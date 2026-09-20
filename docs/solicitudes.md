# Solicitudes: contacto → formulario → suficiencia → conversación (0014)

Primera fase funcional del flujo de peticiones de clientes. No incluye presupuestos, provisiones,
pagos, Calendly ni envíos por email/SMS/WhatsApp; la capa de eventos queda preparada
(notificaciones internas) sin envíos simulados.

## Modelo de datos (`database/migrations/0014_solicitudes.sql`)

| Tabla | Qué guarda |
|---|---|
| `solicitudes` | La petición: contacto, canal de entrada (`llamada/email/sms/whatsapp/portal/otro`), asunto, tipo, notas, fecha límite, estado, `form_data` (respuestas del cliente), `completeness`, `last_activity_at`. |
| `solicitud_accesos` | Enlaces del cliente: **solo el hash SHA-256 del token**, caducidad, revocación y último uso. |
| `solicitud_mensajes` | Conversación empresa ↔ cliente (`author_kind`, `kind` = `message` / `info_request` / `system`, lectura por cada parte). No existen mensajes internos privados. |
| `solicitud_documentos` | Metadatos de archivos: nombre original, ruta física aleatoria en `intake-files`, MIME, tamaño, requisito asociado, `visible_to_client` y `deleted_at` (borrado lógico). |
| `rate_limits` | Contador por clave y ventana para accesos públicos (descarga por token). Sin grants a usuarios. |
| `solicitud_requisitos` | Información pedida al cliente (`field` / `document`), estado `pending/received/resolved/waived`. |
| `solicitud_analisis` | Análisis de suficiencia **versionados** (`provider = 'rules'`): completitud, recibido, pendiente, documentos pendientes. |
| `notificaciones` | Notificaciones internas (empresa y cliente) con `dedupe_key` único → sin duplicados en reintentos. |

Reutilizado sin cambios: `clientes`, `intake_form_templates` (campos/documentos/consentimientos
de la plantilla), `audit_events` (cronología), bucket privado `intake-files`, helpers de rol
(`current_role_name`, `current_empresa_id`, `current_cliente_id`, `is_admin`) y `audit_log_internal`.
`client_intake` (formulario público con token en claro) se mantiene intacto como flujo legado.

### Estados y transiciones (validadas en servidor, `sol_transicion_valida`)

`draft → awaiting_client → submitted → under_review ⇄ missing_information → ready_for_scope → closed`
(cerrar es posible desde cualquier estado con motivo obligatorio; reabrir `closed → under_review`
solo si no existe un presupuesto asociado al cliente). El frontend replica la tabla en
`lib/solicitudes/status.ts` únicamente para mostrar u ocultar acciones.

### Seguridad

- RLS en las 7 tablas: admin lee todo; empresa solo su `empresa_id`; cliente autenticado solo las
  solicitudes con su `cliente_id`; **anon no tiene ningún grant** sobre las tablas.
- Escrituras solo por RPC `security definer` con `search_path` fijo. `empresa_id` / `cliente_id` se
  derivan del JWT; el `cliente_id` recibido debe pertenecer al tenant.
- Acceso del cliente sin cuenta: `solicitud_acceso_*(p_token, …)`. El token (32 bytes aleatorios,
  base64url) se devuelve **una sola vez** al generarlo; se valida por hash, caducidad y revocación
  (`sol_acceso_valido`, error único «Enlace no válido»). La vista del cliente (`sol_vista_cliente`)
  no incluye identificadores internos ni rutas de almacenamiento.
- Archivos: bucket privado `intake-files`; cliente → `sol/{access_id}/{uuid}.{ext}`, empresa →
  `emp/{empresa_id}/{solicitud_id}/{uuid}.{ext}`. Políticas de storage por prefijo; lectura solo de
  objetos registrados en `solicitud_documentos` (empresa propietaria, cliente vinculado, admin) mediante
  URL firmada de 5 minutos. Extensiones PDF/DOC/DOCX/XLS/XLSX/PNG/JPG/JPEG, 10 MB (`sol_validar_archivo`,
  también validado en cliente). El nombre físico nunca lo elige el usuario.
- Auditoría en `audit_events` sin secretos (los eventos de subentidades llevan `metadata.solicitud_id`).
- **Descarga del cliente anónimo**: Edge Function `solicitud-descarga` (POST `{token, document_id}`, desplegada
  con `--no-verify-jwt`). Valida la forma de la petición, llama con service_role a la RPC
  `solicitud_acceso_documento` (ejecutable **solo** por service_role: hash del token, caducidad, revocación,
  documento de esa misma solicitud y empresa, activo y visible) y firma una URL de **5 minutos**. El navegador
  nunca recibe rutas ni claves; cualquier fallo → 404 «Enlace no válido». Límite de frecuencia en la RPC:
  60/5 min por IP y 30/5 min por acceso (429). Auditado como `solicitud.client_download` sin el token.
