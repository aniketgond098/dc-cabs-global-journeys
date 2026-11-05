-- Emergency pricing approval gate. Existing rules default to pending until
-- explicitly reviewed; the known Asian Paints test rows are quarantined.

alter table public.pricing_rules
  add column if not exists approval_status text not null default 'pending';

alter table public.pricing_rules
  alter column approval_status set default 'pending',
  alter column approval_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pricing_rules'::regclass
      and conname = 'pricing_rules_approval_status_check'
  ) then
    alter table public.pricing_rules
      add constraint pricing_rules_approval_status_check
      check (approval_status in ('pending', 'approved', 'test_only', 'rejected'));
  end if;
end
$$;

do $$
declare
  expected_note constant text := 'Asian Paints temporary client rate card — TEST ONLY; not approved DC Cabs public pricing. Effective 2026-10-25 through 2026-12-31.';
  matched_count integer;
  updated_count integer;
begin
  select count(*) into matched_count
  from public.pricing_rules r
  where r.id = any (array[
    'a0000000-0000-4000-8000-000000000201'::uuid,
    'a0000000-0000-4000-8000-000000000202'::uuid,
    'a0000000-0000-4000-8000-000000000203'::uuid,
    'a0000000-0000-4000-8000-000000000204'::uuid,
    'a0000000-0000-4000-8000-000000000205'::uuid,
    'a0000000-0000-4000-8000-000000000206'::uuid,
    'a0000000-0000-4000-8000-000000000207'::uuid,
    'a0000000-0000-4000-8000-000000000208'::uuid,
    'a0000000-0000-4000-8000-000000000209'::uuid
  ])
    and r.internal_notes = expected_note;

  if matched_count <> 9 then
    raise exception 'Expected all nine identified Asian Paints test rules with the exact TEST ONLY note; matched %', matched_count;
  end if;

  update public.pricing_rules r
  set approval_status = 'test_only',
      is_active = false,
      updated_at = clock_timestamp()
  where r.id = any (array[
    'a0000000-0000-4000-8000-000000000201'::uuid,
    'a0000000-0000-4000-8000-000000000202'::uuid,
    'a0000000-0000-4000-8000-000000000203'::uuid,
    'a0000000-0000-4000-8000-000000000204'::uuid,
    'a0000000-0000-4000-8000-000000000205'::uuid,
    'a0000000-0000-4000-8000-000000000206'::uuid,
    'a0000000-0000-4000-8000-000000000207'::uuid,
    'a0000000-0000-4000-8000-000000000208'::uuid,
    'a0000000-0000-4000-8000-000000000209'::uuid
  ])
    and r.internal_notes = expected_note;

  get diagnostics updated_count = row_count;
  if updated_count <> 9 then
    raise exception 'Expected to quarantine exactly nine Asian Paints test rules; updated %', updated_count;
  end if;
end
$$;

-- Quote resolution now requires explicit approval and an exact trip/package
-- match. In particular, airport transfers cannot reuse local package pricing.
create or replace function public.resolve_pricing_rule(
  p_vehicle_category_id uuid,
  p_trip_type public.trip_type,
  p_package_tier public.package_tier,
  p_origin_city_id uuid,
  p_origin_location_id uuid,
  p_destination_city_id uuid,
  p_destination_location_id uuid,
  p_at timestamptz
)
returns table (resolution_status text, pricing_rule_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_origin_city_id uuid := p_origin_city_id;
  v_destination_city_id uuid := p_destination_city_id;
  v_location_city_id uuid;
  v_rule_id uuid;
begin
  if p_vehicle_category_id is null or p_trip_type is null or p_package_tier is null or p_at is null then
    return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid; return;
  end if;

  if p_origin_location_id is not null then
    select l.city_id into v_location_city_id from public.locations l
    where l.id = p_origin_location_id and l.is_active;
    if not found or (v_origin_city_id is not null and v_origin_city_id <> v_location_city_id) then
      return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid; return;
    end if;
    v_origin_city_id := v_location_city_id;
  end if;

  if p_destination_location_id is not null then
    select l.city_id into v_location_city_id from public.locations l
    where l.id = p_destination_location_id and l.is_active;
    if not found or (v_destination_city_id is not null and v_destination_city_id <> v_location_city_id) then
      return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid; return;
    end if;
    v_destination_city_id := v_location_city_id;
  end if;

  if v_origin_city_id is null then
    return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid; return;
  end if;

  if not exists (select 1 from public.vehicle_categories c where c.id = p_vehicle_category_id and c.is_active)
    or not exists (select 1 from public.cities c where c.id = v_origin_city_id and c.is_active)
    or (v_destination_city_id is not null and not exists (
      select 1 from public.cities c where c.id = v_destination_city_id and c.is_active
    )) then
    return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid; return;
  end if;

  select r.id into v_rule_id from public.pricing_rules r
  where r.approval_status = 'approved'
    and r.is_active
    and r.vehicle_category_id = p_vehicle_category_id
    and r.trip_type = p_trip_type
    and r.package_tier = p_package_tier
    and r.effective_from <= p_at
    and (r.effective_until is null or p_at < r.effective_until)
    and (
      (p_origin_location_id is not null and p_destination_location_id is not null
        and r.origin_location_id = p_origin_location_id
        and r.destination_location_id = p_destination_location_id)
      or (p_origin_location_id is not null and v_destination_city_id is not null
        and r.origin_location_id = p_origin_location_id
        and r.destination_location_id is null and r.destination_city_id = v_destination_city_id)
      or (r.origin_location_id is null and r.origin_city_id = v_origin_city_id
        and r.destination_location_id is null and r.destination_city_id = v_destination_city_id
        and v_destination_city_id is not null)
      or (r.origin_location_id is null and r.origin_city_id = v_origin_city_id
        and r.destination_location_id is null and r.destination_city_id is null
        and p_trip_type in ('local', 'airport_transfer')
        and (v_destination_city_id is null or v_destination_city_id = v_origin_city_id))
    )
  order by
    case
      when r.origin_location_id is not null and r.destination_location_id is not null then 1
      when r.origin_location_id is not null and r.destination_city_id is not null then 2
      when r.origin_city_id = v_origin_city_id and r.destination_city_id is not null then 3
      else 4
    end,
    r.effective_from desc, r.created_at desc, r.id
  limit 1;

  if v_rule_id is null then
    return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid;
  else
    return query select 'AVAILABLE'::text, v_rule_id;
  end if;
end
$$;

revoke all on function public.resolve_pricing_rule(
  uuid, public.trip_type, public.package_tier, uuid, uuid, uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.resolve_pricing_rule(
  uuid, public.trip_type, public.package_tier, uuid, uuid, uuid, uuid, timestamptz
) to service_role;
