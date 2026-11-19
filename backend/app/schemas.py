from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Rating = Literal["distracted", "okay", "focused", "flow"]
Period = Literal["day", "week", "month", "year"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- Categories / tasks -------------------------------------------------
class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = "#6366f1"
    archived: bool = False


class CategoryOut(ORM):
    id: int
    name: str
    color: str
    archived: bool


class TaskIn(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=200)
    done: bool = False


class TaskUpdate(BaseModel):
    name: str | None = None
    done: bool | None = None


class TaskOut(ORM):
    id: int
    category_id: int
    name: str
    done: bool


# ---- Focus blocks -------------------------------------------------------
class BlockIn(BaseModel):
    category_id: int | None = None
    task_id: int | None = None
    planned_minutes: int = Field(ge=1, le=240)
    actual_seconds: int = Field(ge=0)
    started_at: datetime
    ended_at: datetime
    rating: Rating
    break_taken: bool = False
    break_seconds: int = 0
    note: str | None = None


class BlockUpdate(BaseModel):
    category_id: int | None = None
    task_id: int | None = None
    rating: Rating | None = None
    note: str | None = None
    break_taken: bool | None = None
    break_seconds: int | None = None


class BlockOut(ORM):
    id: int
    category_id: int | None
    task_id: int | None
    planned_minutes: int
    actual_seconds: int
    started_at: datetime
    ended_at: datetime
    rating: Rating
    break_taken: bool
    break_seconds: int
    note: str | None


class BlockPage(BaseModel):
    items: list[BlockOut]
    total: int


class Suggestion(BaseModel):
    next_minutes: int
    take_break: bool
    break_minutes: int
    message: str


# ---- Goals / settings ---------------------------------------------------
class GoalIn(BaseModel):
    category_id: int | None = None
    target_minutes: int = Field(ge=0, le=24 * 60)
    effective_from: date | None = None


class GoalOut(ORM):
    id: int
    category_id: int | None
    target_minutes: int
    effective_from: date


class SettingsIO(ORM):
    default_start_minutes: int = Field(ge=1, le=120)
    min_block_minutes: int = Field(ge=1, le=60)
    max_block_minutes: int = Field(ge=5, le=240)
    focused_step: int = Field(ge=0, le=60)
    flow_step: int = Field(ge=0, le=60)
    break_minutes: int = Field(ge=0, le=60)
