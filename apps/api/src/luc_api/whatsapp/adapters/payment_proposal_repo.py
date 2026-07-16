"""SqlPaymentProposalRepo: Postgres/Core adapter for PaymentProposalRepo (Seam-2, F2, #193).

Every CAS transition (`confirm`/`cancel`/`mark_expired`/`update_bill`/
`update_reference_period`/`update_field`/`set_awaiting`) is a surgical
`update().where(estado == "proposta").returning()` (ADR-0014): the write only
applies if the row is still open, and an empty `RETURNING` means the repo
lost the race — never an exception. `create` relies on the database's own
partial unique index (`whatsapp_proposals_hash_ativo_uidx`) to close the
check-then-insert race between two concurrent deliveries of the same
receipt, translating the driver's `IntegrityError` into `DuplicateProposalError`.
"""

from typing import Any

from sqlalchemy import Row, Select, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.shared.adapters.db.metadata import whatsapp_proposals
from luc_api.shared.adapters.system_clock import HOUSEHOLD_TZ
from luc_api.whatsapp.application.payment_proposal_repo import (
    AmountPatch,
    DuplicateProposalError,
    FieldPatch,
    PaidOnPatch,
)
from luc_api.whatsapp.domain.payment_proposal import (
    ACTIVE_PROPOSAL_STATES,
    FreeTextField,
    NewPaymentProposal,
    PaymentProposal,
    PaymentProposalData,
)

__all__ = ["SqlPaymentProposalRepo"]


