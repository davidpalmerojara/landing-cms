"""Paginated lists answer `next`/`previous` relative to the site (APP2-011).

DRF builds absolute links from the request's host. Behind the frontend's /api
rewrite that host is the backend's internal address ("http://localhost:8001",
or the platform's private name in production), which then leaked to the
browser. A path with its query works the same through the rewrite.
"""
from urllib.parse import urlsplit, urlunsplit

from rest_framework.pagination import PageNumberPagination


def site_relative(link: str | None) -> str | None:
    if link is None:
        return None
    parts = urlsplit(link)
    return urlunsplit(('', '', parts.path, parts.query, ''))


class SitePageNumberPagination(PageNumberPagination):
    def get_next_link(self):
        return site_relative(super().get_next_link())

    def get_previous_link(self):
        return site_relative(super().get_previous_link())
