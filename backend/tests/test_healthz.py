from django.test import Client


def test_healthz_is_ok_without_touching_the_database():
    # No django_db mark: pytest-django raises on any database access,
    # which is exactly what this endpoint must avoid.
    resp = Client().get('/healthz')
    assert resp.status_code == 200
    assert resp.json() == {'status': 'ok'}
