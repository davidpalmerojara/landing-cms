from django.contrib import admin
from .models import AIGenerationLog


@admin.register(AIGenerationLog)
class AIGenerationLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'page', 'mode', 'tokens_in', 'tokens_out', 'cost_estimate', 'created_at']
    list_filter = ['mode', 'created_at']
    readonly_fields = ['id', 'user', 'page', 'prompt', 'mode', 'tokens_in', 'tokens_out', 'cost_estimate', 'created_at']
    ordering = ['-created_at']
