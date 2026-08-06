-- EcoSwipe external data foundation (run in Supabase SQL editor)

create table if not exists public.service_benchmarks (
  category text primary key,
  traditional_ops_kg_per_hour numeric not null,
  eco_ops_kg_per_hour numeric not null,
  traditional_material_kg numeric not null,
  eco_material_kg numeric not null,
  base_trip_km numeric not null,
  eco_trip_factor numeric not null,
  traditional_price_multiplier numeric not null,
  traditional_eta_buffer_min integer not null,
  demand_eta_factor numeric not null,
  demand_trip_factor numeric not null,
  source text not null default 'external_audit',
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_sustainability_evidence (
  provider text primary key,
  vehicle_type text not null,
  renewable_energy_pct numeric not null,
  waste_diversion_pct numeric not null,
  material_reuse_pct numeric not null,
  route_efficiency_pct numeric not null,
  on_time_rate_pct numeric not null,
  completion_rate_pct numeric not null,
  response_time_min numeric not null,
  verified_level integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.service_benchmarks (
  category, traditional_ops_kg_per_hour, eco_ops_kg_per_hour, traditional_material_kg, eco_material_kg,
  base_trip_km, eco_trip_factor, traditional_price_multiplier, traditional_eta_buffer_min, demand_eta_factor, demand_trip_factor, source
) values
  ('Home Care', 1.7, 1.0, 1.2, 0.55, 15, 0.68, 1.21, 22, 0.18, 0.20, 'external_audit'),
  ('Repairs', 1.2, 0.8, 0.9, 0.45, 13, 0.72, 1.19, 18, 0.16, 0.18, 'external_audit'),
  ('Auto Care', 1.5, 0.92, 1.0, 0.5, 12, 0.70, 1.18, 16, 0.14, 0.16, 'external_audit'),
  ('Lifestyle', 1.1, 0.72, 0.65, 0.3, 10, 0.73, 1.16, 14, 0.12, 0.14, 'external_audit'),
  ('Outdoor', 1.8, 1.12, 1.4, 0.7, 18, 0.71, 1.23, 24, 0.20, 0.22, 'external_audit'),
  ('Errands', 0.95, 0.56, 0.32, 0.1, 9, 0.60, 1.14, 12, 0.10, 0.12, 'external_audit')
on conflict (category) do update set
  traditional_ops_kg_per_hour = excluded.traditional_ops_kg_per_hour,
  eco_ops_kg_per_hour = excluded.eco_ops_kg_per_hour,
  traditional_material_kg = excluded.traditional_material_kg,
  eco_material_kg = excluded.eco_material_kg,
  base_trip_km = excluded.base_trip_km,
  eco_trip_factor = excluded.eco_trip_factor,
  traditional_price_multiplier = excluded.traditional_price_multiplier,
  traditional_eta_buffer_min = excluded.traditional_eta_buffer_min,
  demand_eta_factor = excluded.demand_eta_factor,
  demand_trip_factor = excluded.demand_trip_factor,
  source = excluded.source,
  updated_at = now();

insert into public.provider_sustainability_evidence (
  provider, vehicle_type, renewable_energy_pct, waste_diversion_pct, material_reuse_pct, route_efficiency_pct,
  on_time_rate_pct, completion_rate_pct, response_time_min, verified_level
) values
  ('GreenNest Pros', 'electric_van', 72, 80, 68, 74, 93, 96, 14, 2),
  ('FixLoop Collective', 'hybrid', 46, 71, 84, 70, 90, 94, 18, 2),
  ('SparkleGrid', 'electric_van', 69, 74, 58, 77, 92, 95, 13, 2),
  ('ThreadForward', 'e_bike', 81, 86, 88, 82, 94, 97, 11, 3),
  ('RootRush Studio', 'hybrid', 58, 77, 72, 73, 89, 93, 17, 2),
  ('PedalCart', 'bike', 95, 83, 62, 88, 96, 98, 10, 3),
  ('FlowWise Team', 'hybrid', 42, 69, 66, 68, 87, 91, 19, 1),
  ('Harvest Circle', 'hybrid', 55, 75, 57, 72, 90, 93, 16, 2),
  ('Volt Wheels', 'e_bike', 74, 72, 64, 79, 92, 94, 12, 2),
  ('ShiftCycle', 'hybrid', 49, 78, 81, 75, 88, 92, 20, 2),
  ('LeafLab', 'e_bike', 80, 82, 59, 81, 94, 96, 11, 3),
  ('BuildBack', 'hybrid', 47, 70, 86, 69, 89, 92, 17, 2),
  ('SunFleet', 'electric_van', 78, 79, 63, 76, 93, 95, 13, 2),
  ('AfterGlow Crew', 'hybrid', 45, 85, 67, 74, 87, 91, 18, 2),
  ('ChargeCheck', 'e_bike', 70, 73, 75, 80, 91, 94, 12, 2),
  ('RefillGo', 'bike', 92, 84, 69, 89, 95, 97, 9, 3),
  ('PawPure', 'hybrid', 41, 68, 53, 67, 86, 90, 21, 1),
  ('SoilCycle', 'bike', 97, 88, 71, 91, 96, 98, 9, 3),
  ('BlueLoop Engineers', 'hybrid', 52, 76, 65, 73, 88, 92, 17, 2),
  ('RetroSmart Collective', 'hybrid', 54, 81, 78, 75, 90, 93, 16, 2)
on conflict (provider) do update set
  vehicle_type = excluded.vehicle_type,
  renewable_energy_pct = excluded.renewable_energy_pct,
  waste_diversion_pct = excluded.waste_diversion_pct,
  material_reuse_pct = excluded.material_reuse_pct,
  route_efficiency_pct = excluded.route_efficiency_pct,
  on_time_rate_pct = excluded.on_time_rate_pct,
  completion_rate_pct = excluded.completion_rate_pct,
  response_time_min = excluded.response_time_min,
  verified_level = excluded.verified_level,
  updated_at = now();
