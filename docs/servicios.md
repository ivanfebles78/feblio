# Catálogo de servicios y precios (migración 0018)

Cada empresa define **sus** servicios con el precio que cobra por ellos. Es la base de los futuros
presupuestos: un presupuesto guardará la **versión de precio** exacta que se aplicó. En esta fase no hay
IA, análisis documental ni generación de presupuestos.

## Modelo de datos

| Tabla | Contenido |
|---|---|
| `service_categories` | Categorías comerciales de la empresa (Derecho laboral, Reformas, Ingeniería…). Feblio **no** crea ninguna automáticamente y no tienen relación con la futura clasificación de las entradas de clientes. `unique (empresa_id, code)`. |
| `services` | Cabecera del servicio: código interno inmutable, nombre y descripción ES/EN, categoría, estado, vigencia del servicio, duración estimada, requisitos previos (`visit`/`meeting`/`assessment`), revisión humana, información mínima, documentos obligatorios, preguntas al cliente, actuaciones incluidas y excluidas, `usage_count`. `unique (empresa_id, code)`. |
| `service_price_versions` | Versiones de precio inmutables: modalidad (`fixed`, `hourly`, `per_unit`, `from`, `on_assessment`), importe `numeric(12,2)`, moneda ISO, impuesto configurable (`IVA`/`IGIC`/`IPSI`/`EXENTO`/`OTRO`) con su tipo, unidad, mínimo/máximo, suplemento de urgencia, gastos externos o suplidos, `valid_from`/`valid_to`, `version_no`. |
| `services_catalog_v` | Vista (`security_invoker`) con cada servicio y su versión **vigente hoy** más la **próxima programada**. |

Integridad entre empresas garantizada en el propio esquema: `service_price_versions (service_id, empresa_id)`
y `services (category_id, empresa_id)` son claves foráneas **compuestas**, así que una versión nunca puede
pertenecer a otra empresa que su servicio ni un servicio usar la categoría de otra empresa.

## Vigencia y versionado

- Una versión aplica en la fecha `D` si `valid_from <= D < coalesce(valid_to, ∞)` (intervalo semiabierto).
- Una restricción de exclusión GIST (`btree_gist`) impide **solapes** para un mismo servicio: como máximo
  una versión aplicable por fecha. Las correcciones el mismo día generan un rango vacío (la versión
  sustituida nunca llegó a aplicarse) y no cuentan como solape.
- `service_price_at(servicio, fecha)` devuelve la versión aplicable; los presupuestos futuros guardarán ese
  id (con `on delete restrict`) y llamarán a `service_register_usage` (solo `service_role`).
- **No hay puntero a la versión vigente**: se resuelve siempre por fechas, así que no puede desincronizarse
  con una versión programada a futuro.
- Cambiar el precio crea la versión `N+1` y cierra la anterior (`valid_to`, `superseded_at`). Si no cambia
  ningún campo económico no se crea versión. Se puede programar un cambio futuro y cancelarlo mientras no
  haya entrado en vigor (`service_cancel_scheduled_price`).
- Las versiones son **inmutables**: un trigger rechaza cualquier `update` que no sea cerrar la vigencia y
  cualquier `delete` fuera de las RPC. Desactivar un servicio no borra nada.
- Concurrencia: cada cambio bloquea la fila del servicio (`select … for update`), de modo que dos peticiones
  simultáneas no pueden crear dos versiones vigentes ni repetir `version_no`.

## Roles y permisos

`profiles.company_role` (`owner` | `manager` | `member`) solo tiene sentido cuando `profiles.role = 'empresa'`;
en el resto de cuentas es `NULL` (restricción `profiles_company_role_check` + trigger de normalización).
El backfill inicial marcó como `owner` al propietario del alta y como `manager` al resto de cuentas de
empresa existentes, para no quitarle capacidades a nadie; los perfiles de empresa nuevos entran como `member`.
Nadie puede cambiarse su propio rol desde el perfil (guard + trigger). La gestión visual de miembros llegará
más adelante: entonces **solo `owner`** podrá asignar `owner`/`manager`.

| Acción | owner | manager | member | cliente | admin plataforma |
|---|---|---|---|---|---|
| Ver catálogo, historial y exportar | ✅ | ✅ | ✅ | ❌ | ✅ |
| Crear, editar, importar, activar, desactivar | ✅ | ✅ | ❌ | ❌ | ✅ |
| Borrar un servicio nunca utilizado | ✅ | ✅ | ❌ | ❌ | ✅ |
| Borrar un servicio ya utilizado | ❌ (solo desactivar) | ❌ | ❌ | ❌ | ❌ |

