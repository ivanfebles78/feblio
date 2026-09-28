-- Feblio · 0020 · Revisión humana del análisis inteligente de solicitudes
--
-- Idempotente (create or replace). Aplicar DESPUÉS de 0019.
--
-- Qué crea (solo RPC; ninguna tabla nueva):
--   A) solicitud_ia_abrir_revision(analisis)   → generated/partial → in_review (owner/manager).
--   B) solicitud_ia_item_estado(item, estado, valor) → aceptar / editar / descartar un ítem.
--   C) solicitud_ia_revisar(analisis, decision, nota) → aprobar / corregir / rechazar la cabecera,
--      registrando la revisión en solicitud_analisis_revisiones y auditando sin contenido.
--
-- Qué NO hace: no toca el estado de la solicitud (aprobar solo HABILITA la transición a
-- ready_for_scope, no la ejecuta), no crea el motor de presupuestación y no reabre un análisis
-- ya aprobado (inmutable una vez aprobado, según el diseño).
--
-- Invariantes de seguridad: `authenticated` sigue sin escribir directamente en ninguna tabla del
-- análisis; toda escritura pasa por estas RPC `security definer` con `search_path` fijo. El
-- aislamiento entre empresas se comprueba por `empresa_id` y las claves foráneas compuestas de 0019.
-- Los «no encontrado» usan SQLSTATE 'PT404' y son indistinguibles de «de otra empresa».
--
-- Rollback lógico: eliminar las tres funciones de la sección 2. Nada del flujo actual cambia si no
-- existen: la 0019 sigue encolando y persistiendo análisis; solo desaparece la revisión humana.

-- ===========================================================================
-- 1) Helper: carga y autoriza una cabecera de análisis para gestión (owner/manager o admin)
-- ===========================================================================

-- Devuelve la fila del análisis si la sesión puede gestionarlo; si no, lanza PT404 (indistinguible
-- de «de otra empresa») o 42501 (no autenticado / sin permiso de gestión). Reutiliza el mismo
-- criterio de rol que el catálogo 0018 e ia_ctx_manage de 0019: no inventa un tercer modelo.
create or replace function public.ia_analisis_gestionable(p_analisis uuid)
returns public.solicitud_analisis_ia language plpgsql stable security definer set search_path = public as $$
declare v_row public.solicitud_analisis_ia;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501', detail = 'unauthenticated';
  end if;
  if not public.can_manage_catalog() then
    raise exception 'Solo el propietario o un gestor pueden revisar análisis'
      using errcode = '42501', detail = 'analysis_forbidden';
  end if;
  select * into v_row from public.solicitud_analisis_ia where id = p_analisis;
  if v_row.id is null or not (public.is_admin()
        or (public.current_role_name() = 'empresa' and v_row.empresa_id = public.current_empresa_id())) then
    raise exception 'Análisis no encontrado' using errcode = 'PT404', detail = 'analysis_not_found';
  end if;
  return v_row;
end $$;
revoke all on function public.ia_analisis_gestionable(uuid) from public, anon, authenticated;
-- No se concede a authenticated: es un helper interno de las RPC de esta migración.

-- ===========================================================================
-- 2) RPC de empresa (owner/manager)
-- ===========================================================================

-- Abre la revisión: al mirar un análisis recién generado, la empresa lo marca «en revisión».
-- Solo avanza generated/partial → in_review; cualquier otro estado se devuelve sin cambios
-- (idempotente y sin sorpresas si dos gestores lo abren a la vez).
create or replace function public.solicitud_ia_abrir_revision(p_analisis uuid)
returns public.solicitud_analisis_ia language plpgsql security definer set search_path = public as $$
declare v_row public.solicitud_analisis_ia;
begin
  v_row := public.ia_analisis_gestionable(p_analisis);
  if v_row.status in ('generated', 'partial') then
    update public.solicitud_analisis_ia set status = 'in_review'
     where id = p_analisis returning * into v_row;
  end if;
  return v_row;
end $$;
revoke all on function public.solicitud_ia_abrir_revision(uuid) from public, anon;
grant execute on function public.solicitud_ia_abrir_revision(uuid) to authenticated;

-- Marca el estado humano de un ítem del análisis: aceptado, editado o descartado. El valor humano
-- (para 'edited') se guarda en human_value sin tocar el valor original propuesto por el modelo, de
-- modo que la corrección queda trazada frente a la propuesta. No se puede tocar un análisis ya
-- aprobado o rechazado (inmutable).
create or replace function public.solicitud_ia_item_estado(
  p_item uuid, p_estado text, p_valor jsonb default null)
