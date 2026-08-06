const DEFAULT_CATEGORY_BENCHMARKS = [
  {
    category: 'Home Care',
    traditionalOpsKgPerHour: 1.7,
    ecoOpsKgPerHour: 1.0,
    traditionalMaterialKg: 1.2,
    ecoMaterialKg: 0.55,
    baseTripKm: 15,
    ecoTripFactor: 0.68,
    traditionalPriceMultiplier: 1.21,
    traditionalEtaBufferMin: 22,
    demandEtaFactor: 0.18,
    demandTripFactor: 0.2
  },
  {
    category: 'Repairs',
    traditionalOpsKgPerHour: 1.2,
    ecoOpsKgPerHour: 0.8,
    traditionalMaterialKg: 0.9,
    ecoMaterialKg: 0.45,
    baseTripKm: 13,
    ecoTripFactor: 0.72,
    traditionalPriceMultiplier: 1.19,
    traditionalEtaBufferMin: 18,
    demandEtaFactor: 0.16,
    demandTripFactor: 0.18
  },
  {
    category: 'Auto Care',
    traditionalOpsKgPerHour: 1.5,
    ecoOpsKgPerHour: 0.92,
    traditionalMaterialKg: 1.0,
    ecoMaterialKg: 0.5,
    baseTripKm: 12,
    ecoTripFactor: 0.7,
    traditionalPriceMultiplier: 1.18,
    traditionalEtaBufferMin: 16,
    demandEtaFactor: 0.14,
    demandTripFactor: 0.16
  },
  {
    category: 'Lifestyle',
    traditionalOpsKgPerHour: 1.1,
    ecoOpsKgPerHour: 0.72,
    traditionalMaterialKg: 0.65,
    ecoMaterialKg: 0.3,
    baseTripKm: 10,
    ecoTripFactor: 0.73,
    traditionalPriceMultiplier: 1.16,
    traditionalEtaBufferMin: 14,
    demandEtaFactor: 0.12,
    demandTripFactor: 0.14
  },
  {
    category: 'Outdoor',
    traditionalOpsKgPerHour: 1.8,
    ecoOpsKgPerHour: 1.12,
    traditionalMaterialKg: 1.4,
    ecoMaterialKg: 0.7,
    baseTripKm: 18,
    ecoTripFactor: 0.71,
    traditionalPriceMultiplier: 1.23,
    traditionalEtaBufferMin: 24,
    demandEtaFactor: 0.2,
    demandTripFactor: 0.22
  },
  {
    category: 'Errands',
    traditionalOpsKgPerHour: 0.95,
    ecoOpsKgPerHour: 0.56,
    traditionalMaterialKg: 0.32,
    ecoMaterialKg: 0.1,
    baseTripKm: 9,
    ecoTripFactor: 0.6,
    traditionalPriceMultiplier: 1.14,
    traditionalEtaBufferMin: 12,
    demandEtaFactor: 0.1,
    demandTripFactor: 0.12
  }
];

