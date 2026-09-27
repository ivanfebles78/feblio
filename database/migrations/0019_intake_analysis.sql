-- Feblio · 0019 · Análisis inteligente de solicitudes: modelo, permisos y encolado
--
-- Idempotente (create … if not exists / create or replace). Aplicar DESPUÉS de 0018.
--
-- Qué crea:
--   A) solicitud_documentos += content_sha256, scan_status (antivirus obligatorio antes de procesar).
--   B) ia_empresa_config / ia_empresa_consumo: configuración y contabilidad de gasto por empresa,
--      separadas de los datos de negocio.
--   C) solicitud_documento_texto: texto extraído por página. SOLO service_role: `authenticated`
--      no puede leer el texto completo de un documento en ningún caso.
--   D) solicitud_analisis_ia: cabecera versionada del análisis + estado del trabajo (cola, lease,
--      reintentos, idempotencia, consumo).
--   E) solicitud_analisis_items: todo lo enumerable (partes, plazos, actuaciones, preguntas,
--      servicios…), tipado por `kind`, con `origin` (explicit/inferred/computed) y `deadline_kind`
--      (expreso/calculado) impuestos por esquema, no por el prompt.
--   F) solicitud_analisis_evidencias: documento, página y cita ≤300 caracteres. Sin lectura directa:
--      la interfaz las obtiene por `solicitud_ia_evidencias`, que valida empresa, solicitud y rol.
--   G) solicitud_analisis_revisiones: traza de aprobación, corrección o rechazo humano.
--   H) RPC: solicitud_ia_encolar (owner/manager), solicitud_ia_evidencias (lectura controlada),
--      ia_analisis_tomar (lease) e ia_analisis_guardar (persistencia atómica), estas dos solo
--      service_role.
--
-- Qué NO hace: no conecta OCR ni LLM, no cambia el estado de ninguna solicitud, no toca
-- `solicitud_analisis` (chequeo determinista de suficiencia, que sigue siendo la fuente de la
-- tarjeta de completitud) y no crea el motor de presupuestación.
--
-- Invariantes de seguridad: `authenticated` no escribe directamente en ninguna tabla nueva;
-- toda escritura pasa por RPC `security definer` con `search_path` fijo; el aislamiento entre
-- empresas se refuerza con claves foráneas compuestas `(x_id, empresa_id)`; los «no encontrado»
-- usan SQLSTATE 'PT404' (PostgREST → 404) y son indistinguibles de «de otra empresa».
--
-- Rollback lógico: eliminar las RPC de la sección 8, las tablas de las secciones 2 a 7 (sin
-- DROP CASCADE: enumerar antes los objetos dependientes) y las dos columnas de la sección 1.
-- Nada del flujo actual de solicitudes cambia de comportamiento si estas estructuras no existen.

-- ===========================================================================
-- 1) solicitud_documentos: hash de contenido y estado de antivirus
-- ===========================================================================

