from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DailyGoal, Settings
from ..schemas import GoalIn, GoalOut, SettingsIO

router = APIRouter(prefix="/api", tags=["goals"])


def get_settings(db: Session) -> Settings:
    s = db.get(Settings, 1)
    if not s:
        s = Settings(id=1)
        db.add(s)
        db.commit()
    return s


@router.get("/goals", response_model=list[GoalOut])
def list_goals(db: Session = Depends(get_db)):
    return list(
        db.scalars(
            select(DailyGoal).order_by(DailyGoal.effective_from.desc(), DailyGoal.id.desc())
        )
    )


@router.post("/goals", response_model=GoalOut, status_code=201)
def set_goal(body: GoalIn, db: Session = Depends(get_db)):
    """Add a goal effective from a date (default today); earlier days keep their old goal."""
    eff = body.effective_from or date.today()
    goal = db.scalar(
        select(DailyGoal).where(
            DailyGoal.category_id == body.category_id, DailyGoal.effective_from == eff
        )
    )
    if goal:
        goal.target_minutes = body.target_minutes
    else:
        goal = DailyGoal(
            category_id=body.category_id, target_minutes=body.target_minutes, effective_from=eff
        )
        db.add(goal)
    db.commit()
    return goal


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(DailyGoal, goal_id)
    if not goal:
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()


@router.get("/settings", response_model=SettingsIO)
def read_settings(db: Session = Depends(get_db)):
    return get_settings(db)


@router.put("/settings", response_model=SettingsIO)
def update_settings(body: SettingsIO, db: Session = Depends(get_db)):
    s = get_settings(db)
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return s
