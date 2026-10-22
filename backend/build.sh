#!/usr/bin/env bash
# Build step of the Render web service (render.yaml: buildCommand, run from backend/).
#
# Render's free plan has no pre-deploy command and no shell, and it does not read the
# Procfile, so everything the new version needs before it starts runs here. If any step
# fails the build fails and the previous version keeps serving (ADR-051).
#
# Migrations therefore run BEFORE the new code is live: keep them backward compatible
# (add, deploy, use, then remove).
#
# MIGRATE_DATABASE_URL (optional): a direct Neon connection string (host without
# `-pooler`) for the schema changes, while DATABASE_URL, the pooled endpoint, serves requests.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set: the build would migrate a throwaway SQLite file}"

pip install --require-hashes -r requirements.txt

python manage.py collectstatic --noinput

# Settings read DATABASE_URL once at start-up, so the override goes in the environment
migration_url="${MIGRATE_DATABASE_URL:-$DATABASE_URL}"
DATABASE_URL="$migration_url" python manage.py migrate --noinput
DATABASE_URL="$migration_url" python manage.py seed_plans
# No-op unless DEMO_USERNAME, DEMO_EMAIL and DEMO_PASSWORD are set
DATABASE_URL="$migration_url" python manage.py seed_demo
