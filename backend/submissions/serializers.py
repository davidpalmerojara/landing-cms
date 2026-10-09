from rest_framework import serializers

from pages.block_sanitizers import sanitize_plain_text
from .models import FormSubmission


class ContactSubmissionSerializer(serializers.Serializer):
    """Validates what a visitor sends through a published contact form."""
    name = serializers.CharField(max_length=100)
    email = serializers.EmailField(max_length=254)
    message = serializers.CharField(max_length=2000)
    block_id = serializers.UUIDField(required=False, allow_null=True)

    def _clean_text(self, value):
        cleaned = sanitize_plain_text(value).strip()
        if not cleaned:
            raise serializers.ValidationError('Este campo no puede estar vacío.')
        return cleaned

    def validate_name(self, value):
        return self._clean_text(value)

    def validate_message(self, value):
        return self._clean_text(value)


class FormSubmissionSerializer(serializers.ModelSerializer):
    """What the page owner sees."""

    class Meta:
        model = FormSubmission
        fields = ['id', 'block_id', 'name', 'email', 'message', 'created_at']
        read_only_fields = fields
