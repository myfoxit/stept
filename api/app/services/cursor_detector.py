"""
OpenCV-based cursor detection via template matching.

Detects standard mouse cursors (arrow, hand, I-beam) in screenshot frames
using multi-scale template matching. Returns pixel coordinates of the cursor
tip or None if no cursor found above confidence threshold.
"""

import logging
import os
from functools import lru_cache
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Confidence threshold — below this we consider "no cursor found"
CONFIDENCE_THRESHOLD = float(os.getenv("CURSOR_DETECT_THRESHOLD", "0.55"))

# Scales to try (cursors vary with video resolution/DPI)
MATCH_SCALES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]


def _make_arrow_cursor() -> tuple[np.ndarray, tuple[int, int]]:
    """Generate standard arrow cursor template. Returns (image, hotspot)."""
    # Standard Windows/Mac arrow cursor ~16x22
    shape = [
        "X...............",
        "XX..............",
        "X.X.............",
        "X..X............",
        "X...X...........",
        "X....X..........",
        "X.....X.........",
        "X......X........",
        "X.......X.......",
        "X........X......",
        "X.........X.....",
        "X..........X....",
        "X......XXXXX....",
        "X...X..X........",
        "X..X...X........",
        "X.X....X........",
        "XX......X.......",
        "X.......X.......",
        "........X.......",
        ".........X......",
        ".........X......",
        "..........X.....",
    ]
    h, w = len(shape), len(shape[0])
    img = np.zeros((h, w), dtype=np.uint8)
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "X":
                img[y, x] = 255
    return img, (0, 0)  # hotspot at top-left tip


def _make_hand_cursor() -> tuple[np.ndarray, tuple[int, int]]:
    """Generate hand/pointer cursor template. Returns (image, hotspot)."""
    shape = [
        "......XX........",
        ".....X..X.......",
        ".....X..X.......",
        ".....X..X.......",
        ".....X..XX......",
        ".....X..X.X.....",
        "..XX.X..X.X.....",
        ".X..XX..X..X....",
        ".X..XX..X..X....",
        ".X...X..X..X....",
        "..X..X.....X....",
        "..X........X....",
        "...X.......X....",
        "...X......X.....",
        "....X.....X.....",
        "....X....X......",
        ".....X...X......",
        ".....XXXXX......",
    ]
    h, w = len(shape), len(shape[0])
    img = np.zeros((h, w), dtype=np.uint8)
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "X":
                img[y, x] = 255
    return img, (7, 0)  # hotspot at fingertip


def _make_ibeam_cursor() -> tuple[np.ndarray, tuple[int, int]]:
    """Generate I-beam text cursor template. Returns (image, hotspot)."""
    shape = [
        ".XXX.XXX.",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        "....X....",
        ".XXX.XXX.",
    ]
    h, w = len(shape), len(shape[0])
    img = np.zeros((h, w), dtype=np.uint8)
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "X":
                img[y, x] = 255
    return img, (4, 7)  # hotspot at center


@lru_cache(maxsize=1)
def _get_templates() -> list[tuple[np.ndarray, tuple[int, int], str]]:
    """Return list of (template_image, hotspot_offset, name)."""
    templates = []
    for name, fn in [("arrow", _make_arrow_cursor), ("hand", _make_hand_cursor), ("ibeam", _make_ibeam_cursor)]:
        try:
            img, hotspot = fn()
            templates.append((img, hotspot, name))
        except Exception as e:
            logger.warning("Failed to create %s template: %s", name, e)
    return templates


class CursorDetector:
    """Detect mouse cursor position in screenshots using template matching."""

    def __init__(self, confidence_threshold: float = CONFIDENCE_THRESHOLD):
        self.threshold = confidence_threshold
        self.templates = _get_templates()

    def detect(self, frame_path: str) -> Optional[dict]:
        """Detect cursor position in a frame.

        Returns {"x": int, "y": int, "confidence": float, "cursor_type": str}
        or None if no cursor found above confidence threshold.
        """
        try:
            import cv2
        except ImportError:
            logger.warning("opencv not available — skipping cursor detection")
            return None

        frame = cv2.imread(frame_path, cv2.IMREAD_GRAYSCALE)
        if frame is None:
            return None

        frame_h, frame_w = frame.shape[:2]

        # Also try inverted (for dark cursors on light backgrounds)
        frame_inv = cv2.bitwise_not(frame)

        best_match = None
        best_confidence = 0.0

        for template, hotspot, cursor_name in self.templates:
            for scale in MATCH_SCALES:
                th, tw = template.shape[:2]
                new_h, new_w = max(int(th * scale), 3), max(int(tw * scale), 3)

                if new_h >= frame_h or new_w >= frame_w:
                    continue

                scaled = cv2.resize(template, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

                # Match on both normal and inverted frame
                for img_variant in [frame, frame_inv]:
                    result = cv2.matchTemplate(img_variant, scaled, cv2.TM_CCOEFF_NORMED)
                    _, max_val, _, max_loc = cv2.minMaxLoc(result)

                    if max_val > best_confidence and max_val >= self.threshold:
                        # Adjust for hotspot offset (scaled)
                        hx = int(hotspot[0] * scale)
                        hy = int(hotspot[1] * scale)
                        best_confidence = max_val
                        best_match = {
                            "x": max_loc[0] + hx,
                            "y": max_loc[1] + hy,
                            "confidence": round(float(max_val), 3),
                            "cursor_type": cursor_name,
                        }

        if best_match and best_match["confidence"] >= self.threshold:
            logger.debug("Cursor detected: %s at (%d,%d) conf=%.3f",
                         best_match["cursor_type"], best_match["x"], best_match["y"],
                         best_match["confidence"])
            return best_match

        return None

    def detect_batch(self, frame_paths: list[str]) -> dict[int, dict]:
        """Detect cursors in multiple frames.

        Returns {frame_index: {x, y, confidence, cursor_type}, ...}
        Only includes frames where a cursor was found.
        """
        results = {}
        for i, path in enumerate(frame_paths):
            pos = self.detect(path)
            if pos:
                results[i] = pos
        return results
