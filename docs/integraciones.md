# Integraciones, adaptadores y credenciales

Todas las conexiones con proveedores externos pasan por la Edge Function `integrations`
(`supabase/functions/integrations`). El frontend nunca ve tokens ni secretos y nunca puede marcar una
integración como conectada sin una prueba real.

## Modelo

| Tabla | Contenido |
|---|---|
| `integration_connections` | Una fila por `kind` y empresa: `provider`, `status`, `account_identifier`, `settings` (sin secretos), `last_test_at/ok`, `last_error`, `token_expires_at`, `last_activity_at`… |
| `integration_credentials` | Tokens/contraseñas cifrados con AES-256-GCM (`ciphertext`, `iv`). **Sin políticas RLS y con privilegios revocados**: solo `service_role`. |
| `integration_health_checks` | Historial de pruebas (`test`, `health`, `oauth`). |
| `channel_rules` | Formulario predeterminado, regla de selección y mensaje de envío por canal. |
| `audit_events` | Conectar / desconectar / probar / credenciales guardadas / OAuth iniciado o fallido. |

Estados (`integration_connections.status`): `not_configured`, `pending_credentials`, `connecting`,
`connected`, `degraded`, `expired`, `error`, `disconnected`.

Reglas de servidor:

- `upsert_integration_connection()` (cliente) solo admite `not_configured`, `pending_credentials`, `disconnected`
  y `connected` **exclusivamente** para proveedores internos (`feblio_storage`, `manual_log`, `manual`, `feblio_inbox`
  se verifica en la Edge Function). El trigger `integration_connections_guard_status` lo refuerza a nivel de tabla.
- Cualquier `connected` de un proveedor externo lo escribe la Edge Function tras una llamada real al proveedor.
- Si faltan variables de entorno, la Edge Function responde `{ ok:false, code:'pending_credentials', missing:[…] }`
  y deja la conexión en `pending_credentials` con el texto «Requiere configuración del administrador de Feblio».

## Adaptadores

| Proveedor (`provider`) | Kind | Modo | Prueba real | Variables (secrets de Supabase) |
|---|---|---|---|---|
| `feblio_storage` | document_repository | interno | Subida/lectura/borrado en bucket privado `empresa-docs/{empresa_id}/…` (Storage RLS por empresa) | — |
| `google_drive` | document_repository | OAuth | `drive/v3/about` + crear y borrar carpeta temporal en la raíz elegida | `APP_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| `onedrive` | document_repository | OAuth | Graph `/me/drive` + crear y borrar carpeta | `APP_ENCRYPTION_KEY`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` (`MICROSOFT_TENANT` opcional) |
| `gmail` | email | OAuth | `users/me/profile` + comprobación de etiquetas; envío de prueba con `messages/send` | `GOOGLE_*` |
| `m365` | email | OAuth | Graph `/me` + `mailFolders`; envío con `/me/sendMail` | `MICROSOFT_*` |
| `feblio_inbox` | email | interno | Comprueba la API key de Resend (`/domains`); envío de prueba | `RESEND_API_KEY`, `INTAKE_FROM_EMAIL` (opcional). El dominio `inbound.feblio.app` para recibir reenvíos debe configurarse en el proveedor de correo entrante. |
| `imap` | email | credenciales | Login IMAP (993, TLS) + AUTH PLAIN SMTP (465 o 587 STARTTLS) con `Deno.connectTls`; si el runtime bloquea sockets, falla con error explícito | `APP_ENCRYPTION_KEY` |
| `meta` | whatsapp | credenciales (token de System User) | `GET graph.facebook.com/{phone_number_id}`; envío de plantilla | `APP_ENCRYPTION_KEY`, `WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` |
| `twilio` | sms | credenciales | `GET /Accounts/{sid}` + número remitente; envío de SMS | `APP_ENCRYPTION_KEY`, `SMS_PROVIDER=twilio` |
| `manual_log` | voice | manual | No requiere conexión | — |
| `voice_provider` | voice | credenciales | Pendiente de adaptador concreto (responde error explícito) | `VOICE_PROVIDER`, `VOICE_API_KEY` |
| `stripe` | payments | cuenta de plataforma | `GET /v1/account` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

