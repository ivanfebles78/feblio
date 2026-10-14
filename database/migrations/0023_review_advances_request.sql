-- Feblio · 0023 · La revisión humana del análisis avanza el estado de la solicitud
--
-- Idempotente (create or replace). Aplicar DESPUÉS de 0020.
--
-- Cambia `solicitud_ia_revisar` para que, además de decidir sobre el análisis, mueva la SOLICITUD:
--   · aprobar  → ready_for_scope (preparada para presupuesto)
--   · rechazar → missing_information (información pendiente)
--   · corregir → no cambia la solicitud
-- El cambio humano es seguro (lo decide una persona). Solo se aplica si la transición es válida
-- (sol_transicion_valida) y no está ya en ese estado; si no procede, NO falla la revisión.
-- No notifica al cliente (es un paso interno); queda auditado como solicitud.status.<estado>.

create or replace function public.solicitud_ia_revisar(
  p_analisis uuid, p_decision text, p_nota text default null)
returns public.solicitud_analisis_ia language plpgsql security definer set search_path = public as $$
declare
  v_row public.solicitud_analisis_ia; v_changed int; v_action text;
  v_target text; v_sol_status text;
begin
  if p_decision not in ('approved', 'corrected', 'rejected') then
    raise exception 'Decisión no válida' using errcode = '22023', detail = 'invalid_decision';
  end if;

  v_row := public.ia_analisis_gestionable(p_analisis);

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

  -- Avanzar la solicitud según la decisión humana (si la transición es válida).
  v_target := case p_decision when 'approved' then 'ready_for_scope'
                              when 'rejected' then 'missing_information' end;
  if v_target is not null then
    select status into v_sol_status from public.solicitudes where id = v_row.solicitud_id;
    if v_sol_status is not null and v_sol_status <> v_target
       and public.sol_transicion_valida(v_sol_status, v_target) then
      update public.solicitudes set status = v_target, last_activity_at = now()
       where id = v_row.solicitud_id;
      perform public.audit_log_internal(v_row.empresa_id, auth.uid(), 'solicitud.status.' || v_target,
        'solicitudes', v_row.solicitud_id, 'ok',
        jsonb_build_object('via', 'analysis_review', 'analisis_id', v_row.id));
    end if;
  end if;

  return v_row;
end $$;
revoke all on function public.solicitud_ia_revisar(uuid, text, text) from public, anon;
grant execute on function public.solicitud_ia_revisar(uuid, text, text) to authenticated;

do $$
begin
  if not has_function_privilege('authenticated', 'public.solicitud_ia_revisar(uuid, text, text)', 'execute') then
    raise exception '0023: authenticated debe poder revisar un análisis';
  end if;
  raise notice 'Revisión 0023: aprobar/rechazar avanza la solicitud';
end $$;
