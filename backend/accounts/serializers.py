from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from rest_framework import serializers

from .guests import GUEST_EMAIL_DOMAIN, guest_expires_at
from .messages import message

User = get_user_model()


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
            'username': {'validators': [UnicodeUsernameValidator()]},
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
