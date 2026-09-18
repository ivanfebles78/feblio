# Registro, verificación y wizard de configuración inicial

Este documento describe el flujo completo que implementa la migración `0009_onboarding_wizard.sql`
y el frontend en `frontend/src/{components,pages,lib}/onboarding*`.

```
REGISTRO → creación de usuario + empresa (trigger) → VERIFICACIÓN DE EMAIL → WIZARD (10 pasos)
        → PRUEBA GUIADA → ACTIVAR FEBLIO → DASHBOARD (/empresa) → Configuración (panel permanente)
```

## 1. Registro (`/`, pestaña «Registrarse»)

Campos (todos con `label` visible, `autocomplete` y errores asociados al campo):

| Campo | Destino | Notas |
|---|---|---|
| Nombre y apellidos | `profiles.full_name` y metadato `full_name` | Persona propietaria de la cuenta |
| Razón social o nombre comercial | `empresas.name` (metadato `company_name`) | Tenant |
| Tipo de titular | `empresas.entity_type` (`company` \| `self_employed`) | Mantiene `tax_type` (`CIF`/`NIF`) por compatibilidad |
| NIF fiscal | `empresas.cif` normalizado (mayúsculas, sin espacios/guiones) | Valida NIF/NIE/CIF con dígito de control; admite identificadores con prefijo de país |
| Correo electrónico profesional | `auth.users.email` / `profiles.email` | Email de acceso |
| Contraseña + confirmación | Supabase Auth | Política: 8+ caracteres, mayúscula, minúscula y número. `confirmPassword` nunca se envía |
| Términos y privacidad (obligatorio) | `consent_records` (`terms_of_service`, `privacy_policy`) | Versión en `src/lib/legal.ts` |
| Comunicaciones comerciales (opcional) | `consent_records` (`marketing`) | No condiciona el registro |

`AuthContext.signUp()` construye los metadatos con `buildSignUpMetadata()`; `handle_new_user()` crea la
empresa, el perfil (con `is_onboarding_owner = true`), los tres registros de consentimiento y los eventos
de auditoría `empresa.registered`, `consent.terms_accepted`, `consent.marketing_accepted|rejected`.

Páginas legales: `/terminos` y `/privacidad` (`src/pages/legal/*`). **Son borradores estructurados que
requieren revisión jurídica.** Al cambiar su texto, actualiza `LEGAL_VERSIONS` para que los nuevos
consentimientos registren la versión correcta.

## 2. Verificación de email: una sola experiencia

Fuente de verdad: `empresas.email_verified`. Existen dos mecanismos y `platform_settings.email_verification_mode` decide cuál se muestra:

| Modo | Qué ve la persona | Configuración en Supabase |
|---|---|---|
| `otp` (por defecto) | Pantalla con código de 6 dígitos enviado por la Edge Function `send-otp` (Resend) y validado por `verify_email_otp()` | **Authentication → Providers → Email → «Confirm email» = OFF**. Si estuviera ON, `signUp` no devuelve sesión y el usuario tendría que confirmar por enlace y *además* introducir el código (doble verificación, que es lo que se evita). |
| `native` | Confirma desde el enlace de Supabase y pulsa «Ya he confirmado»; `claim_native_email_verification()` reconoce `auth.users.email_confirmed_at` y marca `email_verified` | «Confirm email» = ON. Cambia el modo con `update platform_settings set value = '"native"' where key = 'email_verification_mode';` |

`claim_native_email_verification()` solo actúa en modo `native`, por lo que con `otp` nunca se puede saltar el código aunque Supabase autoconfirme.

Diagnóstico del entorno actual: el proyecto `feblio` estaba **pausado** al implementar esto, así que no fue posible leer la configuración de Auth. Comprueba el interruptor «Confirm email» y déjalo en OFF para el modo `otp`.

## 3. Redirección después del login

`EmpresaGate` (`src/components/EmpresaGate.tsx`) consulta en servidor `get_verification_state()` y
`empresas.onboarding_status/onboarding_current_step`, muestra una pantalla de carga y decide con la función pura
`resolveEmpresaDestination()` (`src/lib/routing.ts`):

