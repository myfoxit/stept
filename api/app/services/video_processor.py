"""Video processor: converts screen recordings to step-by-step Markdown guides."""

import subprocess, json, os, logging, glob, shutil, re
from pathlib import Path

logger = logging.getLogger(__name__)


class VideoProcessor:
    """Converts video recordings to step-by-step Markdown guides."""

    def __init__(self, llm_chat_fn=None):
        """llm_chat_fn: async callable(system_prompt, user_prompt) -> str"""
        self.llm_chat_fn = llm_chat_fn

    def process(self, video_path: str, output_dir: str, progress_cb=None) -> dict:
        """
        Full pipeline: video → guide.
        progress_cb(stage: str, progress: int) called at each step.
        Returns {"markdown": str, "frames": [path, ...], "transcript": str, "steps": [...]}
        """
        os.makedirs(output_dir, exist_ok=True)

        if progress_cb:
            progress_cb("extracting_audio", 10)
        audio_path = self._extract_audio(video_path, output_dir)

        if progress_cb:
            progress_cb("transcribing", 25)
        transcript = self._transcribe(audio_path)

        if progress_cb:
            progress_cb("extracting_frames", 45)
        frames = self._extract_frames(video_path, output_dir)

        if progress_cb:
            progress_cb("analyzing", 60)
        steps = self._identify_steps(transcript)

        if progress_cb:
            progress_cb("generating", 80)
        matched = self._match_frames(steps, frames)
        markdown = self._generate_guide(matched, transcript)

        if progress_cb:
            progress_cb("done", 100)

        # Clean up audio temp file
        if os.path.exists(audio_path):
            os.remove(audio_path)

        return {
            "markdown": markdown,
            "frames": [f["path"] for f in frames],
            "transcript": transcript,
            "steps": steps,
        }

    def _extract_audio(self, video_path: str, output_dir: str) -> str:
        audio_path = os.path.join(output_dir, "audio.wav")
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            "-y", audio_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg audio extraction failed: {result.stderr[:500]}")
        return audio_path

    def _transcribe(self, audio_path: str) -> list:
        """Returns list of {"start": float, "end": float, "text": str}"""
        whisper_path = shutil.which("whisper")
        if whisper_path:
            return self._transcribe_local_whisper(audio_path)

        api_key = os.environ.get("OPENAI_API_KEY")
        if api_key:
            return self._transcribe_openai(audio_path, api_key)

        raise RuntimeError("No speech-to-text provider available. Install whisper CLI or set OPENAI_API_KEY.")

    def _transcribe_local_whisper(self, audio_path: str) -> list:
        output_dir = os.path.dirname(audio_path)
        cmd = [
            "whisper", audio_path,
            "--model", os.environ.get("WHISPER_MODEL", "base"),
            "--output_format", "json",
            "--output_dir", output_dir,
            "--language", os.environ.get("WHISPER_LANGUAGE", "en"),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            raise RuntimeError(f"Whisper failed: {result.stderr[:500]}")

        json_path = os.path.join(output_dir, Path(audio_path).stem + ".json")
        with open(json_path) as f:
            data = json.load(f)

        return [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in data.get("segments", [])]

    def _transcribe_openai(self, audio_path: str, api_key: str) -> list:
        import httpx

        file_size = os.path.getsize(audio_path)
        if file_size > 24 * 1024 * 1024:
            return self._transcribe_openai_chunked(audio_path, api_key)

        with open(audio_path, "rb") as f:
            response = httpx.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": ("audio.wav", f, "audio/wav")},
                data={
                    "model": "whisper-1",
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "segment",
                },
                timeout=300,
            )

        if response.status_code != 200:
            raise RuntimeError(f"OpenAI Whisper API error: {response.status_code} {response.text[:300]}")

        data = response.json()
        return [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in data.get("segments", [])]

    def _transcribe_openai_chunked(self, audio_path: str, api_key: str) -> list:
        """Split audio into 10-minute chunks and transcribe each."""
        import httpx

        chunk_dir = os.path.join(os.path.dirname(audio_path), "chunks")
        os.makedirs(chunk_dir, exist_ok=True)

        cmd = [
            "ffmpeg", "-i", audio_path,
            "-f", "segment", "-segment_time", "600",
            "-c", "copy",
            os.path.join(chunk_dir, "chunk_%03d.wav"),
        ]
        subprocess.run(cmd, capture_output=True, timeout=300)

        all_segments = []
        time_offset = 0.0

        for chunk_path in sorted(glob.glob(os.path.join(chunk_dir, "chunk_*.wav"))):
            probe_cmd = [
                "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                "-of", "json", chunk_path,
            ]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
            chunk_duration = 600.0
            if probe_result.returncode == 0:
                probe_data = json.loads(probe_result.stdout)
                chunk_duration = float(probe_data.get("format", {}).get("duration", 600))

            with open(chunk_path, "rb") as f:
                response = httpx.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": (os.path.basename(chunk_path), f, "audio/wav")},
                    data={
                        "model": "whisper-1",
                        "response_format": "verbose_json",
                        "timestamp_granularities[]": "segment",
                    },
                    timeout=300,
                )

            if response.status_code == 200:
                data = response.json()
                for s in data.get("segments", []):
                    all_segments.append({
                        "start": s["start"] + time_offset,
                        "end": s["end"] + time_offset,
                        "text": s["text"],
                    })

            time_offset += chunk_duration

        shutil.rmtree(chunk_dir, ignore_errors=True)
        return all_segments

    def _extract_frames(self, video_path: str, output_dir: str, threshold: float = 0.3) -> list:
        """Extract frames at scene changes. Returns [{"path": str, "timestamp": float}]"""
        frames_dir = os.path.join(output_dir, "frames")
        os.makedirs(frames_dir, exist_ok=True)

        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", f"select='gt(scene,{threshold})',showinfo",
            "-vsync", "vfr",
            os.path.join(frames_dir, "frame_%04d.png"),
            "-y",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

        timestamps = []
        for line in result.stderr.split("\n"):
            match = re.search(r"pts_time:(\d+\.?\d*)", line)
            if match:
                timestamps.append(float(match.group(1)))

        frame_files = sorted(glob.glob(os.path.join(frames_dir, "frame_*.png")))

        # Adaptive threshold
        if len(frame_files) > 100 and threshold < 0.8:
            shutil.rmtree(frames_dir)
            return self._extract_frames(video_path, output_dir, threshold + 0.1)
        elif len(frame_files) < 5 and threshold > 0.05:
            shutil.rmtree(frames_dir)
            return self._extract_frames(video_path, output_dir, threshold - 0.1)

        frames = []
        for i, fpath in enumerate(frame_files):
            ts = timestamps[i] if i < len(timestamps) else i * 10.0
            frames.append({"path": fpath, "timestamp": ts})

        return frames

    def _identify_steps(self, transcript: list) -> list:
        """Use LLM to identify key steps from transcript text."""
        if not self.llm_chat_fn or not transcript:
            return [
                {"step": i + 1, "timestamp": s["start"], "title": f"Step {i + 1}", "description": s["text"]}
                for i, s in enumerate(transcript)
            ]

        text = "\n".join(f"[{s['start']:.1f}s - {s['end']:.1f}s] {s['text']}" for s in transcript)

        system_prompt = """You are analyzing a transcript of a screen recording. Identify the key steps/actions performed.
Group related narration into logical steps (aim for 20-50 steps for a long recording).
For each step, output a JSON array of objects with:
- "step": step number
- "timestamp": seconds from start when this step begins
- "title": short title for this step (5-10 words)
- "description": what the user did/said (1-2 sentences)
Return ONLY the JSON array, no other text."""

        import asyncio
        try:
            response = asyncio.run(self.llm_chat_fn(system_prompt, text))
            response = response.strip()
            if response.startswith("```"):
                response = response.split("\n", 1)[1].rsplit("```", 1)[0]
            steps = json.loads(response)
            return steps
        except Exception as e:
            logger.warning(f"LLM step extraction failed: {e}, falling back to segments")
            return [
                {"step": i + 1, "timestamp": s["start"], "title": f"Step {i + 1}", "description": s["text"]}
                for i, s in enumerate(transcript)
            ]

    def _match_frames(self, steps: list, frames: list) -> list:
        """Match each step to the nearest scene-change frame."""
        if not frames:
            return [{"step": s, "frame": None} for s in steps]

        matched = []
        for step in steps:
            ts = step.get("timestamp", 0)
            nearest = min(frames, key=lambda f: abs(f["timestamp"] - ts))
            frame = nearest if abs(nearest["timestamp"] - ts) < 30 else None
            matched.append({"step": step, "frame": frame})

        return matched

    def _generate_guide(self, matched_steps: list, transcript: list) -> str:
        """Generate final Markdown guide."""
        if self.llm_chat_fn and matched_steps:
            return self._generate_guide_with_llm(matched_steps, transcript)
        return self._generate_guide_basic(matched_steps)

    def _generate_guide_basic(self, matched_steps: list) -> str:
        """Fallback: generate guide without LLM."""
        lines = ["# Screen Recording Guide\n"]
        for item in matched_steps:
            step = item["step"]
            frame = item.get("frame")
            lines.append(f"## Step {step['step']}: {step['title']}\n")
            lines.append(f"{step['description']}\n")
            if frame:
                frame_name = os.path.basename(frame["path"])
                lines.append(f"![Step {step['step']}](frames/{frame_name})\n")
            lines.append("")
        return "\n".join(lines)

    def _generate_guide_with_llm(self, matched_steps: list, transcript: list) -> str:
        """Generate polished guide using LLM."""
        steps_text = json.dumps([{
            "step": item["step"]["step"],
            "title": item["step"]["title"],
            "description": item["step"]["description"],
            "timestamp": item["step"].get("timestamp", 0),
            "has_screenshot": item.get("frame") is not None,
            "screenshot": os.path.basename(item["frame"]["path"]) if item.get("frame") else None,
        } for item in matched_steps], indent=2)

        system_prompt = """You are a technical documentation writer. Generate a professional step-by-step Markdown guide from the analyzed steps of a screen recording.

Rules:
- Use clear ## headers for each step
- Include the screenshot reference where available: ![Step N](frames/filename.png)
- Add a brief introduction
- Add prerequisites if inferable
- Add warnings (⚠️) for risky actions
- Add tips (💡) where useful
- Keep professional but approachable tone
- Output valid Markdown only"""

        import asyncio
        try:
            result = asyncio.run(self.llm_chat_fn(system_prompt, f"Steps:\n{steps_text}"))
            return result
        except Exception:
            return self._generate_guide_basic(matched_steps)
