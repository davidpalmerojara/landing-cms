from rest_framework import permissions

from .guests import GuestNotAllowed


class IsNotGuest(permissions.BasePermission):
    """Refuses guest sessions with a GUEST_NOT_ALLOWED error the client can explain."""

    def has_permission(self, request, view):
        if getattr(request.user, 'is_guest', False):
            raise GuestNotAllowed()
        return True