## Seguridad

- RLS de **solo lectura** por empresa en las tres tablas (`is_admin()` o `role = 'empresa'` y
  `empresa_id = current_empresa_id()`); `anon` y `cliente` no tienen ninguna política.
- Ninguna escritura directa para `authenticated`: se revocan `insert/update/delete` y todo pasa por RPC
  `security definer` con `search_path` fijo. `empresa_id` se deriva siempre de la sesión: el cliente nunca
  lo envía y un `id` de otra empresa devuelve `service_not_found` (respuesta indistinguible de «no existe»).
- Los errores usan códigos estables en `detail` (`catalog_forbidden`, `price_overlap`, `service_in_use`…)
  que el frontend traduce; nunca se devuelve texto interno.
- Auditoría en `audit_events`: `catalog.category_created/updated/deleted`, `catalog.service_created/updated/
  deleted/activated/deactivated`, `catalog.price_changed`, `catalog.price_schedule_cancelled`,
  `catalog.imported` (solo recuentos: nunca el archivo ni los datos importados).

## Interfaz

- Paso **opcional** «Servicios y precios» del onboarding (tras Formularios, antes de Automatizaciones): no
  bloquea la activación y las empresas ya activadas lo ven pendiente sin perder su estado.
- Misma pantalla en **Configuración → Servicios** (`STEP_REGISTRY` en modo `settings`).
- Listado con búsqueda, filtros (categoría, estado, modalidad), precio vigente formateado según el idioma,
  aviso de cambio programado, editor por secciones, historial de precios e importación/exportación.
- Español e inglés completos (`locales/{es,en}/services.json`), sin textos sin traducir.

## Importación y exportación

- CSV (separador `;` o `,` autodetectado) y XLSX (**ExcelJS se carga dinámicamente** solo al abrir el
  importador; queda en su propio chunk). El archivo se procesa **en el navegador**: no se sube a Storage.
- Límites: 5 MB y 500 filas. No se evalúan fórmulas (de un XLSX se lee el último resultado guardado) ni macros.
- Previsualización obligatoria con acción por fila (crear, actualizar, nueva versión de precio, error).
  La confirmación es **atómica**: si una fila falla no se guarda ninguna (`services_import(p_rows, p_commit)`).
- Protección frente a *formula injection*: al exportar, toda celda que empiece por `= + - @`, tabulador o
  retorno se prefija con `'`; al importar se retira ese prefijo (round-trip estable).
- Columnas: `code; category; name_es; name_en; description_es; description_en; active; pricing_mode;
  base_price; currency; tax_type; tax_rate; unit; min_price; max_price; urgency_surcharge_type;
  urgency_surcharge_value; external_costs; estimated_duration_minutes; prerequisites; requires_human_review;
  min_info; required_documents; client_questions; included_actions; excluded_actions; valid_from; valid_to`.
  Listas separadas por `|`; textos bilingües como `Español=English`; documentos opcionales con `:opcional`;
  preguntas con `:tipo`; gastos como `Concepto=Item:importe[:fijo]`. Plantillas CSV y XLSX descargables.

## Pruebas

- SQL `database/tests/0018_services_catalog.sql` (69 comprobaciones, ROLLBACK): roles internos, permisos por
  rol, aislamiento entre empresas, versionado, vigencias, inmutabilidad, borrado, importación y auditoría.
- Concurrencia real contra PostgreSQL local: altas simultáneas del mismo código, 20 cambios de precio a la
  vez, activaciones mezcladas, importaciones simultáneas y programaciones a la misma fecha.
- Frontend: `lib/services/catalog.test.ts` (validación, formato, CSV/round-trip, *formula injection*, capa de
  datos) y `pages/onboarding/steps/ServicesCatalogStep.test.tsx` (permisos, filtros, editor, importación, es/en).

## Qué NO hace esta fase

Sin IA, sin análisis de documentos, sin generación de presupuestos y sin clasificación automática de
entradas. Las categorías del catálogo son **comerciales** y no deben confundirse con los tipos de entrada
(consulta, requerimiento, seguimiento…) del futuro clasificador.