- **Ruta conservada tras autenticar**: `ProtectedRoute` guarda la ruta interna pedida sin sesión
  (`rememberReturnTo`, localStorage, 10 min) y `Landing` vuelve a ella si el rol puede abrirla
  (`resolveReturnTo`); solo rutas relativas internas (sin `//`, esquemas ni barras invertidas). Necesario porque
  Supabase Auth descarta el `redirect_to` de un magic link si no está en la lista de URLs permitidas: añade
  `https://<app>/**` (y `http://localhost:5173/**` en desarrollo) a *Redirect URLs* para que el enlace aterrice
  directamente en la ruta profunda.

### Análisis de suficiencia

`sol_analizar` (SQL) es la fuente de verdad y guarda una versión por comprobación: campos base
(contacto, correo, qué necesita, objetivos, alcance, plazos) + campos y documentos obligatorios de
la plantilla + requisitos pedidos manualmente. Se ejecuta al crear, al enviar el formulario, al
pedir/resolver requisitos, al adjuntar documentos y a demanda («Volver a comprobar»).
`frontend/src/lib/solicitudes/analysis.ts` define el contrato `AnalysisProvider` y replica las reglas
(`RulesAnalysisProvider`) para el progreso local del formulario. No hay IA real ni simulada.

## Pantallas

| Ruta | Quién | Contenido |
|---|---|---|
| `/empresa/solicitudes` | empresa | Bandeja: búsqueda, filtros por estado/canal/«solo pendientes» (en la URL), completitud, estado, última actividad, no leídos; estado vacío real. |
| `/empresa/solicitudes/nueva` | empresa | Alta desde llamada/email/mensaje: cliente existente o contacto nuevo, canal, asunto, notas, fecha límite, plantilla; genera el enlace seguro. |
| `/empresa/solicitudes/:id` | empresa | Resumen, estado, tarjeta de completitud, datos recibidos, información pendiente, documentos (descarga firmada + subida), conversación, cronología, acciones permitidas y enlace del cliente (copiar / generar nuevo / revocar). |
| `/s/:token` | cliente (sin cuenta) | Formulario por secciones con progreso, borrador, envío, adjuntos, pendientes y conversación. Enlace inválido, caducado o revocado → mensaje neutro. |

El panel de empresa usa rutas anidadas (`/empresa/*`: inicio, `solicitudes`, `plantillas`,
`configuracion`); `/empresa?settings=<pestaña>` sigue funcionando por compatibilidad.

## Notificaciones internas

Tipos: `solicitud.submitted`, `solicitud.client_reply`, `solicitud.client_document`, `solicitud.message`,
`solicitud.document`, `solicitud.info_requested`, `solicitud.ready_for_scope`, `solicitud.closed`, `solicitud.under_review` (reapertura).
La campana del AppShell (`NotificationsBell` + `useNotifications`) muestra el contador de no leídas,
la lista, marcar una/todas y enlaza al recurso. Se actualiza por Supabase Realtime
(`postgres_changes` sobre `notificaciones`, filtrada por empresa) con recarga de respaldo cada 60 s y al
volver el foco. Ver una solicitud marca como leídos sus mensajes y notificaciones.

## Pruebas

- SQL: `database/tests/0014_solicitudes.sql` (73 comprobaciones, transacción con ROLLBACK):
  aislamiento entre empresas y entre clientes, token válido/caducado/revocado/manipulado, anon sin
  acceso, transiciones, archivos y políticas de storage, no leídos, idempotencia de notificaciones,
  completitud versionada, borrador y envío, y descarga por token (D1–D16: correcta, token manipulado,
  caducado, revocado, documento de otra solicitud/empresa, interno, eliminado, sin acceso directo, rate limit).
- Edge (Deno, CI `edge-security`): `supabase/functions/_shared/solicitudes/descarga.test.ts`.
- Frontend (Vitest): `lib/solicitudes/domain.test.ts`, `useNotifications.test.tsx`,
  `components/v2/NotificationsBell.test.tsx`, `pages/solicitudes/SolicitudesInbox.test.tsx`,
  `pages/solicitudes/NuevaSolicitud.test.tsx`, `pages/SolicitudCliente.test.tsx` (incluye descarga),
  `lib/solicitudes/api.test.ts`, `lib/routing.test.ts` y `components/ReturnTo.test.tsx` (ruta conservada).

## Limitaciones conocidas y siguiente fase

- La empresa aún no marca documentos como internos desde la interfaz (`visible_to_client` existe en el
  modelo y lo respetan vista, políticas y descarga); todo lo que sube es visible para el cliente.
- Sin antivirus en la subida (mejora posterior); validación por extensión/MIME/tamaño.
- Sin envíos de email/SMS/WhatsApp: las notificaciones son internas; la tabla `notificaciones`
  es el punto de enganche para un despachador externo.
- Siguiente fase: presupuestos/alcance a partir de una solicitud «lista para alcance», portal del
  cliente autenticado, reasignación de solicitudes a clientes existentes.