alter table public.solicitud_documentos add column if not exists content_sha256 text;
alter table public.solicitud_documentos add column if not exists scan_status text not null default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'solicitud_documentos_scan_status_check') then
    alter table public.solicitud_documentos add constraint solicitud_documentos_scan_status_check
      check (scan_status in ('pending', 'clean', 'rejected', 'failed', 'skipped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'solicitud_documentos_sha_check') then
    alter table public.solicitud_documentos add constraint solicitud_documentos_sha_check
      check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end $$;

comment on column public.solicitud_documentos.content_sha256 is
  'sha256 hex del contenido. Caché de extracción y detección de análisis obsoleto.';
comment on column public.solicitud_documentos.scan_status is
  'Antivirus. Solo ''clean'' puede procesarse; ''failed'' nunca equivale a limpio.';

create index if not exists solicitud_documentos_sha_idx on public.solicitud_documentos (content_sha256);

-- ===========================================================================
-- 2) Configuración y contabilidad de IA por empresa
-- ===========================================================================

create table if not exists public.ia_empresa_config (
  empresa_id              uuid primary key references public.empresas(id) on delete cascade,
  -- Modo de automatización. Hoy solo 'assistant' y 'approval_required' tienen efecto;
  -- los dos automáticos quedan declarados para el motor de presupuestación (fase posterior)
  -- y nunca se activan solos: requieren autorización expresa de un owner.
  automation_mode         text not null default 'assistant'
                          check (automation_mode in ('assistant', 'approval_required',
                                                     'controlled_auto', 'advanced_auto')),
  -- Interruptor global: detiene de inmediato cualquier envío automático.
  automation_kill_switch  boolean not null default false,
  auto_analysis_enabled   boolean not null default true,
  monthly_limit_micros    bigint not null default 25000000 check (monthly_limit_micros >= 0),
  warn_percent            int not null default 80 check (warn_percent between 1 and 100),
  max_documents           int not null default 20 check (max_documents between 1 and 200),
  max_pages               int not null default 300 check (max_pages between 1 and 5000),
  max_file_bytes          bigint not null default 26214400 check (max_file_bytes > 0),
  max_request_bytes       bigint not null default 209715200 check (max_request_bytes > 0),
  min_service_confidence  numeric(3,2) not null default 0.70
                          check (min_service_confidence between 0 and 1),
  text_retention_days     int not null default 30 check (text_retention_days between 1 and 3650),
  updated_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.ia_empresa_config is
  'Configuración de análisis por empresa: modo, cuota de gasto, límites y umbrales. Sin datos de negocio.';

create table if not exists public.ia_empresa_consumo (
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  period_month   date not null,                       -- siempre día 1 del mes (UTC)
  cost_micros    bigint not null default 0 check (cost_micros >= 0),
  analyses       int not null default 0 check (analyses >= 0),
  ocr_pages      int not null default 0 check (ocr_pages >= 0),
  input_tokens   bigint not null default 0 check (input_tokens >= 0),
  output_tokens  bigint not null default 0 check (output_tokens >= 0),
  updated_at     timestamptz not null default now(),
  primary key (empresa_id, period_month)
);

comment on table public.ia_empresa_consumo is
  'Contabilidad mensual de consumo de IA por empresa. Solo contadores, ningún contenido.';

drop trigger if exists ia_empresa_config_set_updated_at on public.ia_empresa_config;
create trigger ia_empresa_config_set_updated_at before update on public.ia_empresa_config
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 3) Texto extraído por página (SOLO servidor)
-- ===========================================================================

create table if not exists public.solicitud_documento_texto (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  solicitud_id    uuid not null references public.solicitudes(id) on delete cascade,
  documento_id    uuid not null references public.solicitud_documentos(id) on delete cascade,
  content_sha256  text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  page_no         int not null check (page_no >= 1),
  text            text,
  char_count      int not null default 0 check (char_count >= 0),
  ocr_provider    text,
  ocr_status      text not null default 'ok'
                  check (ocr_status in ('ok', 'partial', 'failed', 'unsupported')),
  ocr_error_code  text,
  extracted_at    timestamptz not null default now(),
  unique (documento_id, page_no)
);

comment on table public.solicitud_documento_texto is
  'Texto extraído por página. Contenido no confiable: nunca se trata como instrucciones. '
  'Sin grants para authenticated: la interfaz solo ve citas cortas vía solicitud_ia_evidencias.';

create index if not exists solicitud_documento_texto_sha_idx
  on public.solicitud_documento_texto (content_sha256);
create index if not exists solicitud_documento_texto_solicitud_idx
  on public.solicitud_documento_texto (solicitud_id);

-- ===========================================================================
-- 4) Cabecera del análisis (versionada) y estado del trabajo
-- ===========================================================================

create table if not exists public.solicitud_analisis_ia (
  id                    uuid primary key default gen_random_uuid(),
  solicitud_id          uuid not null references public.solicitudes(id) on delete cascade,
  empresa_id            uuid not null references public.empresas(id) on delete cascade,
  version               int not null check (version >= 1),
  status                text not null default 'queued'
                        check (status in ('queued', 'running', 'generated', 'in_review',
                                          'approved', 'corrected', 'rejected',
                                          'failed', 'partial', 'superseded')),
  -- Proveedor y reproducibilidad
  provider              text,
  model                 text,
  prompt_version        text,
  ocr_provider          text,
  -- Entrada e idempotencia
  input_fingerprint     text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key       text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  -- Clasificación
  primary_type          text check (primary_type in ('requerimiento_judicial', 'requerimiento_administrativo',
                                                     'consulta', 'presupuesto', 'encargo',
                                                     'mixta', 'ambigua')),
  secondary_types       text[] not null default '{}',
  has_formal_requirement boolean,
  requirement_class     text check (requirement_class in ('judicial', 'administrativo', 'otro')),
  summary               text,
  summary_lang          text check (summary_lang in ('es', 'en')),
  -- Confianzas separadas: documental aquí; la del servicio, por ítem
  confidence_document   numeric(3,2) check (confidence_document between 0 and 1),
  requires_human_review boolean not null default true,
  warnings              jsonb not null default '[]'::jsonb,
  -- Cola
  attempts              int not null default 0 check (attempts >= 0),
  lease_until           timestamptz,
  error_code            text,
  -- Consumo
  input_tokens          int not null default 0 check (input_tokens >= 0),
  output_tokens         int not null default 0 check (output_tokens >= 0),
  ocr_pages             int not null default 0 check (ocr_pages >= 0),
  cost_micros           bigint not null default 0 check (cost_micros >= 0),
  -- Trazabilidad
  triggered_by          text not null default 'system' check (triggered_by in ('system', 'empresa')),
  created_by            uuid references auth.users(id) on delete set null,
  started_at            timestamptz,
  finished_at           timestamptz,
  superseded_at         timestamptz,
  created_at            timestamptz not null default now(),
  unique (solicitud_id, version),
  unique (idempotency_key)
);

