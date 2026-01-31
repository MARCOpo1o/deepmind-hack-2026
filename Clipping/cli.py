"""Command-line interface for highlight generation."""

import argparse
import json
import logging
import random
import sys
from pathlib import Path

from .pipeline import generate_highlights


def setup_logging(verbose: bool = False) -> None:
    """Configure logging for the CLI."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )


def make_sample_scoresheet(path: str, duration: float, n: int) -> None:
    """
    Generate a sample scoresheet with random scoring events.
    
    Args:
        path: Output path for the JSONL file.
        duration: Video duration in seconds.
        n: Number of scoring events to generate.
    """
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    min_t = 10.0
    max_t = duration - 10.0
    
    if max_t <= min_t:
        raise ValueError(f"Duration too short: {duration}s (need at least 20s)")
    
    timestamps = sorted(random.uniform(min_t, max_t) for _ in range(n))
    
    with open(output_path, "w", encoding="utf-8") as f:
        for t in timestamps:
            event = {
                "t": round(t, 2),
                "event": "score",
            }
            f.write(json.dumps(event) + "\n")
    
    print(f"Generated sample scoresheet with {n} events: {path}")


def str_to_bool(value: str) -> bool:
    """Convert string to boolean for argparse."""
    if value.lower() in ("true", "1", "yes", "on"):
        return True
    elif value.lower() in ("false", "0", "no", "off"):
        return False
    else:
        raise argparse.ArgumentTypeError(f"Boolean value expected, got: {value}")


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="highlight_mvp",
        description="Generate highlight clips from sports videos using scoring timestamps.",
    )
    
    parser.add_argument(
        "--video",
        type=str,
        help="Path to the video file",
    )
    parser.add_argument(
        "--scoresheet",
        type=str,
        help="Path to the JSONL scoresheet",
    )
    parser.add_argument(
        "--out",
        type=str,
        default="outputs",
        help="Output directory (default: outputs)",
    )
    parser.add_argument(
        "--pre",
        type=float,
        default=6.0,
        help="Seconds before each event (default: 6.0)",
    )
    parser.add_argument(
        "--post",
        type=float,
        default=4.0,
        help="Seconds after each event (default: 4.0)",
    )
    parser.add_argument(
        "--merge-gap",
        type=float,
        default=2.0,
        help="Merge gap in seconds (default: 2.0)",
    )
    parser.add_argument(
        "--min-clip",
        type=float,
        default=2.0,
        help="Minimum clip duration in seconds (default: 2.0)",
    )
    parser.add_argument(
        "--max-clip",
        type=float,
        default=30.0,
        help="Maximum clip duration in seconds (default: 30.0)",
    )
    parser.add_argument(
        "--make-reel",
        type=str_to_bool,
        default=True,
        help="Create highlight reel (default: true)",
    )
    parser.add_argument(
        "--make-sample-scoresheet",
        type=str,
        metavar="PATH",
        help="Generate a sample scoresheet at PATH and exit",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=600.0,
        help="Duration for sample scoresheet (default: 600)",
    )
    parser.add_argument(
        "-n",
        type=int,
        default=12,
        help="Number of events for sample scoresheet (default: 12)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    
    args = parser.parse_args()
    
    setup_logging(verbose=args.verbose)
    
    if args.make_sample_scoresheet:
        try:
            make_sample_scoresheet(args.make_sample_scoresheet, args.duration, args.n)
            return 0
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            return 1
    
    if not args.video:
        parser.error("--video is required")
    if not args.scoresheet:
        parser.error("--scoresheet is required")
    
    try:
        manifest = generate_highlights(
            video_path=args.video,
            scoresheet_path=args.scoresheet,
            output_dir=args.out,
            pre_seconds=args.pre,
            post_seconds=args.post,
            merge_gap_seconds=args.merge_gap,
            min_clip_seconds=args.min_clip,
            max_clip_seconds=args.max_clip,
            make_reel=args.make_reel,
        )
        
        manifest_path = Path(args.out) / "manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        print(f"\nManifest saved to: {manifest_path}")
        
        return 0
        
    except FileNotFoundError as e:
        print(f"File not found: {e}", file=sys.stderr)
        return 1
    except RuntimeError as e:
        print(f"Runtime error: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"Validation error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
