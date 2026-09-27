# Análisis inteligente de solicitudes y documentos (0019 y siguientes)

Feblio analiza el mensaje, los datos del formulario y los documentos adjuntos de una solicitud para
determinar **qué se pide**, **qué falta** y **qué servicios del catálogo de esa empresa podrían aplicar**.
El resultado es una **propuesta revisable**, no una decisión.

Este documento describe el diseño completo. La **fase 1** (migración `0019`) implementa solo el modelo de
datos, los permisos y las RPC de encolado y persistencia: **no conecta OCR ni LLM**.

## Principios

1. **Los documentos son entrada hostil.** Nunca son instrucciones. Ver «Defensa frente a inyección».
2. **Ningún resultado de IA cambia por sí mismo estados, fechas, servicios ni datos de negocio.**
3. **Plazos, requerimientos formales y clasificaciones siempre requieren revisión humana.**
4. **Nada se inventa**: si no hay servicio adecuado en el catálogo, no se propone ninguno.
5. Se distingue siempre **explícito**, **inferido** y **calculado**, y **plazo expreso** de **plazo calculado**.
6. Cada conclusión relevante señala **documento, página y fragmento** de origen.
7. Los datos del cliente **no se usan para entrenar modelos**.

## Qué se reutiliza

| Pieza | Dónde | Uso |
|---|---|---|
| `solicitudes` y sus 7 estados | `0014` | El análisis **no** añade estados a la solicitud |
| `solicitud_documentos` | `0014:84-97` | Origen de los adjuntos |
| Bucket privado `intake-files` | `0006` → privado en `0011:204` | Descarga por URL firmada de 5 min desde servidor |
| `solicitud_analisis` (reglas) | `0014:115-129` | **Se mantiene intacto**: chequeo determinista de suficiencia |
| Catálogo `services` (0018) | `0018:137-177` | `min_info`, `required_documents`, `client_questions`, `included_actions`, `excluded_actions`, `prerequisites` |
| `audit_log_internal` + `strip_secret_keys` | `0009:591-604` | Auditoría sin secretos |
| Patrón de cuota fail closed | `0017` | Base del control de gasto |
| Convención de errores `detail` + `PT404` | `0016`, `0018:19-21` | Códigos estables traducidos en el frontend |

**Por qué no se reutiliza `solicitud_analisis`**: su forma (`completeness`, `received`, `missing`,
`missing_documents`) es la del chequeo determinista, se dispara en cada guardado, no necesita revisión
humana y tiene otro ciclo de vida. Mezclarlos obligaría a un `jsonb` opaco y a condicionar cada consulta
por `provider`. Conviven: reglas alimenta la tarjeta de completitud; IA es otra cosa.

## Modelo de datos (migración `0019_intake_analysis.sql`)

### Columnas añadidas

```
solicitud_documentos += content_sha256 text   -- sha256 del contenido: caché de OCR y obsolescencia
                        scan_status    text   -- pending | clean | rejected | failed | skipped
```

Solo `scan_status = 'clean'` pasa a OCR. `rejected` queda bloqueado, `pending` no se procesa y un fallo
de escaneo **nunca** cuenta como limpio.

### Tablas

| Tabla | Qué guarda | Lectura directa de `authenticated` |
|---|---|---|
| `ia_empresa_config` | Modo, límite mensual, aviso, umbrales por empresa | Sí (su empresa) |
| `ia_empresa_consumo` | Contabilidad mensual: coste, análisis, páginas, tokens | Sí (su empresa) |
| `solicitud_documento_texto` | Texto OCR por página | **No: solo `service_role`** |
| `solicitud_analisis_ia` | Cabecera versionada del análisis y estado del trabajo | Sí (su empresa) |
| `solicitud_analisis_items` | Todo lo enumerable, tipado por `kind` | Sí (su empresa) |
| `solicitud_analisis_evidencias` | Documento, página y cita ≤300 caracteres | **No: solo por RPC controlada** |
| `solicitud_analisis_revisiones` | Quién aprobó, corrigió o rechazó, y cuándo | Sí (su empresa) |

`solicitud_analisis_items.kind` ∈ `party, issuer, reference, notified_on, deadline, action, risk,
missing_info, missing_document, question, service, received_document`.

Tres columnas imponen por esquema lo que no puede quedar en manos del prompt:

- `origin` ∈ `explicit | inferred | computed`
- `deadline_kind` ∈ `expreso | calculado` (obligatorio si `kind = 'deadline'`, nulo en caso contrario)
- `human_state` ∈ `pending | accepted | edited | rejected | added_by_human`

