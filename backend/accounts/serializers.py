from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
import re

from rest_framework import serializers

from .guests import GUEST_EMAIL_DOMAIN, guest_expires_at
from .messages import message

User = get_user_model()

# New usernames (register, guest claim) use only letters and digits of the English
# alphabet, "_", "." and "-" (SEC2-004): a Cyrillic "а" or a full-width "ｄｅｍｏ"
# looked like someone else's name in share emails and collaborator lists, and
# Django's NFKC normalisation turned "ｄｅｍｏ" into "demo" after the uniqueness
# check, which ended in a 500 (SEC2-003). Existing accounts keep their names.
ASCII_USERNAME = re.compile(r'[A-Za-z0-9_.-]+')


_NOT_ASCII_USERNAME_CHAR = re.compile(r'[^A-Za-z0-9_.-]')
USERNAME_FROM_EMAIL_MAX = 30


def username_base_from_email(email: str) -> str:
    """The start of a username for an account created from an email (magic
    link, Google): the part before the "@" with every character the username
    rule does not allow ("+", "'", accents...) turned into "_" (SEC3-005)."""
    local_part = email.split('@')[0][:USERNAME_FROM_EMAIL_MAX]
    return _NOT_ASCII_USERNAME_CHAR.sub('_', local_part) or 'user'


def ascii_username_validator(value):
    if not isinstance(value, str) or not ASCII_USERNAME.fullmatch(value):
        raise serializers.ValidationError(message('username_chars'))


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'username', 'password', 'password2']
        # The default UniqueValidators compare case-sensitively; validate_email
        # and validate_username below ignore case (D8)
        extra_kwargs = {
            'email': {'validators': []},
            # Stricter than Django's UnicodeUsernameValidator: ASCII only (SEC2-004)
            'username': {'validators': [ascii_username_validator]},
        }

    def _others(self):
        """Every account except the one being updated (a guest claiming its account)."""
        queryset = User.objects.all()
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        return queryset

    def validate_email(self, value):
        value = value.strip().lower()
        if value.endswith(f'@{GUEST_EMAIL_DOMAIN}'):
            raise serializers.ValidationError(message('real_email'))
        if self._others().filter(email__iexact=value).exists():
            raise serializers.ValidationError(message('email_taken'))
        return value

    def validate_username(self, value):
        if self._others().filter(username__iexact=value).exists():
            raise serializers.ValidationError(message('username_taken'))
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password2': message('passwords_differ')})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    has_google = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    expires_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'avatar', 'created_at', 'has_google', 'has_password', 'is_guest', 'expires_at']
        read_only_fields = ['id', 'created_at', 'is_guest']

    def get_has_google(self, obj):
        return bool(obj.google_id)

    def get_has_password(self, obj):
        """Magic-link and Google accounts have none: deleting them is confirmed by typing the username."""
        return obj.has_usable_password()

    def get_expires_at(self, obj):
        """When a guest session is deleted; null for normal accounts."""
        expires_at = guest_expires_at(obj)
        return expires_at.isoformat() if expires_at else None



class GoogleAuthSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)


class MagicLinkRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        # `MAGIC@x.com` and `magic@x.com` are the same inbox and the same account (D8)
        return value.strip().lower()


class MagicLinkVerifySerializer(serializers.Serializer):
    token = serializers.CharField(required=True)


class DeleteAccountSerializer(serializers.Serializer):
    """The proof that the request comes from the person: their password, or
    their username typed in full when the account has no password."""
    password = serializers.CharField(
        required=False, allow_blank=True, write_only=True, max_length=128, trim_whitespace=False,
    )
    confirm_username = serializers.CharField(required=False, allow_blank=True, max_length=150)
