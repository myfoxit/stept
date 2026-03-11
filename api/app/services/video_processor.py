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
        output_dir: str | None = None,
        scene_threshold: float = SCENE_THRESHOLD,
        max_frames: int = MAX_FRAMES,
        progress_callback: Callable[[str, int], Any] | None = None,
    ):
        self.video_path = video_path
        self.output_dir = output_dir
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

    def _get_frame_timestamps(self) -> list[float]:
        """Sample frames at even intervals across the full video duration."""
        duration = self._run_ffprobe_duration()
        if duration <= 0:
            return [0.0]

        # Even intervals across entire video
        interval = max(duration / self.max_frames, 1.0)
        timestamps = []
        t = 0.0
        while t < duration and len(timestamps) < self.max_frames:
            timestamps.append(round(t, 2))
            t += interval

        logger.info("Frame extraction: %d frames over %.1fs video (every %.1fs)",
                     len(timestamps), duration, interval)
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

    @staticmethod
    def _get_image_size(path: str) -> dict:
        """Get image dimensions using ffprobe."""
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height",
             "-of", "csv=p=0:s=x", path],
            capture_output=True, text=True, timeout=10,
        )
        parts = result.stdout.strip().split("x")
        if len(parts) == 2:
            return {"width": int(parts[0]), "height": int(parts[1])}
        return {"width": 0, "height": 0}

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
                    "You are an expert at creating step-by-step process documentation from screen recordings. "
                    "These screenshots are taken at regular intervals from a screen recording showing someone "
                    "performing a task on a computer.\n\n"
                    f"There are {len(frame_data_urls)} screenshots total, numbered 0 to {len(frame_data_urls) - 1}.\n\n"
                    + (f"Audio narration transcript:\n{transcript}\n\n" if transcript else "")
                    + "Your job:\n"
                    "1. Analyze what the user is doing across these screenshots\n"
                    "2. Identify the distinct ACTIONS/STEPS the user performs (clicking buttons, typing, navigating menus, etc.)\n"
                    "3. Skip intro/outro screens, loading screens, and frames that don't show meaningful actions\n"
                    "4. Write clear, actionable step titles (e.g. 'Click Settings in the menu bar', 'Select Default Browser')\n"
                    "5. Write descriptions that tell the reader exactly what to do, not what they see\n\n"
                    "For each step provide:\n"
                    "- step_number (starting from 1)\n"
                    "- title (short imperative action, e.g. 'Open Settings')\n"
                    "- description (1-2 sentences explaining what to do and where)\n"
                    "- screenshot_index (0-based index of the screenshot that best shows this step)\n"
                    "- cursor_position (object with x and y as pixel coordinates of where the mouse cursor is pointing or where the user is clicking/interacting in that screenshot. Look for the mouse arrow/pointer/cursor in the image. If you can see it, return its pixel position. If you cannot find a visible cursor, estimate the position of the UI element being interacted with. The coordinates should be in pixels relative to the screenshot dimensions.)\n\n"
                    "Return ONLY valid JSON: an array of objects with those 5 fields. No markdown fences, no extra text."
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

        # chat_completion(stream=False) returns httpx.Response
        if response.status_code != 200:
            logger.error("LLM API error %s: %s", response.status_code, response.text[:500])
            raise RuntimeError(f"LLM API returned {response.status_code}: {response.text[:200]}")

        response_json = response.json()
        text = extract_text_from_response(response_json)

        if not text or not text.strip():
            logger.error("LLM returned empty text. Full response: %s", json.dumps(response_json)[:500])
            raise RuntimeError("LLM returned empty response — check model/API key configuration")

        # Parse JSON from response
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.error("LLM response not valid JSON: %s", text[:500])
            raise RuntimeError(f"LLM did not return valid JSON: {text[:200]}")

    async def process(self) -> dict:
        """Run the full pipeline: scene detection, audio extraction, transcription, LLM analysis."""
        # Use output_dir if provided (frames persist), otherwise temp dir (frames cleaned up)
        if self.output_dir:
            os.makedirs(self.output_dir, exist_ok=True)
            return await self._run_pipeline(self.output_dir)
        else:
            with tempfile.TemporaryDirectory(prefix="ondoki_video_") as tmpdir:
                return await self._run_pipeline(tmpdir)

    async def _run_pipeline(self, workdir: str) -> dict:
        """Internal pipeline execution."""
        duration = self._run_ffprobe_duration()
        await self._progress("extracting_audio", 10)

        audio_path = self._extract_audio(workdir)
        await self._progress("transcribing", 20)

        transcript = await self._transcribe_audio(audio_path)
        await self._progress("extracting_frames", 40)

        timestamps = self._get_frame_timestamps()
        frame_paths = self._extract_frames(timestamps, workdir)
        await self._progress("analyzing", 60)

        if not frame_paths:
            raise RuntimeError("No frames could be extracted from the video")

        # Get frame dimensions from first frame
        frame_size = self._get_image_size(frame_paths[0])

        frame_urls = self._frames_to_base64(frame_paths)
        await self._progress("generating", 75)

        steps = await self._generate_steps_with_llm(frame_urls, transcript)
        await self._progress("done", 100)

        return {
            "duration": duration,
            "transcript": transcript,
            "frame_count": len(frame_paths),
            "frame_timestamps": timestamps[:len(frame_paths)],
            "frame_paths": frame_paths,
            "frame_size": frame_size,
            "steps": steps,
        }
