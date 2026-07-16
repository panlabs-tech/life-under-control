"""Seam-2: SqlAttachmentRepo against a real Postgres — mapping and scoping (F2)."""

from datetime import date
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.finance.adapters.attachment_repo import SqlAttachmentRepo
from luc_api.finance.adapters.bill_repo import SqlBillRepo
from luc_api.finance.adapters.payment_repo import SqlPaymentRepo
from luc_api.finance.application.attachment_repo import NewAttachment
from luc_api.finance.application.bill_repo import NewBill
from luc_api.finance.application.payment_repo import NewPayment
from luc_api.finance.domain.attachment import receipt_key
from luc_api.finance.domain.bill import BillData, FixedDayRule, Recurrence
from tests.support.postgres import create_household, create_user, requires_postgres

__all__: list[str] = []

pytestmark = requires_postgres

_BILL_DATA = BillData(
    name="Internet",
    description=None,
    icon="wifi",
    recurrence=Recurrence(interval_months=1, anchor_month=None),
    due_rule=FixedDayRule(day=15),
    due_month_offset=0,
    first_reference_period="2026-07",
)


async def _scaffold(pg_engine: AsyncEngine) -> tuple[str, str, str]:
    """A fresh Household, its User and one Payment — the trio every Attachment needs."""
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    bill = await SqlBillRepo(pg_engine).create_bill(
        NewBill(household_id=household_id, **vars(_BILL_DATA))
    )
    payment = await SqlPaymentRepo(pg_engine).create_payment(
        NewPayment(
            amount_cents=1500,
            paid_on=date(2026, 7, 15),
            reference_period="2026-07",
            paid_by=user_id,
            household_id=household_id,
            bill_id=bill.id,
        )
    )
    return household_id, user_id, payment.id


def _new_attachment(household_id: str, payment_id: str, uploaded_by: str) -> NewAttachment:
    attachment_id = str(uuid4())
    return NewAttachment(
        original_name="comprovante.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        id=attachment_id,
        household_id=household_id,
        payment_id=payment_id,
        r2_key=receipt_key(household_id, payment_id, attachment_id),
        uploaded_by=uploaded_by,
    )


async def test_create_attachment_returns_domain_with_created_at(pg_engine: AsyncEngine) -> None:
    household_id, user_id, payment_id = await _scaffold(pg_engine)
    repo = SqlAttachmentRepo(pg_engine)
    new_attachment = _new_attachment(household_id, payment_id, user_id)

    attachment = await repo.create_attachment(new_attachment)

    assert attachment.id == new_attachment.id
    assert attachment.household_id == household_id
    assert attachment.payment_id == payment_id
    assert attachment.r2_key == new_attachment.r2_key
    assert attachment.created_at is not None


async def test_list_attachments_by_payments_scopes_by_household(pg_engine: AsyncEngine) -> None:
    household_id, user_id, payment_id = await _scaffold(pg_engine)
    other_household_id, other_user_id, other_payment_id = await _scaffold(pg_engine)
    repo = SqlAttachmentRepo(pg_engine)
    await repo.create_attachment(_new_attachment(household_id, payment_id, user_id))
    await repo.create_attachment(
        _new_attachment(other_household_id, other_payment_id, other_user_id)
    )

    found = await repo.list_attachments_by_payments(household_id, [payment_id, other_payment_id])

    assert [a.payment_id for a in found] == [payment_id]


async def test_list_attachments_by_payments_of_empty_list_is_empty(
    pg_engine: AsyncEngine,
) -> None:
    repo = SqlAttachmentRepo(pg_engine)

    assert await repo.list_attachments_by_payments("whatever-household", []) == []


async def test_get_attachment_of_another_household_is_none(pg_engine: AsyncEngine) -> None:
    household_id, user_id, payment_id = await _scaffold(pg_engine)
    other_household_id = await create_household(pg_engine)
    repo = SqlAttachmentRepo(pg_engine)
    attachment = await repo.create_attachment(_new_attachment(household_id, payment_id, user_id))

    assert await repo.get_attachment(other_household_id, attachment.id) is None
    assert (await repo.get_attachment(household_id, attachment.id)) == attachment


async def test_rename_attachment_replaces_original_name(pg_engine: AsyncEngine) -> None:
    household_id, user_id, payment_id = await _scaffold(pg_engine)
    repo = SqlAttachmentRepo(pg_engine)
    attachment = await repo.create_attachment(_new_attachment(household_id, payment_id, user_id))

    renamed = await repo.rename_attachment(household_id, attachment.id, "novo-nome.pdf")

    assert renamed is not None
    assert renamed.original_name == "novo-nome.pdf"


async def test_delete_attachment_then_second_delete_is_none(pg_engine: AsyncEngine) -> None:
    household_id, user_id, payment_id = await _scaffold(pg_engine)
    repo = SqlAttachmentRepo(pg_engine)
    attachment = await repo.create_attachment(_new_attachment(household_id, payment_id, user_id))

    deleted = await repo.delete_attachment(household_id, attachment.id)
    assert deleted is not None
    assert deleted.id == attachment.id

    assert await repo.delete_attachment(household_id, attachment.id) is None
