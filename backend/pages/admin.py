from django.contrib import admin
from .models import Workspace, Page, Block, Asset, PageVersion, CustomDomain


class BlockInline(admin.TabularInline):
    model = Block
    extra = 0
    ordering = ['order']


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'created_at')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'status', 'workspace', 'updated_at')
    list_filter = ('status',)
    search_fields = ('name', 'slug')
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [BlockInline]


@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display = ('type', 'order', 'page', 'updated_at')
    list_filter = ('type',)
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(PageVersion)
class PageVersionAdmin(admin.ModelAdmin):
    list_display = ('page', 'version_number', 'trigger', 'label', 'created_by', 'size_bytes', 'created_at')
    list_filter = ('trigger',)
    search_fields = ('page__name', 'label')
    readonly_fields = ('id', 'page', 'version_number', 'snapshot', 'page_metadata', 'trigger', 'created_by', 'size_bytes', 'created_at')


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ('name', 'mime_type', 'size', 'created_at')
    readonly_fields = ('id', 'created_at')


@admin.register(CustomDomain)
class CustomDomainAdmin(admin.ModelAdmin):
    list_display = ('domain', 'page', 'dns_status', 'ssl_status', 'is_active', 'created_at')
    list_filter = ('dns_status', 'ssl_status', 'is_active')
    search_fields = ('domain',)
    readonly_fields = ('id', 'created_at', 'updated_at')
