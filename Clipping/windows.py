"""Time window creation, merging, clamping, and filtering."""
from __future__ import annotations

import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)

Window = Tuple[float, float]


def create_windows(
    timestamps: List[float],
    pre_seconds: float,
    post_seconds: float,
) -> List[Window]:
    """Create [t - pre, t + post] windows for each timestamp."""
    windows = []
    for t in timestamps:
        start = t - pre_seconds
        end = t + post_seconds
        windows.append((start, end))
    logger.info(f"Created {len(windows)} windows from timestamps")
    return windows


def clamp_windows(windows: List[Window], duration: float) -> List[Window]:
    """Clamp windows to [0, duration]."""
    clamped = []
    for start, end in windows:
        clamped_start = max(0.0, start)
        clamped_end = min(duration, end)
        if clamped_start < clamped_end:
            clamped.append((clamped_start, clamped_end))
    logger.info(f"Clamped {len(windows)} windows to [0, {duration:.2f}], {len(clamped)} remain")
    return clamped


def filter_short_windows(windows: List[Window], min_seconds: float) -> List[Window]:
    """Remove windows shorter than min_seconds."""
    filtered = []
    for start, end in windows:
        if end - start >= min_seconds:
            filtered.append((start, end))
    removed = len(windows) - len(filtered)
    if removed > 0:
        logger.info(f"Filtered out {removed} windows shorter than {min_seconds}s")
    return filtered


def merge_windows(windows: List[Window], merge_gap_seconds: float) -> List[Window]:
    """
    Merge overlapping or near-overlapping windows.
    
    Two windows are merged if the next window starts within merge_gap_seconds
    of the current window's end.
    """
    if not windows:
        return []
    
    sorted_windows = sorted(windows, key=lambda w: w[0])
    
    merged: List[List[float]] = [[sorted_windows[0][0], sorted_windows[0][1]]]
    
    for start, end in sorted_windows[1:]:
        current = merged[-1]
        if start <= current[1] + merge_gap_seconds:
            current[1] = max(current[1], end)
        else:
            merged.append([start, end])
    
    result = [(w[0], w[1]) for w in merged]
    
    if len(result) < len(windows):
        logger.info(f"Merged {len(windows)} windows into {len(result)} (gap={merge_gap_seconds}s)")
    
    return result


def cap_windows(windows: List[Window], max_seconds: float) -> List[Window]:
    """
    Cap windows to max_seconds duration.
    
    If a window exceeds max_seconds, trim evenly around the midpoint.
    """
    capped = []
    for start, end in windows:
        duration = end - start
        if duration > max_seconds:
            midpoint = (start + end) / 2
            new_start = midpoint - max_seconds / 2
            new_end = midpoint + max_seconds / 2
            capped.append((new_start, new_end))
            logger.debug(f"Capped window [{start:.2f}, {end:.2f}] to [{new_start:.2f}, {new_end:.2f}]")
        else:
            capped.append((start, end))
    return capped


def process_windows(
    timestamps: List[float],
    video_duration: float,
    pre_seconds: float = 6.0,
    post_seconds: float = 4.0,
    merge_gap_seconds: float = 2.0,
    min_clip_seconds: float = 2.0,
    max_clip_seconds: float = 30.0,
) -> List[Window]:
    """
    Full window processing pipeline.
    
    1. Create windows from timestamps
    2. Clamp to video duration
    3. Filter short windows
    4. Merge overlapping windows
    5. Cap to max duration
    """
    windows = create_windows(timestamps, pre_seconds, post_seconds)
    windows = clamp_windows(windows, video_duration)
    windows = filter_short_windows(windows, min_clip_seconds)
    windows = merge_windows(windows, merge_gap_seconds)
    windows = cap_windows(windows, max_clip_seconds)
    
    logger.info(f"Final window count: {len(windows)}")
    return windows
