(function (root) {
  const scenarios = {
    monday: {
      day_of_week: 'monday',
      title: 'The Sharma family uses 340% more water than their neighbours. Fix it.',
      scenario_type: 'water_waste',
      scene_illustration: 'assets/ecofix/monday-water.svg',
      problems: [
        'Leaking tap near sink',
        'Half-load washing cycles',
        'Noon garden hose overuse',
        'No rainwater harvester',
        'Geyser always on'
      ],
      fix_options: [
        { id: 'tap_fix', name: 'Fix leaking tap', cost: 50, impact: 40, resource_type: 'water', is_root_cause: false },
        { id: 'rainwater_harvester', name: 'Install rainwater harvester', cost: 400, impact: 200, resource_type: 'water', is_root_cause: true },
        { id: 'wash_habits', name: 'Change washing habits', cost: 0, impact: 30, resource_type: 'water', is_root_cause: false },
        { id: 'full_load_washer', name: 'Fix half-load washing machine use', cost: 150, impact: 60, resource_type: 'water', is_root_cause: false },
        { id: 'drip_irrigation', name: 'Install drip irrigation', cost: 300, impact: 120, resource_type: 'water', is_root_cause: false, unlock_multiplier: 'rainwater_harvester' },
        { id: 'solar_heater', name: 'Replace geyser with solar heater', cost: 450, impact: 80, resource_type: 'carbon', is_root_cause: false, hidden_penalty: 'North-facing roof reduces efficiency by 60%', hidden_penalty_factor: 0.6 },
        { id: 'aerator_set', name: 'Add faucet aerators', cost: 120, impact: 55, resource_type: 'water', is_root_cause: false }
      ],
      optimal_combination: ['rainwater_harvester', 'tap_fix', 'wash_habits']
    },
    tuesday: {
      day_of_week: 'tuesday',
      title: 'This Chennai street generates 3x the waste of nearby streets. Fix it.',
      scenario_type: 'waste_management',
      scene_illustration: 'assets/ecofix/tuesday-waste.svg',
      problems: [
        'No segregation bins',
        'Open burning at corner',
        'No composting channel',
        'Mixed waste collection',
        'Plastic-heavy vendor packaging'
      ],
      fix_options: [
        { id: 'seg_bins', name: 'Deploy segregation bins', cost: 220, impact: 150, resource_type: 'waste', is_root_cause: true },
        { id: 'burning_stop', name: 'Stop open burning enforcement', cost: 90, impact: 70, resource_type: 'carbon', is_root_cause: false },
        { id: 'vendor_pack', name: 'Reusable vendor packaging kits', cost: 180, impact: 90, resource_type: 'waste', is_root_cause: false },
        { id: 'street_compost', name: 'Street composting hub', cost: 300, impact: 130, resource_type: 'waste', is_root_cause: false, unlock_multiplier: 'seg_bins' },
        { id: 'pickup_contract', name: 'Daily segregated pickup contract', cost: 260, impact: 110, resource_type: 'waste', is_root_cause: false },
        { id: 'awareness', name: 'Resident awareness drive', cost: 40, impact: 30, resource_type: 'waste', is_root_cause: false },
        { id: 'smart_bins', name: 'IoT smart bins', cost: 420, impact: 95, resource_type: 'waste', is_root_cause: false, hidden_penalty: 'Sensor failures reduce uptime by 50%', hidden_penalty_factor: 0.5 }
      ],
      optimal_combination: ['seg_bins', 'burning_stop', 'awareness']
    },
    wednesday: {
      day_of_week: 'wednesday',
      title: 'This textile shop pays ₹18,000/month in electricity. Halve it.',
      scenario_type: 'energy_waste',
      scene_illustration: 'assets/ecofix/wednesday-energy.svg',
      problems: [
        'AC set to 16°C',
        'No insulation',
        'Incandescent bulbs',
        'Standby loads overnight',
        'No rooftop solar'
      ],
      fix_options: [
        { id: 'ac_setpoint', name: 'Set AC to 24°C with zoning', cost: 80, impact: 60, resource_type: 'carbon', is_root_cause: false },
        { id: 'led_upgrade', name: 'Replace all lighting with LED', cost: 150, impact: 85, resource_type: 'carbon', is_root_cause: false },
        { id: 'roof_insulation', name: 'Install roof insulation', cost: 260, impact: 120, resource_type: 'carbon', is_root_cause: true },
        { id: 'standby_cut', name: 'Smart cutoff for standby loads', cost: 100, impact: 55, resource_type: 'carbon', is_root_cause: false },
        { id: 'solar_roof', name: 'Add 2kW rooftop solar', cost: 450, impact: 210, resource_type: 'carbon', is_root_cause: false, unlock_multiplier: 'roof_insulation' },
        { id: 'chiller_upgrade', name: 'Upgrade to inverter chiller', cost: 500, impact: 170, resource_type: 'carbon', is_root_cause: false, hidden_penalty: 'Old wiring derates output by 35%', hidden_penalty_factor: 0.35 },
        { id: 'metering', name: 'Install circuit metering dashboard', cost: 120, impact: 48, resource_type: 'carbon', is_root_cause: false }
      ],
      optimal_combination: ['roof_insulation', 'led_upgrade', 'ac_setpoint']
    },
    thursday: {
      day_of_week: 'thursday',
      title: 'This construction site produces toxic runoff into the street drain. Fix it.',
      scenario_type: 'construction',
      scene_illustration: 'assets/ecofix/thursday-construction.svg',
      problems: [
        'Uncovered material stacks',
        'Chemicals near open drains',
        'No debris segregation',
        'Diesel generator overuse',
        'No silt traps'
      ],
      fix_options: [
        { id: 'cover_materials', name: 'Cover material stacks', cost: 70, impact: 50, resource_type: 'waste', is_root_cause: false },
        { id: 'bunded_storage', name: 'Bunded chemical storage zone', cost: 210, impact: 100, resource_type: 'waste', is_root_cause: true },
        { id: 'silt_trap', name: 'Install silt trap + trench', cost: 230, impact: 120, resource_type: 'water', is_root_cause: false },
        { id: 'diesel_schedule', name: 'Cut diesel runtime', cost: 90, impact: 65, resource_type: 'carbon', is_root_cause: false },
        { id: 'reuse_station', name: 'Debris reuse sorting station', cost: 170, impact: 80, resource_type: 'waste', is_root_cause: false, unlock_multiplier: 'cover_materials' },
        { id: 'battery_pack', name: 'Temporary battery backup pack', cost: 480, impact: 140, resource_type: 'carbon', is_root_cause: false, hidden_penalty: 'Battery cycling cuts output by 40%', hidden_penalty_factor: 0.4 },
        { id: 'site_protocol', name: 'Runoff emergency protocol', cost: 30, impact: 28, resource_type: 'water', is_root_cause: false }
      ],
      optimal_combination: ['bunded_storage', 'silt_trap', 'site_protocol']
    },
    friday: {
      day_of_week: 'friday',
      title: 'This restaurant wastes 40kg of food daily. Fix it.',
      scenario_type: 'food_waste',
      scene_illustration: 'assets/ecofix/friday-food.svg',
      problems: [
        'Over-ordering ingredients',
        'Poor storage control',
        'No composting',
        'Single-use packaging',
        'No energy monitoring'
      ],
      fix_options: [
        { id: 'forecast_buy', name: 'Demand-based ingredient ordering', cost: 120, impact: 95, resource_type: 'waste', is_root_cause: true },
        { id: 'coldchain_fix', name: 'Cold storage calibration', cost: 170, impact: 75, resource_type: 'waste', is_root_cause: false },
        { id: 'compost_contract', name: 'Compost pickup contract', cost: 220, impact: 120, resource_type: 'waste', is_root_cause: false },
        { id: 'reuse_takeaway', name: 'Reusable takeaway containers', cost: 180, impact: 70, resource_type: 'waste', is_root_cause: false },
        { id: 'kitchen_meter', name: 'Kitchen energy metering', cost: 90, impact: 45, resource_type: 'carbon', is_root_cause: false },
        { id: 'digester', name: 'Compact anaerobic digester', cost: 500, impact: 160, resource_type: 'waste', is_root_cause: false, hidden_penalty: 'Maintenance downtime reduces output by 45%', hidden_penalty_factor: 0.45 },
        { id: 'portion_design', name: 'Flexible portion redesign', cost: 40, impact: 35, resource_type: 'waste', is_root_cause: false, unlock_multiplier: 'forecast_buy' }
      ],
      optimal_combination: ['forecast_buy', 'compost_contract', 'portion_design']
    },
    saturday: {
      day_of_week: 'saturday',
      title: 'This apartment complex has the worst EcoScore in the city. Fix it.',
      scenario_type: 'apartment_complex',
      scene_illustration: 'assets/ecofix/saturday-apartment.svg',
      problems: [
        'No rooftop solar',
        'No rainwater lines',
        'Mixed waste disposal',
        'Borewell overuse',
        'Daily diesel backup use'
      ],
      fix_options: [
        { id: 'solar_terrace', name: 'Install shared rooftop solar', cost: 480, impact: 220, resource_type: 'carbon', is_root_cause: true },
        { id: 'rwh_lines', name: 'Rainwater recharge lines', cost: 260, impact: 140, resource_type: 'water', is_root_cause: false, unlock_multiplier: 'solar_terrace' },
        { id: 'tower_bins', name: 'Tower-wise segregation stations', cost: 180, impact: 90, resource_type: 'waste', is_root_cause: false },
        { id: 'diesel_cut', name: 'Diesel reduction protocol', cost: 110, impact: 60, resource_type: 'carbon', is_root_cause: false },
        { id: 'pump_auto', name: 'Borewell pump automation', cost: 170, impact: 80, resource_type: 'water', is_root_cause: false },
        { id: 'ev_grid', name: 'EV microgrid backup', cost: 500, impact: 170, resource_type: 'carbon', is_root_cause: false, hidden_penalty: 'Grid instability lowers benefit by 30%', hidden_penalty_factor: 0.3 },
        { id: 'resident_sla', name: 'Resident sustainability SLA', cost: 50, impact: 28, resource_type: 'waste', is_root_cause: false }
      ],
      optimal_combination: ['solar_terrace', 'diesel_cut', 'resident_sla']
    },
    sunday: {
      day_of_week: 'sunday',
      title: 'This neighbourhood junction causes the most idle vehicle emissions in Chennai. Fix it.',
      scenario_type: 'city_infra',
      scene_illustration: 'assets/ecofix/sunday-city.svg',
      problems: [
        'Long fixed signal timings',
        'No cycle lane',
        'Broken pedestrian path',
        'Poor tree cover',
        'No EV charging'
      ],
      fix_options: [
        { id: 'adaptive_signals', name: 'Adaptive signal timing system', cost: 300, impact: 150, resource_type: 'carbon', is_root_cause: true },
        { id: 'cycle_lane', name: 'Protected cycle lane', cost: 180, impact: 75, resource_type: 'carbon', is_root_cause: false },
        { id: 'pedestrian_path', name: 'Repair pedestrian path', cost: 130, impact: 55, resource_type: 'carbon', is_root_cause: false },
        { id: 'tree_shade', name: 'Rapid canopy line planting', cost: 200, impact: 68, resource_type: 'carbon', is_root_cause: false, unlock_multiplier: 'pedestrian_path' },
        { id: 'ev_charger', name: 'Install EV fast charger', cost: 420, impact: 110, resource_type: 'carbon', is_root_cause: false },
        { id: 'paint_refresh', name: 'Road paint refresh only', cost: 70, impact: 18, resource_type: 'carbon', is_root_cause: false, hidden_penalty: 'No flow redesign loses 50% impact', hidden_penalty_factor: 0.5 },
        { id: 'idle_enforce', name: 'No-idle enforcement window', cost: 90, impact: 46, resource_type: 'carbon', is_root_cause: false }
      ],
      optimal_combination: ['adaptive_signals', 'cycle_lane', 'idle_enforce']
    }
  };

  const providers = [
    { id: 'p1', provider: 'GreenNest Pros', area: 'Anna Nagar', ecoScore: 92, tags: ['plumbers', 'rainwater-harvesting-installers'] },
    { id: 'p2', provider: 'FixLoop Collective', area: 'T. Nagar', ecoScore: 87, tags: ['plumbers', 'electricians'] },
    { id: 'p3', provider: 'SunFleet', area: 'Velachery', ecoScore: 90, tags: ['solar-installers', 'electricians'] },
    { id: 'p4', provider: 'LeafLab', area: 'Adyar', ecoScore: 88, tags: ['urban-greening', 'composting-setup'] },
    { id: 'p5', provider: 'BuildBack', area: 'Porur', ecoScore: 81, tags: ['green-contractors', 'eco-material-suppliers'] },
    { id: 'p6', provider: 'SoilCycle', area: 'Tambaram', ecoScore: 95, tags: ['composting-services', 'food-waste-management'] },
    { id: 'p7', provider: 'RetroSmart Collective', area: 'Nungambakkam', ecoScore: 89, tags: ['solar-installers', 'ac-servicing'] },
    { id: 'p8', provider: 'RefillGo', area: 'Mylapore', ecoScore: 86, tags: ['waste-segregation-services', 'food-waste-management'] },
    { id: 'p9', provider: 'ChargeCheck', area: 'OMR', ecoScore: 84, tags: ['ev-infra', 'electricians'] },
    { id: 'p10', provider: 'BlueLoop Engineers', area: 'Anna Nagar', ecoScore: 91, tags: ['traffic-optimization', 'urban-greening'] }
  ];

  const providerTagMap = {
    'Home Care': ['waste-segregation-services', 'composting-setup', 'plumbers'],
    Repairs: ['plumbers', 'electricians', 'ac-servicing'],
    'Auto Care': ['ev-infra', 'electricians'],
    Lifestyle: ['food-waste-management', 'composting-services'],
    Outdoor: ['rainwater-harvesting-installers', 'solar-installers', 'urban-greening'],
    Errands: ['waste-segregation-services', 'food-waste-management']
  };

  const scenarioTagMap = {
    water_waste: ['plumbers', 'rainwater-harvesting-installers'],
    waste_management: ['waste-segregation-services', 'composting-setup'],
    energy_waste: ['solar-installers', 'ac-servicing', 'electricians'],
    construction: ['eco-material-suppliers', 'green-contractors'],
    food_waste: ['composting-services', 'food-waste-management'],
    apartment_complex: ['solar-installers', 'rainwater-harvesting-installers', 'waste-segregation-services'],
    city_infra: ['ev-infra', 'urban-greening', 'traffic-optimization']
  };

  function newUser(userId, name = 'EcoFix Player') {
    return {
      user_id: userId,
      name,
      neighbourhood_id: 'Anna Nagar',
      current_streak: 0,
      longest_streak: 0,
      last_played_date: '',
      total_puzzles_completed: 0,
      total_score_all_time: 0,
      total_carbon_saved: 0,
      total_water_saved: 0,
      puzzle_history: [],
      streak_freeze_week: ''
    };
  }

  function seedUsers(todayKey) {
    const prev = (n) => {
      const [y, m, d] = todayKey.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      date.setUTCDate(date.getUTCDate() - n);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    };
    return {
      mock_user_1: { ...newUser('mock_user_1', 'Aditi Raman'), neighbourhood_id: 'Anna Nagar', current_streak: 2, longest_streak: 6, last_played_date: prev(1), total_puzzles_completed: 14, total_score_all_time: 1288, total_carbon_saved: 214, total_water_saved: 980 },
      mock_user_2: { ...newUser('mock_user_2', 'Karthik V'), neighbourhood_id: 'Velachery', current_streak: 7, longest_streak: 12, last_played_date: prev(1), total_puzzles_completed: 32, total_score_all_time: 3290, total_carbon_saved: 508, total_water_saved: 1960 },
      mock_user_3: { ...newUser('mock_user_3', 'Meena S'), neighbourhood_id: 'Adyar', current_streak: 15, longest_streak: 21, last_played_date: prev(1), total_puzzles_completed: 58, total_score_all_time: 6874, total_carbon_saved: 1102, total_water_saved: 4130 }
    };
  }

  const ECOFIX_DATA = { scenarios, providers, providerTagMap, scenarioTagMap, newUser, seedUsers };

  // Dual export: browser classic-script global (unchanged) + Node `require()` for server-side
  // reuse (e.g. computing per-scenario difficulty from the same fix_options as the client).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ECOFIX_DATA;
  }
  if (root) {
    root.ECOFIX_DATA = ECOFIX_DATA;
  }
})(typeof window !== 'undefined' ? window : undefined);
