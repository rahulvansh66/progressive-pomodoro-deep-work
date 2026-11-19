"""Fill the database with ~1 year of fake focus blocks so the dashboard has data.

Usage (from backend/):  python seed.py [--reset]
"""

import random
import sys
from datetime import date, datetime, timedelta

from app.database import Base, SessionLocal, engine
from app.models import Category, DailyGoal, FocusBlock, Task
from app.services.progression import Rules, suggest_next

Base.metadata.create_all(engine)
db = SessionLocal()

if "--reset" in sys.argv:
    for m in (FocusBlock, DailyGoal, Task, Category):
        db.query(m).delete()
    db.commit()

if db.query(FocusBlock).count():
    sys.exit("Database already has blocks; run with --reset to wipe and reseed.")

random.seed(42)
cats = [("Coding", "#6366f1"), ("Study", "#10b981"), ("Writing", "#f59e0b"), ("Admin", "#ef4444")]
cat_objs = []
for name, color in cats:
    c = Category(name=name, color=color)
    db.add(c)
    cat_objs.append(c)
db.commit()
tasks = []
for c in cat_objs:
    for t in ("Deep session", "Review", "Planning"):
        task = Task(category_id=c.id, name=f"{c.name}: {t}")
        db.add(task)
        tasks.append(task)
db.commit()

today = date.today()
db.add(DailyGoal(target_minutes=90, effective_from=today - timedelta(days=365)))

rules = Rules()
for offset in range(365, -1, -1):
    day = today - timedelta(days=offset)
    if random.random() < 0.2:  # rest day
        continue
    t = datetime(day.year, day.month, day.day, random.choice([8, 9, 10]), 0)
    length = random.choice([2, 3, 5])
    for _ in range(random.randint(2, 7)):
        rating = random.choices(
            ["distracted", "okay", "focused", "flow"], [2, 4, 3, 3]
        )[0]
        cat = random.choice(cat_objs)
        task = random.choice([x for x in tasks if x.category_id == cat.id])
        actual = length * 60 + (random.randint(60, 600) if rating == "flow" else 0)
        end = t + timedelta(seconds=actual)
        nxt = suggest_next(length, rating, rules)
        db.add(FocusBlock(
            category_id=cat.id, task_id=task.id, planned_minutes=length, actual_seconds=actual,
            started_at=t, ended_at=end, rating=rating, break_taken=nxt["take_break"],
            break_seconds=nxt["break_minutes"] * 60,
        ))
        t = end + timedelta(minutes=nxt["break_minutes"])
        length = nxt["next_minutes"]
db.commit()
print("Seeded", db.query(FocusBlock).count(), "blocks.")
