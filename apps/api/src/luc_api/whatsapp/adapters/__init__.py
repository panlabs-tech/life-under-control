"""Whatsapp adapters layer: concrete implementations of the whatsapp ports (F2, ADR-0014).

Map: `SqlPaymentProposalRepo` (the Proposal's CAS persistence, Seam-2) and
`SqlWhatsappEventRepo` (webhook idempotency + digest claim/release,
insert-first-catch-unique-violation). May depend on `application` and
`domain`; nothing upstream depends on this layer.
"""

from luc_api.whatsapp.adapters.payment_proposal_repo import SqlPaymentProposalRepo
from luc_api.whatsapp.adapters.whatsapp_event_repo import SqlWhatsappEventRepo

__all__ = ["SqlPaymentProposalRepo", "SqlWhatsappEventRepo"]
