"""Who may do what with a page (ADR-031).

A collaborator edits the content: blocks, theme, SEO, AI edit of one block,
creating and restoring versions. What decides what the public sees or takes
the owner's page elsewhere stays with the owner: publish, unpublish,
duplicate, delete the page or a version, regenerate the whole page with AI,
share, unshare, invite.
"""
from rest_framework import status
from rest_framework.exceptions import APIException

NOT_OWNER_MESSAGE = 'Solo el propietario puede hacer esto.'


class NotOwner(APIException):
    """403 {"error", "code": "NOT_OWNER"}: the page is shared with the user, who is not its owner."""
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'NOT_OWNER'

    def __init__(self, message=NOT_OWNER_MESSAGE):
        super().__init__(detail={'error': message, 'code': 'NOT_OWNER'})


def is_page_owner(page, user) -> bool:
    return page.owner_id is not None and page.owner_id == user.pk


def require_page_owner(page, user, message=NOT_OWNER_MESSAGE) -> None:
    """Raise NotOwner unless `user` owns `page`. Call after the user's access
    to the page was established (a stranger gets 404, not 403)."""
    if not is_page_owner(page, user):
        raise NotOwner(message)
