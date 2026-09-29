from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import Skill, User, UserEstadoHistorial


class UserCreationFormEmail(UserCreationForm):
    class Meta:
        model = User
        fields = ("email", "nombre")


class UserChangeFormEmail(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


class EstadoHistorialInline(admin.TabularInline):
    model = UserEstadoHistorial
    fk_name = "usuario"
    extra = 0
    readonly_fields = ("estado", "fecha", "modificado_por", "motivo")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeFormEmail
    add_form = UserCreationFormEmail
    ordering = ("nombre",)
    list_display = ("nombre", "email", "cedula", "roles", "is_active")
    list_filter = ("is_active", "groups", "habilidades")
    search_fields = ("nombre", "email", "cedula", "numero_rol")
    filter_horizontal = ("groups", "user_permissions", "habilidades")
    inlines = [EstadoHistorialInline]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Datos personales", {"fields": ("nombre", "cedula", "numero_rol", "foto", "habilidades")}),
        ("Roles y permisos", {"fields": ("is_active", "groups", "is_staff", "is_superuser")}),
        ("Fechas", {"fields": ("last_login", "date_joined")}),
        ("Migración", {"classes": ("collapse",), "fields": ("firebase_uid",)}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "nombre", "password1", "password2", "groups"),
            },
        ),
    )

    @admin.display(description="roles")
    def roles(self, obj):
        return ", ".join(obj.perfiles)

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("groups")


admin.site.register(Skill)
