"""The committed deployment files agree with each other and with the code (A2, A4, A5, A14)."""
import json
import re
import stat
from pathlib import Path

import pytest

from config.client_ip import ORIGIN_SECRET_HEADER

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT = BACKEND_DIR.parent


def read(relative):
    return (ROOT / relative).read_text()


def render_env(name):
    """The value of an envVars entry in render.yaml (the file is flat enough to read without a YAML parser)."""
    match = re.search(rf'- key: {name}\n\s+value: "?([^"\n]+)"?', read('render.yaml'))
    return match.group(1) if match else None


class TestRenderBlueprint:
    def test_deploy002_the_build_runs_the_script_that_migrates_and_seeds_the_plans(self):
        assert re.search(r'^\s+buildCommand: bash build\.sh$', read('render.yaml'), re.MULTILINE)
        script = read('backend/build.sh')
        for step in ('collectstatic --noinput', 'migrate --noinput', 'seed_plans', 'seed_demo'):
            assert f'manage.py {step}' in script
        assert 'pip install --require-hashes -r requirements.txt' in script

    def test_deploy002_the_build_refuses_to_migrate_a_throwaway_sqlite_file(self):
        assert ': "${DATABASE_URL:?' in read('backend/build.sh')

    def test_deploy002_the_build_script_is_executable_and_stops_at_the_first_failure(self):
        script = BACKEND_DIR / 'build.sh'

        assert script.stat().st_mode & stat.S_IXUSR
        assert 'set -euo pipefail' in script.read_text()

    def test_deploy002_the_start_command_matches_the_procfile_and_the_health_check_is_the_database_free_route(self):
        blueprint = read('render.yaml')
        start = re.search(r'startCommand: (.+)', blueprint).group(1)

        assert read('backend/Procfile').strip() == f'web: {start}'
        assert re.search(r'healthCheckPath: /healthz$', blueprint, re.MULTILINE)

    def test_deploy002_the_procfile_has_no_release_line_that_nothing_runs(self):
        assert 'release:' not in read('backend/Procfile')

    def test_deploy007_python_is_pinned_to_the_minor_ci_and_the_lockfile_use(self):
        pinned = render_env('PYTHON_VERSION')
        minor = read('backend/.python-version').strip()

        assert re.fullmatch(r'\d+\.\d+\.\d+', pinned), 'Render needs a fully qualified version'
        assert pinned.startswith(f'{minor}.')
        assert f'--python-version {minor}' in read('backend/requirements.txt')

    def test_the_blueprint_sets_what_the_production_checks_demand(self):
        assert render_env('DJANGO_DEBUG') == 'False'
        assert int(render_env('NUM_PROXIES')) >= 1
        assert int(render_env('DIRECT_PROXY_HOPS')) == 1
        assert 'generateValue: true' in read('render.yaml')

    def test_the_blueprint_commits_no_secret_values(self):
        blueprint = read('render.yaml')
        for name in ('ORIGIN_SECRET', 'DATABASE_URL', 'MIGRATE_DATABASE_URL', 'REVALIDATE_SECRET', 'DEMO_PASSWORD'):
            assert re.search(rf'- key: {name}\n\s+sync: false', blueprint), name


class TestOriginSecretContract:
    def test_sec002_vercel_adds_the_header_the_backend_reads(self):
        config = json.loads(read('frontend/vercel.json'))
        transforms = [t for route in config['routes'] for t in route['transforms']]

        assert [t['target']['key'].lower() for t in transforms] == [ORIGIN_SECRET_HEADER.lower()]

    def test_sec002_the_proxied_prefixes_are_the_next_rewrites(self):
        sources = re.findall(r"source: '/(\w+)/:path\*', destination: `\$\{backend\}", read('frontend/next.config.ts'))
        route = json.loads(read('frontend/vercel.json'))['routes'][0]

        assert sorted(sources) == sorted(re.match(r'/\(([^)]+)\)/', route['src']).group(1).split('|'))


class TestNodeVersionIsOneMajorEverywhere:
    def test_deploy008_nvmrc_engines_and_ci_agree(self):
        nvmrc = read('.nvmrc').strip()
        engines = json.loads(read('frontend/package.json'))['engines']['node']
        major = nvmrc.split('.')[0]

        assert re.fullmatch(r'\d+\.\d+\.\d+', nvmrc), 'start-dev.sh compares it as major.minor.patch'
        assert engines == f'{major}.x'
        ci = read('.github/workflows/ci.yml')
        assert ci.count('node-version-file: .nvmrc') == 2
        assert 'node-version:' not in ci


class TestDailyMaintenanceWorkflow:
    @pytest.fixture
    def workflow(self):
        return read('.github/workflows/cleanup.yml')

    def test_a14_it_runs_daily_and_by_hand(self, workflow):
        assert re.search(r'cron: "\d+ \d+ \* \* \*"', workflow)
        assert 'workflow_dispatch:' in workflow

    def test_a14_without_the_secret_every_step_is_skipped_and_the_run_passes(self, workflow):
        gated = workflow.count("if: steps.secret.outputs.enabled == 'true'")

        assert 'DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}' in workflow
        assert 'enabled=false' in workflow
        assert gated == 4  # checkout, python, install, command

    def test_a14_the_secret_check_does_not_need_the_checkout(self, workflow):
        step = workflow.split('- name: Is the database secret set?')[1].split('- uses:')[0]

        assert 'working-directory: .' in step

    def test_a14_it_runs_the_command_this_repo_provides(self, workflow):
        assert 'python manage.py daily_maintenance' in workflow
        assert (BACKEND_DIR / 'pages/management/commands/daily_maintenance.py').exists()

    def test_a14_it_does_not_publish_the_database_url_anywhere(self, workflow):
        assert 'upload-artifact' not in workflow
        assert 'echo "$DATABASE_URL"' not in workflow