class SqlPaymentProposalRepo:
    """`PaymentProposalRepo` over SQLAlchemy Core (async, psycopg3) — the anti-corruption layer."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Wraps the shared async engine; every method is its own transaction."""
        self._engine = engine

    async def create(self, new_proposal: NewPaymentProposal) -> PaymentProposal:
        """Persist a new Proposal; the partial unique index closes the dedup race."""
        stmt = (
            insert(whatsapp_proposals)
            .values(
                id=new_proposal.id,
                household_id=new_proposal.household_id,
                **_proposal_write_values(new_proposal),
            )
            .returning(*whatsapp_proposals.c)
        )
        try:
            async with self._engine.begin() as conn:
                row = (await conn.execute(stmt)).one()
        except IntegrityError as exc:
            if "whatsapp_proposals_hash_ativo_uidx" in str(exc.orig):
                raise DuplicateProposalError(new_proposal.bytes_hash) from exc
            raise
        return _row_to_proposal(row)

    async def get_active_by_hash(
        self, household_id: str, bytes_hash: str
    ) -> PaymentProposal | None:
        """The Household's active Proposal of the same bytes hash; `None` if none is active."""
        stmt = select(whatsapp_proposals).where(
            whatsapp_proposals.c.household_id == household_id,
            whatsapp_proposals.c.bytes_hash == bytes_hash,
            whatsapp_proposals.c.estado.in_(ACTIVE_PROPOSAL_STATES),
        )
        return await self._one_or_none(stmt)

    async def get_by_id(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """The Household's Proposal by id (any state); `None` when missing or another Lar's."""
        stmt = select(whatsapp_proposals).where(
            whatsapp_proposals.c.household_id == household_id,
            whatsapp_proposals.c.id == proposal_id,
        )
        return await self._one_or_none(stmt)

    async def confirm(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> confirmada`; `None` when it was no longer `proposta`."""
        return await self._cas_open(household_id, proposal_id, estado="confirmada")

    async def cancel(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> cancelada`; `None` when it was no longer `proposta`."""
        return await self._cas_open(household_id, proposal_id, estado="cancelada")

    async def mark_expired(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> expirada`; `None` when it was no longer `proposta`."""
        return await self._cas_open(household_id, proposal_id, estado="expirada")

    async def update_bill(
        self, household_id: str, proposal_id: str, bill_id: str, reference_period: str | None
    ) -> PaymentProposal | None:
        """Rewrites Bill and reference period of a still-open Proposal; leaves a pending edit untouched."""
        return await self._cas_open(
            household_id, proposal_id, bill_id=bill_id, competencia=reference_period
        )

    async def update_reference_period(
        self, household_id: str, proposal_id: str, reference_period: str
    ) -> PaymentProposal | None:
        """Rewrites only the reference period; leaves a pending edit untouched."""
        return await self._cas_open(household_id, proposal_id, competencia=reference_period)

    async def update_field(
        self, household_id: str, proposal_id: str, patch: FieldPatch
    ) -> PaymentProposal | None:
        """Writes a free-text field's value and clears the pending edit."""
        if isinstance(patch, AmountPatch):
            changes: dict[str, object] = {"valor_centavos": patch.amount_cents}
        elif isinstance(patch, PaidOnPatch):
            changes = {"data_pagamento": patch.paid_on}
        else:
            changes = {"favorecido": patch.payee}
        return await self._cas_open(
            household_id,
            proposal_id,
            aguardando_campo=None,
            aguardando_por=None,
            **changes,
        )

    async def set_awaiting(
        self, household_id: str, proposal_id: str, field: FreeTextField, person: str
    ) -> PaymentProposal | None:
        """CAS-target-first: marks this Proposal waiting, then releases the person's other pending edits.

        Both writes share one transaction: the target's CAS and the release
        of the Pessoa's other pending edits either both land or neither does.
        """
        cas_stmt = (
            update(whatsapp_proposals)
            .where(
                whatsapp_proposals.c.household_id == household_id,
                whatsapp_proposals.c.id == proposal_id,
                whatsapp_proposals.c.estado == "proposta",
            )
            .values(aguardando_campo=field, aguardando_por=person)
            .returning(*whatsapp_proposals.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(cas_stmt)).one_or_none()
            if row is None:
                return None
            release_stmt = (
                update(whatsapp_proposals)
                .where(
                    whatsapp_proposals.c.household_id == household_id,
                    whatsapp_proposals.c.id != proposal_id,
                    whatsapp_proposals.c.aguardando_por == person,
                )
                .values(aguardando_campo=None, aguardando_por=None)
            )
            await conn.execute(release_stmt)
        return _row_to_proposal(row)

    async def get_awaiting_by_person(
        self, household_id: str, person: str
    ) -> PaymentProposal | None:
        """The open Proposal on which this Pessoa has a pending free-text edit; `None` if none pending."""
        stmt = select(whatsapp_proposals).where(
            whatsapp_proposals.c.household_id == household_id,
            whatsapp_proposals.c.estado == "proposta",
            whatsapp_proposals.c.aguardando_por == person,
            whatsapp_proposals.c.aguardando_campo.is_not(None),
        )
        return await self._one_or_none(stmt)

    async def clear_awaiting(self, household_id: str, person: str) -> None:
        """Releases every pending edit of this Pessoa in the Household, regardless of state."""
        stmt = (
            update(whatsapp_proposals)
            .where(
                whatsapp_proposals.c.household_id == household_id,
                whatsapp_proposals.c.aguardando_por == person,
            )
            .values(aguardando_campo=None, aguardando_por=None)
        )
        async with self._engine.begin() as conn:
            await conn.execute(stmt)

    async def list_open(self) -> list[PaymentProposal]:
        """Every still-open (`proposta`) Proposal, regardless of Household."""
        stmt = select(whatsapp_proposals).where(whatsapp_proposals.c.estado == "proposta")
        async with self._engine.connect() as conn:
            rows = (await conn.execute(stmt)).all()
        return [_row_to_proposal(row) for row in rows]

    async def _cas_open(
        self, household_id: str, proposal_id: str, **changes: object
    ) -> PaymentProposal | None:
        """Surgical CAS on `estado == 'proposta'`; empty `RETURNING` means the race was lost."""
        stmt = (
            update(whatsapp_proposals)
            .where(
                whatsapp_proposals.c.household_id == household_id,
                whatsapp_proposals.c.id == proposal_id,
                whatsapp_proposals.c.estado == "proposta",
            )
            .values(**changes)
            .returning(*whatsapp_proposals.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_proposal(row) if row is not None else None

    async def _one_or_none(self, stmt: Select[Any]) -> PaymentProposal | None:
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_proposal(row) if row is not None else None


def _proposal_write_values(data: PaymentProposalData) -> dict[str, object]:
    """Translates `PaymentProposalData` into column values — the write half of the mapping."""
    return {
        "wa_message_id": data.wa_message_id,
        "bytes_hash": data.bytes_hash,
        "paid_by": data.paid_by,
        "bill_id": data.bill_id,
        "valor_centavos": data.amount_cents,
        "data_pagamento": data.paid_on,
        "competencia": data.reference_period,
        "favorecido": data.payee,
        "staging_key": data.staging_key,
        "tipo_mime": data.mime_type,
    }


def _row_to_proposal(row: Row[Any]) -> PaymentProposal:
    """Translates a `whatsapp_proposals` row into a `PaymentProposal` — the read half of the mapping."""
    return PaymentProposal(
        id=row.id,
        household_id=row.household_id,
        wa_message_id=row.wa_message_id,
        bytes_hash=row.bytes_hash,
        paid_by=row.paid_by,
        bill_id=row.bill_id,
        amount_cents=row.valor_centavos,
        paid_on=row.data_pagamento,
        reference_period=row.competencia,
        payee=row.favorecido,
        staging_key=row.staging_key,
        mime_type=row.tipo_mime,
        state=row.estado,
        created_at=row.criado_em.astimezone(HOUSEHOLD_TZ).date(),
        awaiting_field=row.aguardando_campo,
        awaiting_person=row.aguardando_por,
    )
