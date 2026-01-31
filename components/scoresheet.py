"""JSONL scoresheet parsing and validation."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

DEDUP_THRESHOLD_SECONDS = 0.35


@dataclass
class ScoringEvent:
    t: float
    team: Optional[str] = None
    points: Optional[int] = None
    confidence: Optional[float] = None


def parse_scoresheet(path: str) -> List[float]:
    """
    Parse a JSONL scoresheet and return sorted, deduplicated timestamps.
    
    Rules:
    - Only keep events where event == "score"
    - "t" must be a number
    - Ignore invalid JSON lines
    - Sort by t
    - Deduplicate events within 0.35 seconds (keep earliest)
    """
    scoresheet_path = Path(path)
    if not scoresheet_path.exists():
        raise FileNotFoundError(f"Scoresheet not found: {path}")
    
    events: List[ScoringEvent] = []
    
    with open(scoresheet_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                logger.warning(f"Line {line_num}: Invalid JSON, skipping")
                continue
            
            if not isinstance(data, dict):
                logger.warning(f"Line {line_num}: Not a JSON object, skipping")
                continue
            
            if data.get("event") != "score":
                continue
            
            t = data.get("t")
            if not isinstance(t, (int, float)):
                logger.warning(f"Line {line_num}: 't' is not a number, skipping")
                continue
            
            event = ScoringEvent(
                t=float(t),
                team=data.get("team"),
                points=data.get("points"),
                confidence=data.get("confidence"),
            )
            events.append(event)
    
    events.sort(key=lambda e: e.t)
    
    deduplicated = _deduplicate_events(events)
    
    logger.info(f"Parsed {len(events)} score events, {len(deduplicated)} after deduplication")
    
    return [e.t for e in deduplicated]


def _deduplicate_events(events: List[ScoringEvent]) -> List[ScoringEvent]:
    """Remove events within DEDUP_THRESHOLD_SECONDS of the previous event."""
    if not events:
        return []
    
    result = [events[0]]
    
    for event in events[1:]:
        if event.t - result[-1].t > DEDUP_THRESHOLD_SECONDS:
            result.append(event)
        else:
            logger.debug(f"Deduplicated event at t={event.t:.3f} (within {DEDUP_THRESHOLD_SECONDS}s of previous)")
    
    return result
