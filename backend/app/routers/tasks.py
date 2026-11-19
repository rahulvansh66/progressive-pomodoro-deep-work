from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Category, Task
from ..schemas import TaskIn, TaskOut, TaskUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def list_tasks(
    category_id: int | None = None, include_done: bool = True, db: Session = Depends(get_db)
):
    q = select(Task).order_by(Task.done, Task.id)
    if category_id is not None:
        q = q.where(Task.category_id == category_id)
    if not include_done:
        q = q.where(Task.done.is_(False))
    return list(db.scalars(q))


@router.post("", response_model=TaskOut, status_code=201)
def create_task(body: TaskIn, db: Session = Depends(get_db)):
    if not db.get(Category, body.category_id):
        raise HTTPException(404, "Category not found")
    task = Task(**body.model_dump())
    db.add(task)
    db.commit()
    return task


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(task, k, v)
    db.commit()
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
