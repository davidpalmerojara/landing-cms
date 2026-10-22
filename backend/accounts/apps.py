from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        import config.checks  # noqa: F401  (registers the production settings checks)
        import accounts.checks  # noqa: F401  (email settings, ADR-049)
