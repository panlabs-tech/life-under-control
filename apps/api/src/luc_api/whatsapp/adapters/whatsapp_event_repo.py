"""SqlWhatsappEventRepo: Postgres/Core adapter for WhatsappEventRepo (Seam-2, F2, #193).

`claim` inserts first — the unique index on `wa_message_id` is what decides
under concurrent redelivery, never a read followed by a write (which would
let two redeliveries through the check together). `release` deletes the row;
no-op if the key doesn't exist.
"""

from sqlalchemy import delete, insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.shared.adapters.db.metadata import whatsapp_events

__all__ = ["SqlWhatsappEventRepo"]


class SqlWhatsappEventRepo:
    """`WhatsappEventRepo` over SQLAlchemy Core (async, psycopg3) — the anti-corruption layer."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Wraps the shared async engine; every method is its own transaction."""
        self._engine = engine

    async def claim(self, wa_message_id: str, remetente: str) -> bool:
        """Claims `wa_message_id`; `False` if the unique index says it's already claimed."""
        stmt = insert(whatsapp_events).values(wa_message_id=wa_message_id, remetente=remetente)
        try:
            async with self._engine.begin() as conn:
                await conn.execute(stmt)
        except IntegrityError as exc:
            if "whatsapp_events_wa_message_id_unique" in str(exc.orig):
                return False
            raise
        return True

    async def release(self, wa_message_id: str) -> None:
        """Deletes the claim on `wa_message_id`; no-op if absent."""
        stmt = delete(whatsapp_events).where(whatsapp_events.c.wa_message_id == wa_message_id)
        async with self._engine.begin() as conn:
            await conn.execute(stmt)