`service_id` lleva **clave foránea compuesta** `(service_id, empresa_id) → services(id, empresa_id)`,
igual que 0018 entre `services` y `service_price_versions`: es imposible referenciar un servicio de otra
empresa aunque el modelo lo alucine.

### Confianzas separadas

El diseño distingue cuatro magnitudes distintas y **no** las promedia:

| Magnitud | Dónde vive | Fase |
|---|---|---|
| Confianza del **análisis documental** | `solicitud_analisis_ia.confidence_document` | 1 |
| Confianza de **identificación del servicio** | `confidence` de los ítems `kind='service'` | 1 |
| Certeza del **cálculo económico** | presupuesto (fase posterior) | — |
| **Elegibilidad para envío automático** | evaluación de reglas del presupuesto (fase posterior) | — |

## Flujo y estados

El ciclo vive en `solicitud_analisis_ia.status` y **no toca** los estados de la solicitud:

```
queued → running → generated → in_review → approved
                                        ↘ corrected
                                        ↘ rejected
   ↓          ↓
 failed    partial        superseded (sustituido por una versión posterior)
```

- **Disparo**: al **enviar definitivamente** una solicitud, y a demanda («Reanalizar»).
  Nunca sobre borradores ni en cada subida de archivo.
- **Barrido** cada 5 minutos para `queued` atascados y leases caducados (`pg_cron` + `pg_net` si están
  disponibles; si no, Scheduled Edge Function, **sin cambiar el contrato interno**).
- **Obsolescencia**: `input_fingerprint` = sha256 de `form_data` + hashes de documentos + estado de
  requisitos. Si el recalculado difiere, la interfaz marca «obsoleto» y ofrece reanalizar; no se invalida
  solo, para no perder correcciones humanas.
- **Reanálisis**: crea `version = N+1`; la anterior pasa a `superseded` y se conserva.
- **Idempotencia**: `idempotency_key = sha256(solicitud_id || input_fingerprint || prompt_version)`.
  Un segundo encolado con la misma clave devuelve la versión existente en lugar de crear otra.
- **Leases**: `lease_until` evita doble procesamiento; `attempts` máximo 3 con espera creciente.
- **«Preparado para presupuesto»** es el estado existente `ready_for_scope`. Aprobar un análisis
  **habilita** esa transición; no la ejecuta.

## Procesamiento

```
envío definitivo → RPC solicitud_ia_encolar (owner/manager)
   → solicitud_analisis_ia (status='queued')
   → worker (service_role):
       1. lease
       2. antivirus: solo scan_status='clean' continúa
       3. extracción por documento, con caché por content_sha256
       4. LLM con salida JSON estricta
       5. validación en servidor (nunca se confía en el modelo)
       6. RPC ia_analisis_guardar (escritura atómica)
```

### Defensa frente a inyección

1. El texto de documentos **nunca** entra en el *system prompt*; va en bloques delimitados y etiquetados
   como no confiables.
2. El modelo **no tiene herramientas**: solo devuelve JSON.
3. **Salida cerrada**: enumeraciones fijas validadas contra el esquema; un valor fuera del enum invalida
   la respuesta.
4. **Los servicios no los elige el modelo**: propone códigos y el servidor los resuelve contra
   `services` de esa empresa, activos y vigentes. Un código desconocido se descarta con aviso.
5. **Las evidencias se verifican**: un `documento_id` ajeno a la solicitud se rechaza.
6. Heurística de detección: patrones tipo «ignora las instrucciones anteriores» registran
   `analysis.injection_suspected` y fuerzan revisión humana. No bloquean: un requerimiento real puede
   citar texto extraño.

## Límites y coste

| Límite | Valor inicial |
|---|---|
| Documentos por análisis | 20 |
| Páginas totales | 300 |
| Tamaño por archivo | 25 MB |
| Tamaño por solicitud | 200 MB |
| Gasto por empresa y mes | 25 € (configurable) |
| Aviso | 80 % del límite |

Al alcanzar el límite **se detienen los análisis automáticos**. No se degrada a un modelo peor de forma
silenciosa. Un owner o manager puede pedir una ejecución manual explícita si hay cuota global, viendo
antes el coste estimado. Superar un límite produce un **rechazo explícito y traducido**.

La configuración y la contabilidad viven en `ia_empresa_config` e `ia_empresa_consumo`, separadas de los
datos de negocio.

## Proveedores