comment on table public.solicitud_analisis_ia is
  'Análisis de IA versionado. No sustituye a solicitud_analisis (chequeo determinista de suficiencia).';

create unique index if not exists solicitud_analisis_ia_id_empresa_key
  on public.solicitud_analisis_ia (id, empresa_id);
create index if not exists solicitud_analisis_ia_solicitud_idx
  on public.solicitud_analisis_ia (solicitud_id, version desc);
create index if not exists solicitud_analisis_ia_cola_idx
  on public.solicitud_analisis_ia (status, lease_until) where status in ('queued', 'running');

-- Plazos, requerimientos formales y clasificación siempre exigen revisión humana: se impone aquí,
-- no en el prompt ni en la interfaz.
create or replace function public.ia_force_human_review()
returns trigger language plpgsql as $$
begin
  if new.has_formal_requirement is true or new.requirement_class is not null then
    new.requires_human_review := true;
  end if;
  return new;
end $$;
revoke all on function public.ia_force_human_review() from public, anon, authenticated;

drop trigger if exists solicitud_analisis_ia_human_review on public.solicitud_analisis_ia;
create trigger solicitud_analisis_ia_human_review before insert or update on public.solicitud_analisis_ia
  for each row execute function public.ia_force_human_review();

-- ===========================================================================
-- 5) Ítems del análisis
-- ===========================================================================

create table if not exists public.solicitud_analisis_items (
  id            uuid primary key default gen_random_uuid(),
  analisis_id   uuid not null,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  kind          text not null check (kind in ('party', 'issuer', 'reference', 'notified_on',
                                              'deadline', 'action', 'risk', 'missing_info',
                                              'missing_document', 'question', 'service',
                                              'received_document')),
  origin        text not null check (origin in ('explicit', 'inferred', 'computed')),
  label         text,
  value         jsonb not null default '{}'::jsonb,
  service_id    uuid,
  deadline_kind text check (deadline_kind in ('expreso', 'calculado')),
  due_date      date,
  confidence    numeric(3,2) check (confidence between 0 and 1),
  human_state   text not null default 'pending'
                check (human_state in ('pending', 'accepted', 'edited', 'rejected', 'added_by_human')),
  human_value   jsonb,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  -- Un plazo siempre declara si es expreso o calculado; nada más lo declara.
  constraint solicitud_analisis_items_deadline_check
    check ((kind = 'deadline' and deadline_kind is not null)
        or (kind <> 'deadline' and deadline_kind is null)),
  -- Solo los ítems de servicio referencian el catálogo.
  constraint solicitud_analisis_items_service_check
    check ((kind = 'service') or service_id is null),
  -- Aislamiento: el análisis y el ítem pertenecen a la misma empresa.
  constraint solicitud_analisis_items_analisis_fkey
    foreign key (analisis_id, empresa_id)
    references public.solicitud_analisis_ia (id, empresa_id) on delete cascade,
  -- Aislamiento: imposible referenciar un servicio de otra empresa.
  constraint solicitud_analisis_items_service_fkey
    foreign key (service_id, empresa_id)
    references public.services (id, empresa_id) on delete set null
);

comment on table public.solicitud_analisis_items is
  'Ítems del análisis. origin y deadline_kind separan explícito / inferido / calculado por esquema.';

create unique index if not exists solicitud_analisis_items_id_empresa_key
  on public.solicitud_analisis_items (id, empresa_id);
create index if not exists solicitud_analisis_items_analisis_idx
  on public.solicitud_analisis_items (analisis_id, kind, sort_order);

-- ===========================================================================
-- 6) Evidencias (documento, página y cita corta)
-- ===========================================================================

create table if not exists public.solicitud_analisis_evidencias (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null,
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  documento_id uuid not null references public.solicitud_documentos(id) on delete cascade,
  page_no      int check (page_no >= 1),
  quote        text check (quote is null or length(quote) <= 300),
  char_start   int check (char_start is null or char_start >= 0),
  char_end     int check (char_end is null or char_end >= 0),
  created_at   timestamptz not null default now(),
  constraint solicitud_analisis_evidencias_item_fkey
    foreign key (item_id, empresa_id)
    references public.solicitud_analisis_items (id, empresa_id) on delete cascade
);

comment on table public.solicitud_analisis_evidencias is
  'Procedencia de cada ítem: documento, página y cita de 300 caracteres como máximo. '
  'Sin lectura directa para authenticated: se sirve por solicitud_ia_evidencias.';

