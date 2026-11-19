"""Period math and aggregation for the dashboard."""

import calendar
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import RATING_SCORE, RATINGS, Category, DailyGoal, FocusBlock, Task


# ---- Period math --------------------------------------------------------
def period_range(period: str, d: date) -> tuple[date, date]:
    """Inclusive (start, end) dates of the period containing d."""
    if period == "day":
        return d, d
    if period == "week":  # ISO week, Monday-Sunday
        start = d - timedelta(days=d.weekday())
        return start, start + timedelta(days=6)
    if period == "month":
        last = calendar.monthrange(d.year, d.month)[1]
        return d.replace(day=1), d.replace(day=last)
    if period == "year":
        return date(d.year, 1, 1), date(d.year, 12, 31)
    raise ValueError(f"unknown period: {period}")


def previous_range(period: str, d: date) -> tuple[date, date]:
    start, _ = period_range(period, d)
    return period_range(period, start - timedelta(days=1))


def bucket_labels(period: str, start: date) -> list[str]:
    if period == "day":
        return [f"{h:02d}:00" for h in range(24)]
    if period == "week":
        return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    if period == "month":
        return [str(i) for i in range(1, 32)]
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def bucket_index(period: str, dt: datetime, start: date) -> int:
    if period == "day":
        return dt.hour
    if period == "week":
        return dt.date().weekday()
    if period == "month":
        return dt.day - 1
    return dt.month - 1


def bucket_count(period: str, start: date, end: date) -> int:
    return {"day": 24, "week": 7, "year": 12}.get(period) or (end - start).days + 1


# ---- Data access --------------------------------------------------------
def fetch_blocks(
    db: Session, start: date, end: date, category_id: int | None = None
) -> list[FocusBlock]:
    q = select(FocusBlock).where(
        FocusBlock.started_at >= datetime.combine(start, time.min),
        FocusBlock.started_at < datetime.combine(end + timedelta(days=1), time.min),
    )
    if category_id is not None:
        q = q.where(FocusBlock.category_id == category_id)
    return list(db.scalars(q.order_by(FocusBlock.started_at)))


def goal_for(goals: list[DailyGoal], d: date, category_id: int | None) -> int:
    """Target minutes in force on date d for the given scope (None = overall)."""
    applicable = [
        g for g in goals if g.category_id == category_id and g.effective_from <= d
    ]
    if not applicable:
        return 0
    return max(applicable, key=lambda g: (g.effective_from, g.id)).target_minutes


def minutes_by_day(blocks: list[FocusBlock]) -> dict[date, float]:
    out: dict[date, float] = defaultdict(float)
    for b in blocks:
        out[b.started_at.date()] += b.actual_seconds / 60
    return out


# ---- Metrics ------------------------------------------------------------
def compute_metrics(
    blocks: list[FocusBlock],
    goals: list[DailyGoal],
    start: date,
    end: date,
    category_id: int | None,
    today: date,
) -> dict:
    n = len(blocks)
    total_min = sum(b.actual_seconds for b in blocks) / 60
    flow = sum(1 for b in blocks if b.rating == "flow")
    scores = [RATING_SCORE[b.rating] for b in blocks]

    per_day = minutes_by_day(blocks)
    goal_days = met_days = 0
    d = start
    last = min(end, today)
    while d <= last:
        target = goal_for(goals, d, category_id)
        if target > 0:
            goal_days += 1
            if per_day.get(d, 0) >= target:
                met_days += 1
        d += timedelta(days=1)

    return {
        "total_minutes": round(total_min, 1),
        "block_count": n,
        "avg_block_minutes": round(total_min / n, 1) if n else 0,
        "flow_rate": round(100 * flow / n, 1) if n else 0,
        "avg_rating": round(sum(scores) / n, 2) if n else 0,
        "longest_block_minutes": round(max((b.actual_seconds for b in blocks), default=0) / 60, 1),
        "breaks_skipped": sum(1 for b in blocks if not b.break_taken),
        "active_days": len(per_day),
        "goal_days": goal_days,
        "goal_days_met": met_days,
    }


def with_delta(cur: dict, prev: dict) -> dict:
    out = {}
    for k, v in cur.items():
        p = prev[k]
        out[k] = {
            "current": v,
            "previous": p,
            "delta": round(v - p, 2),
            "delta_pct": round(100 * (v - p) / p, 1) if p else None,
        }
    return out


def summary(
    db: Session, period: str, d: date, category_id: int | None, today: date | None = None
) -> dict:
    today = today or date.today()
    s, e = period_range(period, d)
    ps, pe = previous_range(period, d)
    goals = list(db.scalars(select(DailyGoal)))
    cur = compute_metrics(fetch_blocks(db, s, e, category_id), goals, s, e, category_id, today)
    prev = compute_metrics(fetch_blocks(db, ps, pe, category_id), goals, ps, pe, category_id, today)
    return {
        "period": period,
        "range": {"start": s, "end": e},
        "previous_range": {"start": ps, "end": pe},
        "metrics": with_delta(cur, prev),
    }


