# Deploy de Feblio (GitHub + Railway + Supabase)

Producción actual: `https://feblio-production.up.railway.app/` (el dominio `feblio.com` aún no está conectado).

## 1. Frontend en Railway

1. Servicio desde el repo `feblio` con **Root Directory: `frontend`** (Nixpacks detecta `nixpacks.toml`: `npm ci` → `npm run build` → `serve -s dist`).
2. Variables (se inyectan en tiempo de build; cambiarlas requiere redeploy):
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable/anon key>
   VITE_APP_URL=https://feblio-production.up.railway.app
   # NO definir VITE_DEMO_MODE en producción (los accesos demo quedan ocultos)
   ```
3. Deploy. No hace falta nada más para el frontend.

## 2. Base de datos (Supabase)

1. **Antes de producción, prueba en una rama** (Supabase → Branches → New branch) o en un proyecto de desarrollo:
   - SQL Editor → `0009_onboarding_wizard.sql`, `0010_sync_profile_email.sql`, `0011_security_hardening.sql`, `0012_e2e_fixes.sql`, `0013_registration_v2.sql`, `0014_solicitudes.sql`, `0015_i18n_public_language.sql`, `0016_i18n_server_messages.sql`, `0017_intake_email_rate_limit.sql`, `0018_services_catalog.sql` y `0019_intake_analysis.sql` → Run (en ese orden).
   - SQL Editor → `database/tests/0009_rls_isolation.sql`, `0009_backfill.sql`, `0010_sync_profile_email.sql`, `0011_security_audit.sql`, `0011_signup_roles.sql`, `0013_registration_v2.sql`, `0014_solicitudes.sql`, `0015_i18n_public_language.sql`, `0016_i18n_server_messages.sql`, `0017_intake_email_rate_limit.sql`, `0018_services_catalog.sql` y `0019_intake_analysis.sql` → Run (terminan en `rollback`; deben imprimir «… han pasado»).
   - `0011` convierte `intake-files` en bucket **privado**: los adjuntos ya subidos siguen accesibles para la empresa
     dueña mediante URLs firmadas (el panel las genera al pulsar); las URLs públicas antiguas dejan de funcionar.
   - Opcional en desarrollo: `database/seed/0003_seed_onboarding_ralm.sql`.
2. Aplica `0009`, `0010`, `0011`, `0012`, `0013`, `0014`, `0015`, `0016`, `0017` y `0018` en producción cuando la rama esté verificada. Con `0016` vuelve a desplegar `send-otp`, `send-intake-email`, `integrations` y `solicitud-descarga` (mensajes en el idioma de la empresa/usuario y códigos estables). Con `0014` despliega también la Edge Function pública `supabase functions deploy solicitud-descarga --no-verify-jwt` (descarga del cliente por token; no requiere secretos adicionales) y añade `https://<app>/**` a *Auth → Redirect URLs* para que los magic links conserven la ruta profunda. Es idempotente y no destruye datos: las empresas
   existentes quedan con `onboarding_status = 'completed'` en la primera ejecución (backfill de una sola vez, marcado en
   `platform_settings.onboarding_backfill_done`; pueden reabrir el asistente desde Configuración). No usa GUC personalizados
   (`set_config` de parámetros propios no está permitido en Supabase alojado).
3. Comprueba en **Database → Advisors** que no aparecen tablas sin RLS.

## 3. Configuración manual de Supabase Auth

| Ajuste | Valor | Motivo |
|---|---|---|
| Authentication → Providers → Email → **Confirm email** | **OFF** (modo `otp`, por defecto) | Feblio verifica con su propio código de 6 dígitos. Si se deja ON habría doble verificación (enlace + código). Si prefieres la confirmación nativa, déjalo ON y ejecuta `update public.platform_settings set value = '"native"' where key = 'email_verification_mode';` |
| Authentication → URL Configuration → **Site URL** | `https://feblio-production.up.railway.app` | Enlaces de confirmación / cambio de email |
| Authentication → URL Configuration → **Redirect URLs** | `https://feblio-production.up.railway.app/**`, `http://localhost:5173/**` | Cambio seguro de email de acceso (`auth.updateUser`) y confirmación nativa |
| Authentication → Email Templates | Plantillas bilingües de `docs/email-templates/` (aplicadas en producción el 2026-09-22) | Asunto y cuerpo es/en según `user_metadata.language` (ausente → español). Restauración e instrucciones en `docs/email-templates/README.md` |
| Authentication → Rate limits | Revisar | Registro y OTP |

## 4. Edge Functions y secrets

```bash
supabase link --project-ref <ref>
supabase functions deploy send-otp
supabase functions deploy send-intake-email                 # privada: JWT + sesión validada; solo formularios propios; requiere 0017 (límite de envíos, fail closed)
supabase functions deploy integrations                       # privada: verificación de JWT activada
supabase functions deploy integrations-oauth-callback --no-verify-jwt   # pública: solo el callback OAuth (state firmado)

supabase secrets set \
  RESEND_API_KEY=<…> OTP_FROM_EMAIL="Feblio <no-reply@tudominio>" INTAKE_FROM_EMAIL="Feblio <no-reply@tudominio>" \
  APP_ENCRYPTION_KEY=<cadena aleatoria de 32+ caracteres> \
  APP_URL=https://feblio-production.up.railway.app
# Opcionales, por integración (si faltan, la UI muestra "Requiere configuración del administrador de Feblio"):
#   GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI
#   MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET MICROSOFT_REDIRECT_URI [MICROSOFT_TENANT]
#   WHATSAPP_APP_ID WHATSAPP_APP_SECRET WHATSAPP_VERIFY_TOKEN
#   SMS_PROVIDER=twilio
#   VOICE_PROVIDER VOICE_API_KEY
#   STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
```

