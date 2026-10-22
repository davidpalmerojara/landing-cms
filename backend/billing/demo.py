"""Demo plan: every account gets the Pro features while payments are off (C1, ADR-051).

Registered accounts used to fall to Free (no collaboration, no analytics, the
watermark) right after a guest trial that had everything. With no way to pay,
the cliff only hid the product. With DEMO_ALL_PRO on (the default) and billing
off, `get_user_plan` answers the Pro plan for everyone; the stored
subscriptions are not touched, so turning billing on brings the real plans back.
"""
from django.conf import settings

from config.features import billing_enabled


def demo_all_pro() -> bool:
    return bool(settings.DEMO_ALL_PRO) and not billing_enabled()
