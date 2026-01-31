"""Main highlight generation pipeline."""

import logging
from pathlib import Path

from .ffmpeg_utils import check_ffmpeg_installed, get_video_duration, cut_clip, concat_clips
from .scoresheet import parse_scoresheet
from .windows import process_windows

logger = logging.getLogger(__name__)


def generate_highlights(
    video_path: str,
    scoresheet_path: str,
    output_dir: str,
    pre_seconds: float = 6.0,
    post_seconds: float = 4.0,
    merge_gap_seconds: float = 2.0,
    min_clip_seconds: float = 2.0,
    max_clip_seconds: float = 30.0,
    make_reel: bool = True,
) -> dict:
    """
    Generate highlight clips from a video based on scoring events.
    
    Args:
        video_path: Path to the source video file.
        scoresheet_path: Path to the JSONL scoresheet.
        output_dir: Directory for output clips and reel.
        pre_seconds: Seconds before each scoring event to include.
        post_seconds: Seconds after each scoring event to include.
        merge_gap_seconds: Merge windows if gap is less than this.
        min_clip_seconds: Minimum clip duration.
        max_clip_seconds: Maximum clip duration.
        make_reel: If True, concatenate clips into a highlight reel.
        
    Returns:
        Manifest dict with video info, clips, and reel path.
        
    Raises:
        FileNotFoundError: If video or scoresheet doesn't exist.
        RuntimeError: If ffmpeg is not installed.
        ValueError: If no valid scoring events found.
    """
    logger.info("=" * 60)
    logger.info("Starting highlight generation")
    logger.info("=" * 60)
    
    video_path = str(Path(video_path).resolve())
    scoresheet_path = str(Path(scoresheet_path).resolve())
    output_dir = str(Path(output_dir).resolve())
    
    if not Path(video_path).exists():
        raise FileNotFoundError(f"Video not found: {video_path}")
    
    logger.info(f"Video: {video_path}")
    logger.info(f"Scoresheet: {scoresheet_path}")
    logger.info(f"Output: {output_dir}")
    
    check_ffmpeg_installed()
    
    logger.info("-" * 40)
    logger.info("Parsing scoresheet")
    timestamps = parse_scoresheet(scoresheet_path)
    
    if not timestamps:
        raise ValueError("No valid scoring events found in scoresheet")
    
    num_events = len(timestamps)
    logger.info(f"Found {num_events} scoring events")
    
    logger.info("-" * 40)
    logger.info("Getting video duration")
    video_duration = get_video_duration(video_path)
    
    logger.info("-" * 40)
    logger.info("Processing time windows")
    windows = process_windows(
        timestamps=timestamps,
        video_duration=video_duration,
        pre_seconds=pre_seconds,
        post_seconds=post_seconds,
        merge_gap_seconds=merge_gap_seconds,
        min_clip_seconds=min_clip_seconds,
        max_clip_seconds=max_clip_seconds,
    )
    
    if not windows:
        raise ValueError("No valid clips after window processing")
    
    clips_dir = Path(output_dir) / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info("-" * 40)
    logger.info(f"Cutting {len(windows)} clips")
    
    clips_info = []
    clip_paths = []
    
    for i, (start, end) in enumerate(windows):
        duration = end - start
        start_ms = int(start * 1000)
        end_ms = int(end * 1000)
        
        clip_filename = f"clip_{i+1:04d}_{start_ms}_{end_ms}.mp4"
        clip_path = clips_dir / clip_filename
        
        logger.info(f"  Clip {i+1}/{len(windows)}: {start:.2f}s - {end:.2f}s ({duration:.2f}s)")
        
        cut_clip(
            video_path=video_path,
            start=start,
            duration=duration,
            output_path=str(clip_path),
        )
        
        relative_path = f"clips/{clip_filename}"
        clips_info.append({
            "start": start,
            "end": end,
            "path": relative_path,
        })
        clip_paths.append(str(clip_path))
    
    reel_relative_path = None
    
    if make_reel and len(clip_paths) > 0:
        logger.info("-" * 40)
        logger.info("Creating highlight reel")
        
        reel_dir = Path(output_dir) / "reel"
        reel_dir.mkdir(parents=True, exist_ok=True)
        
        reel_path = reel_dir / "highlights.mp4"
        concat_clips(clip_paths, str(reel_path))
        
        reel_relative_path = "reel/highlights.mp4"
        logger.info(f"Reel created: {reel_relative_path}")
    
    manifest = {
        "video_path": video_path,
        "video_duration": video_duration,
        "num_events": num_events,
        "num_clips": len(clips_info),
        "clips": clips_info,
        "reel": reel_relative_path,
    }
    
    logger.info("=" * 60)
    logger.info("Highlight generation complete")
    logger.info(f"  Events: {num_events}")
    logger.info(f"  Clips: {len(clips_info)}")
    logger.info(f"  Reel: {reel_relative_path or 'None'}")
    logger.info("=" * 60)
    
    return manifest
