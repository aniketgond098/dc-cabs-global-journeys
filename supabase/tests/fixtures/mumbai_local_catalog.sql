-- LOCAL TEST ONLY. Loaded only by scripts/run-local-mumbai-fixtures.ts.
-- This fixture contains catalog geography only; it does not invent capacities
-- or create pricing rules while verified model capacities are unavailable.
do $$
begin
  if current_setting('application_name') <> 'dc-cabs-local-mumbai-fixtures' then
    raise exception 'Refusing Mumbai fixture outside the guarded local test runner';
  end if;
end
$$;

begin;

insert into public.countries (id, iso2, iso3, name, currency_code, is_active)
values (
  'f1000000-0000-4000-8000-000000000001', 'IN', 'IND', 'India (LOCAL TEST)', 'INR', true
)
on conflict (id) do update
set iso2 = excluded.iso2,
    iso3 = excluded.iso3,
    name = excluded.name,
    currency_code = excluded.currency_code,
    is_active = excluded.is_active;

insert into public.regions (id, country_id, kind, name, is_active)
values (
  'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'state',
  'Maharashtra (LOCAL TEST)',
  true
)
on conflict (id) do update
set country_id = excluded.country_id,
    kind = excluded.kind,
    name = excluded.name,
    is_active = excluded.is_active;

insert into public.cities (id, country_id, region_id, name, slug, timezone, is_active)
values (
  'f3000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'Mumbai (LOCAL TEST)',
  'mumbai-local-test',
  'Asia/Kolkata',
  true
)
on conflict (id) do update
set country_id = excluded.country_id,
    region_id = excluded.region_id,
    name = excluded.name,
    slug = excluded.slug,
    timezone = excluded.timezone,
    is_active = excluded.is_active;

insert into public.locations (id, city_id, kind, name, address, latitude, longitude, is_active)
values
  (
    'f4000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'airport',
    'Mumbai Airport Terminal 1 (LOCAL TEST)',
    'Local test catalog location',
    null,
    null,
    true
  ),
  (
    'f4000000-0000-4000-8000-000000000002',
    'f3000000-0000-4000-8000-000000000001',
    'business_district',
    'BKC (LOCAL TEST)',
    'Local test catalog location',
    null,
    null,
    true
  )
on conflict (id) do update
set city_id = excluded.city_id,
    kind = excluded.kind,
    name = excluded.name,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    is_active = excluded.is_active;

commit;