Otras variables: `APP_URL` (URL pública del frontend; destino de la vuelta OAuth `/integraciones/callback`).
`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase.

## Acciones de la Edge Function (POST JSON, JWT del usuario)

```
{ action, kind, provider?, credentials?, payload?, returnTo?, empresa_id? }
```

| Acción | Efecto |
|---|---|
| `start_oauth` | Devuelve la URL de autorización (estado firmado HMAC con empresa, usuario, kind, proveedor y ruta de vuelta; caduca a los 10 min). Marca `connecting`. |
| `test` / `health` | Prueba real; `test` incluye escritura (carpeta temporal), `health` no. Actualiza `connected|error`, `last_test_*`, salud y auditoría. |
| `disconnect` | Revoca (Google), borra credenciales, marca `disconnected`. |
| `store_credentials` | Cifra las credenciales de la empresa (IMAP, Meta, Twilio), las guarda y ejecuta `test`. |
| `send_test` | Correo/SMS/WhatsApp de prueba (requiere `connected`). |
| `list_folders` / `create_folder` | Drive/OneDrive: listar carpetas de la raíz o crear la ruta de un proyecto. |

### Dos funciones, dos niveles de exposición

| Función | Exposición | Despliegue | Autenticación |
|---|---|---|---|
| `integrations` | **Privada** (POST) | `supabase functions deploy integrations` (verificación de JWT del gateway **activada**) | Además valida el JWT con `auth.getUser` y resuelve el tenant del perfil (`resolveActor`) |
| `integrations-oauth-callback` | **Pública** (GET, el navegador vuelve del proveedor) | `supabase functions deploy integrations-oauth-callback --no-verify-jwt` | `state` firmado HMAC-SHA256 con `APP_ENCRYPTION_KEY`, caducidad 10 min, tenant/usuario/proveedor dentro del estado; comprueba que el proveedor coincide con la ruta (`/google`, `/microsoft`) |

`--no-verify-jwt` **solo** se usa en `integrations-oauth-callback`. Nunca en `integrations`.

Callbacks a registrar como `GOOGLE_REDIRECT_URI` / `MICROSOFT_REDIRECT_URI`:
`…/functions/v1/integrations-oauth-callback/google` y `…/functions/v1/integrations-oauth-callback/microsoft`.
Tras intercambiar el código, la función redirige a `${APP_URL}/integraciones/callback?kind=…&status=connected|error`
(sin tokens en la URL).

Código compartido en `supabase/functions/_shared/integrations/` (`crypto.ts`, `db.ts`, `settings.ts`, `providers/*`).
Pruebas: `_shared/integrations/security.test.ts` (`deno test --node-modules-dir=auto --allow-env=APP_ENCRYPTION_KEY`); se ejecutan en CI en el job `edge-security` sin red ni conexión a Supabase.

Secrets: `supabase secrets set APP_ENCRYPTION_KEY=… APP_URL=https://… GOOGLE_CLIENT_ID=… …`
(`APP_ENCRYPTION_KEY`: cadena aleatoria ≥ 32 caracteres; cambiarla invalida las credenciales cifradas).

## Webhooks (NO implementados todavía)

Cuando se implementen, cada uno será una función **separada y pública** (`--no-verify-jwt`) que **verifique la firma
del proveedor antes de cualquier efecto** y responda 401 si falla:

- WhatsApp: `…/functions/v1/whatsapp-webhook` — reto GET con `WHATSAPP_VERIFY_TOKEN`; POST con `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo con `WHATSAPP_APP_SECRET`).
- SMS: `…/functions/v1/sms-webhook` — `X-Twilio-Signature` (HMAC-SHA1 de URL+params con el Auth Token del tenant).
- Stripe: `…/functions/v1/stripe-webhook` — `Stripe-Signature` con `STRIPE_WEBHOOK_SECRET` y tolerancia de tiempo.

El campo `settings.webhook_verified` de la conexión se mostrará como «Verificado» cuando esas funciones lo actualicen.

## Seguridad

- Nunca se guardan secretos en `localStorage`, en `onboarding_steps.data`, en `integration_connections.settings` ni en `audit_events.metadata` (`strip_secret_keys`).
- Ninguna variable `VITE_*` contiene secretos.
- Timeouts de 12 s por llamada a proveedor y 25 s en el cliente; errores coherentes (`pending_credentials`, `not_connected`, `provider_error`, `timeout`, `unauthorized`, `unsupported`).
- Cifrado: AES-256-GCM (autenticado) con IV aleatorio de 12 bytes por operación; clave derivada con SHA-256 de `APP_ENCRYPTION_KEY`, que solo existe como secret de Supabase (nunca `VITE_*`). Cambiarla invalida las credenciales guardadas (habrá que reconectar).
- Las respuestas al frontend solo contienen filas de `integration_connections` (sin secretos), `details` de proveedor (cuenta, dominio, estado) y mensajes de error acotados a 300 caracteres. La función no escribe logs.
- Aislamiento: la empresa se resuelve del JWT; un admin puede indicar `empresa_id`; cualquier otro `empresa_id` devuelve 403.