def _series(period: str, blocks: list[FocusBlock], start: date, size: int) -> list[float]:
    vals = [0.0] * size
    for b in blocks:
        i = bucket_index(period, b.started_at, start)
        if 0 <= i < size:
            vals[i] += b.actual_seconds / 60
    return [round(v, 1) for v in vals]


def timeseries(db: Session, period: str, d: date, category_id: int | None) -> dict:
    s, e = period_range(period, d)
    ps, pe = previous_range(period, d)
    size = max(bucket_count(period, s, e), bucket_count(period, ps, pe))
    cur = _series(period, fetch_blocks(db, s, e, category_id), s, size)
    prev = _series(period, fetch_blocks(db, ps, pe, category_id), ps, size)
    labels = bucket_labels(period, s)[:size]
    return {
        "period": period,
        "points": [
            {"label": labels[i], "current": cur[i], "previous": prev[i]} for i in range(size)
        ],
    }


def breakdown(db: Session, period: str, d: date, category_id: int | None) -> dict:
    s, e = period_range(period, d)
    ps, pe = previous_range(period, d)
    cats = {c.id: c for c in db.scalars(select(Category))}
    tasks = {t.id: t for t in db.scalars(select(Task))}

    def agg(blocks):
        by_cat: dict = defaultdict(float)
        by_task: dict = defaultdict(float)
        for b in blocks:
            m = b.actual_seconds / 60
            by_cat[b.category_id] += m
            if b.task_id:
                by_task[b.task_id] += m
        return by_cat, by_task

    cc, ct = agg(fetch_blocks(db, s, e, category_id))
    pc, pt = agg(fetch_blocks(db, ps, pe, category_id))

    def cat_row(cid):
        c = cats.get(cid)
        return {
            "id": cid,
            "name": c.name if c else "Uncategorized",
            "color": c.color if c else "#94a3b8",
            "current": round(cc.get(cid, 0), 1),
            "previous": round(pc.get(cid, 0), 1),
        }

    def task_row(tid):
        t = tasks.get(tid)
        c = cats.get(t.category_id) if t else None
        return {
            "id": tid,
            "name": t.name if t else "Deleted task",
            "category": c.name if c else None,
            "color": c.color if c else "#94a3b8",
            "current": round(ct.get(tid, 0), 1),
            "previous": round(pt.get(tid, 0), 1),
        }

    cat_rows = sorted((cat_row(i) for i in set(cc) | set(pc)), key=lambda r: -r["current"])
    task_rows = sorted((task_row(i) for i in set(ct) | set(pt)), key=lambda r: -r["current"])
    return {"categories": cat_rows, "tasks": task_rows[:15]}


def ratings(db: Session, period: str, d: date, category_id: int | None) -> list[dict]:
    s, e = period_range(period, d)
    ps, pe = previous_range(period, d)

    def count(blocks):
        c = {r: 0 for r in RATINGS}
        for b in blocks:
            c[b.rating] += 1
        return c

    cur = count(fetch_blocks(db, s, e, category_id))
    prev = count(fetch_blocks(db, ps, pe, category_id))
    return [{"rating": r, "current": cur[r], "previous": prev[r]} for r in RATINGS]


def block_progression(db: Session, d: date, category_id: int | None) -> list[dict]:
    """Planned length + rating of each block in a day: the 'start small, grow' curve."""
    return [
        {
            "time": b.started_at.strftime("%H:%M"),
            "planned_minutes": b.planned_minutes,
            "actual_minutes": round(b.actual_seconds / 60, 1),
            "rating": b.rating,
        }
        for b in fetch_blocks(db, d, d, category_id)
    ]


def daily_minutes(db: Session, start: date, end: date, category_id: int | None) -> list[dict]:
    per_day = minutes_by_day(fetch_blocks(db, start, end, category_id))
    out, d = [], start
    while d <= end:
        out.append({"date": d, "minutes": round(per_day.get(d, 0), 1)})
        d += timedelta(days=1)
    return out


def streak(db: Session, today: date | None = None) -> dict:
    """Consecutive days meeting the overall daily goal (today doesn't break a streak)."""
    today = today or date.today()
    goals = [g for g in db.scalars(select(DailyGoal)) if g.category_id is None]
    if not goals:
        return {"current": 0, "longest": 0}
    first = min(g.effective_from for g in goals)
    per_day = minutes_by_day(fetch_blocks(db, first, today, None))

    longest = run = 0
    d = first
    met_by_day: dict[date, bool] = {}
    while d <= today:
        target = goal_for(goals, d, None)
        met = target > 0 and per_day.get(d, 0) >= target
        met_by_day[d] = met
        run = run + 1 if met else 0
        longest = max(longest, run)
        d += timedelta(days=1)

    current = 0
    d = today
    if not met_by_day.get(d, False):
        d -= timedelta(days=1)
    while d >= first and met_by_day.get(d, False):
        current += 1
        d -= timedelta(days=1)
    return {"current": current, "longest": longest}
