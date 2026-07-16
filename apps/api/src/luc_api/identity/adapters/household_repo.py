"""SqlHouseholdRepo: Postgres/Core adapter for HouseholdRepo — Row<->Household mapping (Seam-2, F2)."""

from typing import Any

from sqlalchemy import Row, select
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.identity.domain.household import Household, User
from luc_api.shared.adapters.db.metadata import households, users

__all__ = ["SqlHouseholdRepo"]


class SqlHouseholdRepo:
    """`HouseholdRepo` over SQLAlchemy Core (async, psycopg3) — single-Household app (ADR-0002)."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Wraps the shared async engine."""
        self._engine = engine

    async def load_household(self) -> Household | None:
        """The Household with its Users, or `None` if there is no Household yet."""
        async with self._engine.connect() as conn:
            household_row = (await conn.execute(select(households).limit(1))).one_or_none()
            if household_row is None:
                return None
            user_rows = (
                await conn.execute(select(users).where(users.c.household_id == household_row.id))
            ).all()
        return Household(
            id=household_row.id,
            name=household_row.nome,
            users=tuple(_row_to_user(row) for row in user_rows),
        )


def _row_to_user(row: Row[Any]) -> User:
    """Translates a `users` row into a `User` — the read half of the mapping."""
    return User(
        id=row.id,
        name=row.nome,
        email=row.email,
        google_email=row.google_email,
        hue=row.hue,
        initial=row.inicial,
        avatar_key=row.avatar_key,
        whatsapp_phone=row.whatsapp_phone,
        household_id=row.household_id,
    )