1. Sin sesión → `/` (login).
2. Email no verificado → pantalla de verificación (modo `otp` o `native`).
3. Verificado y `onboarding_status ≠ completed` → `/onboarding/<onboarding_current_step>` (reanuda).
4. `completed` → `/empresa`. Si se visita `/onboarding` se redirige a `/empresa` (sin bucles).
5. `admin` y `cliente` nunca pasan por el gate: `ProtectedRoute` los envía a `/admin` o `/cliente`.

## 4. Estado del onboarding (modelo)

- `empresas.onboarding_status` (`not_started | in_progress | completed | requires_attention`), `onboarding_current_step`, `onboarding_started_at`, `onboarding_completed_at`, `onboarding_version`.
  Estas columnas (y `email_verified`, `subscription_status`, `trial_ends_at`) solo cambian a través de RPCs: el trigger `empresas_guard_onboarding` rechaza cualquier otra escritura.
- `onboarding_steps` (una fila por paso y empresa): `status` (`pending | in_progress | completed | skipped | error | requires_attention`), `data` JSONB (sin secretos: el RPC rechaza claves `token/secret/password/api_key`), `errors`, fechas, `skipped_reason`, `updated_by`.
- Las empresas creadas **antes** de la migración se marcan `completed` una sola vez (`onboarding_backfill_existing()`, función interna no invocable por usuarios, ejecutada antes de instalar el trigger de guarda y marcada en `platform_settings.onboarding_backfill_done`) para no forzarlas al wizard; pueden reabrirlo desde Configuración. Las empresas nuevas empiezan en `not_started`.

### Pasos

| # | `step_key` | Obligatorio | Dónde se guardan los datos |
|---|---|---|---|
| 1 | `company` | Sí | `empresas` + `profiles` (autoguardado) y copia en `data` |
| 2 | `repository` | Sí (elegir uno; el interno no requiere nada) | `data` + `integration_connections(kind=document_repository)` + `folder_templates` |
| 3 | `email` | No | `data` + `integration_connections(email)` |
| 4 | `whatsapp` | No | `data` + `integration_connections(whatsapp)` |
| 5 | `sms` | No | `data` + `integration_connections(sms)` |
| 6 | `voice` | No | `data` + `integration_connections(voice)`; acción «Crear solicitud desde llamada» → `create_request_from_call()` |
| 7 | `forms` | Sí | `intake_form_templates` + `channel_rules` |
| 8 | `automation` | Sí | `automation_settings` |
| 9 | `billing` | Sí | `billing_settings` + `empresas.iban/disclosures` (el IBAN nunca va a JSONB) |
| 10 | `review` | Sí | prueba guiada (`run_onboarding_test`) y activación (`activate_onboarding`) |

### RPCs (todas `SECURITY DEFINER`, aislamiento por `onboarding_target_empresa()`)

`get_onboarding`, `save_onboarding_step`, `complete_onboarding_step`, `skip_onboarding_step`, `reopen_onboarding_step`,
`flag_onboarding_step`, `reopen_onboarding`, `get_onboarding_blockers`, `activate_onboarding`,
`upsert_integration_connection`, `update_integration_settings`, `record_internal_health_check`,
`create_request_from_call`, `run_onboarding_test`, `cleanup_onboarding_test_data`, `log_audit_event`,
`record_consent`, `get_verification_state`, `claim_native_email_verification`.

### Bloqueos de activación (servidor, `onboarding_blockers()`)

- Faltan datos esenciales (razón social, NIF, tipo de titular, nombre del propietario).
- No hay repositorio documental elegido/conectado.
- No existe ningún método para crear solicitudes (formularios completados, registro manual de llamadas o un canal `connected`).
- Hay pasos en `error`.
- No constan los consentimientos de términos y privacidad.
- Email no verificado.

Las integraciones opcionales en `pending_credentials` **no** bloquean.

## 5. Autoguardado, reanudación y accesibilidad

