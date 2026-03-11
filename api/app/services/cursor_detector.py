"""
Click position detection via frame differencing.

Compares consecutive frames to find where the UI changed — the centroid of
the largest changed region is the likely click/interaction point.

No templates, no cursor sprites needed. Works regardless of cursor visibility.
"""

import logging
import os
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Minimum change area (% of frame) to consider a real interaction vs noise
MIN_CHANGE_RATIO = float(os.getenv("CLICK_DETECT_MIN_CHANGE", "0.001"))
# Maximum change area — if >40% of frame changed, it's a page navigation, not a click
MAX_CHANGE_RATIO = float(os.getenv("CLICK_DETECT_MAX_CHANGE", "0.40"))
# Pixel diff threshold (0-255) to consider a pixel "changed"
DIFF_THRESHOLD = int(os.getenv("CLICK_DETECT_DIFF_THRESHOLD", "30"))


class ClickDetector:
    """Detect click/interaction positions by comparing consecutive frames."""

    def __init__(self):
        try:
            import cv2
            self.cv2 = cv2
        except ImportError:
            logger.warning("opencv not available — click detection disabled")
            self.cv2 = None

    def detect_between(self, frame_before: str, frame_after: str) -> Optional[dict]:
        """Find where the UI changed between two frames.

        Returns {"x": int, "y": int, "area": float} or None.
        area is the fraction of the frame that changed (0-1).
        """
        if not self.cv2:
            return None

        cv2 = self.cv2

        img_a = cv2.imread(frame_before, cv2.IMREAD_GRAYSCALE)
        img_b = cv2.imread(frame_after, cv2.IMREAD_GRAYSCALE)
        if img_a is None or img_b is None:
            return None

        # Ensure same size
        if img_a.shape != img_b.shape:
            img_b = cv2.resize(img_b, (img_a.shape[1], img_a.shape[0]))

        frame_h, frame_w = img_a.shape[:2]
        total_pixels = frame_h * frame_w

        # Compute absolute difference
        diff = cv2.absdiff(img_a, img_b)

        # Apply Gaussian blur to reduce noise
        diff = cv2.GaussianBlur(diff, (5, 5), 0)

        # Threshold to binary
        _, binary = cv2.threshold(diff, DIFF_THRESHOLD, 255, cv2.THRESH_BINARY)

        # Morphological closing to merge nearby changed pixels
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

        # Find contours of changed regions
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        # Total changed area
        total_changed = cv2.countNonZero(binary)
        change_ratio = total_changed / total_pixels

        if change_ratio < MIN_CHANGE_RATIO:
            # Too little change — probably just compression artifacts
            return None

        if change_ratio > MAX_CHANGE_RATIO:
            # Too much changed — page navigation or full redraw, not a targeted click
            # Still return the centroid but flag it
            logger.debug("Large change (%.1f%%) — likely navigation", change_ratio * 100)

        # Find the largest contour (most significant change)
        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)

        if area < 10:  # too tiny
            return None

        # Centroid of the largest changed region
        M = cv2.moments(largest)
        if M["m00"] == 0:
            # Fallback to bounding box center
            x, y, w, h = cv2.boundingRect(largest)
            cx, cy = x + w // 2, y + h // 2
        else:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])

        return {
            "x": cx,
            "y": cy,
            "change_ratio": round(change_ratio, 4),
        }

    def detect_clicks(self, frame_paths: list[str]) -> dict[int, dict]:
        """Detect interaction points across a sequence of frames.

        For each frame (except the last), compares it with the next frame.
        Returns {frame_index: {x, y, change_ratio}, ...}

        The position represents where the UI changed AFTER this frame,
        i.e., where the user likely clicked while viewing frame N.
        """
        if not self.cv2 or len(frame_paths) < 2:
            return {}

        results = {}
        for i in range(len(frame_paths) - 1):
            pos = self.detect_between(frame_paths[i], frame_paths[i + 1])
            if pos:
                results[i] = pos

        logger.info("Click detection: found changes in %d/%d frame pairs",
                     len(results), len(frame_paths) - 1)
        return results