Previstos: **LLM Claude vía AWS Bedrock en región UE**; **OCR Mistral OCR con residencia UE**. Ambos
detrás de una abstracción (`OcrProvider`, `AnalysisProvider`) con el nombre en configuración y las claves
en Supabase Secrets, para poder sustituir cualquiera de los dos.

**Antes de activar producción** hay que documentar y verificar, con evidencia: DPA, subencargados,
residencia efectiva, retención, uso para entrenamiento y **alcance exacto de ENS/CPSTIC**. A fecha de
este documento no consta que ningún servicio concreto de OCR o LLM figure en el catálogo CPSTIC del CCN;
solo consta calificación ENS a nivel de plataforma de los grandes proveedores. **No se afirma
cumplimiento sin evidencia.**

## Idioma

- Resumen y preguntas: idioma configurado en la empresa (`empresas.language`).
- Datos estructurados: independientes del idioma siempre que sea posible (enumeraciones, fechas, códigos).
- Evidencias y citas: **idioma original del documento**.
- No se generan dos versiones por defecto, para no duplicar coste. La traducción bajo demanda se podrá
  añadir después.

## Seguridad

- RLS en todas las tablas nuevas con la plantilla del proyecto:
  `is_admin() or (current_role_name() = 'empresa' and empresa_id = current_empresa_id())`.
- Permisos: `revoke all … from public, anon` + `revoke insert, update, delete, truncate, references,
  trigger … from authenticated` + `grant select … to authenticated` (Supabase concede `ALL` por defecto
  en las tablas nuevas).
- **`solicitud_documento_texto` no tiene ningún grant para `authenticated`**: el texto OCR completo es
  exclusivamente de servidor.
- **`solicitud_analisis_evidencias` tampoco**: la interfaz obtiene las citas por la RPC
  `solicitud_ia_evidencias`, que valida empresa, solicitud, documento y rol.
- Escrituras del trabajador: `ia_analisis_guardar`, con `grant execute … to service_role` únicamente.
- Roles: **owner y manager** lanzan, reanalizan, corrigen, aprueban y rechazan (`can_manage_catalog()`);
  **member** solo lee; **cliente y anon** no tienen ningún acceso.
- **Nunca** se escriben en logs ni en `audit_events` texto de documentos, resúmenes sensibles ni citas.
  La auditoría guarda identificadores, códigos y recuentos: `analysis.queued`, `analysis.completed`,
  `analysis.failed`, `analysis.approved`, `analysis.rejected`, `analysis.injection_suspected`,
  `analysis.text_purged`.
- Antivirus **obligatorio antes de abrir o procesar** el documento, con escáner aislado (ClamAV o
  equivalente) en infraestructura europea. **No se envían documentos a VirusTotal ni a servicios públicos
  de análisis.** Además se valida el tipo real, no solo la extensión.

## Retención

El texto OCR se elimina **30 días después** de que la solicitud quede cerrada o cancelada. Los documentos
originales siguen la política de conservación de la empresa. El borrado es auditable
(`analysis.text_purged`, con recuentos) y **no** guarda contenido sensible en `audit_events`.

## Interfaz (fase 4)

Pestaña **Análisis** dentro de la solicitud, con el patrón de pestañas ya probado en `SettingsSection`
(`role="tablist"`, `aria-selected`, `aria-controls`) y estado en la URL. Contenido: clasificación;
resumen; urgencia y plazos **con los expresos y los calculados visualmente separados**; información y
documentos faltantes; preguntas sugeridas; servicios sugeridos **sin precio**; evidencias con enlace al
origen; confianza; editar/corregir; aprobar o rechazar; historial de versiones. Bilingüe ES/EN,
responsive y accesible.

## Evolución: automatización progresiva de presupuestos

La regla «la IA propone y una persona decide» rige el arranque y los casos que no cumplan las
condiciones de automatización. El diseño admite automatización creciente **sin rediseñar el análisis**.

### Modos por empresa y por servicio

| Modo | Comportamiento |
|---|---|
| `assistant` | Feblio propone; siempre requiere revisión |
| `approval_required` | Genera el presupuesto completo; una persona lo aprueba |
| `controlled_auto` | Envía automáticamente solo los casos que superan **todas** las reglas |
| `advanced_auto` | Automatización ampliada para servicios con historial fiable |

Activar `controlled_auto` o `advanced_auto` **nunca es automático**: requiere autorización expresa de un
**owner**, se activa o revoca **por servicio**, registra quién, cuándo y con qué umbrales, y existe un
**interruptor global** que detiene de inmediato todos los envíos automáticos.

### Condiciones para enviar un presupuesto automáticamente