const DEFAULT_PROVIDER_EVIDENCE = [
  {
    provider: 'GreenNest Pros',
    vehicleType: 'electric_van',
    renewableEnergyPct: 72,
    wasteDiversionPct: 80,
    materialReusePct: 68,
    routeEfficiencyPct: 74,
    onTimeRatePct: 93,
    completionRatePct: 96,
    responseTimeMin: 14,
    verifiedLevel: 2
  },
  {
    provider: 'FixLoop Collective',
    vehicleType: 'hybrid',
    renewableEnergyPct: 46,
    wasteDiversionPct: 71,
    materialReusePct: 84,
    routeEfficiencyPct: 70,
    onTimeRatePct: 90,
    completionRatePct: 94,
    responseTimeMin: 18,
    verifiedLevel: 2
  },
  {
    provider: 'SparkleGrid',
    vehicleType: 'electric_van',
    renewableEnergyPct: 69,
    wasteDiversionPct: 74,
    materialReusePct: 58,
    routeEfficiencyPct: 77,
    onTimeRatePct: 92,
    completionRatePct: 95,
    responseTimeMin: 13,
    verifiedLevel: 2
  },
  {
    provider: 'ThreadForward',
    vehicleType: 'e_bike',
    renewableEnergyPct: 81,
    wasteDiversionPct: 86,
    materialReusePct: 88,
    routeEfficiencyPct: 82,
    onTimeRatePct: 94,
    completionRatePct: 97,
    responseTimeMin: 11,
    verifiedLevel: 3
  },
  {
    provider: 'RootRush Studio',
    vehicleType: 'hybrid',
    renewableEnergyPct: 58,
    wasteDiversionPct: 77,
    materialReusePct: 72,
    routeEfficiencyPct: 73,
    onTimeRatePct: 89,
    completionRatePct: 93,
    responseTimeMin: 17,
    verifiedLevel: 2
  },
  {
    provider: 'PedalCart',
    vehicleType: 'bike',
    renewableEnergyPct: 95,
    wasteDiversionPct: 83,
    materialReusePct: 62,
    routeEfficiencyPct: 88,
    onTimeRatePct: 96,
    completionRatePct: 98,
    responseTimeMin: 10,
    verifiedLevel: 3
  },
  {
    provider: 'FlowWise Team',
    vehicleType: 'hybrid',
    renewableEnergyPct: 42,
    wasteDiversionPct: 69,
    materialReusePct: 66,
    routeEfficiencyPct: 68,
    onTimeRatePct: 87,
    completionRatePct: 91,
    responseTimeMin: 19,
    verifiedLevel: 1
  },
  {
    provider: 'Harvest Circle',
    vehicleType: 'hybrid',
    renewableEnergyPct: 55,
    wasteDiversionPct: 75,
    materialReusePct: 57,
    routeEfficiencyPct: 72,
    onTimeRatePct: 90,
    completionRatePct: 93,
    responseTimeMin: 16,
    verifiedLevel: 2
  },
  {
    provider: 'Volt Wheels',
    vehicleType: 'e_bike',
    renewableEnergyPct: 74,
    wasteDiversionPct: 72,
    materialReusePct: 64,
    routeEfficiencyPct: 79,
    onTimeRatePct: 92,
    completionRatePct: 94,
    responseTimeMin: 12,
    verifiedLevel: 2
  },
  {
    provider: 'ShiftCycle',
    vehicleType: 'hybrid',
    renewableEnergyPct: 49,
    wasteDiversionPct: 78,
    materialReusePct: 81,
    routeEfficiencyPct: 75,
    onTimeRatePct: 88,
    completionRatePct: 92,
    responseTimeMin: 20,
    verifiedLevel: 2
  },
  {
    provider: 'LeafLab',
    vehicleType: 'e_bike',
    renewableEnergyPct: 80,
    wasteDiversionPct: 82,
    materialReusePct: 59,
    routeEfficiencyPct: 81,
    onTimeRatePct: 94,
    completionRatePct: 96,
    responseTimeMin: 11,
    verifiedLevel: 3
  },
  {
    provider: 'BuildBack',
    vehicleType: 'hybrid',
    renewableEnergyPct: 47,
    wasteDiversionPct: 70,
    materialReusePct: 86,
    routeEfficiencyPct: 69,
    onTimeRatePct: 89,
    completionRatePct: 92,
    responseTimeMin: 17,
    verifiedLevel: 2
  },
  {
    provider: 'SunFleet',
    vehicleType: 'electric_van',
    renewableEnergyPct: 78,
    wasteDiversionPct: 79,
    materialReusePct: 63,
    routeEfficiencyPct: 76,
    onTimeRatePct: 93,
    completionRatePct: 95,
    responseTimeMin: 13,
    verifiedLevel: 2
  },
  {
    provider: 'AfterGlow Crew',
    vehicleType: 'hybrid',
    renewableEnergyPct: 45,
    wasteDiversionPct: 85,
    materialReusePct: 67,
    routeEfficiencyPct: 74,
    onTimeRatePct: 87,
    completionRatePct: 91,
    responseTimeMin: 18,
    verifiedLevel: 2
  },
  {
    provider: 'ChargeCheck',
    vehicleType: 'e_bike',
    renewableEnergyPct: 70,
    wasteDiversionPct: 73,
    materialReusePct: 75,
    routeEfficiencyPct: 80,
    onTimeRatePct: 91,
    completionRatePct: 94,
    responseTimeMin: 12,
    verifiedLevel: 2
  },
  {
    provider: 'RefillGo',
    vehicleType: 'bike',
    renewableEnergyPct: 92,
    wasteDiversionPct: 84,
    materialReusePct: 69,
    routeEfficiencyPct: 89,
    onTimeRatePct: 95,
    completionRatePct: 97,
    responseTimeMin: 9,
    verifiedLevel: 3
  },
  {
    provider: 'PawPure',
    vehicleType: 'hybrid',
    renewableEnergyPct: 41,
    wasteDiversionPct: 68,
    materialReusePct: 53,
    routeEfficiencyPct: 67,
    onTimeRatePct: 86,
    completionRatePct: 90,
    responseTimeMin: 21,
    verifiedLevel: 1
  },
  {
    provider: 'SoilCycle',
    vehicleType: 'bike',
    renewableEnergyPct: 97,
    wasteDiversionPct: 88,
    materialReusePct: 71,
    routeEfficiencyPct: 91,
    onTimeRatePct: 96,
    completionRatePct: 98,
    responseTimeMin: 9,
    verifiedLevel: 3
  },
  {
    provider: 'BlueLoop Engineers',
    vehicleType: 'hybrid',
    renewableEnergyPct: 52,
    wasteDiversionPct: 76,
    materialReusePct: 65,
    routeEfficiencyPct: 73,
    onTimeRatePct: 88,
    completionRatePct: 92,
    responseTimeMin: 17,
    verifiedLevel: 2
  },
  {
    provider: 'RetroSmart Collective',
    vehicleType: 'hybrid',
    renewableEnergyPct: 54,
    wasteDiversionPct: 81,
    materialReusePct: 78,
    routeEfficiencyPct: 75,
    onTimeRatePct: 90,
    completionRatePct: 93,
    responseTimeMin: 16,
    verifiedLevel: 2
  }
];

