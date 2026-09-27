# Arquitectura de Feblio

## Visión

SaaS multi-tenant para gestión de proyectos de principio a fin. Tres niveles de acceso:

```
admin (plataforma Feblio)
  └── empresa (tenant de pago)
        ├── clientes (finales)
        ├── solicitudes (client_intake) y formularios (intake_form_templates)
        ├── proyectos y documentos
        ├── canales e integraciones (integration_connections)
        └── configuración (billing_settings, automation_settings, channel_rules, folder_templates)
```

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS 3 · React Router 6 · Vitest
- **Auth / DB / Storage / Functions:** Supabase (Postgres 17 + GoTrue + RLS + Storage + Edge Functions en Deno)
- **Deploy:** Railway (frontend) · GitHub (repo)

## Modelo de datos

| Tabla | Descripción |
|-------|-------------|
| `empresas` | Tenants: datos fiscales y de contacto, marca, zona horaria/moneda/idioma, verificación, prueba de 14 días y estado del onboarding |
| `profiles` | 1:1 con `auth.users`; `role`, `empresa_id`, `cliente_id`, datos de contacto del propietario (`is_onboarding_owner`) |
| `clientes`, `projects`, `documents`, `tasks`, `document_templates` | Núcleo operativo (con `is_test` para datos sandbox) |
| `client_intake` | Enlaces de formulario por token (ahora con `form_template_id`, `channel`, `expires_at`, `is_test`) |
| `intake_form_templates` | Plantillas de formulario: campos, documentos, consentimientos, caducidad, recordatorios |
| `channel_rules` | Formulario predeterminado, regla de selección y mensaje por canal |
| `consent_records` | Aceptación/rechazo de términos, privacidad y marketing (versión, fecha, IP/UA cuando se puede) |
| `onboarding_steps` | Estado y datos de cada paso del wizard |
| `integration_connections` | Conexiones por canal (estado, cuenta, ajustes sin secretos, pruebas, errores) |
| `integration_credentials` | Credenciales cifradas (solo `service_role`) |
| `integration_health_checks` | Historial de pruebas de conexión |
| `folder_templates` | Estructura de carpetas por proyecto |
| `automation_settings` | Nivel de automatización y reglas |
| `billing_settings` | Series, numeración, validez, anticipo, plazos, impuestos, métodos de cobro, políticas |
| `onboarding_test_runs` | Ejecuciones de la prueba guiada |
| `audit_events` | Auditoría (empresa, usuario, acción, entidad, resultado, metadatos sin secretos, IP/UA) |
| `platform_settings` | Ajustes de plataforma (solo admin), p. ej. `email_verification_mode` |
| `email_otps` | Códigos de verificación (solo funciones) |
| `ia_empresa_config` / `ia_empresa_consumo` | Configuración y contabilidad de gasto del análisis por empresa (0019) |
| `solicitud_documento_texto` | Texto extraído por página. **Solo `service_role`**: `authenticated` nunca lo lee (0019) |
| `solicitud_analisis_ia` | Análisis versionado de una solicitud: clasificación, confianza, cola, lease y consumo (0019) |
| `solicitud_analisis_items` | Ítems del análisis (partes, plazos, actuaciones, preguntas, servicios) con `origin` y `deadline_kind` (0019) |
| `solicitud_analisis_evidencias` | Documento, página y cita ≤300 caracteres. Sin lectura directa: RPC `solicitud_ia_evidencias` (0019) |
| `solicitud_analisis_revisiones` | Traza de aprobación, corrección o rechazo humano (0019) |

Storage: dos buckets **privados**. `intake-files` (adjuntos del formulario público): anon solo puede subir bajo
`{token}/` de un formulario pendiente y no caducado; solo la empresa dueña (o admin) lee/borra, mediante URLs firmadas
de 10 minutos. `empresa-docs`: políticas por prefijo `{empresa_id}/…`.

## Análisis inteligente y automatización progresiva

El análisis de solicitudes y documentos (migración 0019) produce una **propuesta revisable**: ningún
resultado de IA cambia por sí mismo estados, fechas, servicios ni datos de negocio, y los plazos,
requerimientos formales y clasificaciones **siempre** exigen revisión humana. Los documentos se tratan
como entrada hostil y nunca como instrucciones.

El diseño admite automatización creciente de la presupuestación (`assistant`, `approval_required`,
`controlled_auto`, `advanced_auto`) por empresa y por servicio, con autorización expresa de un owner,
interruptor global de parada y once condiciones que deben cumplirse para enviar sin intervención.
Detalle completo, salvaguardas y puntos de extensión en
[analisis-inteligente-solicitudes.md](analisis-inteligente-solicitudes.md).