URLs de callback OAuth a registrar en Google Cloud / Entra ID (y como `GOOGLE_REDIRECT_URI` / `MICROSOFT_REDIRECT_URI`):

```
https://<ref>.supabase.co/functions/v1/integrations-oauth-callback/google
https://<ref>.supabase.co/functions/v1/integrations-oauth-callback/microsoft
```

## 5. Cuentas de prueba y rotación de credenciales

Cuentas de prueba (definidas en `database/seed/0002_seed_users.sql`; la contraseña se fija con
`set_config('app.seed_password', …)` en la sesión SQL y nunca se guarda en el repositorio):

| Rol | Email |
|---|---|
| admin | ivan.febles@gmail.com |
| empresa (RALM) | ivan.feblestrujillo@gmail.com |
| cliente final | ivanfebles@devcon8.com |

Versiones anteriores del repositorio (público) contenían otros emails demo y su contraseña. **Rota esas cuentas**
en Supabase → Authentication → Users → Reset password. Cambiar los archivos SQL **no** modifica los usuarios que
ya existen en Supabase: para actualizar los emails de las cuentas existentes sigue el apartado 5.1.

### 5.1 Cambiar el email de una cuenta existente y mantener `profiles.email` sincronizado

Hazlo primero en una **rama** de Supabase y, cuando el acceso esté validado, en producción. Una cuenta cada vez.

1. **Instala el trigger de sincronización** (una sola vez, después de `0009`): SQL Editor →
   `database/migrations/0010_sync_profile_email.sql` → Run. Es idempotente. A partir de aquí, cualquier cambio de
   `auth.users.email` se copia a `public.profiles.email` (y a `public.clientes.email` del cliente vinculado). Puedes
   verificarlo con `database/tests/0010_sync_profile_email.sql` (hace `rollback`).
2. **Cambia el email en Authentication**: Supabase → **Authentication → Users** → busca el email antiguo → abre el
   usuario → **Edit user** → campo **Email** → escribe el nuevo → **Save**.
   - Si el panel muestra la opción de confirmar el email («Confirm email» / «Auto confirm»), márcala; si no, el usuario
     queda con `email_confirmed_at` vacío y no podrá iniciar sesión si «Confirm email» está activado en el proveedor
     Email. En ese caso, en SQL: `update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = '<nuevo>';`
   - Asignación:
     | Email antiguo | Email nuevo | Rol |
     |---|---|---|
     | (cuenta admin anterior) | ivan.febles@gmail.com | admin |
     | (cuenta empresa anterior) | ivan.feblestrujillo@gmail.com | empresa (RALM) |
     | (cuenta cliente anterior) | ivanfebles@devcon8.com | cliente |
3. **No toques `public.profiles` a mano**: `role`, `empresa_id` y `cliente_id` no cambian porque el usuario (`id`) es el
   mismo; solo cambia `email`, y de eso se encarga el trigger. Si cambiaste el email **antes** de instalar el trigger,
   ejecuta el backfill que hay al final de `0010_sync_profile_email.sql`.
4. **Verifica** en el SQL Editor:
   ```sql
   select u.email as auth_email, p.email as profile_email, p.role, p.empresa_id, p.cliente_id, u.email_confirmed_at
     from auth.users u join public.profiles p on p.id = u.id
    order by p.role;
   ```
   `auth_email` y `profile_email` deben coincidir y `role/empresa_id/cliente_id` deben ser los de antes.
5. **Valida el acceso** iniciando sesión con cada email nuevo (y, si es la cuenta empresa, comprueba que entra en su
   dashboard/onboarding). Hasta que las tres cuentas hayan iniciado sesión correctamente, **no elimines ni desactives**
   ninguna cuenta antigua ni cambies sus contraseñas de forma que pierdas el acceso de respaldo.
6. Rota la contraseña de las tres cuentas (Reset password) y, si quieres, borra los emails antiguos de la libreta de
   Resend/Google Cloud si estaban registrados como destinatarios de prueba.

Alternativa sin panel: Admin API `PUT /auth/v1/admin/users/{id}` con `{"email": "...", "email_confirm": true}` usando
la service role key desde un entorno seguro (nunca desde el navegador). El trigger sincroniza igual.

## 6. Cuando se conecte feblio.com

Actualiza en este orden:

1. Railway → Settings → Domains → añade `feblio.com` / `app.feblio.com` y configura el DNS.
2. Railway → Variables → `VITE_APP_URL=https://feblio.com` → redeploy.
3. Supabase → Authentication → URL Configuration → Site URL `https://feblio.com`; añade `https://feblio.com/**` a Redirect URLs (mantén la de Railway mientras convivan).
4. Supabase secrets → `APP_URL=https://feblio.com`.
5. Google Cloud / Entra ID: las URLs de callback no cambian (apuntan a Supabase); revisa los «Authorized JavaScript origins» si los usas.
6. Resend: verifica el dominio `feblio.com` y actualiza `OTP_FROM_EMAIL` / `INTAKE_FROM_EMAIL`; configura el dominio de entrada (`inbound.feblio.app` o el que decidas) para la «Dirección de entrada de Feblio».
7. Meta / Twilio / Stripe: actualiza las URLs de webhook cuando existan.

## Notas

- La clave `anon`/publishable es pública por diseño; la seguridad la impone RLS.
- `.env.local` NO se sube al repo. Los secretos viven en Supabase (secrets) o Railway (variables), nunca en `VITE_*`.
- Desarrollo local: `cd frontend && npm install && npm run dev`.
