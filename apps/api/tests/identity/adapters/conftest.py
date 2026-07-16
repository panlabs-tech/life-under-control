"""Truncates the Household-bearing tables before each test in this directory.

`SqlHouseholdRepo.load_household` does `LIMIT 1` (ADR-0002: exactly one
Household ever) — deterministic only when the table holds exactly what a
given test put there. Safe against the shared session-scoped `pg_engine`:
every other Seam-2 suite (finance) creates its own Household/User rows per
test and never depends on rows surviving from elsewhere, so wiping the table
here never breaks a test that runs before or after this directory's.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

__all__: list[str] = []


@pytest.fixture(autouse=True)
async def isolated_household(pg_engine: AsyncEngine) -> None:
    """Wipes the Household-bearing tables so `LIMIT 1` sees only this test's rows."""
    async with pg_engine.begin() as conn:
        await conn.execute(text("truncate households cascade"))
