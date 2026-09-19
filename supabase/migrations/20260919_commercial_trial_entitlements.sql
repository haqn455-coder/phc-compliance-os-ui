alter table public.pilot_requests
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz,
  add column if not exists paid_until_at timestamptz,
  add column if not exists commercial_status text,
  add column if not exists plan_code text;

update public.pilot_requests
set commercial_status = case
      when status = 'SUSPENDED' then 'SUSPENDED'
      when status = 'ACTIVE' then 'PAID_ACTIVE'
      else 'TRIAL_ACTIVE'
    end,
    plan_code = case
      when status = 'SUSPENDED' then 'PILOT_SUSPENDED'
      when status = 'ACTIVE' then 'PILOT_GRANDFATHERED'
      else 'TRIAL_3D'
    end
where commercial_status is null or plan_code is null;

alter table public.pilot_requests
  alter column commercial_status set default 'TRIAL_ACTIVE',
  alter column commercial_status set not null,
  alter column plan_code set default 'TRIAL_3D',
  alter column plan_code set not null;

alter table public.pilot_requests
  drop constraint if exists pilot_requests_commercial_status_check;
alter table public.pilot_requests
  add constraint pilot_requests_commercial_status_check
  check (commercial_status in ('TRIAL_ACTIVE','PAID_ACTIVE','EXPIRED','SUSPENDED'));

alter table public.pilot_requests
  drop constraint if exists pilot_requests_trial_dates_check;
alter table public.pilot_requests
  add constraint pilot_requests_trial_dates_check
  check (trial_expires_at is null or trial_started_at is not null);

create index if not exists pilot_requests_tenant_entitlement_idx
  on public.pilot_requests (tenant_id, submitted_at desc)
  where tenant_id is not null;

