-- Pricing classification is explicit catalog data. Existing categories remain
-- unclassified until an authorized data change verifies their commercial type.
alter table public.vehicle_categories
  add column if not exists pricing_type text not null default 'unclassified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vehicle_categories'::regclass
      and conname = 'vehicle_categories_pricing_type_check'
  ) then
    alter table public.vehicle_categories
      add constraint vehicle_categories_pricing_type_check
      check (pricing_type in ('fixed', 'price_on_request', 'unclassified'));
  end if;
end
$$;

comment on column public.vehicle_categories.pricing_type is
  'Authoritative customer pricing classification. Unclassified categories cannot be quoted or checked out.';

-- Keep the existing approval/effective-date resolution rules and additionally
-- require an explicit fixed-price catalog classification.
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

  if not exists (
      select 1 from public.vehicle_categories c
      where c.id = p_vehicle_category_id and c.is_active and c.pricing_type = 'fixed'
    )
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

-- A quote created while a category was fixed-price cannot be converted into a
-- booking after the catalog category is reclassified or deactivated.
create or replace function public.claim_quote_for_checkout(p_quote_id uuid)
returns table (claim_status text, quote_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.quotes%rowtype;
  v_now timestamptz;
begin
  select q.* into v_quote from public.quotes q where q.id = p_quote_id for update;
  if not found then return query select 'NOT_FOUND'::text, p_quote_id; return; end if;

  if not exists (
    select 1 from public.vehicle_categories c
    where c.id = v_quote.vehicle_category_id and c.is_active and c.pricing_type = 'fixed'
  ) then
    return query select 'NOT_BOOKABLE'::text, p_quote_id; return;
  end if;

  -- Take the timestamp after acquiring the row lock so a concurrent waiter
  -- cannot use a pre-expiry timestamp after the quote expires while waiting.
  v_now := clock_timestamp();
  if v_quote.status = 'open' and v_quote.expires_at <= v_now then
    update public.quotes q set status = 'expired' where q.id = p_quote_id and q.status = 'open';
    return query select 'EXPIRED'::text, p_quote_id; return;
  end if;

  if v_quote.status <> 'open' then
    if v_quote.status = 'expired' then
      return query select 'EXPIRED'::text, p_quote_id;
    else
      return query select 'ALREADY_CLAIMED'::text, p_quote_id;
    end if;
    return;
  end if;

  update public.quotes q set status = 'claimed', claimed_at = v_now
  where q.id = p_quote_id and q.status = 'open' and q.expires_at > v_now;
  if found then return query select 'CLAIMED'::text, p_quote_id;
  else return query select 'EXPIRED'::text, p_quote_id; end if;
end
$$;

revoke all on function public.claim_quote_for_checkout(uuid) from public, anon, authenticated;
grant execute on function public.claim_quote_for_checkout(uuid) to service_role;
