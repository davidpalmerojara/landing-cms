from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'username', 'password', 'password2']

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
    has_ai_key = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'avatar', 'created_at', 'has_google', 'ai_provider', 'has_ai_key']
        read_only_fields = ['id', 'created_at']

    def get_has_google(self, obj):
        return bool(obj.google_id)

    def get_has_ai_key(self, obj):
        return bool(obj.ai_api_key)


class AISettingsSerializer(serializers.Serializer):
    ai_provider = serializers.ChoiceField(
        choices=[('', 'None'), ('gemini', 'Google Gemini'), ('anthropic', 'Anthropic Claude')],
        required=False,
        allow_blank=True,
    )
    ai_api_key = serializers.CharField(required=False, allow_blank=True, max_length=255)


class GoogleAuthSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)


class MagicLinkRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class MagicLinkVerifySerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
