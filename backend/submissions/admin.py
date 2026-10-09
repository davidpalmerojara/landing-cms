from django.contrib import admin

from .models import FormSubmission


@admin.register(FormSubmission)
class FormSubmissionAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'page', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('name', 'email')
    raw_id_fields = ('page',)
