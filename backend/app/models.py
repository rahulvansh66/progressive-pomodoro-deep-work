from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

RATINGS = ("distracted", "okay", "focused", "flow")
RATING_SCORE = {"distracted": 1, "okay": 2, "focused": 3, "flow": 4}


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    category: Mapped[Category] = relationship(back_populates="tasks")


class FocusBlock(Base):
    __tablename__ = "focus_blocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    planned_minutes: Mapped[int] = mapped_column(Integer)
    actual_seconds: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    ended_at: Mapped[datetime] = mapped_column(DateTime)
    rating: Mapped[str] = mapped_column(String(16))
    break_taken: Mapped[bool] = mapped_column(Boolean, default=False)
    break_seconds: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    category: Mapped[Category | None] = relationship()
    task: Mapped[Task | None] = relationship()


class DailyGoal(Base):
    """A goal applies from `effective_from` until a newer goal for the same scope."""

    __tablename__ = "daily_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True
    )
    target_minutes: Mapped[int] = mapped_column(Integer)
    effective_from: Mapped[date] = mapped_column(Date)


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    default_start_minutes: Mapped[int] = mapped_column(Integer, default=5)
    min_block_minutes: Mapped[int] = mapped_column(Integer, default=2)
    max_block_minutes: Mapped[int] = mapped_column(Integer, default=60)
    focused_step: Mapped[int] = mapped_column(Integer, default=5)
    flow_step: Mapped[int] = mapped_column(Integer, default=10)
    break_minutes: Mapped[int] = mapped_column(Integer, default=5)