function mapCamelCategory(row) {
  return {
    category: row.category,
    traditionalOpsKgPerHour: Number(row.traditional_ops_kg_per_hour),
    ecoOpsKgPerHour: Number(row.eco_ops_kg_per_hour),
    traditionalMaterialKg: Number(row.traditional_material_kg),
    ecoMaterialKg: Number(row.eco_material_kg),
    baseTripKm: Number(row.base_trip_km),
    ecoTripFactor: Number(row.eco_trip_factor),
    traditionalPriceMultiplier: Number(row.traditional_price_multiplier),
    traditionalEtaBufferMin: Number(row.traditional_eta_buffer_min),
    demandEtaFactor: Number(row.demand_eta_factor),
    demandTripFactor: Number(row.demand_trip_factor),
    source: row.source || 'supabase',
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

function mapCamelProvider(row) {
  return {
    provider: row.provider,
    vehicleType: row.vehicle_type,
    renewableEnergyPct: Number(row.renewable_energy_pct),
    wasteDiversionPct: Number(row.waste_diversion_pct),
    materialReusePct: Number(row.material_reuse_pct),
    routeEfficiencyPct: Number(row.route_efficiency_pct),
    onTimeRatePct: Number(row.on_time_rate_pct),
    completionRatePct: Number(row.completion_rate_pct),
    responseTimeMin: Number(row.response_time_min),
    verifiedLevel: Number(row.verified_level || 1),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

async function fetchSupabaseRows(table, select = '*') {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`Supabase request failed: ${res.status}`);
    }
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } finally {
    clearTimeout(timeout);
  }
}

function ensureProviderCoverage(providerNames, current) {
  const byProvider = new Map(current.map((item) => [item.provider, item]));
  providerNames.forEach((provider) => {
    if (byProvider.has(provider)) {
      return;
    }
    const fallback = DEFAULT_PROVIDER_EVIDENCE.find((item) => item.provider === provider) || {
      provider,
      vehicleType: 'hybrid',
      renewableEnergyPct: 50,
      wasteDiversionPct: 60,
      materialReusePct: 55,
      routeEfficiencyPct: 65,
      onTimeRatePct: 88,
      completionRatePct: 92,
      responseTimeMin: 18,
      verifiedLevel: 1
    };
    byProvider.set(provider, fallback);
  });
  return [...byProvider.values()];
}

async function loadCalibrationData(providerNames = []) {
  const hasExternal = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  let source = 'local-fallback';
  let benchmarks = DEFAULT_CATEGORY_BENCHMARKS;
  let providerEvidence = ensureProviderCoverage(providerNames, DEFAULT_PROVIDER_EVIDENCE);
  let warning = '';

  if (hasExternal) {
    try {
      const [benchRows, providerRows] = await Promise.all([
        fetchSupabaseRows('service_benchmarks'),
        fetchSupabaseRows('provider_sustainability_evidence')
      ]);

      if (benchRows.length) {
        benchmarks = benchRows.map(mapCamelCategory);
      }
      if (providerRows.length) {
        providerEvidence = ensureProviderCoverage(providerNames, providerRows.map(mapCamelProvider));
      }
      source = 'supabase';
    } catch (error) {
      warning = error.message;
    }
  }

  return {
    source,
    benchmarks,
    providerEvidence,
    warning,
    loadedAt: new Date().toISOString()
  };
}

module.exports = {
  DEFAULT_CATEGORY_BENCHMARKS,
  DEFAULT_PROVIDER_EVIDENCE,
  loadCalibrationData
};