create index if not exists solicitud_analisis_evidencias_item_idx
  on public.solicitud_analisis_evidencias (item_id);

-- ===========================================================================
-- 7) Revisiones humanas
-- ===========================================================================

create table if not exists public.solicitud_analisis_revisiones (
  id            uuid primary key default gen_random_uuid(),
  analisis_id   uuid not null,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  reviewer_id   uuid references auth.users(id) on delete set null,
  decision      text not null check (decision in ('approved', 'corrected', 'rejected')),
  note          text check (note is null or length(note) <= 2000),
  changed_items int not null default 0 check (changed_items >= 0),
  created_at    timestamptz not null default now(),
  constraint solicitud_analisis_revisiones_analisis_fkey
    foreign key (analisis_id, empresa_id)
    references public.solicitud_analisis_ia (id, empresa_id) on delete cascade
);

create index if not exists solicitud_analisis_revisiones_analisis_idx
  on public.solicitud_analisis_revisiones (analisis_id, created_at desc);

-- ===========================================================================
-- 8) RLS y permisos
-- ===========================================================================

alter table public.ia_empresa_config             enable row level security;
alter table public.ia_empresa_consumo            enable row level security;
alter table public.solicitud_documento_texto     enable row level security;
alter table public.solicitud_analisis_ia         enable row level security;
alter table public.solicitud_analisis_items      enable row level security;
alter table public.solicitud_analisis_evidencias enable row level security;
alter table public.solicitud_analisis_revisiones enable row level security;

drop policy if exists ia_empresa_config_select on public.ia_empresa_config;
create policy ia_empresa_config_select on public.ia_empresa_config for select to authenticated
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

drop policy if exists ia_empresa_consumo_select on public.ia_empresa_consumo;
create policy ia_empresa_consumo_select on public.ia_empresa_consumo for select to authenticated
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

drop policy if exists solicitud_analisis_ia_select on public.solicitud_analisis_ia;
create policy solicitud_analisis_ia_select on public.solicitud_analisis_ia for select to authenticated
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

drop policy if exists solicitud_analisis_items_select on public.solicitud_analisis_items;
create policy solicitud_analisis_items_select on public.solicitud_analisis_items for select to authenticated
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

drop policy if exists solicitud_analisis_revisiones_select on public.solicitud_analisis_revisiones;
create policy solicitud_analisis_revisiones_select on public.solicitud_analisis_revisiones for select to authenticated
  using (public.is_admin() or (public.current_role_name() = 'empresa' and empresa_id = public.current_empresa_id()));

-- solicitud_documento_texto y solicitud_analisis_evidencias NO tienen política alguna:
-- son inalcanzables salvo para service_role y para las funciones security definer.

-- Supabase concede ALL por defecto a anon/authenticated en las tablas nuevas: se retira todo y
-- solo se devuelve SELECT donde corresponde. El cliente final y anon no acceden a nada de esto.
revoke all on table public.ia_empresa_config, public.ia_empresa_consumo,
                    public.solicitud_documento_texto, public.solicitud_analisis_ia,
                    public.solicitud_analisis_items, public.solicitud_analisis_evidencias,
                    public.solicitud_analisis_revisiones
  from public, anon;

revoke all on table public.solicitud_documento_texto, public.solicitud_analisis_evidencias
  from authenticated;

revoke insert, update, delete, truncate, references, trigger on table
  public.ia_empresa_config, public.ia_empresa_consumo, public.solicitud_analisis_ia,
  public.solicitud_analisis_items, public.solicitud_analisis_revisiones
  from authenticated;

grant select on table public.ia_empresa_config, public.ia_empresa_consumo,
                      public.solicitud_analisis_ia, public.solicitud_analisis_items,
                      public.solicitud_analisis_revisiones
  to authenticated;

-- ===========================================================================
-- 9) Helpers internos
-- ===========================================================================

-- Contexto de escritura del análisis: owner/manager de la empresa (o admin). Mismo criterio que
-- el catálogo 0018, para no inventar un tercer modelo de permisos.
create or replace function public.ia_ctx_manage()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_empresa uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501', detail = 'unauthenticated';
  end if;
  if not public.can_manage_catalog() then
    raise exception 'Solo el propietario o un gestor pueden lanzar análisis'
      using errcode = '42501', detail = 'analysis_forbidden';
  end if;
  v_empresa := public.current_empresa_id();
  if v_empresa is null and not public.is_admin() then
    raise exception 'Cuenta sin empresa' using errcode = '42501', detail = 'no_company';
  end if;
  return v_empresa;
end $$;
revoke all on function public.ia_ctx_manage() from public, anon, authenticated;

