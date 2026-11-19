import os
from datetime import date, datetime

os.environ["POMODORO_DB_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.services import stats as svc
from app.services.progression import Rules, suggest_next


# ---- Period math --------------------------------------------------------
def test_period_ranges():
    d = date(2024, 3, 6)  # Wednesday
    assert svc.period_range("day", d) == (d, d)
    assert svc.period_range("week", d) == (date(2024, 3, 4), date(2024, 3, 10))
    assert svc.period_range("month", d) == (date(2024, 3, 1), date(2024, 3, 31))
    assert svc.period_range("year", d) == (date(2024, 1, 1), date(2024, 12, 31))


def test_previous_ranges_rollover():
    assert svc.previous_range("day", date(2024, 3, 1)) == (date(2024, 2, 29),) * 2  # leap year
    assert svc.previous_range("week", date(2024, 1, 3)) == (date(2023, 12, 25), date(2023, 12, 31))
    assert svc.previous_range("month", date(2024, 1, 15)) == (date(2023, 12, 1), date(2023, 12, 31))
    assert svc.previous_range("month", date(2024, 3, 15)) == (date(2024, 2, 1), date(2024, 2, 29))
    assert svc.previous_range("year", date(2024, 6, 1)) == (date(2023, 1, 1), date(2023, 12, 31))


# ---- Progression --------------------------------------------------------
@pytest.mark.parametrize(
    "planned,rating,nxt,brk",
    [(5, "distracted", 3, True), (3, "distracted", 2, True), (10, "okay", 10, True),
     (10, "focused", 15, True), (10, "flow", 20, False), (55, "flow", 60, False)],
)
def test_suggest_next(planned, rating, nxt, brk):
    r = suggest_next(planned, rating, Rules())
    assert r["next_minutes"] == nxt and r["take_break"] is brk


# ---- API ----------------------------------------------------------------
@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def add_block(c, day, minutes, rating="okay", cat=None, hour=9):
    start = datetime(day.year, day.month, day.day, hour, 0)
    r = c.post("/api/sessions", json={
        "category_id": cat, "planned_minutes": minutes, "actual_seconds": minutes * 60,
        "started_at": start.isoformat(), "ended_at": start.isoformat(),
        "rating": rating, "break_taken": rating != "flow",
    })
    assert r.status_code == 201, r.text


def test_summary_compares_with_previous_week(client):
    cat = client.post("/api/categories", json={"name": "Code"}).json()["id"]
    add_block(client, date(2024, 3, 6), 20, "flow", cat)     # current week
    add_block(client, date(2024, 3, 7), 10, "okay", cat)
    add_block(client, date(2024, 2, 28), 15, "focused", cat)  # previous week
    r = client.get("/api/stats/summary", params={"period": "week", "date": "2024-03-06"}).json()
    m = r["metrics"]
    assert m["total_minutes"]["current"] == 30 and m["total_minutes"]["previous"] == 15
    assert m["total_minutes"]["delta_pct"] == 100.0
    assert m["flow_rate"]["current"] == 50.0
    assert r["previous_range"]["start"] == "2024-02-26"


def test_delta_pct_none_when_previous_zero(client):
    add_block(client, date(2024, 3, 6), 10)
    m = client.get("/api/stats/summary", params={"period": "day", "date": "2024-03-06"}).json()["metrics"]
    assert m["total_minutes"]["previous"] == 0 and m["total_minutes"]["delta_pct"] is None


def test_timeseries_and_breakdown(client):
    cat = client.post("/api/categories", json={"name": "Study"}).json()["id"]
    add_block(client, date(2024, 3, 6), 10, cat=cat)  # Wednesday -> index 2
    add_block(client, date(2024, 2, 28), 5, cat=cat)
    pts = client.get("/api/stats/timeseries", params={"period": "week", "date": "2024-03-06"}).json()["points"]
    assert pts[2]["current"] == 10 and pts[2]["previous"] == 5 and len(pts) == 7
    b = client.get("/api/stats/breakdown", params={"period": "week", "date": "2024-03-06"}).json()
    assert b["categories"][0]["name"] == "Study" and b["categories"][0]["current"] == 10


def test_goals_and_streak(client):
    client.post("/api/goals", json={"target_minutes": 10, "effective_from": "2024-03-04"})
    for d in (4, 5, 6):
        add_block(client, date(2024, 3, d), 10)
    m = client.get("/api/stats/summary", params={"period": "week", "date": "2024-03-06"}).json()["metrics"]
    assert m["goal_days_met"]["current"] == 3
    assert client.get("/api/stats/streak").json()["longest"] == 3


def test_goal_history_not_rewritten(client):
    client.post("/api/goals", json={"target_minutes": 10, "effective_from": "2024-03-01"})
    client.post("/api/goals", json={"target_minutes": 60, "effective_from": "2024-03-05"})
    add_block(client, date(2024, 3, 2), 10)  # meets old goal
    add_block(client, date(2024, 3, 6), 10)  # misses new goal
    m = client.get("/api/stats/summary", params={"period": "day", "date": "2024-03-02"}).json()["metrics"]
    assert m["goal_days_met"]["current"] == 1
    m = client.get("/api/stats/summary", params={"period": "day", "date": "2024-03-06"}).json()["metrics"]
    assert m["goal_days_met"]["current"] == 0 and m["goal_days"]["current"] == 1


def test_suggest_endpoint_and_block_crud(client):
    r = client.get("/api/sessions/suggest", params={"planned_minutes": 10, "rating": "flow"}).json()
    assert r["next_minutes"] == 20 and r["take_break"] is False
    add_block(client, date(2024, 3, 6), 10)
    items = client.get("/api/sessions").json()["items"]
    bid = items[0]["id"]
    assert client.patch(f"/api/sessions/{bid}", json={"rating": "flow"}).json()["rating"] == "flow"
    assert client.delete(f"/api/sessions/{bid}").status_code == 204
    assert client.get("/api/sessions").json()["total"] == 0
