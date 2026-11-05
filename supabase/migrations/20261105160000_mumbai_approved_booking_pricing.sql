-- Approved Mumbai-only fixed pricing from the co-founder supplied rate card.
-- This migration must run after 20261105140000 and 20261105150000.
-- Route metrics passed to the RPC are produced by the server, never the browser.

do $$
declare
  v_mumbai_city_id uuid;
  v_city_count integer;
  v_category_count integer;
begin
  select count(*), (array_agg(c.id))[1]
    into v_city_count, v_mumbai_city_id
  from public.cities c
  join public.countries co on co.id = c.country_id
  where c.slug = 'mumbai' and co.iso2 = 'IN' and c.is_active and co.is_active;

  if v_city_count <> 1 then
    raise exception 'Expected one active Mumbai city in India, found %', v_city_count;
  end if;

  select count(*) into v_category_count
  from public.vehicle_categories
  where (code = 'SEDAN' and pricing_type = 'fixed')
     or (code = 'SUV' and pricing_type = 'fixed')
     or (code = 'SUV_PREMIUM' and pricing_type = 'fixed');
  if v_category_count <> 3 then
    raise exception 'Expected the three fixed Mumbai vehicle categories; found %', v_category_count;
  end if;

  if exists (
    select 1
    from public.city_vehicle_categories cv
    join public.vehicle_categories c on c.id = cv.vehicle_category_id
    where c.code in ('SEDAN', 'SUV', 'SUV_PREMIUM')
      and cv.city_id <> v_mumbai_city_id
  ) then
    raise exception 'A Mumbai fixed-price category is assigned to another city; refusing cross-city changes';
  end if;

  if exists (
    select 1 from public.pricing_rules
    where internal_notes = 'DC Cabs approved Mumbai rate card 2026-11-05'
  ) then
    raise exception 'Mumbai approved rate-card marker already exists; inspect before applying this migration';
  end if;

  -- Restrict fixed-rate model labels to the supplied rate-card groups.
  update public.vehicle_categories
  set models = array['Maruti Dzire']::text[], updated_at = now()
  where code = 'SEDAN';

  -- Toyota Rumion is not part of the supplied Ertiga rate group.
  update public.vehicle_categories
  set models = array_remove(models, 'Toyota Rumion'), updated_at = now()
  where code = 'SUV';

  insert into public.pricing_rules (
    vehicle_category_id, trip_type, package_tier, origin_city_id,
    destination_city_id, base_fare, included_hours, included_km,
    minimum_daily_km, extra_km_rate, extra_hour_rate,
    driver_allowance_per_day, night_surcharge, airport_charge, tolls_charge,
    tax_rate_percent, currency_code, effective_from, effective_until,
    is_active, approval_status, internal_notes
  )
  select c.id, rates.trip_type::public.trip_type, rates.package_tier::public.package_tier,
    v_mumbai_city_id, null, rates.base_fare, rates.included_hours, rates.included_km,
    rates.minimum_daily_km, rates.extra_km_rate, rates.extra_hour_rate,
    rates.driver_allowance_per_day, 0, 0, 0,
    5, 'INR', transaction_timestamp(), null, true, 'approved',
    'DC Cabs approved Mumbai rate card 2026-11-05'
  from (values
    ('SEDAN', 'local', '4hr_40km', 1449::numeric, 4::numeric, 40::numeric, null::numeric, 15::numeric, 150::numeric, 0::numeric),
    ('SEDAN', 'local', '8hr_80km', 2499::numeric, 8::numeric, 80::numeric, null::numeric, 15::numeric, 150::numeric, 0::numeric),
    ('SUV', 'local', '4hr_40km', 2199::numeric, 4::numeric, 40::numeric, null::numeric, 17::numeric, 175::numeric, 0::numeric),
    ('SUV', 'local', '8hr_80km', 3249::numeric, 8::numeric, 80::numeric, null::numeric, 17::numeric, 175::numeric, 0::numeric),
    ('SUV_PREMIUM', 'local', '4hr_40km', 2599::numeric, 4::numeric, 40::numeric, null::numeric, 21::numeric, 210::numeric, 0::numeric),
    ('SUV_PREMIUM', 'local', '8hr_80km', 3499::numeric, 8::numeric, 80::numeric, null::numeric, 21::numeric, 210::numeric, 0::numeric),
    ('SEDAN', 'airport_transfer', 'airport_transfer', 1199::numeric, 2::numeric, 30::numeric, null::numeric, 15::numeric, 150::numeric, 0::numeric),
    ('SEDAN', 'outstation', 'outstation', 0::numeric, null::numeric, null::numeric, 300::numeric, 15::numeric, 0::numeric, 450::numeric)
  ) as rates(code, trip_type, package_tier, base_fare, included_hours, included_km,
      minimum_daily_km, extra_km_rate, extra_hour_rate, driver_allowance_per_day)
  join public.vehicle_categories c on c.code = rates.code and c.is_active;

  get diagnostics v_category_count = row_count;
  if v_category_count <> 8 then
    raise exception 'Expected to create eight approved Mumbai pricing rules, created %', v_category_count;
  end if;