## Seguridad (RLS)

Cada tabla tiene Row Level Security. Las políticas usan funciones `SECURITY DEFINER`
(`current_role_name()`, `current_empresa_id()`, `current_cliente_id()`, `is_admin()`).

- **admin:** acceso total.
- **empresa:** solo filas con `empresa_id = current_empresa_id()`.
- **cliente:** solo lectura de sus proyectos/documentos.
- Tablas de estado (`onboarding_steps`, `integration_connections`, `audit_events`, `onboarding_test_runs`,
  `integration_health_checks`, `consent_records`) son de **solo lectura** para la empresa; las escrituras pasan por
  RPCs `SECURITY DEFINER` que validan tenant y contenido. Triggers de guarda impiden editar directamente
  `empresas.onboarding_*`, `email_verified`, `subscription_status`, el rol/empresa/email del perfil y el estado
  `connected` de proveedores externos.
- `integration_credentials` no tiene políticas y tiene los privilegios revocados: solo la Edge Function (service role).
- `feblio_trusted()` (marca para triggers de guarda) no usa GUC personalizados (Supabase alojado no permite
  `set_config` de parámetros propios): es cierta cuando `current_user` no es `anon`/`authenticated` (RPCs
  `SECURITY DEFINER`, SQL Editor, migraciones, seeds, trigger de GoTrue) o con `service_role`.
- El signup público no puede auto-asignarse el rol `admin`: `handle_new_user` solo acepta `admin` desde una sesión
  administrativa directa (no `supabase_auth_admin`/PostgREST) **y** con opt-in explícito
  una fila `platform_settings.allow_admin_signup = true` (tabla solo-admin); en cualquier otro caso degrada a `cliente` y audita
  `security.admin_signup_blocked`. `empresa` y `cliente` se respetan tal cual.
- Helpers internos (`audit_log_internal`, `onboarding_target_empresa`, `ensure_onboarding_defaults`, `onboarding_blockers`,
  `feblio_trusted`, `request_ip`, …) tienen `EXECUTE` revocado a `public`, `anon` y `authenticated`.
- Secretos: cifrado AES-256-GCM en la Edge Function con `APP_ENCRYPTION_KEY`; nunca en JSONB de configuración, en
  auditoría, en `localStorage` ni en variables `VITE_*`.

## Flujo de auth y onboarding

1. `signUp` con metadatos (persona, empresa, tipo de titular, NIF, consentimientos) → trigger `handle_new_user`
   crea `empresas`, `profiles`, `consent_records` y auditoría.
2. `AuthContext` carga el `profile`; `ProtectedRoute` redirige por rol.
3. Para `empresa`, `EmpresaGate` decide: verificación de email → `/onboarding/:step` → `/empresa`
   (ver `docs/onboarding.md`).
4. Las integraciones externas se conectan vía Edge Function privada `integrations` (JWT verificado por el gateway y
   por la función) y el callback OAuth público `integrations-oauth-callback` (estado firmado) — ver `docs/integraciones.md`.

## Frontend (organización)

```
src/
├── components/
│   ├── auth/            RegisterForm, LoginForm, DemoAccess, PasswordRequirements
│   ├── forms/           Field (TextField, SelectField, …), BusinessHoursEditor
│   ├── onboarding/      Layout, Stepper, Header, Navigation, AutoSaveStatus, StepStatusBadge,
│   │                    IntegrationCard, ConnectionStatus, CredentialsForm, CreateRequestFromCall, ResumeBanner
│   ├── EmpresaGate, OnboardingRoute, ProtectedRoute, ConfirmDialog, LoadingScreen
├── lib/
│   ├── validation.ts, routing.ts, env.ts, legal.ts, types.ts
│   ├── onboarding/      types, steps, api, validation, OnboardingContext
│   └── integrations/    adapters (registro), api (Edge Function), useIntegration
├── pages/
│   ├── onboarding/      OnboardingPage, registry, steps/* (10 pasos)
│   ├── legal/           Terminos, Privacidad
│   └── Landing, EmpresaDashboard, AdminDashboard, ClienteDashboard, PublicIntakeForm, OAuthCallback
└── sections/
    ├── EmpresaHome, PlantillasSection, VerifyEmailScreen
    └── settings/        SettingsSection (Configuración), IntegrationsSettings
```

## Notas de despliegue (Railway)

Ver `DEPLOY.md`. El frontend es una SPA Vite servida con `serve -s dist`; las variables `VITE_*` se inyectan
en build. Las Edge Functions y sus secrets viven en Supabase.
