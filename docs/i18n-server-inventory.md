# Inventario de textos generados por el servidor (antes → después de 0016)

Auditoría previa a la internacionalización de los mensajes que Feblio genera fuera del frontend. Columnas:
destinatario, idioma que tenía, de dónde sale ahora el idioma y si el texto se **persiste** (se guarda en
base de datos en el momento de crearlo) o se **genera al mostrar** (el cliente lo traduce por código).

Fuentes de idioma: **E** = `empresas.language` de la empresa origen · **U** = `auth.user_metadata.language`
· **UI** = idioma de la interfaz del usuario que lo ve (el servidor devuelve un código estable).

## 1. SQL — mensajes persistidos (migración `0016_i18n_server_messages.sql`)

| Función | Texto anterior (es) | Destinatario | Fuente | Tipo |
|---|---|---|---|---|
| `solicitud_acceso_enviar` | «El cliente ha enviado el formulario ({n}% completo).» (mensaje de sistema) | empresa y cliente (hilo) | E | persistido (`request.systemSubmitted`) |
| `solicitud_acceso_enviar` | «Formulario enviado: {título}» + «{nombre} ha enviado el formulario ({n}% completo).» (notificación) | empleados de la empresa | E | persistido (`notif.submitted.*`) |
| `solicitud_solicitar_informacion` | «Necesitamos información adicional» (etiqueta por defecto), cuerpo por defecto, autor «{empresa}», título «Petición de información: …» | cliente / empleados | E | persistido (`request.infoRequestDefault`, `request.requisitoDefault`, `request.authorCompany`, `notif.info_requested.title`) |
| `solicitud_enviar_mensaje` | autor «{empresa}», «Nuevo mensaje de la empresa: …» | cliente / empleados | E | persistido (`request.authorCompany`, `notif.message.title`) |
| `solicitud_registrar_documento` | «Documento nuevo: …» | empleados | E | persistido (`notif.document.title`) |
| `solicitud_acceso_mensaje` | «Respuesta del cliente: …» | empleados | E | persistido (`notif.client_reply.title`) |
| `solicitud_acceso_registrar_documento` | «Documento del cliente: …» | empleados | E | persistido (`notif.client_document.title`) |
| `solicitud_cambiar_estado` | «Solicitud lista para presupuesto / cerrada / en revisión / actualizada: …» | empleados | E | persistido (`notif.status.*`) |
| `submit_intake_form` | tarea «Revisar alta de cliente: {nombre}» + detalle, cliente «Cliente» por defecto, prefijo «[PRUEBA] » | empleados | E | persistido (`intake.taskTitle`, `intake.taskDetail`, `intake.defaultClient`, `intake.testPrefix`) |

Lo ya guardado antes de 0016 no se toca; el frontend sigue reconociendo el formato antiguo en español
(`NotificationsBell.notificationBody`).

## 2. SQL — errores públicos de RPC (códigos estables)

| Función | Mensaje (se conserva en español por compatibilidad) | Código añadido | Fuente al mostrar |
|---|---|---|---|
| `sol_propia` | Solicitud no encontrada | `detail = request_not_found` | UI |
| `sol_acceso_valido`, `solicitud_acceso_documento` | Enlace no válido | `invalid_link` | UI (respuesta neutra intacta) |
| `sol_validar_archivo` | El archivo supera el tamaño máximo (10 MB) / Tipo de archivo no permitido | `file_too_large`, `file_type_not_allowed` | UI |
| `solicitud_cambiar_estado` | Transición no permitida / Indica el motivo de cierre / No se puede reabrir | `invalid_transition`, `close_reason_required`, `reopen_blocked` | UI |
| `solicitud_solicitar_informacion` | La solicitud no admite peticiones de información… | `info_request_not_allowed` | UI |
| `solicitud_enviar_mensaje`, `solicitud_acceso_mensaje` | Escribe un mensaje | `message_required` | UI |
| `solicitud_registrar_documento`, `solicitud_acceso_registrar_documento` | Ruta no válida / Archivo no encontrado / Requisito no válido | `invalid_path`, `file_not_found`, `invalid_requisito` | UI |
| `solicitud_acceso_guardar`, `solicitud_acceso_enviar` | El formulario ya se ha enviado | `already_submitted` | UI |
| `solicitud_acceso_mensaje`, `solicitud_acceso_registrar_documento` | La solicitud está cerrada | `request_closed` | UI |
| `solicitud_acceso_documento` | Demasiadas solicitudes. Inténtalo en unos minutos. | `rate_limited` (53400) | UI |
| `submit_intake_form` | Datos no válidos / demasiado grandes / Formulario no válido / ya completado / enlace caducado | `code = invalid_data, payload_too_large, invalid_form, already_completed, link_expired` | UI (`intake.submit.serverErrors.*`) |
| `verify_email_otp` | Cuenta sin empresa / No hay código pendiente / caducado / Demasiados intentos / Código incorrecto | `no_company, otp_missing, otp_expired, otp_too_many_attempts, otp_incorrect` | UI (`auth.verify.serverErrors.*`) |
| `claim_native_email_verification` | La plataforma usa verificación por código / Cuenta sin empresa / El email aún no está confirmado | `otp_mode, no_company, email_not_confirmed` | UI |

