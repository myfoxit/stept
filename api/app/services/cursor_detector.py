"""
OpenCV-based cursor detection via template matching.

Detects standard mouse cursors (arrow, hand) in screenshot frames using
multi-scale template matching with proper anti-aliased cursor rendering.
Returns pixel coordinates of the cursor tip or None if not found.
"""

import logging
import os
from functools import lru_cache
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# High threshold to avoid false positives on UI elements
CONFIDENCE_THRESHOLD = float(os.getenv("CURSOR_DETECT_THRESHOLD", "0.70"))

# Scales to try (cursors vary with video resolution/DPI)
MATCH_SCALES = [0.4, 0.5, 0.6, 0.75, 0.85, 1.0, 1.2, 1.5]


def _render_arrow_cursor(size: int = 24) -> tuple[np.ndarray, np.ndarray, tuple[int, int]]:
    """Render a proper anti-aliased arrow cursor with alpha mask.

    Returns (grayscale_image, mask, hotspot).
    The cursor is white-filled with a black 1px border — standard Windows/Mac style.
    """
    try:
        import cv2
    except ImportError:
        return np.zeros((1, 1), np.uint8), np.zeros((1, 1), np.uint8), (0, 0)

    h = size
    w = int(size * 0.7)
    img = np.zeros((h, w), dtype=np.uint8)
    mask = np.zeros((h, w), dtype=np.uint8)

    # Arrow shape points (normalized 0-1, then scaled)
    # Standard arrow: tip at top-left, widens down, then narrows to tail
    pts_outer = np.array([
        [0, 0],          # tip
        [0, h - 1],      # bottom-left of shaft
        [w * 0.35, h * 0.6],   # notch right
        [w - 1, h - 1],  # tail bottom-right
        [w * 0.45, h * 0.45],  # notch top
        [w * 0.25, 0],   # near tip right
    ], dtype=np.int32)

    # Fill outer (black border)
    cv2.fillPoly(mask, [pts_outer], 255)
    cv2.fillPoly(img, [pts_outer], 0)  # black border

    # Inner fill (white) — shrink by 1px
    pts_inner = np.array([
        [1, 3],
        [1, h - 4],
        [w * 0.33, h * 0.58],
        [w - 4, h - 4],
        [w * 0.43, h * 0.44],
        [w * 0.22, 3],
    ], dtype=np.int32)
    cv2.fillPoly(img, [pts_inner], 255)

    return img, mask, (0, 0)


def _render_hand_cursor(size: int = 22) -> tuple[np.ndarray, np.ndarray, tuple[int, int]]:
    """Render a simplified hand/pointer cursor.

    Returns (grayscale_image, mask, hotspot).
    """
    try:
        import cv2
    except ImportError:
        return np.zeros((1, 1), np.uint8), np.zeros((1, 1), np.uint8), (0, 0)

    h = size
    w = int(size * 0.65)
    img = np.zeros((h, w), dtype=np.uint8)
    mask = np.zeros((h, w), dtype=np.uint8)

    # Pointing finger shape
    finger_w = max(w // 4, 2)
    finger_x = w // 2 - finger_w // 2

    # Finger (top portion)
    cv2.rectangle(mask, (finger_x, 0), (finger_x + finger_w, h * 2 // 3), 255, -1)
    cv2.rectangle(img, (finger_x + 1, 1), (finger_x + finger_w - 1, h * 2 // 3 - 1), 255, -1)

    # Palm (bottom portion)
    cv2.rectangle(mask, (1, h * 2 // 3 - 2), (w - 1, h - 1), 255, -1)
    cv2.rectangle(img, (2, h * 2 // 3 - 1), (w - 2, h - 2), 200, -1)

    return img, mask, (finger_x + finger_w // 2, 0)


@lru_cache(maxsize=1)
def _get_templates() -> list[tuple[np.ndarray, np.ndarray, tuple[int, int], str]]:
    """Return list of (template, mask, hotspot, name)."""
    templates = []
    for name, fn in [("arrow", _render_arrow_cursor), ("hand", _render_hand_cursor)]:
        try:
            img, mask, hotspot = fn()
            if img.shape[0] > 1:
                templates.append((img, mask, hotspot, name))
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
        best_match = None
        best_confidence = 0.0

        for template, mask, hotspot, cursor_name in self.templates:
            for scale in MATCH_SCALES:
                th, tw = template.shape[:2]
                new_h, new_w = max(int(th * scale), 3), max(int(tw * scale), 3)

                if new_h >= frame_h or new_w >= frame_w:
                    continue

                scaled_tmpl = cv2.resize(template, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
                scaled_mask = cv2.resize(mask, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

                # Use masked template matching — only matches the cursor shape, not background
                result = cv2.matchTemplate(frame, scaled_tmpl, cv2.TM_CCORR_NORMED, mask=scaled_mask)
                _, max_val, _, max_loc = cv2.minMaxLoc(result)

                if max_val > best_confidence and max_val >= self.threshold:
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
            logger.info("Cursor detected: %s at (%d,%d) conf=%.3f",
                        best_match["cursor_type"], best_match["x"], best_match["y"],
                        best_match["confidence"])
            return best_match

        logger.debug("No cursor found in %s (best conf=%.3f)", frame_path, best_confidence)
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
        logger.info("Cursor detection: found in %d/%d frames", len(results), len(frame_paths))
        return results
