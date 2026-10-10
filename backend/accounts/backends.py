"""Sign-in that ignores the case of the username (D8)."""
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class CaseInsensitiveModelBackend(ModelBackend):
    """`Demo` and `demo` are the same account: the database enforces that two
    usernames never differ only by case, so the lookup matches at most one."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)
        if not isinstance(username, str) or password is None:
            return None
        user = User.objects.filter(username__iexact=username.strip()).first()
        if user is None:
            # Same work as a real check, so a missing account is not faster to reject
            User().set_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