## 3. Edge Functions

| Función | Texto anterior (es) | Destinatario | Fuente | Tipo |
|---|---|---|---|---|
| `send-otp` | asunto «Tu código de verificación · Feblio», saludo, instrucciones, caducidad, pie (solo HTML) | usuario que se registra | **U** | generado al enviar (es/en + alternativa en texto plano) |
| `send-intake-email` | asunto «Completa tus datos · {empresa}», saludo, cuerpo, botón, enlace alternativo, pie (solo HTML) | cliente de la empresa | **E** (resuelto en servidor por el token del enlace → `client_intake.empresa_id`) | generado al enviar (es/en + texto plano) |
| `send-intake-email` | «Faltan datos (to, link)» | app | — | respuesta con `code: missing_data` |
| `integrations` → `sendTest` | asunto «Prueba de configuración · {empresa}», texto de prueba, plantilla SMS por defecto «{empresa}: prueba de SMS desde Feblio. {url}», `{nombre}` → «cliente» | destinatario de prueba elegido por la empresa | **E** | generado al enviar; la plantilla personalizada (`payload.template`) se envía tal cual |
| `integrations` → `testConnection` | «Conexión verificada.» | empleado | **E** | generado (`code: verified`) |
| `solicitud-descarga` | «Enlace no válido» (400/404), «Demasiadas solicitudes…» (429) | cliente anónimo | UI | respuesta con `code: download_bad_request / download_invalid / download_rate_limited` + `error` (compatibilidad) |

Sin cambios (fuera de alcance o ya en el idioma correcto): errores internos de `integrations` (`HttpError`
con `code` propio que el frontend ya traduce), `integrations-oauth-callback` (redirecciones sin texto),
mensajes de proveedores externos (Resend, Twilio, Meta, Google, Microsoft: se registran, no se muestran).

## 4. Frontend — textos persistidos por defecto

| Origen | Texto anterior (es) | Fuente ahora |
|---|---|---|
| `lib/onboarding/steps.ts` → `defaultWhatsAppData` | bienvenida, fuera de horario, plantilla de formulario, palabras de escalado, consentimiento | **E** (`channelDefaults.ts`, solo campos no guardados) |
| `defaultSmsData` | plantilla de formulario SMS, palabra de baja «BAJA» | **E** |
| `defaultVoiceData` | locución de bienvenida | **E** |
| `ChannelFormMapping` | mensaje por defecto por canal | **E** |

## 5. Supabase Auth (plantillas alojadas)

| Plantilla | Estado anterior | Ahora |
|---|---|---|
| Confirm sign up, Reset password, Invite user, Magic link, Change email, Reauthentication, notificaciones de seguridad | las alojadas en cada proyecto (se copian exactamente antes de cambiarlas; ver informe del despliegue) | versión bilingüe es/en por `user_metadata.language` en `docs/email-templates/` (ver README de esa carpeta para el estado de aplicación) |

## Textos que siguen sin traducir y por qué

- Mensajes escritos por personas, nombres de empresas/clientes/archivos y contenido personalizado por la empresa.
- Registros históricos creados antes de 0016 (se muestran tal cual; las notificaciones «ha enviado el formulario»
  sí se reconocen y se muestran en el idioma de la interfaz).
- Mensajes de error internos (`RESEND_API_KEY no configurada`, excepciones inesperadas): solo se registran o se
  muestran a administradores; llevan `code` para que el frontend pueda mostrar un texto neutro.
