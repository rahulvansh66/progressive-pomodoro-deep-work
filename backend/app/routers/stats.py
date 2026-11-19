from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import Period
from ..services import stats as svc

router = APIRouter(prefix="/api/stats", tags=["stats"])

# The query parameter is named "date" (alias) to keep the URL natural.
DateQ = Query(None, alias="date")


@router.get("/summary")
def summary(
    period: Period = "week",
    on: date | None = DateQ,
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    return svc.summary(db, period, on or date.today(), category_id)


@router.get("/timeseries")
def timeseries(
    period: Period = "week",
    on: date | None = DateQ,
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    return svc.timeseries(db, period, on or date.today(), category_id)


@router.get("/breakdown")
def breakdown(
    period: Period = "week",
    on: date | None = DateQ,
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    return svc.breakdown(db, period, on or date.today(), category_id)


@router.get("/ratings")
def ratings(
    period: Period = "week",
    on: date | None = DateQ,
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    return svc.ratings(db, period, on or date.today(), category_id)


@router.get("/progression")
def progression(
    on: date | None = DateQ, category_id: int | None = None, db: Session = Depends(get_db)
):
    return svc.block_progression(db, on or date.today(), category_id)


@router.get("/calendar")
def calendar(year: int | None = None, category_id: int | None = None, db: Session = Depends(get_db)):
    y = year or date.today().year
    return svc.daily_minutes(db, date(y, 1, 1), date(y, 12, 31), category_id)


@router.get("/streak")
def streak(db: Session = Depends(get_db)):
    return svc.streak(db)