create or replace function public.open_pilot_entitlement(p_tenant_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private
as $function$
declare
  r public.pilot_requests%rowtype;
  v_now timestamptz := clock_timestamp();
  v_row_count integer := 0;
begin
  if not exists (
    select 1 from public.memberships
    where tenant_id = p_tenant_id and user_id = p_user_id
  ) then
    return jsonb_build_object('allowed',false,'code','TENANT_ACCESS_DENIED','message','This account is not assigned to the requested clinic.');
  end if;

  select * into r
  from public.pilot_requests
  where tenant_id = p_tenant_id
  order by submitted_at desc
  limit 1
  for update;

  if r.id is null then
    return jsonb_build_object('allowed',false,'code','ENTITLEMENT_REQUIRED','message','Clinic access requires an approved PHC OS entitlement.');
  end if;

  if r.status in ('SUSPENDED','CLOSED') or r.commercial_status = 'SUSPENDED' then
    return jsonb_build_object('allowed',false,'code','ACCESS_SUSPENDED','message','Clinic access is suspended. Contact PHC OS admin.','commercial_status','SUSPENDED','pilot_request_id',r.id);
  end if;

  if r.commercial_status = 'PAID_ACTIVE' then
    if r.plan_code = 'PILOT_GRANDFATHERED' and r.paid_until_at is null then
      return jsonb_build_object('allowed',true,'code','PAID_ACTIVE','commercial_status','PAID_ACTIVE','plan_code',r.plan_code,'paid_until_at',r.paid_until_at,'pilot_request_id',r.id,'pilot_code',r.pilot_code,'clinic_name',r.clinic_name);
    end if;
    if r.paid_until_at is not null and r.paid_until_at > v_now then
      return jsonb_build_object('allowed',true,'code','PAID_ACTIVE','commercial_status','PAID_ACTIVE','plan_code',r.plan_code,'paid_until_at',r.paid_until_at,'pilot_request_id',r.id,'pilot_code',r.pilot_code,'clinic_name',r.clinic_name);
    end if;
    update public.pilot_requests set commercial_status='EXPIRED',updated_at=v_now where id=r.id and commercial_status<>'EXPIRED';
    get diagnostics v_row_count = row_count;
    if v_row_count > 0 then
      insert into public.pilot_events(pilot_request_id,event_type,actor_user_id,details)
      values(r.id,'PAID_ENTITLEMENT_EXPIRED',p_user_id,jsonb_build_object('paid_until_at',r.paid_until_at));
    end if;
    return jsonb_build_object('allowed',false,'code','ENTITLEMENT_EXPIRED','message','Your trial has ended. Contact PHC OS admin to continue.','commercial_status','EXPIRED','pilot_request_id',r.id);
  end if;

  if r.commercial_status = 'TRIAL_ACTIVE' then
    if r.trial_started_at is null then
      update public.pilot_requests
      set trial_started_at=v_now,trial_expires_at=v_now+interval '72 hours',plan_code='TRIAL_3D',updated_at=v_now
      where id=r.id and trial_started_at is null;
      get diagnostics v_row_count = row_count;
      if v_row_count > 0 then
        insert into public.pilot_events(pilot_request_id,event_type,actor_user_id,details)
        values(r.id,'TRIAL_STARTED',p_user_id,jsonb_build_object('trial_started_at',v_now,'trial_expires_at',v_now+interval '72 hours','duration_hours',72));
      end if;
      select * into r from public.pilot_requests where id=r.id;
    end if;
    if r.trial_expires_at > v_now then
      return jsonb_build_object('allowed',true,'code','TRIAL_ACTIVE','commercial_status','TRIAL_ACTIVE','plan_code',r.plan_code,'trial_started_at',r.trial_started_at,'trial_expires_at',r.trial_expires_at,'pilot_request_id',r.id,'pilot_code',r.pilot_code,'clinic_name',r.clinic_name);
    end if;
    update public.pilot_requests set commercial_status='EXPIRED',updated_at=v_now where id=r.id and commercial_status<>'EXPIRED';
    get diagnostics v_row_count = row_count;
    if v_row_count > 0 then
      insert into public.pilot_events(pilot_request_id,event_type,actor_user_id,details)
      values(r.id,'TRIAL_EXPIRED',p_user_id,jsonb_build_object('trial_expires_at',r.trial_expires_at));
    end if;
  end if;

  return jsonb_build_object('allowed',false,'code','ENTITLEMENT_EXPIRED','message','Your trial has ended. Contact PHC OS admin to continue.','commercial_status','EXPIRED','pilot_request_id',r.id);
end $function$;

create or replace function public.set_pilot_entitlement(p_request_id uuid, p_actor_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private
as $function$
declare
  r public.pilot_requests%rowtype;
  v_now timestamptz := clock_timestamp();
  v_action text := upper(trim(coalesce(p_action,'')));
  v_status text;
  v_event text;
begin
  if not exists(select 1 from public.platform_admins where user_id=p_actor_id) then
    raise exception 'platform admin required';
  end if;
  select * into r from public.pilot_requests where id=p_request_id for update;
  if r.id is null then raise exception 'pilot request not found'; end if;
  if r.tenant_id is null then raise exception 'pilot has no tenant'; end if;

  if v_action='START_TRIAL' then
    if r.status in ('SUSPENDED','CLOSED') or r.commercial_status='SUSPENDED' then raise exception 'resume access before starting a trial'; end if;
    if r.commercial_status='PAID_ACTIVE' and (r.plan_code='PILOT_GRANDFATHERED' or r.paid_until_at>v_now) then raise exception 'paid entitlement is already active'; end if;
    if r.trial_started_at is not null and coalesce(r.trial_expires_at,v_now)<=v_now then raise exception 'expired trial must be extended, not restarted'; end if;
    update public.pilot_requests set commercial_status='TRIAL_ACTIVE',plan_code='TRIAL_3D',paid_until_at=null,updated_at=v_now where id=r.id;
    v_event := case when r.trial_started_at is null then 'TRIAL_ENABLED' else 'TRIAL_CONFIRMED' end;
  elsif v_action='EXTEND_TRIAL_3D' then
    if r.status in ('SUSPENDED','CLOSED') or r.commercial_status='SUSPENDED' then raise exception 'resume access before extending a trial'; end if;
    if r.trial_started_at is null then raise exception 'trial has not started; first authorized owner open starts the 72-hour clock'; end if;
    update public.pilot_requests set commercial_status='TRIAL_ACTIVE',plan_code='TRIAL_3D',trial_expires_at=greatest(coalesce(trial_expires_at,v_now),v_now)+interval '72 hours',paid_until_at=null,updated_at=v_now where id=r.id;
    v_event := 'TRIAL_EXTENDED_3D';
  elsif v_action in ('MARK_PAID_30D','MARK_PAID_12M') then
    if r.status in ('SUSPENDED','CLOSED') or r.commercial_status='SUSPENDED' then raise exception 'resume access before marking paid'; end if;
    update public.pilot_requests set commercial_status='PAID_ACTIVE',plan_code=case when v_action='MARK_PAID_30D' then 'PAID_30D' else 'PAID_12M' end,paid_until_at=case when v_action='MARK_PAID_30D' then v_now+interval '30 days' else v_now+interval '1 year' end,updated_at=v_now where id=r.id;
    v_event := case when v_action='MARK_PAID_30D' then 'PAID_30D_CONFIRMED' else 'PAID_12M_CONFIRMED' end;
  elsif v_action='SUSPEND' then
    update public.tenant_invites set active=false where tenant_id=r.tenant_id;
    update public.pilot_requests set status='SUSPENDED',commercial_status='SUSPENDED',decision_notes=coalesce(nullif(trim(p_reason),''),decision_notes),updated_at=v_now where id=r.id;
    v_event := 'ACCESS_SUSPENDED';
  elsif v_action='RESUME' then
    update public.tenant_invites set active=true where tenant_id=r.tenant_id;
    v_status := case
      when r.plan_code='PILOT_GRANDFATHERED' and r.paid_until_at is null then 'PAID_ACTIVE'
      when r.paid_until_at>v_now then 'PAID_ACTIVE'
      when r.trial_started_at is null or r.trial_expires_at>v_now then 'TRIAL_ACTIVE'
      else 'EXPIRED'
    end;
    update public.pilot_requests set status='ACTIVE',commercial_status=v_status,updated_at=v_now where id=r.id;
    v_event := 'ACCESS_RESUMED';
  else
    raise exception 'unsupported entitlement action';
  end if;

  insert into public.pilot_events(pilot_request_id,event_type,actor_user_id,details)
  values(r.id,v_event,p_actor_id,jsonb_build_object('action',v_action,'reason',coalesce(p_reason,'')));

  select * into r from public.pilot_requests where id=r.id;
  return jsonb_build_object('ok',true,'pilot_code',r.pilot_code,'status',r.status,'commercial_status',r.commercial_status,'plan_code',r.plan_code,'trial_started_at',r.trial_started_at,'trial_expires_at',r.trial_expires_at,'paid_until_at',r.paid_until_at);
end $function$;

revoke all on function public.open_pilot_entitlement(uuid,uuid) from public, anon, authenticated;
revoke all on function public.set_pilot_entitlement(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.open_pilot_entitlement(uuid,uuid) to service_role;
grant execute on function public.set_pilot_entitlement(uuid,uuid,text,text) to service_role;
