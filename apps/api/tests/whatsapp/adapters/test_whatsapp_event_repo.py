"""Seam-2: SqlWhatsappEventRepo against a real Postgres — claim/release (F2, #193)."""

import asyncio
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.whatsapp.adapters.whatsapp_event_repo import SqlWhatsappEventRepo
from tests.support.postgres import requires_postgres

__all__: list[str] = []

pytestmark = requires_postgres


async def test_claim_first_time_returns_true(pg_engine: AsyncEngine) -> None:
    repo = SqlWhatsappEventRepo(pg_engine)
    wa_message_id = f"wamid.{uuid4()}"

    assert await repo.claim(wa_message_id, "5511999999999") is True


async def test_reclaim_same_message_id_returns_false(pg_engine: AsyncEngine) -> None:
    repo = SqlWhatsappEventRepo(pg_engine)
    wa_message_id = f"wamid.{uuid4()}"
    await repo.claim(wa_message_id, "5511999999999")

    assert await repo.claim(wa_message_id, "5511999999999") is False


async def test_claim_after_release_succeeds(pg_engine: AsyncEngine) -> None:
    repo = SqlWhatsappEventRepo(pg_engine)
    wa_message_id = f"digest:2026-07-15:{uuid4()}"
    await repo.claim(wa_message_id, "5511999999999")

    await repo.release(wa_message_id)

    assert await repo.claim(wa_message_id, "5511999999999") is True


async def test_release_of_unclaimed_message_id_is_noop(pg_engine: AsyncEngine) -> None:
    repo = SqlWhatsappEventRepo(pg_engine)

    await repo.release(f"wamid.{uuid4()}")


async def test_two_concurrent_claims_of_same_message_id_exactly_one_wins(
    pg_engine: AsyncEngine,
) -> None:
    repo = SqlWhatsappEventRepo(pg_engine)
    wa_message_id = f"wamid.{uuid4()}"

    results = await asyncio.gather(
        repo.claim(wa_message_id, "5511999999999"),
        repo.claim(wa_message_id, "5511999999999"),
    )

    assert sorted(results) == [False, True]