Las once deben cumplirse: solicitud completa; sin documentos, datos ni respuestas pendientes; servicio
identificado inequívocamente y activo; cálculo determinista sobre una **versión concreta del precio**;
sin contradicciones ni avisos de seguridad; sin condiciones especiales sin resolver; impuestos, suplidos,
costes externos, descuentos y recargos determinados; confianza por encima del umbral configurado; importe
dentro de los límites autorizados; empresa y servicio con envío automático permitido; métricas históricas
mínimas cumplidas.

Si falla una condición **el proceso no se bloquea**: se genera el borrador y pasa a revisión humana
**indicando exactamente qué regla impidió el envío automático**.

### Métricas mínimas iniciales (configurables por empresa)

100 presupuestos humanos del mismo servicio · 98 % aprobados sin modificaciones relevantes · desviación
media de precio inferior al 1 % · cero errores graves en los últimos 50 casos · ninguna reclamación
atribuible al cálculo automático · autorización expresa del owner.

Los servicios con precio libre, «desde», por horas sin límite conocido, sujetos a valoración, con gastos
externos no cerrados o condiciones excepcionales **siguen necesitando aprobación**, salvo que exista una
fórmula determinista aprobada.

### Trazabilidad de cada presupuesto automático

Solicitud y documentos usados · análisis y versión · servicios seleccionados · **versión exacta de cada
precio** · fórmula de cálculo · impuestos, descuentos, recargos y suplidos · reglas evaluadas · valores de
confianza · motivo de elegibilidad · plantilla enviada · destinatario · fecha y canal · proveedor, modelo
y prompt · registro de entrega y auditoría.

### Salvaguardas

Modo **sombra** (calcula lo que habría enviado sin enviarlo, para medir precisión) · muestreo humano
configurable · límites por operación, día y mes · bloqueo ante anomalías o aumento de correcciones ·
retirada inmediata del modo automático · **nunca** se marca un presupuesto como aceptado: la aceptación
pertenece al cliente · tras la aceptación, la provisión del 50 % sí puede generarse y enviarse
automáticamente según la configuración de la empresa.

### Puntos de extensión ya presentes en 0019

- `ia_empresa_config.automation_mode` con las cuatro modalidades y el **interruptor global**
  `automation_kill_switch`, más los umbrales configurables.
- Confianzas **separadas** desde el principio (documental e identificación del servicio), de modo que la
  certeza del cálculo y la elegibilidad se añadan sin tocar lo existente.
- Análisis **versionado e inmutable una vez aprobado**: un presupuesto podrá referenciar
  `solicitud_analisis_ia.id` y conservar exactamente lo que se usó.
- `solicitud_analisis_items.service_id` con FK compuesta: el presupuesto partirá de servicios ya
  resueltos contra el catálogo de la empresa, nunca de texto libre.
- `prompt_version`, `provider` y `model` guardados por análisis, para reproducibilidad.

El modo por servicio y el registro de autorizaciones del owner **no se crean todavía**: pertenecen al
motor de presupuestación y se diseñarán con él, apoyados en `ia_empresa_config`.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Migración 0019: modelo, permisos, RPC de encolado y persistencia, suite SQL | en curso |
| 2 | Antivirus y extracción (OCR) con caché por hash | pendiente |
| 3 | Análisis LLM, validación de esquema y defensas de inyección | pendiente |
| 4 | Pestaña Análisis bilingüe y accesible | pendiente |
| 5 | Validación en staging con documentos anonimizados | pendiente |
| 6 | Despliegue controlado a producción | pendiente |
| 7+ | Motor de presupuestación y automatización progresiva | diseñado, no implementado |

## Tareas separadas detectadas durante el diseño

No se mezclan con esta migración:

1. `sol_rate_limit` (`0014:818-831`) hace **fail open** con clave vacía y su limpieza borra todas las
   claves antiguas; `intake_email_rate_check` ya corrigió ambos aspectos en su ámbito.
2. `send-otp/index.ts:86` devuelve `error: String(e)`: puede filtrar texto de excepción. Tampoco valida
   el método HTTP ni tiene límite de frecuencia propio.
3. `stripSecrets()` de TypeScript (`_shared/integrations/db.ts:124`) no incluye `iban`, que sí está en
   `strip_secret_keys()` de SQL.
4. `safeDownloadName` (`_shared/solicitudes/descarga.ts:75`) usa `/[" -]/g`, que elimina espacios y
   guiones normales además de los caracteres de control pretendidos.
5. Producción no envía `X-Frame-Options` ni `Content-Security-Policy`.
