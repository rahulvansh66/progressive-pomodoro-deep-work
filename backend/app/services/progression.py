"""Progressive Pomodoro rules: decide the break and the next block's length from a rating."""

from dataclasses import dataclass


@dataclass
class Rules:
    min_block: int = 2
    max_block: int = 60
    focused_step: int = 5
    flow_step: int = 10
    break_minutes: int = 5


MESSAGES = {
    "distracted": "No stress — shrink the next block and start with clear intent.",
    "okay": "Steady. Keep the same length and build momentum.",
    "focused": "Momentum is building — stretch the next block.",
    "flow": "You're flowing — skip the break and keep on flowing!",
}


def suggest_next(planned_minutes: int, rating: str, rules: Rules | None = None) -> dict:
    r = rules or Rules()
    if rating == "distracted":
        nxt = round(planned_minutes * 0.6)
    elif rating == "okay":
        nxt = planned_minutes
    elif rating == "focused":
        nxt = planned_minutes + r.focused_step
    elif rating == "flow":
        nxt = planned_minutes + r.flow_step
    else:
        raise ValueError(f"unknown rating: {rating}")
    nxt = max(r.min_block, min(r.max_block, nxt))
    return {
        "next_minutes": nxt,
        "take_break": rating != "flow",
        "break_minutes": 0 if rating == "flow" else r.break_minutes,
        "message": MESSAGES[rating],
    }