-- Huella de la entrada: form_data + documentos limpios (hash y orden estable) + requisitos.
-- Si cambia, el análisis guardado queda obsoleto.
create or replace function public.ia_fingerprint(p_solicitud uuid)
returns text language sql stable security definer set search_path = public, extensions as $$
  select encode(digest(convert_to(
    coalesce((select s.form_data::text from public.solicitudes s where s.id = p_solicitud), '') ||
    coalesce((select string_agg(d.id::text || ':' || coalesce(d.content_sha256, ''), '|' order by d.id)
                from public.solicitud_documentos d
               where d.solicitud_id = p_solicitud and d.deleted_at is null), '') ||
    coalesce((select string_agg(r.id::text || ':' || r.status, '|' order by r.id)
                from public.solicitud_requisitos r
               where r.solicitud_id = p_solicitud), ''),
    'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function public.ia_fingerprint(uuid) from public, anon, authenticated;

-- Configuración efectiva (crea la fila por defecto la primera vez que se consulta).
create or replace function public.ia_config(p_empresa uuid)
returns public.ia_empresa_config language plpgsql security definer set search_path = public as $$
declare v_row public.ia_empresa_config;
begin
  insert into public.ia_empresa_config (empresa_id) values (p_empresa) on conflict (empresa_id) do nothing;
  select * into v_row from public.ia_empresa_config where empresa_id = p_empresa;
  return v_row;
end $$;
revoke all on function public.ia_config(uuid) from public, anon, authenticated;

-- ===========================================================================
-- 10) RPC de empresa
-- ===========================================================================

-- Encola un análisis. Idempotente: si ya existe uno para la misma entrada y versión de prompt,
-- devuelve el existente en lugar de crear otro. No cambia el estado de la solicitud.
create or replace function public.solicitud_ia_encolar(
  p_solicitud uuid,
  p_prompt_version text default 'v1',
  p_motivo text default 'manual')
returns public.solicitud_analisis_ia language plpgsql security definer set search_path = public, extensions as $$
declare
  v_empresa uuid; v_sol public.solicitudes; v_cfg public.ia_empresa_config;
  v_fp text; v_key text; v_row public.solicitud_analisis_ia; v_version int;
  v_docs int; v_bytes bigint; v_consumo bigint;
begin
  v_empresa := public.ia_ctx_manage();

  select * into v_sol from public.solicitudes where id = p_solicitud;
  if v_sol.id is null or (v_empresa is not null and v_sol.empresa_id <> v_empresa) then
    raise exception 'Solicitud no encontrada' using errcode = 'PT404', detail = 'request_not_found';
  end if;
  v_empresa := v_sol.empresa_id;

  -- Nunca se analiza un borrador: solo solicitudes ya enviadas por el cliente.
  if v_sol.status in ('draft', 'awaiting_client') then
    raise exception 'La solicitud aún no se ha enviado'
      using errcode = '22023', detail = 'analysis_not_submitted';
  end if;

  v_cfg := public.ia_config(v_empresa);

  select count(*), coalesce(sum(size_bytes), 0) into v_docs, v_bytes
    from public.solicitud_documentos
   where solicitud_id = p_solicitud and deleted_at is null;

  if v_docs > v_cfg.max_documents then
    raise exception 'Demasiados documentos para analizar'
      using errcode = '22023', detail = 'analysis_too_many_documents';
  end if;
  if v_bytes > v_cfg.max_request_bytes then
    raise exception 'Los documentos superan el tamaño máximo por solicitud'
      using errcode = '22023', detail = 'analysis_request_too_large';
  end if;
  if exists (select 1 from public.solicitud_documentos
              where solicitud_id = p_solicitud and deleted_at is null and size_bytes > v_cfg.max_file_bytes) then
    raise exception 'Un documento supera el tamaño máximo'
      using errcode = '22023', detail = 'analysis_file_too_large';
  end if;

  -- Cuota mensual: se detiene, no se degrada el modelo.
  select coalesce(cost_micros, 0) into v_consumo
    from public.ia_empresa_consumo
   where empresa_id = v_empresa and period_month = date_trunc('month', now() at time zone 'utc')::date;
  if coalesce(v_consumo, 0) >= v_cfg.monthly_limit_micros then
    raise exception 'Se ha alcanzado el límite mensual de análisis'
      using errcode = '22023', detail = 'analysis_quota_exhausted';
  end if;

  v_fp := public.ia_fingerprint(p_solicitud);
  v_key := encode(digest(convert_to(p_solicitud::text || v_fp || coalesce(p_prompt_version, 'v1'), 'UTF8'), 'sha256'), 'hex');

  select * into v_row from public.solicitud_analisis_ia where idempotency_key = v_key;
  if v_row.id is not null then
    return v_row;                                   -- idempotencia: misma entrada, mismo análisis
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.solicitud_analisis_ia where solicitud_id = p_solicitud;

  insert into public.solicitud_analisis_ia
    (solicitud_id, empresa_id, version, status, prompt_version, input_fingerprint, idempotency_key,
     triggered_by, created_by)
  values (p_solicitud, v_empresa, v_version, 'queued', coalesce(p_prompt_version, 'v1'), v_fp, v_key,
          'empresa', auth.uid())
  returning * into v_row;

  perform public.audit_log_internal(v_empresa, auth.uid(), 'analysis.queued', 'solicitud_analisis_ia',
    v_row.id, 'ok', jsonb_build_object('solicitud_id', p_solicitud, 'version', v_version,
                                        'documents', v_docs, 'motivo', left(coalesce(p_motivo, 'manual'), 40)));
  return v_row;
end $$;
revoke all on function public.solicitud_ia_encolar(uuid, text, text) from public, anon;
grant execute on function public.solicitud_ia_encolar(uuid, text, text) to authenticated;

-- Lectura controlada de evidencias: valida empresa, análisis y rol, y devuelve solo la cita corta.
-- Nunca expone storage_path ni el texto completo de la página.
create or replace function public.solicitud_ia_evidencias(p_analisis uuid)
returns table (item_id uuid, documento_id uuid, original_name text, page_no int, quote text)
language plpgsql stable security definer set search_path = public as $$
declare v_empresa uuid; v_row public.solicitud_analisis_ia;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501', detail = 'unauthenticated';
  end if;
  v_empresa := public.current_empresa_id();
  select * into v_row from public.solicitud_analisis_ia where id = p_analisis;
  if v_row.id is null or not (public.is_admin()
        or (public.current_role_name() = 'empresa' and v_row.empresa_id = v_empresa)) then
    raise exception 'Análisis no encontrado' using errcode = 'PT404', detail = 'analysis_not_found';
  end if;

  return query
    select e.item_id, e.documento_id, d.original_name, e.page_no, e.quote
      from public.solicitud_analisis_evidencias e
      join public.solicitud_analisis_items i on i.id = e.item_id and i.empresa_id = e.empresa_id
      join public.solicitud_documentos d on d.id = e.documento_id and d.empresa_id = e.empresa_id
     where i.analisis_id = p_analisis
       and e.empresa_id = v_row.empresa_id
       and d.solicitud_id = v_row.solicitud_id            -- evidencia de otra solicitud: descartada
       and d.deleted_at is null
     order by e.documento_id, e.page_no;
end $$;
revoke all on function public.solicitud_ia_evidencias(uuid) from public, anon;
grant execute on function public.solicitud_ia_evidencias(uuid) to authenticated;

-- ===========================================================================
-- 11) RPC internas (solo service_role)
-- ===========================================================================

-- Toma un trabajo de la cola con lease. Devuelve null si no hay nada pendiente.
create or replace function public.ia_analisis_tomar(p_lease_seconds int default 300)
returns public.solicitud_analisis_ia language plpgsql security definer set search_path = public as $$
declare v_row public.solicitud_analisis_ia; v_id uuid;
begin
  select id into v_id
    from public.solicitud_analisis_ia
   where (status = 'queued' and (lease_until is null or lease_until < now()))
      or (status = 'running' and lease_until is not null and lease_until < now())
   order by created_at
   for update skip locked
   limit 1;

  if v_id is null then
    return null;
  end if;

  update public.solicitud_analisis_ia
     set status = 'running',
         attempts = attempts + 1,
         lease_until = now() + make_interval(secs => greatest(30, least(3600, coalesce(p_lease_seconds, 300)))),
         started_at = coalesce(started_at, now())
   where id = v_id
   returning * into v_row;
  return v_row;
end $$;
revoke all on function public.ia_analisis_tomar(int) from public, anon, authenticated;
grant execute on function public.ia_analisis_tomar(int) to service_role;

-- Persistencia atómica del resultado. Descarta por diseño lo que no se puede confiar al modelo:
--   · servicios que no existen, no están activos o son de otra empresa;
--   · evidencias que apuntan a documentos ajenos a la solicitud.
-- Lo descartado se registra en `warnings`, nunca se inventa.
create or replace function public.ia_analisis_guardar(p_analisis uuid, p_payload jsonb)
returns public.solicitud_analisis_ia language plpgsql security definer set search_path = public as $$
declare
  v_row public.solicitud_analisis_ia; v_item jsonb; v_ev jsonb; v_item_id uuid;
  v_service uuid; v_warn jsonb := '[]'::jsonb; v_kind text; v_status text;
begin
  select * into v_row from public.solicitud_analisis_ia where id = p_analisis for update;
  if v_row.id is null then
    raise exception 'Análisis no encontrado' using errcode = 'PT404', detail = 'analysis_not_found';
  end if;
  if v_row.status not in ('running', 'queued') then
    raise exception 'El análisis ya no admite escritura'
      using errcode = '22023', detail = 'analysis_not_writable';
  end if;

  v_status := coalesce(p_payload->>'status', 'generated');
  if v_status not in ('generated', 'partial', 'failed') then
    raise exception 'Estado de resultado no válido' using errcode = '22023', detail = 'invalid_status';
  end if;

  delete from public.solicitud_analisis_items where analisis_id = p_analisis;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    v_kind := v_item->>'kind';
    v_service := null;

    if v_kind = 'service' then
      -- El modelo propone un código; el servidor decide. Nunca al revés.
      select s.id into v_service
        from public.services s
       where s.empresa_id = v_row.empresa_id
         and s.code = upper(coalesce(v_item->>'service_code', ''))
         and s.is_active
         and (s.effective_from is null or s.effective_from <= current_date)
         and (s.effective_to is null or s.effective_to > current_date);
      if v_service is null then
        v_warn := v_warn || jsonb_build_object('code', 'service_not_matched',
                                               'value', left(coalesce(v_item->>'service_code', ''), 40));
        continue;                                    -- no se inventa el servicio: se descarta el ítem
      end if;
    end if;

    insert into public.solicitud_analisis_items
      (analisis_id, empresa_id, kind, origin, label, value, service_id, deadline_kind, due_date,
       confidence, sort_order)
    values (p_analisis, v_row.empresa_id, v_kind,
            coalesce(v_item->>'origin', 'inferred'),
            left(coalesce(v_item->>'label', ''), 500),
            coalesce(v_item->'value', '{}'::jsonb),
            v_service,
            case when v_kind = 'deadline' then coalesce(v_item->>'deadline_kind', 'calculado') end,
            nullif(v_item->>'due_date', '')::date,
            nullif(v_item->>'confidence', '')::numeric,
            coalesce(nullif(v_item->>'sort_order', '')::int, 0))
    returning id into v_item_id;

    for v_ev in select * from jsonb_array_elements(coalesce(v_item->'evidence', '[]'::jsonb)) loop
      -- La evidencia debe apuntar a un documento vivo de ESTA solicitud.
      if exists (select 1 from public.solicitud_documentos d
                  where d.id = nullif(v_ev->>'documento_id', '')::uuid
                    and d.solicitud_id = v_row.solicitud_id
                    and d.empresa_id = v_row.empresa_id
                    and d.deleted_at is null) then
        insert into public.solicitud_analisis_evidencias
          (item_id, empresa_id, documento_id, page_no, quote, char_start, char_end)
        values (v_item_id, v_row.empresa_id, (v_ev->>'documento_id')::uuid,
                nullif(v_ev->>'page_no', '')::int,
                left(coalesce(v_ev->>'quote', ''), 300),
                nullif(v_ev->>'char_start', '')::int,
                nullif(v_ev->>'char_end', '')::int);
      else
        v_warn := v_warn || jsonb_build_object('code', 'evidence_rejected');
      end if;
    end loop;
  end loop;

  update public.solicitud_analisis_ia
     set status = v_status,
         provider = coalesce(p_payload->>'provider', provider),
         model = coalesce(p_payload->>'model', model),
         ocr_provider = coalesce(p_payload->>'ocr_provider', ocr_provider),
         primary_type = nullif(p_payload->>'primary_type', ''),
         secondary_types = coalesce(
           (select array_agg(x) from jsonb_array_elements_text(coalesce(p_payload->'secondary_types', '[]'::jsonb)) t(x)),
           '{}'),
         has_formal_requirement = (p_payload->>'has_formal_requirement')::boolean,
         requirement_class = nullif(p_payload->>'requirement_class', ''),
         summary = p_payload->>'summary',
         summary_lang = nullif(p_payload->>'summary_lang', ''),
         confidence_document = nullif(p_payload->>'confidence_document', '')::numeric,
         warnings = coalesce(p_payload->'warnings', '[]'::jsonb) || v_warn,
         input_tokens = coalesce(nullif(p_payload->>'input_tokens', '')::int, 0),
         output_tokens = coalesce(nullif(p_payload->>'output_tokens', '')::int, 0),
         ocr_pages = coalesce(nullif(p_payload->>'ocr_pages', '')::int, 0),
         cost_micros = coalesce(nullif(p_payload->>'cost_micros', '')::bigint, 0),
         error_code = nullif(p_payload->>'error_code', ''),
         lease_until = null,
         finished_at = now()
   where id = p_analisis
   returning * into v_row;

  -- Cualquier plazo detectado obliga a revisión humana, sea cual sea lo que diga el modelo.
  if exists (select 1 from public.solicitud_analisis_items
              where analisis_id = p_analisis and kind = 'deadline') then
    update public.solicitud_analisis_ia set requires_human_review = true
     where id = p_analisis returning * into v_row;
  end if;

  -- Versiones anteriores de la misma solicitud quedan sustituidas.
  update public.solicitud_analisis_ia
     set status = 'superseded', superseded_at = now()
   where solicitud_id = v_row.solicitud_id
     and id <> p_analisis
     and status in ('generated', 'partial', 'in_review');

  -- Contabilidad mensual.
  insert into public.ia_empresa_consumo (empresa_id, period_month, cost_micros, analyses, ocr_pages,
                                         input_tokens, output_tokens)
  values (v_row.empresa_id, date_trunc('month', now() at time zone 'utc')::date,
          v_row.cost_micros, 1, v_row.ocr_pages, v_row.input_tokens, v_row.output_tokens)
  on conflict (empresa_id, period_month) do update
    set cost_micros = public.ia_empresa_consumo.cost_micros + excluded.cost_micros,
        analyses = public.ia_empresa_consumo.analyses + 1,
        ocr_pages = public.ia_empresa_consumo.ocr_pages + excluded.ocr_pages,
        input_tokens = public.ia_empresa_consumo.input_tokens + excluded.input_tokens,
        output_tokens = public.ia_empresa_consumo.output_tokens + excluded.output_tokens,
        updated_at = now();

  -- Auditoría sin contenido: identificadores, códigos y recuentos.
  perform public.audit_log_internal(v_row.empresa_id, null,
    case when v_status = 'failed' then 'analysis.failed' else 'analysis.completed' end,
    'solicitud_analisis_ia', v_row.id, case when v_status = 'failed' then 'error' else 'ok' end,
    jsonb_build_object('solicitud_id', v_row.solicitud_id, 'version', v_row.version,
                       'items', (select count(*) from public.solicitud_analisis_items where analisis_id = p_analisis),
                       'warnings', jsonb_array_length(v_row.warnings)));
  return v_row;
end $$;
revoke all on function public.ia_analisis_guardar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ia_analisis_guardar(uuid, jsonb) to service_role;

-- Purga del texto extraído: 30 días (configurable) tras cerrar la solicitud. Auditable, sin contenido.
create or replace function public.ia_purgar_texto()
returns int language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  with borradas as (
    delete from public.solicitud_documento_texto t
     using public.solicitudes s, public.ia_empresa_config c
     where t.solicitud_id = s.id
       and c.empresa_id = t.empresa_id
       and s.status = 'closed'
       and s.last_activity_at < now() - make_interval(days => c.text_retention_days)
    returning t.empresa_id
  )
  select count(*) into v_deleted from borradas;
  if v_deleted > 0 then
    perform public.audit_log_internal(null, null, 'analysis.text_purged', 'solicitud_documento_texto',
      null, 'ok', jsonb_build_object('rows', v_deleted));
  end if;
  return v_deleted;
end $$;
revoke all on function public.ia_purgar_texto() from public, anon, authenticated;
grant execute on function public.ia_purgar_texto() to service_role;

-- ===========================================================================
-- 12) Comprobaciones
-- ===========================================================================

