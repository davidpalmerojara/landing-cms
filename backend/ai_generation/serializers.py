from rest_framework import serializers


TONE_CHOICES = (
    ('professional', 'professional'),
    ('creative', 'creative'),
    ('minimalist', 'minimalist'),
    ('corporate', 'corporate'),
)

LANGUAGE_CHOICES = (
    ('es', 'es'),
    ('en', 'en'),
)


class OwnKeyMixin(serializers.Serializer):
    """Optional user API key, used for this request only and never stored."""
    provider = serializers.ChoiceField(choices=[('gemini', 'Gemini'), ('anthropic', 'Anthropic')], required=False)
    api_key = serializers.CharField(required=False, allow_blank=True, max_length=255, trim_whitespace=True, write_only=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get('api_key') and not attrs.get('provider'):
            raise serializers.ValidationError({'provider': 'Indica el proveedor de tu clave.'})
        return attrs


class GeneratePageSerializer(OwnKeyMixin, serializers.Serializer):
    prompt = serializers.CharField(max_length=2000, trim_whitespace=True)
    tone = serializers.ChoiceField(
        choices=TONE_CHOICES,
        required=False,
        allow_blank=True,
        default='',
    )
    language = serializers.ChoiceField(
        choices=LANGUAGE_CHOICES,
        required=False,
        default='es',
    )


class EditBlockSerializer(OwnKeyMixin, serializers.Serializer):
    instruction = serializers.CharField(max_length=1000, trim_whitespace=True)
