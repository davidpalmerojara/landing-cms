from django.urls import path
from .views import GeneratePageView, EditBlockView

urlpatterns = [
    path('pages/<uuid:page_id>/generate/', GeneratePageView.as_view(), name='page-generate'),
    path('pages/<uuid:page_id>/blocks/<uuid:block_id>/edit-ai/', EditBlockView.as_view(), name='block-edit-ai'),
]
