-- Mumbai booking vehicle catalog. All vehicle specs in this migration are
-- sourced from the co-founder-approved Mumbai vehicle catalog; no prices are
-- created here. Price-on-request classifications cannot enter online checkout.

alter table public.vehicle_categories
  add column if not exists models text[] not null default '{}';

comment on column public.vehicle_categories.models is
  'Verified vehicle models represented by this customer-facing category.';

do $$
declare
  v_mumbai_city_id uuid;
  v_mumbai_count integer;
  v_existing_count integer;
begin
  select count(*), (array_agg(c.id))[1]
    into v_mumbai_count, v_mumbai_city_id
  from public.cities c
  join public.countries country on country.id = c.country_id
  where c.slug = 'mumbai'
    and country.iso2 = 'IN'
    and c.is_active
    and country.is_active;

  if v_mumbai_count <> 1 then
    raise exception 'Expected exactly one active Mumbai city in India; found %', v_mumbai_count;
  end if;

  select count(*) into v_existing_count
  from public.vehicle_categories
  where code in ('SEDAN', 'SUV', 'SUV_PREMIUM');

  if v_existing_count <> 3 then
    raise exception 'Expected the three existing Mumbai fixed categories; found %', v_existing_count;
  end if;

  -- These shared catalog rows are updated with Mumbai-approved specs only if
  -- they are not currently attached to any other city.
  if exists (
    select 1
    from public.city_vehicle_categories city_category
    join public.vehicle_categories category
      on category.id = city_category.vehicle_category_id
    where category.code in (
      'SEDAN', 'SUV', 'SUV_PREMIUM',
      'MUMBAI_HYCROSS_INVICTO', 'MUMBAI_EXCLUSIVE_SUV',
      'MUMBAI_PREMIUM_SEDAN', 'MUMBAI_LUXURY_SEDAN',
      'MUMBAI_LUXURY_VAN', 'MUMBAI_GROUP_COACH'
    )
      and city_category.city_id <> v_mumbai_city_id
  ) then
    raise exception 'A Mumbai vehicle category is already assigned to another city; refusing cross-city catalog changes';
  end if;

  update public.vehicle_categories category
  set name = spec.name,
      passenger_capacity = spec.passenger_capacity,
      luggage_capacity = spec.luggage_capacity,
      models = spec.models,
      pricing_type = 'fixed',
      display_order = spec.display_order,
      is_active = true,
      updated_at = now()
  from (values
    ('SEDAN', 'Sedan', 4::smallint, 2::smallint,
      array['Maruti Dzire', 'Alma']::text[], 1),
    ('SUV', 'SUV', 6::smallint, 4::smallint,
      array['Maruti Ertiga', 'Toyota Rumion', 'Kia Carens', 'Honda City', 'Maruti Ciaz']::text[], 2),
    ('SUV_PREMIUM', 'Premium SUV', 7::smallint, 4::smallint,
      array['Toyota Innova Crysta']::text[], 3)
  ) as spec(code, name, passenger_capacity, luggage_capacity, models, display_order)
  where category.code = spec.code;

  insert into public.vehicle_categories (
    code, name, passenger_capacity, luggage_capacity, models,
    pricing_type, display_order, is_active
  ) values
    (
      'MUMBAI_HYCROSS_INVICTO',
      'Innova Hycross / Maruti Suzuki Invicto',
      7, 4,
      array['Toyota Innova Hycross', 'Maruti Suzuki Invicto'],
      'price_on_request', 4, true
    ),
    (
      'MUMBAI_EXCLUSIVE_SUV',
      'Exclusive SUV',
      7, 4,
      array['Toyota Fortuner', 'Kia Carnival'],
      'price_on_request', 5, true
    ),
    (
      'MUMBAI_PREMIUM_SEDAN',
      'Premium Sedan',
      4, 3,
      array['Toyota Camry'],
      'price_on_request', 6, true
    ),
    (
      'MUMBAI_LUXURY_SEDAN',
      'Luxury Sedan',
      4, 3,
      array['BMW 5 Series', 'Audi A6', 'Mercedes E-Class', 'Mercedes S-Class', 'BMW 7 Series'],
      'price_on_request', 7, true
    ),
    (
      'MUMBAI_LUXURY_VAN',
      'Luxury Van',
      7, 6,
      array['Mercedes GLE 350', 'Toyota Vellfire', 'Mercedes V-Class'],
      'price_on_request', 8, true
    ),
    (
      'MUMBAI_GROUP_COACH',
      'Group / Coach',
      45, 45,
      array['Urbania 9 Seater', 'Urbania 16 Seater', '35 Seater BharatBenz', '45 Seater BharatBenz', '45 Seater Volvo'],
      'price_on_request', 9, true
    )
  on conflict (code) do update
    set name = excluded.name,
        passenger_capacity = excluded.passenger_capacity,
        luggage_capacity = excluded.luggage_capacity,
        models = excluded.models,
        pricing_type = excluded.pricing_type,
        display_order = excluded.display_order,
        is_active = excluded.is_active,
        updated_at = now();

  insert into public.city_vehicle_categories (
    city_id, vehicle_category_id, is_available
  )
  select v_mumbai_city_id, category.id, true
  from public.vehicle_categories category
  where category.code in (
    'SEDAN', 'SUV', 'SUV_PREMIUM',
    'MUMBAI_HYCROSS_INVICTO', 'MUMBAI_EXCLUSIVE_SUV',
    'MUMBAI_PREMIUM_SEDAN', 'MUMBAI_LUXURY_SEDAN',
    'MUMBAI_LUXURY_VAN', 'MUMBAI_GROUP_COACH'
  )
  on conflict (city_id, vehicle_category_id) do update
    set is_available = true,
        updated_at = now();

  select count(*) into v_existing_count
  from public.city_vehicle_categories city_category
  join public.vehicle_categories category
    on category.id = city_category.vehicle_category_id
  where city_category.city_id = v_mumbai_city_id
    and city_category.is_available
    and category.is_active
    and category.code in (
      'SEDAN', 'SUV', 'SUV_PREMIUM',
      'MUMBAI_HYCROSS_INVICTO', 'MUMBAI_EXCLUSIVE_SUV',
      'MUMBAI_PREMIUM_SEDAN', 'MUMBAI_LUXURY_SEDAN',
      'MUMBAI_LUXURY_VAN', 'MUMBAI_GROUP_COACH'
    );

  if v_existing_count <> 9 then
    raise exception 'Expected 9 active Mumbai vehicle categories after catalog update; found %', v_existing_count;
  end if;
end
$$;
