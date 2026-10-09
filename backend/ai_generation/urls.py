from django.urls import path
from .views import AIOptionsView, GeneratePageView, EditBlockView

urlpatterns = [
    path('ai/options/', AIOptionsView.as_view(), name='ai-options'),
    path('pages/<uuid:page_id>/generate/', GeneratePageView.as_view(), name='page-generate'),
    path('pages/<uuid:page_id>/blocks/<uuid:block_id>/edit-ai/', EditBlockView.as_view(), name='block-edit-ai'),
]