do $$
declare v_missing text := '';
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'solicitud_analisis_ia') then
    v_missing := v_missing || ' solicitud_analisis_ia';
  end if;
  if has_table_privilege('authenticated', 'public.solicitud_documento_texto', 'select') then
    raise exception '0019: authenticated no debe poder leer el texto extraído';
  end if;
  if has_table_privilege('authenticated', 'public.solicitud_analisis_evidencias', 'select') then
    raise exception '0019: authenticated no debe poder leer las evidencias directamente';
  end if;
  if has_table_privilege('authenticated', 'public.solicitud_analisis_ia', 'insert')
     or has_table_privilege('authenticated', 'public.solicitud_analisis_items', 'update') then
    raise exception '0019: authenticated no debe escribir directamente en el análisis';
  end if;
  if not has_table_privilege('authenticated', 'public.solicitud_analisis_ia', 'select') then
    raise exception '0019: authenticated debe poder leer la cabecera del análisis';
  end if;
  if not has_function_privilege('service_role', 'public.ia_analisis_guardar(uuid, jsonb)', 'execute') then
    raise exception '0019: service_role debe poder ejecutar ia_analisis_guardar';
  end if;
  if has_function_privilege('authenticated', 'public.ia_analisis_guardar(uuid, jsonb)', 'execute') then
    raise exception '0019: authenticated no debe ejecutar ia_analisis_guardar';
  end if;
  if not has_function_privilege('authenticated', 'public.solicitud_ia_encolar(uuid, text, text)', 'execute') then
    raise exception '0019: authenticated debe poder encolar un análisis';
  end if;
  if v_missing <> '' then
    raise exception '0019: faltan objetos:%', v_missing;
  end if;
  raise notice 'Análisis 0019: estructuras y permisos verificados';
end $$;