returns public.solicitud_analisis_items language plpgsql security definer set search_path = public as $$
declare v_item public.solicitud_analisis_items; v_ana public.solicitud_analisis_ia;
begin
  if p_estado not in ('pending', 'accepted', 'edited', 'rejected') then
    raise exception 'Estado de ítem no válido' using errcode = '22023', detail = 'invalid_item_state';
  end if;

  select * into v_item from public.solicitud_analisis_items where id = p_item;
  if v_item.id is null then
    raise exception 'Ítem no encontrado' using errcode = 'PT404', detail = 'item_not_found';
  end if;
  -- Autoriza sobre la cabecera (misma empresa, rol de gestión). PT404 si no procede.
  v_ana := public.ia_analisis_gestionable(v_item.analisis_id);

  if v_ana.status in ('approved', 'rejected') then
    raise exception 'El análisis ya está cerrado' using errcode = '22023', detail = 'analysis_closed';
  end if;

  update public.solicitud_analisis_items
     set human_state = p_estado,
         human_value = case when p_estado = 'edited' then p_valor else null end
   where id = p_item
   returning * into v_item;
  return v_item;
end $$;
revoke all on function public.solicitud_ia_item_estado(uuid, text, jsonb) from public, anon;
grant execute on function public.solicitud_ia_item_estado(uuid, text, jsonb) to authenticated;

-- Decisión humana sobre la cabecera: aprobar, corregir o rechazar. Registra la revisión con el
-- número de ítems intervenidos y actualiza el estado del análisis. Aprobar/rechazar son terminales;
-- corregir deja el análisis en 'corrected' y admite una aprobación posterior. Nunca cambia el estado
-- de la solicitud: aprobar solo habilita, en otra parte, la transición a ready_for_scope.
create or replace function public.solicitud_ia_revisar(
  p_analisis uuid, p_decision text, p_nota text default null)
returns public.solicitud_analisis_ia language plpgsql security definer set search_path = public as $$
declare v_row public.solicitud_analisis_ia; v_changed int; v_action text;
begin
  if p_decision not in ('approved', 'corrected', 'rejected') then
    raise exception 'Decisión no válida' using errcode = '22023', detail = 'invalid_decision';
  end if;

  v_row := public.ia_analisis_gestionable(p_analisis);

  -- Solo se decide sobre análisis vivos y revisables.
  if v_row.status not in ('generated', 'partial', 'in_review', 'corrected') then
    raise exception 'El análisis no admite revisión en su estado actual'
      using errcode = '22023', detail = 'analysis_not_reviewable';
  end if;

  select count(*) into v_changed from public.solicitud_analisis_items
   where analisis_id = p_analisis and human_state in ('edited', 'rejected', 'added_by_human');

  insert into public.solicitud_analisis_revisiones (analisis_id, empresa_id, reviewer_id, decision, note, changed_items)
  values (p_analisis, v_row.empresa_id, auth.uid(), p_decision,
          nullif(left(coalesce(p_nota, ''), 2000), ''), v_changed);

  update public.solicitud_analisis_ia set status = p_decision
   where id = p_analisis returning * into v_row;

  v_action := case when p_decision = 'rejected' then 'analysis.rejected' else 'analysis.approved' end;
  perform public.audit_log_internal(v_row.empresa_id, auth.uid(), v_action, 'solicitud_analisis_ia',
    v_row.id, case when p_decision = 'rejected' then 'error' else 'ok' end,
    jsonb_build_object('solicitud_id', v_row.solicitud_id, 'version', v_row.version,
                       'decision', p_decision, 'changed_items', v_changed));
  return v_row;
end $$;
revoke all on function public.solicitud_ia_revisar(uuid, text, text) from public, anon;
grant execute on function public.solicitud_ia_revisar(uuid, text, text) to authenticated;

-- ===========================================================================
-- 3) Comprobaciones
-- ===========================================================================

do $$
begin
  if not has_function_privilege('authenticated', 'public.solicitud_ia_revisar(uuid, text, text)', 'execute') then
    raise exception '0020: authenticated debe poder revisar un análisis';
  end if;
  if not has_function_privilege('authenticated', 'public.solicitud_ia_item_estado(uuid, text, jsonb)', 'execute') then
    raise exception '0020: authenticated debe poder marcar el estado de un ítem';
  end if;
  if has_function_privilege('authenticated', 'public.ia_analisis_gestionable(uuid)', 'execute') then
    raise exception '0020: ia_analisis_gestionable es interno y no debe concederse a authenticated';
  end if;
  -- authenticated sigue sin poder escribir directamente en las tablas del análisis (0019 lo garantiza).
  if has_table_privilege('authenticated', 'public.solicitud_analisis_items', 'update')
     or has_table_privilege('authenticated', 'public.solicitud_analisis_revisiones', 'insert') then
    raise exception '0020: authenticated no debe escribir directamente en el análisis';
  end if;
  raise notice 'Revisión 0020: RPC y permisos verificados';
end $$;
