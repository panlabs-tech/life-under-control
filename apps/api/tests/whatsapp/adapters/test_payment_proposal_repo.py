"""Seam-2: SqlPaymentProposalRepo against a real Postgres — CAS, dedup, awaiting (F2, #193).

Every Household/User/Proposal is created fresh per test (random uuid) —
reruns against the same long-lived Postgres never collide.
"""

import asyncio
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.finance.adapters.bill_repo import SqlBillRepo
from luc_api.whatsapp.adapters.payment_proposal_repo import SqlPaymentProposalRepo
from luc_api.whatsapp.application.payment_proposal_repo import (
    AmountPatch,
    DuplicateProposalError,
    FieldPatch,
    PaidOnPatch,
    PayeePatch,
)
from tests.support.finance import new_bill as _new_bill
from tests.support.postgres import create_household, create_user, requires_postgres
from tests.support.whatsapp import new_proposal as _new_proposal

__all__: list[str] = []

pytestmark = requires_postgres


async def test_create_returns_domain_born_in_proposta_state(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)

    proposal = await repo.create(_new_proposal(household_id, user_id))

    assert proposal.id
    assert proposal.household_id == household_id
    assert proposal.paid_by == user_id
    assert proposal.state == "proposta"
    assert proposal.awaiting_field is None
    assert proposal.awaiting_person is None


async def test_create_second_proposal_of_same_active_hash_raises_duplicate_error(
    pg_engine: AsyncEngine,
) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    await repo.create(_new_proposal(household_id, user_id, bytes_hash="same-hash"))

    with pytest.raises(DuplicateProposalError):
        await repo.create(_new_proposal(household_id, user_id, bytes_hash="same-hash"))


async def test_create_after_cancel_of_same_hash_succeeds(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    first = await repo.create(_new_proposal(household_id, user_id, bytes_hash="same-hash"))
    await repo.cancel(household_id, first.id)

    second = await repo.create(_new_proposal(household_id, user_id, bytes_hash="same-hash"))

    assert second.id != first.id


async def test_get_active_by_hash_ignores_cancelled(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id, bytes_hash="h"))
    await repo.cancel(household_id, proposal.id)

    assert await repo.get_active_by_hash(household_id, "h") is None


async def test_get_by_id_of_another_household_is_none(pg_engine: AsyncEngine) -> None:
    household_a = await create_household(pg_engine)
    household_b = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_a)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_a, user_id))

    assert await repo.get_by_id(household_b, proposal.id) is None
    assert (await repo.get_by_id(household_a, proposal.id)) == proposal


async def test_confirm_is_cas_and_second_confirm_finds_no_target(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))

    confirmed = await repo.confirm(household_id, proposal.id)
    assert confirmed is not None
    assert confirmed.state == "confirmada"

    lost_race = await repo.confirm(household_id, proposal.id)
    assert lost_race is None


async def test_cancel_is_cas_and_second_cancel_finds_no_target(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))

    cancelled = await repo.cancel(household_id, proposal.id)
    assert cancelled is not None
    assert cancelled.state == "cancelada"

    assert await repo.cancel(household_id, proposal.id) is None


async def test_mark_expired_is_cas(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))

    expired = await repo.mark_expired(household_id, proposal.id)

    assert expired is not None
    assert expired.state == "expirada"


async def test_two_concurrent_confirms_exactly_one_wins(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))

    results = await asyncio.gather(
        repo.confirm(household_id, proposal.id),
        repo.confirm(household_id, proposal.id),
    )

    winners = [r for r in results if r is not None]
    assert len(winners) == 1


async def test_update_bill_leaves_pending_edit_untouched(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    bill = await SqlBillRepo(pg_engine).create_bill(_new_bill(household_id))
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))
    await repo.set_awaiting(household_id, proposal.id, "valor", user_id)

    updated = await repo.update_bill(household_id, proposal.id, bill.id, "2026-08")

    assert updated is not None
    assert updated.bill_id == bill.id
    assert updated.reference_period == "2026-08"
    assert updated.awaiting_field == "valor"
    assert updated.awaiting_person == user_id


async def test_update_reference_period_only_changes_that_field(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))

    updated = await repo.update_reference_period(household_id, proposal.id, "2026-09")

    assert updated is not None
    assert updated.reference_period == "2026-09"


@pytest.mark.parametrize(
    ("patch", "field_name", "expected"),
    [
        (AmountPatch(amount_cents=2500), "amount_cents", 2500),
        (PayeePatch(payee="Novo Favorecido"), "payee", "Novo Favorecido"),
    ],
)
async def test_update_field_writes_value_and_clears_awaiting(
    pg_engine: AsyncEngine, patch: FieldPatch, field_name: str, expected: object
) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))
    await repo.set_awaiting(household_id, proposal.id, "valor", user_id)

    updated = await repo.update_field(household_id, proposal.id, patch)

    assert updated is not None
    assert getattr(updated, field_name) == expected
    assert updated.awaiting_field is None
    assert updated.awaiting_person is None


async def test_update_field_paid_on_patch(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))

    updated = await repo.update_field(
        household_id, proposal.id, PaidOnPatch(paid_on=date(2026, 8, 1))
    )

    assert updated is not None
    assert updated.paid_on == date(2026, 8, 1)


async def test_set_awaiting_releases_other_pending_edit_of_same_person(
    pg_engine: AsyncEngine,
) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    first = await repo.create(_new_proposal(household_id, user_id, bytes_hash="h1"))
    second = await repo.create(_new_proposal(household_id, user_id, bytes_hash="h2"))
    await repo.set_awaiting(household_id, first.id, "valor", user_id)

    marked = await repo.set_awaiting(household_id, second.id, "data", user_id)

    assert marked is not None
    assert marked.awaiting_field == "data"
    released_first = await repo.get_by_id(household_id, first.id)
    assert released_first is not None
    assert released_first.awaiting_field is None
    assert released_first.awaiting_person is None


async def test_get_awaiting_by_person_returns_none_when_none_pending(
    pg_engine: AsyncEngine,
) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    await repo.create(_new_proposal(household_id, user_id))

    assert await repo.get_awaiting_by_person(household_id, user_id) is None


async def test_clear_awaiting_releases_every_pending_edit_of_person(
    pg_engine: AsyncEngine,
) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    proposal = await repo.create(_new_proposal(household_id, user_id))
    await repo.set_awaiting(household_id, proposal.id, "valor", user_id)

    await repo.clear_awaiting(household_id, user_id)

    cleared = await repo.get_by_id(household_id, proposal.id)
    assert cleared is not None
    assert cleared.awaiting_field is None
    assert cleared.awaiting_person is None


async def test_list_open_only_returns_proposta_state(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlPaymentProposalRepo(pg_engine)
    open_proposal = await repo.create(_new_proposal(household_id, user_id, bytes_hash="open"))
    closed_proposal = await repo.create(_new_proposal(household_id, user_id, bytes_hash="closed"))
    await repo.cancel(household_id, closed_proposal.id)

    open_ids = {p.id for p in await repo.list_open()}

    assert open_proposal.id in open_ids
    assert closed_proposal.id not in open_ids
