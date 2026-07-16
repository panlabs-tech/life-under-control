"""`Clock` adapter over the system clock, in the Household (Lar) timezone.

Yields a civil date (`datetime.date`), with no time or timezone leaking into
the domain.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from luc_api.shared.application.clock import Clock

__all__ = ["HOUSEHOLD_TZ", "SystemClock", "system_clock"]

HOUSEHOLD_TZ = ZoneInfo("America/Sao_Paulo")
"""The Household's own timezone — the single pin other adapters convert into (e.g. a `timestamptz` column read back as a civil date)."""


class SystemClock:
    """`Clock` over the system clock, in the Household timezone."""

    def today(self) -> date:
        """Today's civil date in the Household timezone."""
        return datetime.now(HOUSEHOLD_TZ).date()


def system_clock() -> Clock:
    """Builds the system `Clock` in the Household timezone."""
    return SystemClock()
