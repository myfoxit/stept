import asyncio
import base64
import json
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path
import inspect
from typing import Any, Callable

logger = logging.getLogger(__name__)

SCENE_THRESHOLD = float(os.getenv("VIDEO_SCENE_THRESHOLD", "0.3"))
MAX_FRAMES = int(os.getenv("VIDEO_MAX_FRAMES", "50"))
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-1")


class VideoProcessor:
    def __init__(
        self,
        video_path: str,
        scene_threshold: float = SCENE_THRESHOLD,
        max_frames: int = MAX_FRAMES,
        progress_callback: Callable[[str, int], Any] | None = None,
    ):
        self.video_path = video_path
        self.scene_threshold = scene_threshold
        self.max_frames = max_frames
        self._progress_cb = progress_callback

    async def _progress(self, stage: str, pct: int):
        if self._progress_cb is not None:
            result = self._progress_cb(stage, pct)
            if inspect.isawaitable(result):
                await result

    def _run_ffprobe_duration(self) -> float:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                self.video_path,
            ],
            capture_output=True, text=True, timeout=30,
        )
        return float(result.stdout.strip())

    def _detect_scenes(self) -> list[float]:
        """Return list of timestamps (seconds) where scene changes occur."""
        result = subprocess.run(
            [
                "ffmpeg", "-i", self.video_path,
                "-vf", f"select='gt(scene,{self.scene_threshold})',showinfo",
                "-vsync", "vfr",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=600,
        )
        timestamps = []
        for line in result.stderr.splitlines():
            m = re.search(r"pts_time:([\d.]+)", line)
            if m:
                timestamps.append(float(m.group(1)))

        # Always include the first frame
        if not timestamps or timestamps[0] > 1.0:
            timestamps.insert(0, 0.5)

        # Sample evenly if too many scenes detected
        if len(timestamps) > self.max_frames:
            step = len(timestamps) / self.max_frames
            timestamps = [timestamps[int(i * step)] for i in range(self.max_frames)]

        return timestamps

    def _extract_frames(self, timestamps: list[float], output_dir: str) -> list[str]:
        """Extract frames at given timestamps, return list of file paths."""
        paths = []
        for i, ts in enumerate(timestamps):
            out_path = os.path.join(output_dir, f"frame_{i:04d}.png")
            subprocess.run(
                [
                    "ffmpeg", "-ss", str(ts),
                    "-i", self.video_path,
                    "-frames:v", "1",
                    "-q:v", "2",
                    out_path,
                ],
                capture_output=True, timeout=30,
            )
            if os.path.exists(out_path):
                paths.append(out_path)
        return paths

    def _extract_audio(self, output_dir: str) -> str:
        """Extract audio track to WAV file."""
        audio_path = os.path.join(output_dir, "audio.wav")
        subprocess.run(
            [
                "ffmpeg", "-i", self.video_path,
                "-vn", "-acodec", "pcm_s16le",
                "-ar", "16000", "-ac", "1",
                audio_path,
            ],
            capture_output=True, timeout=300,
        )
        return audio_path

    async def _transcribe_audio(self, audio_path: str) -> str:
        """Transcribe audio using OpenAI Whisper API."""
        import httpx

        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            logger.warning("No OPENAI_API_KEY set — skipping transcription")
            return ""

        if not os.path.exists(audio_path) or os.path.getsize(audio_path) < 1000:
            logger.info("Audio file too small or missing — skipping transcription")
            return ""

        async with httpx.AsyncClient(timeout=300) as client:
            with open(audio_path, "rb") as f:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": ("audio.wav", f, "audio/wav")},
                    data={"model": WHISPER_MODEL, "response_format": "text"},
                )
                if resp.status_code != 200:
                    logger.warning("Whisper API failed (%s): %s — continuing without transcript", resp.status_code, resp.text[:200])
                    return ""
                return resp.text.strip()

    def _frames_to_base64(self, frame_paths: list[str]) -> list[str]:
        results = []
        for path in frame_paths:
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
                results.append(f"data:image/png;base64,{b64}")
        return results

    async def _generate_steps_with_llm(
        self, frame_data_urls: list[str], transcript: str
    ) -> list[dict]:
        """Use vision LLM to generate step-by-step guide from frames + transcript."""
        from app.services.llm import chat_completion, extract_text_from_response

        content_parts: list[dict] = [
            {
                "type": "text",
                "text": (
                    "You are an expert at creating step-by-step guides from screen recordings. "
                    "Below are screenshots extracted from a screen recording, numbered starting from 0. "
                    f"There are {len(frame_data_urls)} screenshots total.\n\n"
                    + (f"Narration transcript:\n{transcript}\n\n" if transcript else "No narration was detected.\n\n")
                    + "Generate a step-by-step guide. For each step provide:\n"
                    "- step_number (starting from 1)\n"
                    "- title (short action title)\n"
                    "- description (what the user does in this step)\n"
                    "- screenshot_index (0-based index of the screenshot that best represents this step)\n\n"
                    "Return ONLY valid JSON: an array of objects with those fields. No markdown fences."
                ),
            }
        ]
        for i, url in enumerate(frame_data_urls):
            content_parts.append({
                "type": "text",
                "text": f"Screenshot {i}:",
            })
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": url},
            })

        messages = [{"role": "user", "content": content_parts}]

        response = await chat_completion(messages, stream=False)
        text = extract_text_from_response(response)

        # Parse JSON from response
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)

        return json.loads(text)

    async def process(self) -> dict:
        """Run the full pipeline: scene detection, audio extraction, transcription, LLM analysis."""
        with tempfile.TemporaryDirectory(prefix="ondoki_video_") as tmpdir:
            # Get duration
            duration = self._run_ffprobe_duration()
            await self._progress("extracting_audio", 10)

            # Extract audio + transcribe
            audio_path = self._extract_audio(tmpdir)
            await self._progress("transcribing", 20)

            transcript = await self._transcribe_audio(audio_path)
            await self._progress("extracting_frames", 40)

            # Detect scenes + extract frames
            timestamps = self._detect_scenes()
            frame_paths = self._extract_frames(timestamps, tmpdir)
            await self._progress("analyzing", 60)

            if not frame_paths:
                raise RuntimeError("No frames could be extracted from the video")

            # Convert to base64 for LLM
            frame_urls = self._frames_to_base64(frame_paths)
            await self._progress("generating", 75)

            # Generate steps via vision LLM
            steps = await self._generate_steps_with_llm(frame_urls, transcript)
            await self._progress("done", 100)

            return {
                "duration": duration,
                "transcript": transcript,
                "frame_count": len(frame_paths),
                "frame_timestamps": timestamps[:len(frame_paths)],
                "frame_paths": frame_paths,
                "steps": steps,
            }
