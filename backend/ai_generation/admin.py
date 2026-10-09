from django.contrib import admin
from .models import AIGenerationLog


@admin.register(AIGenerationLog)
class AIGenerationLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'page', 'mode', 'source', 'tokens_in', 'tokens_out', 'cost_estimate', 'created_at']
    list_filter = ['mode', 'source', 'created_at']
    readonly_fields = ['id', 'user', 'page', 'prompt', 'mode', 'source', 'tokens_in', 'tokens_out', 'cost_estimate', 'created_at']
    ordering = ['-created_at']
