from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CreateStaffView,
    LoginView,
    UserDetailView,
    UsersView,
    ask_question,
    forgot_password,
    me,
    register,
    resend_otp,
    reset_password,
    verify_email,
)

urlpatterns = [
    path('register/', register),
    path('verify-email/', verify_email),
    path('resend-otp/', resend_otp),
    path('login/', LoginView.as_view()),
    path('token/refresh/', TokenRefreshView.as_view()),
    path('users/', UsersView.as_view()),
    path('users/<int:pk>/', UserDetailView.as_view()),
    path('create-staff/', CreateStaffView.as_view()),
    path('me/', me),
    path('ask-question/', ask_question),
    path('forgot-password/', forgot_password),
    path('reset-password/', reset_password),
]
