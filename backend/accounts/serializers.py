from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .guests import GUEST_EMAIL_DOMAIN, guest_expires_at

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'username', 'password', 'password2']

    def validate_email(self, value):
        if value.lower().endswith(f'@{GUEST_EMAIL_DOMAIN}'):
            raise serializers.ValidationError('Usa un email real.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password2': 'Las contraseñas no coinciden.'})
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


class MagicLinkVerifySerializer(serializers.Serializer):
    token = serializers.CharField(required=True)


class DeleteAccountSerializer(serializers.Serializer):
    """The proof that the request comes from the person: their password, or
    their username typed in full when the account has no password."""
    password = serializers.CharField(
        required=False, allow_blank=True, write_only=True, max_length=128, trim_whitespace=False,
    )
    confirm_username = serializers.CharField(required=False, allow_blank=True, max_length=150)
