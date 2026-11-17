-- Workspace staff roles and invitation provisioning.
-- Additive at the application level: existing owner/admin/agent memberships
-- remain valid. Apply to an isolated staging project first, after a backup.

do $$
begin
  if exists (
    select 1
    from public.workspace_members
    where role not in ('owner', 'admin', 'manager', 'support', 'analyst', 'agent')
  ) then
    raise exception 'workspace_members contains an unsupported role; reconcile it before expanding role constraints';
  end if;

  if exists (
    select 1
    from public.workspace_invitations
    where role not in ('admin', 'manager', 'support', 'analyst', 'agent')
  ) then
    raise exception 'workspace_invitations contains an unsupported role; reconcile it before expanding role constraints';
  end if;
end;
$$;

-- The original constraints were unnamed in some historical environments.
-- Remove only CHECK constraints that constrain the role column, then restore
-- the explicit canonical constraints below.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.workspace_members'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~ '\mrole\M'
  loop
    execute format('alter table public.workspace_members drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.workspace_invitations'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~ '\mrole\M'
  loop
    execute format('alter table public.workspace_invitations drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'manager', 'support', 'analyst', 'agent'));

alter table public.workspace_invitations
  add constraint workspace_invitations_role_check
  check (role in ('admin', 'manager', 'support', 'analyst', 'agent'));

-- Keep the public RPC signature stable while preserving the role and the
-- restrictive permission overrides that were attached to an invitation.
create or replace function public.provision_verified_account_v2(
  p_user_id uuid,
  p_email text,
  p_account_kind text,
  p_first_name text,
  p_last_name text,
  p_phone_e164 text,
  p_country_code text,
  p_company_name text,
  p_tax_country text,
  p_tax_id_type text,
  p_tax_id text,
  p_tax_id_normalized text,
  p_invitation_id uuid,
  p_legal_document_ids uuid[],
  p_accept_ip inet,
  p_user_agent text
)
returns uuid
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_email text;
  v_workspace_id uuid;
  v_workspace_name text;
  v_slug text;
  v_role text := 'owner';
  v_permissions jsonb := '{}'::jsonb;
  v_invite public.workspace_invitations%rowtype;
  v_doc uuid;
begin
  if p_user_id is null or nullif(trim(p_email), '') is null then
    raise exception 'account identity is required';
  end if;
  select lower(email) into v_email from auth.users where id = p_user_id;
  if v_email is null or v_email <> lower(trim(p_email)) then
    raise exception 'auth email mismatch';
  end if;

  if p_invitation_id is not null then
    select * into v_invite
    from public.workspace_invitations
    where id = p_invitation_id
      and lower(email) = v_email
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    for update;
    if not found then raise exception 'invalid workspace invitation'; end if;
    v_workspace_id := v_invite.workspace_id;
    v_role := case
      when v_invite.role in ('admin', 'manager', 'support', 'analyst', 'agent')
        then v_invite.role
      else 'agent'
    end;
    v_permissions := coalesce(v_invite.permissions, '{}'::jsonb);
  else
    v_workspace_name := coalesce(nullif(trim(p_company_name), ''), nullif(trim(concat_ws(' ', p_first_name, p_last_name)), ''), v_email);
    v_slug := regexp_replace(lower(v_workspace_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then v_slug := 'workspace'; end if;
    v_slug := left(v_slug, 72) || '-' || substr(gen_random_uuid()::text, 1, 8);
    insert into public.workspaces(name, slug, kind, created_by)
    values (v_workspace_name, v_slug, coalesce(nullif(p_account_kind, ''), 'person'), p_user_id)
    returning id into v_workspace_id;
  end if;

  insert into public.profiles(user_id, account_kind, first_name, last_name, email, phone_e164, country_code)
  values (p_user_id, coalesce(nullif(p_account_kind, ''), 'person'), nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''), v_email, p_phone_e164, p_country_code)
  on conflict (user_id) do update set
    account_kind = excluded.account_kind,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone_e164 = excluded.phone_e164,
    country_code = excluded.country_code,
    updated_at = now();

  insert into public.workspace_members(workspace_id, user_id, role, permissions, status, updated_at)
  values (v_workspace_id, p_user_id, v_role, v_permissions, 'active', now())
  on conflict (workspace_id, user_id) do update set
    role = excluded.role,
    permissions = excluded.permissions,
    status = 'active',
    updated_at = now();

  if p_account_kind = 'company' and to_regclass('public.workspace_company_profiles') is not null then
    insert into public.workspace_company_profiles(
      workspace_id, legal_name, trade_name, tax_country, tax_id_type, tax_id, tax_id_normalized,
      tax_status, phone_e164, country_code, accent_token, white_label_enabled, custom_domain_status
    ) values (
      v_workspace_id, coalesce(nullif(trim(p_company_name), ''), v_workspace_name), null,
      coalesce(nullif(p_tax_country, ''), 'BR'), coalesce(nullif(p_tax_id_type, ''), 'CNPJ'),
      coalesce(p_tax_id, ''), coalesce(p_tax_id_normalized, ''), 'unverified',
      p_phone_e164, p_country_code, 'neutral', false, 'not_configured'
    ) on conflict (workspace_id) do nothing;
  end if;

  foreach v_doc in array coalesce(p_legal_document_ids, '{}'::uuid[]) loop
    insert into public.legal_acceptances(workspace_id, user_id, document_id, ip, user_agent, metadata)
    select v_workspace_id, p_user_id, d.id, p_accept_ip, p_user_agent, jsonb_build_object('source', 'registration')
    from public.legal_documents d
    where d.id = v_doc and d.active = true
    on conflict do nothing;
  end loop;

  insert into public.password_history(user_id, password_hash)
  select p_user_id, pr.initial_password_hash
  from public.pending_registrations pr
  where pr.auth_user_id = p_user_id and pr.completed_at is null
  order by pr.created_at desc limit 1;

  if p_invitation_id is not null then
    update public.workspace_invitations set accepted_at = now() where id = p_invitation_id;
  end if;
  return v_workspace_id;
end;
$$;

revoke all on function public.provision_verified_account_v2(uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid[], inet, text) from public, anon, authenticated;
grant execute on function public.provision_verified_account_v2(uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid[], inet, text) to service_role;
