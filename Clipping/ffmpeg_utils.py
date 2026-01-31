"""FFmpeg and FFprobe subprocess utilities."""
from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)


class FFmpegError(Exception):
    """Raised when an FFmpeg operation fails."""
    pass


def check_ffmpeg_installed() -> None:
    """
    Check if ffmpeg and ffprobe are installed and accessible.
    
    Raises:
        RuntimeError: If ffmpeg or ffprobe is not found.
    """
    for tool in ["ffmpeg", "ffprobe"]:
        if shutil.which(tool) is None:
            raise RuntimeError(
                f"{tool} not found in PATH. Please install FFmpeg:\n"
                f"  macOS: brew install ffmpeg\n"
                f"  Ubuntu/Debian: sudo apt install ffmpeg\n"
                f"  Windows: Download from https://ffmpeg.org/download.html"
            )
    logger.info("FFmpeg and FFprobe found")


def get_video_duration(video_path: str) -> float:
    """
    Get the duration of a video file in seconds using ffprobe.
    
    Args:
        video_path: Path to the video file.
        
    Returns:
        Duration in seconds.
        
    Raises:
        FFmpegError: If ffprobe fails or returns invalid output.
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
        )
        duration = float(result.stdout.strip())
        logger.info(f"Video duration: {duration:.2f}s")
        return duration
    except subprocess.CalledProcessError as e:
        raise FFmpegError(f"ffprobe failed: {e.stderr}")
    except ValueError:
        raise FFmpegError(f"ffprobe returned invalid duration")


def cut_clip(
    video_path: str,
    start: float,
    duration: float,
    output_path: str,
) -> None:
    """
    Cut a clip from a video using ffmpeg.
    
    Uses input seeking (-ss before -i) for fast seeking, then re-encodes
    with H.264/AAC for consistent output.
    
    Args:
        video_path: Path to the source video.
        start: Start time in seconds.
        duration: Duration of the clip in seconds.
        output_path: Path for the output clip.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(start),
        "-i", video_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-movflags", "+faststart",
        output_path,
    ]
    
    logger.debug(f"Cutting clip: start={start:.2f}s, duration={duration:.2f}s")
    
    try:
        subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        raise FFmpegError(f"Failed to cut clip: {e.stderr}")


def concat_clips(
    clip_paths: List[str],
    output_path: str,
    fallback_reencode: bool = True,
) -> None:
    """
    Concatenate multiple clips into a single video.
    
    First attempts stream copy (fast). If that fails and fallback_reencode
    is True, retries with re-encoding.
    
    Args:
        clip_paths: List of paths to clips to concatenate.
        output_path: Path for the output video.
        fallback_reencode: If True, retry with re-encode on stream-copy failure.
    """
    if not clip_paths:
        raise ValueError("No clips to concatenate")
    
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        concat_list_path = f.name
        for clip_path in clip_paths:
            abs_path = str(Path(clip_path).resolve())
            f.write(f"file '{abs_path}'\n")
    
    try:
        _run_concat(concat_list_path, output_path, stream_copy=True)
        logger.info(f"Concatenated {len(clip_paths)} clips (stream copy)")
    except FFmpegError as e:
        if fallback_reencode:
            logger.warning(f"Stream copy concat failed, falling back to re-encode: {e}")
            _run_concat(concat_list_path, output_path, stream_copy=False)
            logger.info(f"Concatenated {len(clip_paths)} clips (re-encoded)")
        else:
            raise
    finally:
        Path(concat_list_path).unlink(missing_ok=True)


def _run_concat(concat_list_path: str, output_path: str, stream_copy: bool) -> None:
    """Run the ffmpeg concat command."""
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list_path,
    ]
    
    if stream_copy:
        cmd.extend(["-c", "copy"])
    else:
        cmd.extend([
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-c:a", "aac",
        ])
    
    cmd.append(output_path)
    
    try:
        subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        raise FFmpegError(f"Concat failed: {e.stderr}")