- `OnboardingProvider` mantiene borradores por paso, guarda con *debounce* (900 ms), reintenta 2 veces y expone
  `Guardando… / Guardado hh:mm / Error (Reintentar)` con `aria-live`.
- Al salir con cambios sin guardar se pide confirmación; `beforeunload` avisa si hay guardados pendientes.
- «Guardar y continuar después» persiste y cierra sesión; al volver, el gate reanuda el último paso.
- Stepper con enlaces reales, `aria-current="step"`, estados con icono + texto; foco al título al cambiar de paso;
  diálogos con `role="dialog"`, foco atrapado y Escape; `prefers-reduced-motion` respetado.

## 6. Prueba guiada (sandbox)

`run_onboarding_test()` crea cliente, formulario completado, proyecto, tarea de documento pendiente, presupuesto
aprobado y provisión de fondos (justificante aportado ≠ pago confirmado), todos con `is_test = true` y prefijo
`[PRUEBA]`. El frontend crea además la carpeta del proyecto en el repositorio (Storage interno o Edge Function
para Drive/OneDrive). `cleanup_onboarding_test_data()` borra todo lo marcado como prueba.

## 7. Panel permanente

Dashboard de empresa → **Configuración** → Datos de empresa · Canales e integraciones · Facturación y pagos ·
Automatizaciones · Formularios · Reabrir configuración inicial. Reutiliza los mismos componentes de paso en modo
`settings`. La tabla de integraciones muestra canal, estado (8 estados, nunca un booleano), cuenta/número, última
actividad, última prueba, último error y acciones Gestionar / Probar / Desconectar / Reconectar.

## 8. Modo demo

Los accesos rápidos solo aparecen con `VITE_DEMO_MODE=true` y `VITE_DEMO_ACCOUNTS="Admin:email,Empresa:email,Cliente:email"`
(variables de entorno; nada escrito en `Landing.tsx`). **Decisiones:**

- En producción no se definen esas variables, así que el bloque no se renderiza.
- Aunque estén definidas, la landing muestra **solo las etiquetas** (Admin, Empresa, Cliente); el email no se imprime.
  Al elegir una, el formulario de login sustituye el campo de correo por «Cuenta de demostración: Empresa» y pide la
  contraseña manualmente («Usar otro email» vuelve al campo normal).
- No existe ninguna contraseña en código, variables `VITE_*` ni documentación, y no hay login automático: un secreto en
  el navegador nunca es privado.
- Las cuentas demo publicadas en versiones anteriores del repositorio deben **rotarse manualmente** en Supabase.

## 9. Aplicar la migración

1. Crea una rama en Supabase (o usa un proyecto de desarrollo).
2. SQL Editor → `0009_onboarding_wizard.sql`, `0010_sync_profile_email.sql`, `0011_security_hardening.sql` → Run (idempotentes, en orden).
3. Ejecuta `database/tests/0009_rls_isolation.sql`, `0009_backfill.sql`, `0010_sync_profile_email.sql`, `0011_security_audit.sql` y `0011_signup_roles.sql` (hacen `rollback`; deben terminar con «… han pasado»).
4. Opcional: `database/seed/0003_seed_onboarding_ralm.sql` en desarrollo.
5. Despliega las Edge Functions: `supabase functions deploy integrations` y `supabase functions deploy integrations-oauth-callback --no-verify-jwt`; configura los secrets (ver `docs/integraciones.md`).
6. Fusiona la rama / repite en producción.

## 10. Pruebas automatizadas

`cd frontend && npm test` (Vitest + Testing Library + jsdom). Cubren registro (persona/empresa separadas,
confirmación, términos, marketing), metadatos de `signUp`, modo demo oculto, redirecciones (verificación,
onboarding, dashboard, admin, cliente), persistencia/reanudación, autoguardado y reintentos, validaciones por
paso, estados de integración, accesibilidad básica y adjuntos privados (ruta en vez de URL pública). El aislamiento
RLS, los permisos, el bucket privado y la sincronización de email se prueban con los scripts SQL del punto 9.
