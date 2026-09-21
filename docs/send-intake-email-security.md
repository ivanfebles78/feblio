# `send-intake-email`: endurecimiento de seguridad

## Vulnerabilidad encontrada (antes de este cambio)

La Edge Function `send-intake-email` se desplegaba con `verify_jwt` activado, pero **la clave anon
pública del frontend es un JWT válido** para el gateway y el código no validaba ninguna sesión. El
payload `{ to, link, empresa }` se aceptaba tal cual:

- **Relé abierto de correo**: cualquiera con la clave anon (visible en el bundle de feblio.com) podía
  hacer que Feblio enviase correos, con remitente `notificaciones@feblio.com`, a **cualquier
  destinatario** con **cualquier enlace** y **cualquier nombre de empresa** (phishing con marca Feblio,
  daño a la reputación del dominio en Resend).
- **Acceso cruzado entre empresas**: el idioma y el nombre se resolvían a partir del token presente en
  `link`; un usuario de la empresa A podía hacer enviar (a quien quisiera) el enlace real de un
  formulario de la empresa B si conocía su token.
- El mensaje de error devolvía el texto de la excepción (`String(e)`).

## Controles añadidos

| Control | Implementación |
|---|---|
| JWT obligatorio + sesión validada en servidor | `verify_jwt` sigue activado y, además, `auth.getUser(jwt)` con service role; sin usuario → `401 unauthorized`. |
| Empresa del remitente desde datos protegidos | `profiles.empresa_id` / `profiles.role` del usuario autenticado (service role). Cuentas `cliente` o sin empresa → `403 forbidden`. |
| Pertenencia del recurso | El payload solo identifica el formulario (`{ intake_id }`; por compatibilidad `{ token }` o `{ link }`, del que solo se extrae el token). La fila `client_intake` debe existir **y** tener `empresa_id` igual a la del usuario; inexistente y de otra empresa responden igual (`404 not_found`). |
| Datos autoritativos de la base de datos | Destinatario = `client_intake.client_email` (validado); nombre = `empresas.trade_name`/`name`; idioma = `empresas.language`; enlace = origen permitido + `/form/<token de la fila>`. Los campos `to`, `empresa`, `language` o URL del payload se ignoran. |
| Estado del formulario | `status = 'completado'` o `expires_at` pasado → `409 form_closed`; sin correo válido → `400 no_recipient`. |
| Validación estricta del payload | JSON ≤ 4 KB, UUID canónico, nada más; `400 invalid_payload`. |
| Respuestas neutras | Solo `{ ok, code }` (+ `locale`, `link`, `to`, `id` en éxito). Fallo del proveedor → `502 send_failed` sin detalle; excepción inesperada → `500 error` sin texto. Se registra en logs solo el id del formulario y el nombre del error. |
| CORS y métodos | `Access-Control-Allow-Origin` solo para `https://feblio.com`, `https://www.feblio.com`, el origen de `APP_URL` y localhost (desarrollo); métodos `POST, OPTIONS`; otros → `405` con `Allow`. `Cache-Control: no-store`. |
| Secretos | `RESEND_API_KEY`, `INTAKE_FROM_EMAIL` y `APP_URL` solo en `Deno.env` del servidor; nunca en respuestas ni logs. |

## Pruebas

`supabase/functions/_shared/intake/sendIntake.test.ts` (Deno, en el job `edge-security` de CI; proveedor y
base de datos simulados, **sin envíos reales**): sin JWT; JWT inválido; usuario válido con recurso propio
(destinatario/enlace/empresa del servidor, payload hostil ignorado); usuario válido con recurso de otra
empresa (por id, token y enlace) → 404 neutro y aislamiento simétrico; recurso inexistente; payload
manipulado (vacío, no UUID, inyección, ruta `../`, tipos incorrectos, no JSON, > 4 KB), cuenta de cliente,
método GET; idioma es/en/no válido según `empresas.language`; error de Resend simulado y clave ausente;
formulario completado/caducado/sin destinatario; CORS y construcción del enlace.

## Límite de frecuencia (migración 0017)

| Ámbito | Clave en `public.rate_limits` | Límite | Ventana |
|---|---|---|---|
| Usuario + formulario | `ie:u:<user_id>:i:<intake_id>` | 5 | 60 min (fija) |
| Empresa | `ie:e:<empresa_id>` | 30 | 60 min (fija) |

- RPC `public.intake_email_rate_check(p_user, p_empresa, p_intake)` (`security definer`, `search_path`
  fijo, EXECUTE solo para `service_role`): bloquea las dos filas en orden determinista por clave, evalúa
  ambos límites y solo si los dos permiten incrementa ambos contadores exactamente una vez. Un rechazo no
  consume cuota ni prolonga la ventana. Devuelve `{allowed, retry_after}`.
- La Edge Function la llama justo antes del proveedor (tras autenticación, pertenencia, destinatario,
  estado del formulario y configuración): solo cuentan los intentos que llegan a Resend, aunque Resend
  falle. Bloqueado → `429 { code: "rate_limited" }` + `Retry-After` (1..3600 s). Si la RPC falla, no se
  envía (`500 error`, fail closed): por eso la migración se aplica antes que la función.
- Solo se almacenan UUID y contadores. Limpieza oportunista al inicio de cada llamada: claves `ie:%` con
  ventana vencida hace más de un día (las claves `dl:*` de descargas no se tocan).
- Pruebas: `database/tests/0017_intake_email_rate_limit.sql` (permisos por rol, 5/6.º, independencia,
  expiración, límite de empresa, nulos, limpieza), concurrencia real con 212 llamadas simultáneas sobre
  Postgres local (cuotas exactas, sin deadlocks) y casos 11–17 de `sendIntake.test.ts`.

## Riesgos que permanecen

- `APP_URL` en producción apunta al dominio de Railway; el enlace del correo usa el origen de la petición
  (feblio.com) cuando está en la lista blanca, y `APP_URL` solo como respaldo. Conviene actualizar el
  secreto a `https://feblio.com` (cambio de secreto: fuera de este alcance).
- La ruta de compatibilidad `{ link }` sigue aceptándose para clientes con el bundle anterior; se puede
  retirar cuando el frontend con `{ intake_id }` esté desplegado en Railway.
