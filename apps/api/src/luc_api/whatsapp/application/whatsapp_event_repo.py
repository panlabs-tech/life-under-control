"""WhatsappEventRepo port: idempotency of the webhook edge table (ADR-0012), with its fake.

The digest use-case (#189) reuses the same table under synthetic keys
(`digest:{date}:{phone}`) — no separate claim-date column exists; a claim is
just a row keyed by `wa_message_id`, and "same day" is baked into the caller's
key, not this port's contract.
"""

from typing import Protocol

__all__ = ["FakeWhatsappEventRepo", "WhatsappEventRepo"]


class WhatsappEventRepo(Protocol):
    """Port for the webhook edge's idempotency table."""

    async def claim(self, wa_message_id: str, remetente: str) -> bool:
        """Claims processing of the event — `True` the first time (persists), `False` if already claimed.

        Atomic: under concurrent redelivery, only one call returns `True` (the
        database's unique index decides, never a read followed by a write).
        """
        ...

    async def release(self, wa_message_id: str) -> None:
        """Releases a claim (deletes the row) — no-op if the key doesn't exist.

        The digest's compensation (#160): claims before sending the template;
        if the send fails, releases so the next run can try again instead of
        poisoning the day. The webhook (#155) never calls this — there, Meta's
        own redelivery is the retry.
        """
        ...


class FakeWhatsappEventRepo:
    """In-memory `WhatsappEventRepo` — the test double of the port."""

    def __init__(self) -> None:
        """Starts with no claims."""
        self._claimed: set[str] = set()

    async def claim(self, wa_message_id: str, remetente: str) -> bool:
        """Claims `wa_message_id`; `False` if already claimed."""
        if wa_message_id in self._claimed:
            return False
        self._claimed.add(wa_message_id)
        return True

    async def release(self, wa_message_id: str) -> None:
        """Releases the claim on `wa_message_id`; no-op if absent."""
        self._claimed.discard(wa_message_id)
