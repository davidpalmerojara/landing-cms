"""
Django settings for Paxl backend.
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
if not SECRET_KEY:
    # Allow insecure key ONLY when DEBUG is explicitly enabled
    if os.environ.get('DJANGO_DEBUG', '').lower() in ('true', '1', 'yes'):
        SECRET_KEY = 'django-insecure-dev-only-change-in-production'
    else:
        raise RuntimeError(
            'DJANGO_SECRET_KEY environment variable is required in production. '
            'Set DJANGO_DEBUG=True for local development without a key.'
        )

DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() in ('true', '1', 'yes')

ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')


# Apps

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'channels',
    # Local
    'accounts',
    'pages',
    'collaboration',
    'ai_generation',
    'analytics',
    'billing',
    'submissions',
]


# Middleware

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'accounts.middleware.OriginCheckMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]


# URLs

ROOT_URLCONF = 'config.urls'


# Templates

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'


# Database — SQLite for dev, PostgreSQL for production

if os.environ.get('DATABASE_URL'):
    # Production: postgres://user:pass@host:5432/name?sslmode=require
    import urllib.parse
    url = urllib.parse.urlparse(os.environ['DATABASE_URL'])
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': url.path[1:],
            'USER': urllib.parse.unquote(url.username or ''),
            'PASSWORD': urllib.parse.unquote(url.password or ''),
            'HOST': url.hostname,
            'PORT': url.port or 5432,
            # Query parameters (e.g. sslmode=require for Neon) go to the driver
            'OPTIONS': dict(urllib.parse.parse_qsl(url.query)),
            'CONN_MAX_AGE': 60,
            'CONN_HEALTH_CHECKS': True,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }


# Auth

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# i18n

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# Static files

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# whitenoise serves the collected static files (Django admin) from the app
# itself, so production needs no separate static host. The manifest storage
# needs `collectstatic`, which only runs in the production build.
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {
        'BACKEND': (
            'django.contrib.staticfiles.storage.StaticFilesStorage' if DEBUG
            else 'whitenoise.storage.CompressedManifestStaticFilesStorage'
        ),
    },
}


# Media files (uploads)

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Max upload size: 5MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024


# Default PK

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# DRF

REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'accounts.authentication.CookieJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'user': '120/minute',
        'auth': '10/minute',
        'login_username': '5/minute',
        'contact': '5/minute',
        'guest': os.environ.get('GUEST_CREATION_RATE', '5/hour'),
    },
    # Number of trusted proxies in front of the app. With the default (unset)
    # DRF used the whole X-Forwarded-For header as the client id, so any
    # client could reset its rate limits by sending a different value.
    # 0 = use the connection address; set it to the real hop count in production.
    'NUM_PROXIES': int(os.environ.get('NUM_PROXIES', '0')),
    'EXCEPTION_HANDLER': 'config.exception_handler.custom_exception_handler',
}


# JWT

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}


# CORS — allow frontend dev server

# The editor tags its writes with its WebSocket connection id (ADR-024), so
# a direct (non-rewritten) call needs it allowed in the CORS preflight.
CORS_ALLOW_HEADERS = (*default_headers, 'x-connection-id')

CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001'
).split(',')

CORS_ALLOW_CREDENTIALS = True

# Origins allowed to make state-changing requests with the auth cookies
# (accounts.middleware.OriginCheckMiddleware) and to open WebSockets.
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get('CSRF_TRUSTED_ORIGINS', ','.join(CORS_ALLOWED_ORIGINS)).split(',') if o.strip()
]


# Security headers (enforced in production)
if not DEBUG:
    # TLS ends at the hosting proxy, which forwards plain HTTP with
    # X-Forwarded-Proto. No SECURE_SSL_REDIRECT: the platform already
    # redirects to HTTPS and its internal health check arrives over HTTP.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True


# Guest mode ("try it without signing up", accounts/guests.py)
# How long a guest account and everything in it lives, in hours.
GUEST_LIFETIME_HOURS = int(os.environ.get('GUEST_LIFETIME_HOURS', '24'))
# Guest accounts alive at the same time; past this, new guests get a 503.
GUEST_MAX_ACTIVE = int(os.environ.get('GUEST_MAX_ACTIVE', '200'))
# Pages one guest can create.
GUEST_MAX_PAGES = int(os.environ.get('GUEST_MAX_PAGES', '5'))


# Google OAuth

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')


# Email — console backend for dev, SMTP/Resend for production

EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend'
)
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Paxl <noreply@localhost>')

# SMTP settings (for production with Resend, SendGrid, etc.)
EMAIL_HOST = os.environ.get('EMAIL_HOST', '')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True').lower() in ('true', '1', 'yes')

# Magic link
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
# Shared with the frontend: lets the backend ask it to drop a cached public
# page after publishing (ADR-019). Empty: no request is sent.
REVALIDATE_SECRET = os.environ.get('REVALIDATE_SECRET', '')


# --- Custom domains (ADR-025) ---
# Off by default: they need DNS verification and SSL on the host, which the free
# demo hosting does not provide. Off: the endpoints answer 404 FEATURE_DISABLED
# and the frontend hides every trace of the feature.
CUSTOM_DOMAINS_ENABLED = os.environ.get('CUSTOM_DOMAINS_ENABLED', 'False').lower() in ('true', '1', 'yes')
# What a customer points their domain at (CNAME, or the A record as an alternative)
CUSTOM_DOMAINS_CNAME_TARGET = os.environ.get('CUSTOM_DOMAINS_CNAME_TARGET', 'domains.tu-dominio.com')
CUSTOM_DOMAINS_A_RECORD = os.environ.get('CUSTOM_DOMAINS_A_RECORD', '203.0.113.10')
# The app's own domains: nobody can register them (or their subdomains) as a custom domain
CUSTOM_DOMAINS_RESERVED = [
    d.strip().lower() for d in os.environ.get('CUSTOM_DOMAINS_RESERVED', 'tu-dominio.com').split(',') if d.strip()
]


# --- AI generation (ADR-023) ---
# Server-level keys (users can send their own with each request; those are never stored)
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
GOOGLE_AI_KEY = os.environ.get('GOOGLE_AI_KEY', '')
# Model ids sent to each provider
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
ANTHROPIC_MODEL = os.environ.get('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514')
# Demo mode (default): the server key is never used. Page generation serves a saved
# response and block editing a saved variant. A key sent with the request still works.
AI_DEMO_MODE = os.environ.get('AI_DEMO_MODE', 'True').lower() in ('true', '1', 'yes')
# Seconds a saved response takes to arrive, so it feels like the real thing (0 in tests)
AI_DEMO_DELAY_SECONDS = float(os.environ.get('AI_DEMO_DELAY_SECONDS', '2.5'))
# With AI_DEMO_MODE=False and a server key: calls per UTC day, for everyone and per user.
# Past either limit (or if the provider reports its quota is exhausted) a saved response is served.
AI_LIVE_DAILY_LIMIT = int(os.environ.get('AI_LIVE_DAILY_LIMIT', '30'))
AI_LIVE_USER_DAILY_LIMIT = int(os.environ.get('AI_LIVE_USER_DAILY_LIMIT', '2'))


# Stripe
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
STRIPE_PRO_PRICE_MONTHLY = os.environ.get('STRIPE_PRO_PRICE_MONTHLY', '')
STRIPE_PRO_PRICE_YEARLY = os.environ.get('STRIPE_PRO_PRICE_YEARLY', '')


# Redis & Channels

REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
# Without REDIS_URL: in-memory channel layer and block locks (single process only)
REDIS_ENABLED = bool(os.environ.get('REDIS_URL'))

# Use Redis channel layer if available, otherwise fall back to in-memory (dev only).
# In-memory only works for a single process — use Redis in production.
if REDIS_ENABLED:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [REDIS_URL],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }
