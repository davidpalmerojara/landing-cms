from django.urls import path

from .views import PageSubmissionViewSet, PublicContactView

submission_list = PageSubmissionViewSet.as_view({'get': 'list'})
submission_detail = PageSubmissionViewSet.as_view({'delete': 'destroy'})

urlpatterns = [
    path('public/pages/<slug:slug>/contact/', PublicContactView.as_view(), name='public-page-contact'),
    path('pages/<uuid:page_id>/submissions/', submission_list, name='page-submission-list'),
    path('pages/<uuid:page_id>/submissions/<uuid:id>/', submission_detail, name='page-submission-detail'),
]
