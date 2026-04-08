from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PageViewSet, PublicPageView, AssetViewSet, PageVersionViewSet,
    SitemapView, SitemapDataView, CustomDomainViewSet, ResolveDomainView,
)

router = DefaultRouter()
router.register('pages', PageViewSet, basename='page')
router.register('assets', AssetViewSet, basename='asset')
router.register('domains', CustomDomainViewSet, basename='domain')

# Nested version routes under pages
version_list = PageVersionViewSet.as_view({'get': 'list', 'post': 'create'})
version_detail = PageVersionViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy'})
version_restore = PageVersionViewSet.as_view({'post': 'restore'})

urlpatterns = [
    path('public/pages/<slug:slug>/', PublicPageView.as_view(), name='public-page'),
    path('sitemap/', SitemapView.as_view(), name='sitemap'),
    path('public/sitemap-data/', SitemapDataView.as_view(), name='sitemap-data'),
    path('public/resolve-domain/', ResolveDomainView.as_view(), name='resolve-domain'),
    path('pages/<uuid:page_id>/versions/', version_list, name='page-version-list'),
    path('pages/<uuid:page_id>/versions/<uuid:id>/', version_detail, name='page-version-detail'),
    path('pages/<uuid:page_id>/versions/<uuid:id>/restore/', version_restore, name='page-version-restore'),
    path('', include(router.urls)),
]
