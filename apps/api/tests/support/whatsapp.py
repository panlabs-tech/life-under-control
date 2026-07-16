"""Seam-2 whatsapp fixtures: the Proposal scaffolding every whatsapp repo test builds on."""

from dataclasses import fields
from datetime import date
from uuid import uuid4

from luc_api.whatsapp.domain.payment_proposal import NewPaymentProposal, PaymentProposalData

__all__ = ["BASE_PROPOSAL_DATA", "new_proposal"]

BASE_PROPOSAL_DATA = PaymentProposalData(
    wa_message_id="wamid.test",
    bytes_hash="hash",
    paid_by="",
    bill_id=None,
    amount_cents=1500,
    paid_on=date(2026, 7, 15),
    reference_period="2026-07",
    payee="Empresa Teste",
    staging_key="finance/proposals/staging",
    mime_type="image/jpeg",
)


def new_proposal(household_id: str, paid_by: str, **over: object) -> NewPaymentProposal:
    """Builds a `NewPaymentProposal` from `BASE_PROPOSAL_DATA`, with per-test field overrides."""
    base = {f.name: getattr(BASE_PROPOSAL_DATA, f.name) for f in fields(PaymentProposalData)}
    values = base | {"paid_by": paid_by} | over
    return NewPaymentProposal(id=str(uuid4()), household_id=household_id, **values)  # type: ignore[arg-type]