end
$$;

alter table public.quotes drop constraint if exists quotes_route_metric_check;
alter table public.quotes add constraint quotes_route_metric_check
  check ((route_distance_km is null or route_distance_km >= 0)
    and (route_estimated_duration_hours is null or route_estimated_duration_hours >= 0)
    and (route_metric_source is null or route_metric_source in (
      'server_geocode_osrm', 'server_geocode_osrm_traffic_heuristic'
    )));
alter table public.bookings drop constraint if exists bookings_route_metric_check;
alter table public.bookings add constraint bookings_route_metric_check
  check ((route_distance_km is null or route_distance_km >= 0)
    and (route_estimated_duration_hours is null or route_estimated_duration_hours >= 0)
    and (route_metric_source is null or route_metric_source in (
      'server_geocode_osrm', 'server_geocode_osrm_traffic_heuristic'
    )));

-- The Mumbai outstation rate is keyed by origin city and applies to eligible
-- outbound destinations; it always uses the one-way server route distance.
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
  ) or not exists (
    select 1 from public.cities c where c.id = v_origin_city_id and c.is_active
  ) or (v_destination_city_id is not null and not exists (
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
      or (r.origin_location_id is null and r.origin_city_id = v_origin_city_id
        and r.destination_location_id is null and r.destination_city_id is null
        and p_trip_type = 'outstation')
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

create or replace function public.create_booking_quote_from_addresses(
  p_trip_type public.trip_type,
  p_package_tier public.package_tier,
  p_origin_city_id uuid,
  p_origin_location_id uuid,
  p_origin_address text,
  p_destination_city_id uuid,
  p_destination_location_id uuid,
  p_destination_address text,
  p_pickup_at timestamptz,
  p_vehicle_category_id uuid,
  p_passenger_count smallint,
  p_trip_days smallint,
  p_route_distance_km numeric,
  p_route_estimated_duration_hours numeric
)
returns table (result_status text, quote_id uuid, pricing jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_origin_city_id uuid := p_origin_city_id;
  v_destination_city_id uuid := p_destination_city_id;
  v_mumbai_city_id uuid;
  v_origin_address text := nullif(trim(p_origin_address), '');
  v_destination_address text := nullif(trim(p_destination_address), '');
  v_origin_kind public.location_kind;
  v_destination_kind public.location_kind;
  v_effective_tier public.package_tier := p_package_tier;
  v_rule_id uuid;
  v_rule public.pricing_rules%rowtype;
  v_resolution text;
  v_new_quote_id uuid;
  v_billable_distance numeric(9,2);
  v_distance_fare numeric(12,2) := 0;
  v_extra_km numeric(12,2) := 0;
  v_extra_hour numeric(12,2) := 0;
  v_driver_allowance numeric(12,2) := 0;
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_breakdown jsonb;
begin
  if p_trip_type is null or p_trip_type not in ('local', 'airport_transfer', 'outstation')
    or p_package_tier is null or v_origin_city_id is null or v_destination_city_id is null
    or v_origin_address is null or v_destination_address is null
    or length(v_origin_address) > 500 or length(v_destination_address) > 500
    or p_pickup_at is null or p_vehicle_category_id is null or p_passenger_count is null
    or p_trip_days is null or p_passenger_count < 1 or p_trip_days < 1
    or p_route_distance_km is null or p_route_distance_km < 0
    or p_route_estimated_duration_hours is null or p_route_estimated_duration_hours < 0 then
    return query select 'INVALID_REQUEST'::text, null::uuid, null::jsonb; return;
  end if;
  if p_pickup_at <= clock_timestamp() then
    return query select 'INVALID_REQUEST'::text, null::uuid, null::jsonb; return;
  end if;

  select c.id into v_mumbai_city_id
  from public.cities c
  join public.countries co on co.id = c.country_id and co.is_active
  where c.slug = 'mumbai' and co.iso2 = 'IN' and c.is_active;
  if not found then return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid, null::jsonb; return; end if;

  if not exists (
    select 1 from public.cities c join public.countries co on co.id = c.country_id and co.is_active
    where c.id = v_origin_city_id and c.is_active and co.iso2 = 'IN'
  ) or not exists (
    select 1 from public.cities c join public.countries co on co.id = c.country_id and co.is_active
    where c.id = v_destination_city_id and c.is_active and co.iso2 = 'IN'
  ) then
    return query select 'INVALID_LOCATION'::text, null::uuid, null::jsonb; return;
  end if;
  if v_origin_city_id <> v_mumbai_city_id then
    return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid, null::jsonb; return;
  end if;
  if p_trip_type in ('local', 'airport_transfer') and v_destination_city_id <> v_origin_city_id then
    return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid, null::jsonb; return;
  end if;

  if p_origin_location_id is not null then
    select l.kind, concat_ws(', ', l.name, l.address) into v_origin_kind, v_origin_address
    from public.locations l where l.id = p_origin_location_id and l.city_id = v_origin_city_id and l.is_active;
    if not found then return query select 'INVALID_LOCATION'::text, null::uuid, null::jsonb; return; end if;
  end if;
  if p_destination_location_id is not null then
    select l.kind, concat_ws(', ', l.name, l.address) into v_destination_kind, v_destination_address
    from public.locations l where l.id = p_destination_location_id and l.city_id = v_destination_city_id and l.is_active;
    if not found then return query select 'INVALID_LOCATION'::text, null::uuid, null::jsonb; return; end if;
  end if;

  if not exists (
    select 1 from public.vehicle_categories c
    join public.city_vehicle_categories cv on cv.vehicle_category_id = c.id
    where c.id = p_vehicle_category_id and c.is_active and c.pricing_type = 'fixed'
      and p_passenger_count <= c.passenger_capacity and cv.city_id = v_mumbai_city_id
      and cv.is_available and (cv.valid_from is null or cv.valid_from <= p_pickup_at)
      and (cv.valid_until is null or cv.valid_until > p_pickup_at)
  ) then
    return query select 'VEHICLE_UNAVAILABLE'::text, null::uuid, null::jsonb; return;
  end if;

  if p_trip_type = 'local' then
    if p_package_tier not in ('4hr_40km', '8hr_80km') then
      return query select 'INVALID_REQUEST'::text, null::uuid, null::jsonb; return;
    end if;
    if p_package_tier = '4hr_40km'
      and (p_route_distance_km > 40 or p_route_estimated_duration_hours > 4) then
      v_effective_tier := '8hr_80km';
    end if;
  elsif p_trip_type = 'airport_transfer' and p_package_tier <> 'airport_transfer' then
    return query select 'INVALID_REQUEST'::text, null::uuid, null::jsonb; return;
  elsif p_trip_type = 'airport_transfer'
    and v_origin_kind is distinct from 'airport'::public.location_kind
    and v_destination_kind is distinct from 'airport'::public.location_kind then
    return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid, null::jsonb; return;
  elsif p_trip_type = 'outstation' and p_package_tier <> 'outstation' then
    return query select 'INVALID_REQUEST'::text, null::uuid, null::jsonb; return;
  end if;

  select r.resolution_status, r.pricing_rule_id into v_resolution, v_rule_id
  from public.resolve_pricing_rule(
    p_vehicle_category_id, p_trip_type, v_effective_tier, v_origin_city_id,
    p_origin_location_id, v_destination_city_id, p_destination_location_id, p_pickup_at
  ) r;
  if v_resolution is distinct from 'AVAILABLE' or v_rule_id is null then
    return query select 'ONLINE_PRICING_UNAVAILABLE'::text, null::uuid, null::jsonb; return;
  end if;
  select r.* into v_rule from public.pricing_rules r where r.id = v_rule_id;

  if p_trip_type = 'outstation' then
    v_billable_distance := greatest(p_route_distance_km, coalesce(v_rule.minimum_daily_km, 0) * p_trip_days);
    v_distance_fare := round(v_billable_distance * v_rule.extra_km_rate, 2);
    v_driver_allowance := round(v_rule.driver_allowance_per_day * p_trip_days, 2);
  else
    v_billable_distance := p_route_distance_km;
    v_extra_km := round(greatest(0, v_billable_distance - coalesce(v_rule.included_km, 0)) * v_rule.extra_km_rate, 2);
    v_extra_hour := round(greatest(0, p_route_estimated_duration_hours - coalesce(v_rule.included_hours, 0)) * v_rule.extra_hour_rate, 2);
  end if;

  v_subtotal := round(coalesce(v_rule.base_fare, 0) + v_distance_fare + v_extra_km + v_extra_hour + v_driver_allowance, 2);
  v_tax := round(v_subtotal * 5 / 100, 2);
  v_total := v_subtotal + v_tax;
  v_breakdown := jsonb_build_object(
    'currency', v_rule.currency_code,
    'pricingRuleId', v_rule.id,
    'effectivePackageTier', v_effective_tier,
    'allowances', jsonb_build_object(
      'includedKm', v_rule.included_km,
      'includedHours', v_rule.included_hours,
      'minimumDailyKm', v_rule.minimum_daily_km
    ),
    'components', jsonb_build_object(
      'baseFare', case when p_trip_type = 'outstation' then null else v_rule.base_fare end,
      'distanceFare', v_distance_fare,
      'extraDistance', v_extra_km,
      'extraDuration', v_extra_hour,
      'driverAllowance', v_driver_allowance,
      'subtotal', v_subtotal,
      'taxRatePercent', 5,
      'tax', v_tax,
      'total', v_total
    ),
    'inputs', jsonb_build_object(
      'distanceKm', p_route_distance_km,
      'billableDistanceKm', v_billable_distance,
      'durationHours', p_route_estimated_duration_hours,
      'tripDays', p_trip_days
    ),
    'route', jsonb_build_object(
      'distanceKm', p_route_distance_km,
      'estimatedDurationHours', p_route_estimated_duration_hours,
      'distanceProvenance', 'server_geocode_osrm',
      'durationProvenance', 'server_geocode_osrm_traffic_heuristic',
      'durationPurpose', case when p_trip_type = 'outstation'
        then 'display_estimate_only' else 'server_route_eta_extra_hour_basis' end
    )
  );

  insert into public.quotes (
    vehicle_category_id, trip_type, package_tier, origin_city_id, origin_location_id,
    destination_city_id, destination_location_id, origin_address, destination_address,
    route_distance_km, route_estimated_duration_hours, route_metric_source,
    pickup_at, trip_days, passenger_count, pricing_rule_id, currency_code, subtotal,
    tax_amount, total_amount, pricing_snapshot
  ) values (
    p_vehicle_category_id, p_trip_type, v_effective_tier, v_origin_city_id, p_origin_location_id,
    v_destination_city_id, p_destination_location_id, v_origin_address, v_destination_address,
    p_route_distance_km, p_route_estimated_duration_hours, 'server_geocode_osrm_traffic_heuristic',
    p_pickup_at, p_trip_days, p_passenger_count, v_rule_id, v_rule.currency_code, v_subtotal,
    v_tax, v_total, v_breakdown
  ) returning id into v_new_quote_id;

  return query select 'CREATED'::text, v_new_quote_id, v_breakdown;
end
$$;

revoke all on function public.create_booking_quote_from_addresses(
  public.trip_type, public.package_tier, uuid, uuid, text, uuid, uuid, text,
  timestamptz, uuid, smallint, smallint, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.create_booking_quote_from_addresses(
  public.trip_type, public.package_tier, uuid, uuid, text, uuid, uuid, text,
  timestamptz, uuid, smallint, smallint, numeric, numeric
) to service_role;
