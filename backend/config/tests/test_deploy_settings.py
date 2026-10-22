"""Settings and routes the Render + Neon deployment relies on (DEPLOY-006, CODE-002/DATA-001/PERF-006)."""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from config.database import postgres_config

BACKEND_DIR = Path(__file__).resolve().parents[2]
NEON_POOLED = 'postgresql://neondb_owner:p%40ss@ep-cool-1234-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'


class TestDatabaseConfig:
    def test_code002_connections_are_not_kept_between_requests(self):
        """CONN_MAX_AGE=60 under ASGI left an idle connection per request thread, until Neon's cap."""
        assert postgres_config(NEON_POOLED)['CONN_MAX_AGE'] == 0

    def test_code002_server_side_cursors_are_off_for_the_pooled_endpoint(self):
        assert postgres_config(NEON_POOLED)['DISABLE_SERVER_SIDE_CURSORS'] is True

    def test_the_url_parts_and_driver_options_are_kept(self):
        config = postgres_config(NEON_POOLED)

        assert config['HOST'] == 'ep-cool-1234-pooler.eu-central-1.aws.neon.tech'
        assert config['NAME'] == 'neondb'
        assert config['USER'] == 'neondb_owner'
        assert config['PASSWORD'] == 'p@ss'
        assert config['PORT'] == 5432
        assert config['OPTIONS'] == {'sslmode': 'require', 'channel_binding': 'require'}


def settings_in_a_clean_process(**env):
    """Import config.settings with exactly this environment (the module reads it once, at import)."""
    script = (
        'import json, config.settings as s;'
        'print(json.dumps({"db": s.DATABASES["default"], "hosts": s.ALLOWED_HOSTS, '
        '"middleware": s.MIDDLEWARE[:2]}, default=str))'
    )
    clean = {'PATH': os.environ.get('PATH', ''), 'DJANGO_DEBUG': 'False', 'DJANGO_SECRET_KEY': 'x' * 50}
    result = subprocess.run(
        [sys.executable, '-c', script],
        cwd=BACKEND_DIR, env={**clean, **env, 'PYTHONPATH': str(BACKEND_DIR)},
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


class TestSettingsFromTheEnvironment:
    def test_code002_database_url_selects_the_pool_friendly_settings(self):
        loaded = settings_in_a_clean_process(DATABASE_URL=NEON_POOLED)

        assert loaded['db']['CONN_MAX_AGE'] == 0
        assert loaded['db']['DISABLE_SERVER_SIDE_CURSORS'] is True
        assert 'CONN_HEALTH_CHECKS' not in loaded['db']

    def test_deploy006_the_render_hostname_is_always_allowed(self):
        loaded = settings_in_a_clean_process(
            DJANGO_ALLOWED_HOSTS='paxl-api.onrender.com', RENDER_EXTERNAL_HOSTNAME='paxl-api-x1y2.onrender.com',
        )

        assert 'paxl-api-x1y2.onrender.com' in loaded['hosts']

    def test_the_health_check_and_the_client_address_run_before_everything_else(self):
        loaded = settings_in_a_clean_process()

        assert loaded['middleware'] == ['config.middleware.HealthzMiddleware', 'config.client_ip.ClientIPMiddleware']


class TestHealthz:
    @pytest.fixture(autouse=True)
    def only_the_real_host_is_allowed(self, settings):
        settings.ALLOWED_HOSTS = ['paxl-api.onrender.com']

    @pytest.mark.parametrize('path', ['/healthz', '/api/healthz/', '/api/healthz'])
    @pytest.mark.parametrize('host', ['paxl-api.onrender.com', 'localhost:10000', '10.1.2.3:10000'])
    def test_deploy006_any_host_gets_200_ok(self, client, path, host):
        """Render's port detector asks with Host: localhost:<port>; this was a 400 DisallowedHost."""
        response = client.get(path, HTTP_HOST=host)

        assert response.status_code == 200
        assert response.json() == {'status': 'ok'}

    def test_deploy006_head_is_answered_too(self, client):
        assert client.head('/healthz', HTTP_HOST='localhost:10000').status_code == 200

    @pytest.mark.django_db
    def test_healthz_does_not_touch_the_database(self, client, django_assert_num_queries):
        with django_assert_num_queries(0):
            assert client.get('/api/healthz/').status_code == 200

    def test_deploy006_other_paths_still_validate_the_host(self, client):
        assert client.get('/api/features/', HTTP_HOST='evil.example').status_code == 400

    def test_deploy006_only_reads_are_answered_by_the_shortcut(self, client):
        assert client.post('/healthz', HTTP_HOST='localhost:10000').status_code == 400
