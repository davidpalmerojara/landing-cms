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


class GeneratePageSerializer(serializers.Serializer):
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


class EditBlockSerializer(serializers.Serializer):
    instruction = serializers.CharField(max_length=1000, trim_whitespace=True)
