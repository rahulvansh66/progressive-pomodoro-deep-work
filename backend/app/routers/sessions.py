from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import FocusBlock
from ..schemas import BlockIn, BlockOut, BlockPage, BlockUpdate, Suggestion
from ..services.progression import Rules, suggest_next
from .goals import get_settings

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# Declared before "/{block_id}" routes so "suggest" is not parsed as an id.
@router.get("/suggest", response_model=Suggestion)
def suggest(planned_minutes: int, rating: str, db: Session = Depends(get_db)):
    s = get_settings(db)
    rules = Rules(
        s.min_block_minutes, s.max_block_minutes, s.focused_step, s.flow_step, s.break_minutes
    )
    try:
        return suggest_next(planned_minutes, rating, rules)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("", response_model=BlockPage)
def list_blocks(
    start: date | None = None,
    end: date | None = None,
    category_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = select(FocusBlock)
    if start:
        q = q.where(FocusBlock.started_at >= datetime.combine(start, time.min))
    if end:
        q = q.where(FocusBlock.started_at < datetime.combine(end + timedelta(days=1), time.min))
    if category_id is not None:
        q = q.where(FocusBlock.category_id == category_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = list(
        db.scalars(q.order_by(FocusBlock.started_at.desc()).limit(limit).offset(offset))
    )
    return {"items": items, "total": total}


@router.post("", response_model=BlockOut, status_code=201)
def create_block(body: BlockIn, db: Session = Depends(get_db)):
    block = FocusBlock(**body.model_dump())
    db.add(block)
    db.commit()
    return block


@router.patch("/{block_id}", response_model=BlockOut)
def update_block(block_id: int, body: BlockUpdate, db: Session = Depends(get_db)):
    block = db.get(FocusBlock, block_id)
    if not block:
        raise HTTPException(404, "Block not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(block, k, v)
    db.commit()
    return block


@router.delete("/{block_id}", status_code=204)
def delete_block(block_id: int, db: Session = Depends(get_db)):
    block = db.get(FocusBlock, block_id)
    if not block:
        raise HTTPException(404, "Block not found")
    db.delete(block)
    db.commit()
