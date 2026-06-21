/**
 * DeCarbonizer — Personal Carbon Footprint Tracker & Assistant
 *
 * Carbon emission coefficients sourced from:
 *  - IPCC AR6 (2021): transport, energy, diet baselines
 *  - US EPA (2023): solid waste, refrigerant, electricity grid factors
 *  - Our World in Data / GHG Protocol: consumption and flight estimates
 */

// ─── Named Constants ────────────────────────────────────────────────────────────
/** Weekly sustainable carbon budget (kg CO₂e): 2000 kg / 52 weeks ≈ 38.46 */
const WEEKLY_SUSTAINABLE_KG = 2000 / 52;
/** Annual sustainable target per IPCC 2°C pathway (kg CO₂e) */
const ANNUAL_SUSTAINABLE_TARGET_KG = 2000;
/** Global average CO₂ absorbed by a mature tree per year (kg) */
const TREE_ANNUAL_CO2_ABSORPTION_KG = 22;
/** Average weeks in a year */
const WEEKS_PER_YEAR = 52;
/** Days in a standard week */
const DAYS_PER_WEEK = 7;
/** Base human lifespan reference (WHO world average 2023) */
const BASE_HUMAN_LIFESPAN = 82.5;
/** Maximum allowed guest nickname length */
const MAX_NICKNAME_LENGTH = 50;
/** Maximum allowed log description length */
const MAX_LOG_DESC_LENGTH = 200;
/** Valid emission log categories */
const VALID_CATEGORIES = ['Transport', 'Energy', 'Food', 'Consumption', 'Travel', 'Waste'];
/** Scale divisor used to convert weekly CO₂e (kg) into a [0,1] ecosystem health score */
const ECOSYSTEM_HEALTH_SCALE = 100.0;
/** Kilometres per mile, used for unit conversion */
const KM_PER_MILE = 1.60934;

// ─── Emission Factors ───────────────────────────────────────────────────────
/**
 * Carbon emission factors organised by category.
 * All values are in kg CO₂e per unit described in comments.
 * Sources: IPCC AR6 WG3, EPA eGRID 2023, GHG Protocol.
 */
const EMISSION_FACTORS = {
  /** Transport: kg CO₂e per km driven / ridden */
  transport: {
    gas_suv:        0.26,  // Large gasoline SUV (EPA 2023)
    gas_medium:     0.18,  // Medium gasoline car (EPA 2023)
    hybrid:         0.10,  // Hybrid vehicle
    electric:       0.04,  // EV on average grid (EPA eGRID 2023)
    transit:        0.035, // Bus / rail average
    walking_cycling: 0.0   // Zero-emission active transport
  },
  /** Diet baseline: kg CO₂e per day (annual total ÷ 365) */
  diet: {
    meat_heavy:   2800 / 365, // ~7.67 kg/day (IPCC AR6)
    meat_average: 2000 / 365, // ~5.48 kg/day
    flexitarian:  1400 / 365, // ~3.83 kg/day
    vegetarian:   1100 / 365, // ~3.01 kg/day
    vegan:         750 / 365  // ~2.05 kg/day
  },
  /** Meal overrides: kg CO₂e per single-meal log */
  meals: {
    beef:        3.2,
    chicken:     0.9,
    vegetarian:  0.5,
    vegan:       0.3,
    average:     1.1
  },
  /** Home energy: kg CO₂e per month per person */
  energy: {
    grid:  140, // Standard utility grid (EPA eGRID 2023)
    mixed:  70, // Partial solar / renewable mix
    green:   8  // 100 % renewable tariff
  },
  /** Flights: kg CO₂e per flight (includes radiative forcing ×2) */
  flights: {
    short_haul: 180, // < 3 h flight
    long_haul:  850, // > 3 h intercontinental
    average:    450  // Mixed-haul average
  },
  /** Consumption baseline: kg CO₂e per month */
  shopping: {
    heavy:      120,
    average:     55,
    minimalist:  15
  },
  /** Individual purchase overrides: kg CO₂e per item */
  purchases: {
    new_clothing:       11.5,
    secondhand_clothing: 1.2,
    electronics:        80.0,
    furniture:          45.0,
    miscellaneous:       5.0
  },
  /** Waste disposal: kg CO₂e per month per person */
  waste: {
    standard:  40, // Landfill (EPA 2023)
    recycling: 15  // Active recycling / composting
  }
};

// ─── Country Averages ────────────────────────────────────────────────────────
/** National average annual footprints (kg CO₂e per capita) — IEA 2023 */
const COUNTRY_AVERAGES = {
  US: 16000,
  UK:  6500,
  EU:  7200,
  IN:  2500,
  GL:  4700 // Global average
};

const COUNTRY_NAMES = {
  US: 'United States',
  UK: 'United Kingdom',
  EU: 'European Union',
  IN: 'India',
  GL: 'Global Average'
};

// ─── Habits Template ─────────────────────────────────────────────────────────
/** Weekly micro-habits with CO₂ saving estimates (kg CO₂e / week) */
const HABITS_TEMPLATE = [
  { id: 'h_transit',  text: 'Swap 2 car drives for public transit this week',         impact: 8.5, category: 'transport',   applicable: ['gas_suv', 'gas_medium', 'hybrid'] },
  { id: 'h_bike',     text: 'Replace car trips under 3km with biking or walking',      impact: 4.2, category: 'transport',   applicable: ['gas_suv', 'gas_medium', 'hybrid', 'electric'] },
  { id: 'h_meatless', text: 'Adopt Meatless Monday (completely plant-based for 1 day)', impact: 5.6, category: 'food',       applicable: ['meat_heavy', 'meat_average', 'flexitarian'] },
  { id: 'h_dairy',    text: 'Choose oat/soy milk instead of dairy milk this week',     impact: 2.1, category: 'food',        applicable: ['meat_heavy', 'meat_average', 'flexitarian', 'vegetarian'] },
  { id: 'h_unplug',   text: 'Unplug stand-by appliances and chargers when not in use', impact: 1.8, category: 'energy',     applicable: ['grid', 'mixed'] },
  { id: 'h_wash',     text: 'Wash clothes at 30°C and air dry instead of using the dryer', impact: 3.5, category: 'energy', applicable: ['grid', 'mixed'] },
  { id: 'h_thrift',   text: 'Buy secondhand or rent instead of purchasing new items',  impact: 7.2, category: 'consumption', applicable: ['heavy', 'average'] },
  { id: 'h_recycle',  text: 'Compost organic scraps and strictly recycle all paper/metals', impact: 2.8, category: 'waste', applicable: ['standard'] }
];

// ─── Application State ────────────────────────────────────────────────────────
let state = {
  onboarded: false,
  profile: {
    location:       'GL',
    householdSize:  1,
    transportMode:  'gas_medium',
    weeklyKm:       50,
    dietType:       'meat_average',
    energySource:   'grid',
    monthlyFlights: 0,
    shoppingHabit:  'average',
    baselineAnnual: 4700,
    reductionGoal:  15  // % reduction target
  },
  logs:   [],
  habits: []
};



// Onboarding Steps Definition
const onboardingSteps = [
  {
    title: "Where are you located?",
    desc: "Your location helps us compare your footprint to regional averages and set accurate baselines.",
    html: `
      <div class="slider-container">
        <label class="stat-label" for="ob-input-location">Select Country/Region</label>
        <select id="ob-input-location" class="input-dropdown">
          <option value="US">United States (Avg: ~16.0 tonnes/yr)</option>
          <option value="UK">United Kingdom (Avg: ~6.5 tonnes/yr)</option>
          <option value="EU">European Union (Avg: ~7.2 tonnes/yr)</option>
          <option value="IN">India (Avg: ~2.5 tonnes/yr)</option>
          <option value="GL" selected>Global Average (Avg: ~4.7 tonnes/yr)</option>
        </select>
        
        <label class="stat-label" for="ob-input-household" style="margin-top: 15px;">Household Size (people living together)</label>
        <div class="slider-container" style="margin-top: 5px;">
          <div class="slider-val-bubble" id="ob-val-household">1</div>
          <input type="range" id="ob-input-household" class="custom-slider" min="1" max="8" value="1" aria-label="Household size (people)">
        </div>

        <label class="stat-label" for="ob-input-name" style="margin-top: 15px;">Your Nickname</label>
        <input type="text" id="ob-input-name" class="input-dropdown" placeholder="Enter nickname..." value="EcoHero" style="margin-top: 5px; font-size: 0.95rem;">
      </div>
    `,
    init: () => {
      const slider = document.getElementById('ob-input-household');
      const bubble = document.getElementById('ob-val-household');
      slider.addEventListener('input', (e) => {
        bubble.textContent = e.target.value;
      });
    },
    save: () => {
      state.profile.location = document.getElementById('ob-input-location').value;
      state.profile.householdSize = parseInt(document.getElementById('ob-input-household').value);
      // Sanitize nickname: trim, enforce max length, and strip any HTML tags
      const rawName = document.getElementById('ob-input-name').value.trim();
      const nameVal = (rawName.replace(/<[^>]*>/g, '').slice(0, MAX_NICKNAME_LENGTH)) || 'EcoHero';
      state.profile.nickname = nameVal;
      if (!state.google_user) {
        state.google_user = {
          name: nameVal,
          picture: "🌳",
          isGuest: true
        };
      }
    }
  },
  {
    title: "How do you commute?",
    desc: "Transportation is a massive source of personal carbon emissions. Select your main transport mode.",
    html: `
      <div class="card-selector" id="ob-transport-selector" role="radiogroup" aria-label="Select transport mode">
        <div class="selection-card" data-val="gas_suv" role="radio" aria-checked="false" tabindex="0" aria-label="SUV/Large Gas Car (High emissions)">
          <span class="card-icon" aria-hidden="true">🚗</span>
          <span class="card-label">SUV/Large Gas Car</span>
          <span class="card-subtext">High emissions</span>
        </div>
        <div class="selection-card selected" data-val="gas_medium" role="radio" aria-checked="true" tabindex="0" aria-label="Mid/Small Gas Car (Average emissions)">
          <span class="card-icon" aria-hidden="true">🚗</span>
          <span class="card-label">Mid/Small Gas Car</span>
          <span class="card-subtext">Average emissions</span>
        </div>
        <div class="selection-card" data-val="hybrid" role="radio" aria-checked="false" tabindex="0" aria-label="Hybrid Vehicle (Moderate emissions)">
          <span class="card-icon" aria-hidden="true">🔌</span>
          <span class="card-label">Hybrid Vehicle</span>
          <span class="card-subtext">Moderate emissions</span>
        </div>
        <div class="selection-card" data-val="electric" role="radio" aria-checked="false" tabindex="0" aria-label="Electric Vehicle (Low emissions)">
          <span class="card-icon" aria-hidden="true">⚡</span>
          <span class="card-label">Electric Vehicle</span>
          <span class="card-subtext">Low emissions</span>
        </div>
        <div class="selection-card" data-val="transit" role="radio" aria-checked="false" tabindex="0" aria-label="Public Transit (Bus, subway, train)">
          <span class="card-icon" aria-hidden="true">🚌</span>
          <span class="card-label">Public Transit</span>
          <span class="card-subtext">Bus, subway, train</span>
        </div>
        <div class="selection-card" data-val="walking_cycling" role="radio" aria-checked="false" tabindex="0" aria-label="Active Transport (Biking, walking)">
          <span class="card-icon" aria-hidden="true">🚲</span>
          <span class="card-label">Active Transport</span>
          <span class="card-subtext">Biking, walking</span>
        </div>
      </div>
      <div class="slider-container" style="margin-top: 20px;">
        <label class="stat-label" for="ob-input-km">Approximate weekly distance: <span id="ob-val-km" style="color:var(--primary); font-weight:700;">50 km</span></label>
        <input type="range" id="ob-input-km" class="custom-slider" min="0" max="400" value="50" step="10" aria-label="Approximate weekly distance in kilometers">
      </div>
    `,
    init: () => {
      const selector = document.getElementById('ob-transport-selector');
      const cards = selector.querySelectorAll('.selection-card');
      let selectedVal = 'gas_medium';
      
      const selectCard = (card) => {
        cards.forEach(c => {
          c.classList.remove('selected');
          c.setAttribute('aria-checked', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');
        selectedVal = card.dataset.val;
      };

      cards.forEach(card => {
        card.setAttribute('aria-checked', card.classList.contains('selected') ? 'true' : 'false');
        card.addEventListener('click', () => selectCard(card));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectCard(card);
          }
        });
      });
      
      const slider = document.getElementById('ob-input-km');
      const display = document.getElementById('ob-val-km');
      slider.addEventListener('input', (e) => {
        display.textContent = `${e.target.value} km`;
      });
      
      selector.dataset.current = selectedVal;
    },
    save: () => {
      const selected = document.querySelector('#ob-transport-selector .selection-card.selected');
      state.profile.transportMode = selected ? selected.dataset.val : 'gas_medium';
      state.profile.weeklyKm = parseInt(document.getElementById('ob-input-km').value);
    }
  },
  {
    title: "What is your diet style?",
    desc: "Food emissions depend heavily on meat consumption. Select the description that fits you best.",
    html: `
      <div class="card-selector" id="ob-diet-selector" style="grid-template-columns: 1fr;" role="radiogroup" aria-label="Select diet style">
        <div class="selection-card" data-val="meat_heavy" style="flex-direction: row; text-align: left; justify-content: flex-start; gap: 15px;" role="radio" aria-checked="false" tabindex="0" aria-label="Frequent Meat Eater (beef, pork, or lamb in most daily meals)">
          <span class="card-icon" aria-hidden="true">🥩</span>
          <div>
            <div class="card-label">Frequent Meat Eater</div>
            <div class="card-subtext">Include beef, pork, or lamb in most daily meals</div>
          </div>
        </div>
        <div class="selection-card selected" data-val="meat_average" style="flex-direction: row; text-align: left; justify-content: flex-start; gap: 15px;" role="radio" aria-checked="true" tabindex="0" aria-label="Average Omnivore (eat meat regularly, poultry/fish)">
          <span class="card-icon" aria-hidden="true">🍗</span>
          <div>
            <div class="card-label">Average Omnivore</div>
            <div class="card-subtext">Eat meat regularly, but mix with poultry/fish</div>
          </div>
        </div>
        <div class="selection-card" data-val="flexitarian" style="flex-direction: row; text-align: left; justify-content: flex-start; gap: 15px;" role="radio" aria-checked="false" tabindex="0" aria-label="Flexitarian (primarily vegetarian, eat meat occasionally)">
          <span class="card-icon" aria-hidden="true">🥗</span>
          <div>
            <div class="card-label">Flexitarian</div>
            <div class="card-subtext">Primarily vegetarian, eat meat occasionally</div>
          </div>
        </div>
        <div class="selection-card" data-val="vegetarian" style="flex-direction: row; text-align: left; justify-content: flex-start; gap: 15px;" role="radio" aria-checked="false" tabindex="0" aria-label="Vegetarian (no meat or fish, eat dairy and eggs)">
          <span class="card-icon" aria-hidden="true">🧀</span>
          <div>
            <div class="card-label">Vegetarian</div>
            <div class="card-subtext">No meat or fish, eat dairy products & eggs</div>
          </div>
        </div>
        <div class="selection-card" data-val="vegan" style="flex-direction: row; text-align: left; justify-content: flex-start; gap: 15px;" role="radio" aria-checked="false" tabindex="0" aria-label="Vegan (exclusively plant-based)">
          <span class="card-icon" aria-hidden="true">🌱</span>
          <div>
            <div class="card-label">Vegan</div>
            <div class="card-subtext">Exclusively plant-based diet</div>
          </div>
        </div>
      </div>
    `,
    init: () => {
      const selector = document.getElementById('ob-diet-selector');
      const cards = selector.querySelectorAll('.selection-card');
      const selectCard = (card) => {
        cards.forEach(c => {
          c.classList.remove('selected');
          c.setAttribute('aria-checked', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');
      };
      cards.forEach(card => {
        card.setAttribute('aria-checked', card.classList.contains('selected') ? 'true' : 'false');
        card.addEventListener('click', () => selectCard(card));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectCard(card);
          }
        });
      });
    },
    save: () => {
      const selected = document.querySelector('#ob-diet-selector .selection-card.selected');
      state.profile.dietType = selected ? selected.dataset.val : 'meat_average';
    }
  },
  {
    title: "How is your home powered?",
    desc: "Electricity and heating are primary energy drivers. Select your primary power source.",
    html: `
      <div class="card-selector" id="ob-energy-selector" role="radiogroup" aria-label="Select home power source">
        <div class="selection-card selected" data-val="grid" role="radio" aria-checked="true" tabindex="0" aria-label="Standard Grid (Fossil-fuel heavy mix)">
          <span class="card-icon" aria-hidden="true">🔌</span>
          <span class="card-label">Standard Grid</span>
          <span class="card-subtext">Fossil-fuel heavy mix</span>
        </div>
        <div class="selection-card" data-val="mixed" role="radio" aria-checked="false" tabindex="0" aria-label="Mixed Source (Partial solar, wind, offsets)">
          <span class="card-icon" aria-hidden="true">☀️</span>
          <span class="card-label">Mixed Source</span>
          <span class="card-subtext">Partial solar, wind, or carbon offsets</span>
        </div>
        <div class="selection-card" data-val="green" role="radio" aria-checked="false" tabindex="0" aria-label="Green/Solar (100% renewable or home solar)">
          <span class="card-icon" aria-hidden="true">🌿</span>
          <span class="card-label">100% Green / Solar</span>
          <span class="card-subtext">Clean, renewable tariff or home solar</span>
        </div>
      </div>
    `,
    init: () => {
      const selector = document.getElementById('ob-energy-selector');
      const cards = selector.querySelectorAll('.selection-card');
      const selectCard = (card) => {
        cards.forEach(c => {
          c.classList.remove('selected');
          c.setAttribute('aria-checked', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');
      };
      cards.forEach(card => {
        card.setAttribute('aria-checked', card.classList.contains('selected') ? 'true' : 'false');
        card.addEventListener('click', () => selectCard(card));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectCard(card);
          }
        });
      });
    },
    save: () => {
      const selected = document.querySelector('#ob-energy-selector .selection-card.selected');
      state.profile.energySource = selected ? selected.dataset.val : 'grid';
    }
  },
  {
    title: "How often do you fly?",
    desc: "Air travel releases high emissions in single bursts. Estimate your monthly flight frequency.",
    html: `
      <div class="slider-container">
        <label class="stat-label" for="ob-input-flights">Average Flights per Month</label>
        <div class="slider-val-bubble" id="ob-val-flights">0</div>
        <input type="range" id="ob-input-flights" class="custom-slider" min="0" max="6" value="0" step="0.5" aria-label="Average flights per month">
        <span style="font-size:0.75rem; color:var(--text-muted); text-align:center;" id="ob-flights-note">
          Note: Short-haul fits as ~0.5 flight, long-haul as 1-2 flights.
        </span>
      </div>
    `,
    init: () => {
      const slider = document.getElementById('ob-input-flights');
      const display = document.getElementById('ob-val-flights');
      slider.addEventListener('input', (e) => {
        display.textContent = e.target.value;
      });
    },
    save: () => {
      state.profile.monthlyFlights = parseFloat(document.getElementById('ob-input-flights').value);
    }
  },
  {
    title: "What are your shopping habits?",
    desc: "Purchasing goods, fast fashion, and appliances has hidden carbon costs from manufacturing and transport.",
    html: `
      <div class="card-selector" id="ob-shopping-selector" role="radiogroup" aria-label="Select shopping habits">
        <div class="selection-card" data-val="heavy" role="radio" aria-checked="false" tabindex="0" aria-label="Frequent Buyer (often purchase fashion, tech)">
          <span class="card-icon" aria-hidden="true">🛍️</span>
          <span class="card-label">Frequent Buyer</span>
          <span class="card-subtext">Often buy new fashion, tech, items</span>
        </div>
        <div class="selection-card selected" data-val="average" role="radio" aria-checked="true" tabindex="0" aria-label="Average Consumer (buy new only when needed)">
          <span class="card-icon" aria-hidden="true">🛒</span>
          <span class="card-label">Average Consumer</span>
          <span class="card-subtext">Buy new only when needed</span>
        </div>
        <div class="selection-card" data-val="minimalist" role="radio" aria-checked="false" tabindex="0" aria-label="Thrifter/Minimalist (secondhand items)">
          <span class="card-icon" aria-hidden="true">♻️</span>
          <span class="card-label">Thrifter / Minimalist</span>
          <span class="card-subtext">Secondhand clothing, minimal purchases</span>
        </div>
      </div>
    `,
    init: () => {
      const selector = document.getElementById('ob-shopping-selector');
      const cards = selector.querySelectorAll('.selection-card');
      const selectCard = (card) => {
        cards.forEach(c => {
          c.classList.remove('selected');
          c.setAttribute('aria-checked', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');
      };
      cards.forEach(card => {
        card.setAttribute('aria-checked', card.classList.contains('selected') ? 'true' : 'false');
        card.addEventListener('click', () => selectCard(card));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectCard(card);
          }
        });
      });
    },
    save: () => {
      const selected = document.querySelector('#ob-shopping-selector .selection-card.selected');
      state.profile.shoppingHabit = selected ? selected.dataset.val : 'average';
    }
  },
  {
    title: "Your Baseline Carbon Profile",
    desc: "Here is your baseline carbon footprint. Adjust your goal to see your potential impact.",
    html: `
      <div class="stats-grid" style="margin-bottom: 15px;" role="region" aria-label="Baseline stats">
        <div class="stat-card glass-panel" style="padding: 12px;">
          <span class="stat-label">Annual Baseline</span>
          <span class="stat-value" id="ob-val-baseline" style="font-size: 1.4rem;">0 kg</span>
        </div>
        <div class="stat-card glass-panel" style="padding: 12px;">
          <span class="stat-label" id="ob-lbl-country">vs Country Avg</span>
          <span class="stat-value" id="ob-val-country-pct" style="font-size: 1.4rem; color: var(--color-travel);">0%</span>
        </div>
        <div class="stat-card glass-panel" style="padding: 12px;">
          <span class="stat-label">Sustainable Target</span>
          <span class="stat-value" style="font-size: 1.4rem; color: var(--primary);">2,000 kg</span>
        </div>
      </div>
      <div class="slider-container">
        <label class="stat-label" for="ob-input-goal">Set Reduction Goal: <span id="ob-val-goal" style="color:var(--primary); font-weight:700;">15%</span></label>
        <input type="range" id="ob-input-goal" class="custom-slider" min="10" max="30" value="15" step="1" aria-label="Reduction goal percentage">
        <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; margin-top: 8px;" id="ob-goal-impact-lbl" aria-live="polite">
          Saving ~600 kg CO2e / year. Equivalent to taking 1.5 cars off the road!
        </div>
      </div>
    `,
    init: () => {
      const baseline = calculateBaseline();
      state.profile.baselineAnnual = baseline;
      
      const baselineDisp = document.getElementById('ob-val-baseline');
      const countryLbl = document.getElementById('ob-lbl-country');
      const countryPctDisp = document.getElementById('ob-val-country-pct');
      
      baselineDisp.textContent = `${Math.round(baseline).toLocaleString()} kg`;
      
      const regionalAvg = COUNTRY_AVERAGES[state.profile.location] || COUNTRY_AVERAGES.GL;
      const pct = Math.round((baseline / regionalAvg) * 100);
      countryLbl.textContent = `vs ${state.profile.location} Average`;
      countryPctDisp.textContent = `${pct}%`;
      if (pct <= 100) {
        countryPctDisp.style.color = 'var(--primary)';
      } else {
        countryPctDisp.style.color = 'var(--color-travel)';
      }

      const slider = document.getElementById('ob-input-goal');
      const display = document.getElementById('ob-val-goal');
      const impactLbl = document.getElementById('ob-goal-impact-lbl');
      
      const updateGoalText = (val) => {
        display.textContent = `${val}%`;
        const saved = Math.round(baseline * (val / 100));
        const equivalentGasKm = Math.round(saved / EMISSION_FACTORS.transport.gas_medium);
        impactLbl.innerHTML = `Saving <strong>${saved.toLocaleString()} kg CO₂e</strong> / year.<br>Equivalent to avoiding <strong>${equivalentGasKm.toLocaleString()} km</strong> of driving!`;
      };
      
      slider.addEventListener('input', (e) => {
        updateGoalText(e.target.value);
      });
      
      updateGoalText(slider.value);
    },
    save: () => {
      state.profile.reductionGoal = parseInt(document.getElementById('ob-input-goal').value);
    }
  }
];

let currentStep = 0;

// ─── Calculation Helpers ─────────────────────────────────────────────────────
/**
 * Calculate annual carbon baseline (kg CO₂e) from the user's onboarding profile.
 * Aggregates: transport, diet, energy, flights, consumption, and waste.
 * Sources: IPCC AR6 WG3, EPA eGRID 2023, GHG Protocol.
 * @returns {number} Annual carbon footprint in kg CO₂e.
 */
global.calculateBaseline = function calculateBaseline() {
  const p = state.profile;

  // Transport: kg CO₂e/km × km/week × weeks/year
  const transFactor     = EMISSION_FACTORS.transport[p.transportMode] || EMISSION_FACTORS.transport.gas_medium;
  const transportAnnual = p.weeklyKm * WEEKS_PER_YEAR * transFactor;

  // Diet: daily factor × 365 days
  const dietFactor = EMISSION_FACTORS.diet[p.dietType] || EMISSION_FACTORS.diet.meat_average;
  const dietAnnual = dietFactor * 365;

  // Energy: monthly factor × 12 months (per person)
  const energyFactor = EMISSION_FACTORS.energy[p.energySource] || EMISSION_FACTORS.energy.grid;
  const energyAnnual = energyFactor * 12;

  // Flights: monthly flights × 12 months × average flight CO₂
  const flightsAnnual = p.monthlyFlights * 12 * EMISSION_FACTORS.flights.average;

  // Shopping / consumption: monthly factor × 12 months
  const shopFactor        = EMISSION_FACTORS.shopping[p.shoppingHabit] || EMISSION_FACTORS.shopping.average;
  const consumptionAnnual = shopFactor * 12;

  // Waste: standard monthly disposal × 12 months per person
  const wasteAnnual = EMISSION_FACTORS.waste.standard * 12;

  return transportAnnual + dietAnnual + energyAnnual + flightsAnnual + consumptionAnnual + wasteAnnual;
};

/**
 * Resolve the CSS color variable for a given emission category.
 * Centralises the category→color mapping used in both the history list
 * and any future UI components.
 * @param {string} category - One of the VALID_CATEGORIES strings.
 * @returns {string} A CSS custom-property reference string (e.g. 'var(--color-transport)').
 */
function getCategoryColor(category) {
  const MAP = {
    Transport:   'var(--color-transport)',
    Energy:      'var(--color-energy)',
    Food:        'var(--color-food)',
    Consumption: 'var(--color-consumption)',
    Travel:      'var(--color-travel)',
    Waste:       'var(--color-waste)'
  };
  return MAP[category] || 'var(--text-muted)';
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initOnboarding();
  initMainApp();
  initGoogleServices();
  initGuestLogin();
  initFirebase();
  syncDatabaseData();
  
  // Initialize Mobile Tab switcher
  initMobileTabs();
  
  // Initialize 3D Ecosystem Tree Visualizer
  window.ecosystem3D = new Ecosystem3D('canvas-container');
  
  // Seed tree history on fresh load if needed
  if (state.onboarded && (!state.treeHistory || state.treeHistory.length === 0)) {
    setupDefaultTreeHistory();
  }
  
  initEcosystemEvents();
  
  // Render App based on onboarding state
  if (state.onboarded) {
    document.getElementById('onboarding-overlay').classList.add('hidden');
    refreshDashboard();
  } else {
    document.getElementById('onboarding-overlay').classList.remove('hidden');
    renderStep(0);
  }
});

/**
 * Load persisted application state from localStorage.
 * Falls back to the default state if storage is empty or corrupt.
 */
function loadState() {
  const saved = localStorage.getItem('decarbonizer_state');
  if (saved) {
    try {
      state = JSON.parse(saved);
    } catch (e) {
      console.error('Error loading localStorage state:', e);
    }
  }
}

/**
 * Persist the current application state to localStorage.
 */
function saveState() {
  localStorage.setItem('decarbonizer_state', JSON.stringify(state));
}

// ─── Firebase & Backend Sync ─────────────────────────────────────────────────
/**
 * Initialise Firebase using placeholder credentials.
 * Silently degrades if the Firebase SDK is not loaded from CDN.
 * Real credentials should be injected via environment variables in production.
 */
/** Flag set to true once Firebase app initialisation succeeds. */
window.firebaseInitialized = false;

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn("Firebase script not loaded from CDN.");
    return;
  }
  try {
    const firebaseConfig = {
      apiKey: "AIzaSyFakeKey_DeCarbonizer_123456789",
      authDomain: "decarbonizer-tracker.firebaseapp.com",
      projectId: "decarbonizer-tracker",
      storageBucket: "decarbonizer-tracker.appspot.com",
      messagingSenderId: "98765432101",
      appId: "1:98765432101:web:abcdef123456789"
    };
    
    firebase.initializeApp(firebaseConfig);
    window.firebaseInitialized = true;
    console.log("Firebase initialized successfully.");
  } catch (e) {
    console.warn("Firebase initialization failed:", e.message);
  }
}

/**
 * Synchronise logs from both the local JSON server and Firebase Firestore
 * into the current in-memory state, deduplicating by log ID.
 * Falls back gracefully if either backend is unavailable.
 * @returns {Promise<void>}
 */
async function syncDatabaseData() {
  const userId = (state.google_user && state.google_user.name) || 'guest';
  
  // 1. Fetch from server DB
  try {
    const res = await fetch(`/api/logs?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const dbLogs = await res.json();
      if (Array.isArray(dbLogs) && dbLogs.length > 0) {
        const logMap = new Map();
        state.logs.forEach(l => logMap.set(l.id, l));
        dbLogs.forEach(l => logMap.set(l.id, l));
        state.logs = Array.from(logMap.values());
        saveState();
        refreshDashboard();
      }
    }
  } catch (e) {
    console.warn("Database sync connection offline.");
  }
  
  // 2. Fetch from Firebase
  if (window.firebaseInitialized) {
    try {
      const db = firebase.firestore();
      const snap = await db.collection("users").doc(userId).collection("logs").get();
      const fbLogs = [];
      snap.forEach(doc => fbLogs.push(doc.data()));
      if (fbLogs.length > 0) {
        const logMap = new Map();
        state.logs.forEach(l => logMap.set(l.id, l));
        fbLogs.forEach(l => logMap.set(l.id, l));
        state.logs = Array.from(logMap.values());
        saveState();
        refreshDashboard();
      }
    } catch (e) {
      console.warn("Firebase logs sync failed:", e.message);
    }
  }
}

/**
 * Persist a new log entry to both the local JSON server and Firebase Firestore.
 * Both writes are best-effort — failures are logged to console only.
 * @param {Object} newLog - The validated log object to persist.
 * @returns {Promise<void>}
 */
async function persistLogToServer(newLog) {
  const userId = (state.google_user && state.google_user.name) || 'guest';
  
  // 1. POST to Server JSON Database
  try {
    fetch(`/api/logs?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLog)
    });
  } catch (e) {
    console.warn("Server DB log sync offline:", e);
  }
  
  // 2. Save to Firebase Firestore
  if (window.firebaseInitialized) {
    try {
      const db = firebase.firestore();
      db.collection("users").doc(userId).collection("logs").doc(newLog.id).set(newLog);
    } catch (e) {
      console.warn("Firebase log sync failed:", e.message);
    }
  }
}

/**
 * Trap keyboard focus inside an overlay modal.
 * Prevents Tab from escaping the modal, and handles Escape to close it.
 * Restores focus to the previously active element when the overlay closes.
 * @param {HTMLElement} overlay - The full-screen overlay element.
 * @param {HTMLElement} card    - The modal card containing focusable children.
 */
function initFocusTrap(overlay, card) {
  let prevActiveElement = null;

  const getFocusableElements = () => {
    return Array.from(card.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.hasAttribute('disabled') && el.style.display !== 'none');
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      const cancelBtn = overlay.querySelector('.btn-secondary, #guest-cancel-btn, #ob-prev-btn');
      if (cancelBtn && !cancelBtn.hasAttribute('disabled') && overlay.style.display !== 'none' && !overlay.classList.contains('hidden')) {
        cancelBtn.click();
      } else if (overlay.id === 'guest-login-overlay') {
        overlay.style.display = 'none';
        if (prevActiveElement) prevActiveElement.focus();
      }
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      
      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
  };

  const observer = new MutationObserver(() => {
    const isVisible = (overlay.style.display !== 'none' && !overlay.classList.contains('hidden'));
    if (isVisible) {
      prevActiveElement = document.activeElement;
      overlay.addEventListener('keydown', handleKeydown);
      setTimeout(() => {
        card.focus();
        const focusables = getFocusableElements();
        if (focusables.length > 0) {
          focusables[0].focus();
        }
      }, 50);
    } else {
      overlay.removeEventListener('keydown', handleKeydown);
      if (prevActiveElement) {
        prevActiveElement.focus();
        prevActiveElement = null;
      }
    }
  });

  observer.observe(overlay, { attributes: true, attributeFilter: ['style', 'class'] });

  const isVisible = (overlay.style.display !== 'none' && !overlay.classList.contains('hidden'));
  if (isVisible) {
    prevActiveElement = document.activeElement;
    overlay.addEventListener('keydown', handleKeydown);
    card.focus();
  }
}

// Onboarding logic
function initOnboarding() {
  const nextBtn = document.getElementById('ob-next-btn');
  const prevBtn = document.getElementById('ob-prev-btn');
  const overlay = document.getElementById('onboarding-overlay');
  const card = document.getElementById('onboarding-card');
  
  if (overlay && card) {
    initFocusTrap(overlay, card);
  }
  
  nextBtn.addEventListener('click', () => {
    // Save current step data
    onboardingSteps[currentStep].save();
    
    if (currentStep < onboardingSteps.length - 1) {
      currentStep++;
      renderStep(currentStep);
    } else {
      // Complete Onboarding
      state.onboarded = true;
      setupDefaultHabits();
      setupDefaultTreeHistory();
      saveState();
      
      document.getElementById('onboarding-overlay').classList.add('hidden');
      refreshDashboard();
      
      // Send onboarding completion message in chat
      sendSystemGreeting();
    }
  });
  
  prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      renderStep(currentStep);
    }
  });
}

function renderStep(stepIndex) {
  currentStep = stepIndex;
  const step = onboardingSteps[stepIndex];
  
  const progressText = document.getElementById('ob-progress');
  const container = document.getElementById('ob-question-container');
  const prevBtn = document.getElementById('ob-prev-btn');
  const nextBtn = document.getElementById('ob-next-btn');
  
  progressText.textContent = `Step ${stepIndex + 1} of ${onboardingSteps.length}`;
  
  container.innerHTML = `
    <h2 class="ob-step-title" id="ob-step-title">${step.title}</h2>
    <p class="ob-step-desc" id="ob-step-desc">${step.desc}</p>
    <div class="ob-question-content">${step.html}</div>
  `;
  
  // Initialize step-specific event listeners
  step.init();
  
  // Navigation states
  prevBtn.disabled = stepIndex === 0;
  nextBtn.textContent = stepIndex === onboardingSteps.length - 1 ? "Get Started" : "Next";
}

function setupDefaultHabits() {
  const p = state.profile;
  // Filter templates that are applicable based on user selections
  const habits = HABITS_TEMPLATE.filter(habit => {
    if (habit.category === 'transport') {
      return habit.applicable.includes(p.transportMode);
    }
    if (habit.category === 'food') {
      return habit.applicable.includes(p.dietType);
    }
    if (habit.category === 'energy') {
      return habit.applicable.includes(p.energySource);
    }
    if (habit.category === 'consumption') {
      return habit.applicable.includes(p.shoppingHabit);
    }
    return true; // waste is standard
  }).map(h => ({
    id: h.id,
    text: h.text,
    impact: h.impact,
    category: h.category,
    checked: false
  }));
  
  state.habits = habits;
}

/**
 * Re-render the entire dashboard UI from the current application state.
 * Updates stat cards, progress bar, pie chart, habits list, and history log.
 * Should be called any time state.logs, state.habits, or state.profile changes.
 */
function refreshDashboard() {
  const p = state.profile;
  const weeklyBaseline    = p.baselineAnnual / WEEKS_PER_YEAR;
  const weeklySustainable = WEEKLY_SUSTAINABLE_KG; // ANNUAL_SUSTAINABLE_TARGET_KG / 52 ≈ 38.46

  // Update baseline stat card
  document.getElementById('stat-baseline').textContent = `${Math.round(p.baselineAnnual).toLocaleString()} kg`;

  const regionalAvg = COUNTRY_AVERAGES[p.location] || COUNTRY_AVERAGES.GL;
  const compareAvg  = Math.round((p.baselineAnnual / regionalAvg) * 100);
  document.getElementById('stat-country-compare').innerHTML =
    `<strong>${compareAvg}%</strong> of ${COUNTRY_NAMES[p.location] || 'Global'} Avg`;

  // Accumulate logged totals by category
  let transportTotal   = 0;
  let energyTotal      = 0;
  let foodTotal        = 0;
  let consumptionTotal = 0;
  let travelTotal      = 0;
  let wasteTotal       = 0;

  state.logs.forEach(log => {
    // Only count logs in current weekly window
    const val = parseFloat(log.co2);
    if (log.category === 'Transport') transportTotal += val;
    else if (log.category === 'Energy') energyTotal += val;
    else if (log.category === 'Food') foodTotal += val;
    else if (log.category === 'Consumption') consumptionTotal += val;
    else if (log.category === 'Travel') travelTotal += val;
    else if (log.category === 'Waste') wasteTotal += val;
  });
  
  // Running weekly logged total
  const loggedTotal = transportTotal + energyTotal + foodTotal + consumptionTotal + travelTotal + wasteTotal;
  document.getElementById('stat-weekly-total').textContent = `${loggedTotal.toFixed(1)} kg`;
  
  // Budget progress bar calculations
  // Max progress bar domain (sustainable target vs actual baseline)
  const maxWeeklyBudgetDomain = Math.max(weeklyBaseline, 60);
  document.getElementById('weekly-max-lbl').textContent = `${Math.round(maxWeeklyBudgetDomain)} kg`;
  
  const loggedPercentage = Math.min((loggedTotal / maxWeeklyBudgetDomain) * 100, 100);
  const progressFill = document.getElementById('weekly-budget-progress');
  progressFill.style.width = `${loggedPercentage}%`;
  progressFill.setAttribute('aria-valuenow', Math.round(loggedPercentage));
  progressFill.setAttribute('aria-label', `Weekly carbon budget: ${Math.round(loggedPercentage)}% used`);
  
  // Position the sustainable marker
  const markerPos = (weeklySustainable / maxWeeklyBudgetDomain) * 100;
  const sustainableMarker = document.getElementById('sustainable-marker');
  sustainableMarker.style.left = `${markerPos}%`;
  
  const percentOfSustainable = Math.round((loggedTotal / weeklySustainable) * 100);
  document.getElementById('progress-percentage-text').textContent = `${percentOfSustainable}% of Sustainable Target`;
  
  if (loggedTotal > weeklySustainable) {
    progressFill.style.background = 'linear-gradient(90deg, #34d399, var(--color-travel))';
  } else {
    progressFill.style.background = 'linear-gradient(90deg, #34d399, var(--primary))';
  }
  
  // Calculate habits saving
  let habitsSavings = 0;
  state.habits.forEach(h => {
    if (h.checked) habitsSavings += h.impact;
  });
  
  document.getElementById('stat-savings').textContent = `${habitsSavings.toFixed(1)} kg`;
  
  const weeklyGoalSavingsTarget = weeklyBaseline * (p.reductionGoal / 100);
  const goalPercentage = weeklyGoalSavingsTarget > 0
    ? Math.round((habitsSavings / weeklyGoalSavingsTarget) * 100)
    : 0;
  document.getElementById('stat-savings-percentage').textContent = `${goalPercentage}% of weekly goal (${weeklyGoalSavingsTarget.toFixed(1)} kg)`;
  
  // Update donut chart
  document.getElementById('donut-total').textContent = loggedTotal.toFixed(1);
  
  const breakdownVals = {
    transport: transportTotal,
    energy: energyTotal,
    food: foodTotal,
    consumption: consumptionTotal,
    travel: travelTotal,
    waste: wasteTotal
  };
  
  // Set label values
  document.getElementById('lbl-val-transport').textContent = `${transportTotal.toFixed(1)} kg`;
  document.getElementById('lbl-val-energy').textContent = `${energyTotal.toFixed(1)} kg`;
  document.getElementById('lbl-val-food').textContent = `${foodTotal.toFixed(1)} kg`;
  document.getElementById('lbl-val-consumption').textContent = `${consumptionTotal.toFixed(1)} kg`;
  document.getElementById('lbl-val-travel').textContent = `${travelTotal.toFixed(1)} kg`;
  document.getElementById('lbl-val-waste').textContent = `${wasteTotal.toFixed(1)} kg`;
  
  // Render Google Chart
  if (window.googleChartsLoaded) {
    drawGoogleChart(transportTotal, energyTotal, foodTotal, consumptionTotal, travelTotal, wasteTotal);
  }
  
  // Render Habits checklist
  renderHabitsList();
  
  // Render History lists
  renderHistoryList();

  // Update 3D Ecosystem Tree
  if (window.ecosystem3D && !window.ecosystem3D.isSimulator) {
    const calculatedHealth = Math.max(0.0, 1.0 - (loggedTotal / ECOSYSTEM_HEALTH_SCALE));
    window.ecosystem3D.updateEcosystem(calculatedHealth, loggedTotal);
    updateTodayTreeHistory(calculatedHealth);
    updateHumanLifespan(loggedTotal);
    updatePlanetaryProjection(loggedTotal);
  } else if (window.ecosystem3D && window.ecosystem3D.isSimulator) {
    // Keep lifespan/projection updated with the simulator's current value
    updateHumanLifespan(window.ecosystem3D.currentCo2);
    updatePlanetaryProjection(window.ecosystem3D.currentCo2);
  }
}

function renderHabitsList() {
  const container = document.getElementById('habits-list-container');
  container.innerHTML = '';
  
  let checkedCount = 0;
  
  state.habits.forEach(h => {
    if (h.checked) checkedCount++;
    
    const card = document.createElement('div');
    card.className = `habit-card ${h.checked ? 'checked' : ''}`;
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'checkbox');
    card.setAttribute('aria-checked', h.checked ? 'true' : 'false');
    card.setAttribute('aria-label', `${h.text}, saves ${h.impact} kg CO₂e weekly`);
    
    card.innerHTML = `
      <div class="habit-checkbox" aria-hidden="true"></div>
      <span class="habit-text">${h.text}</span>
      <span class="habit-impact">-${h.impact} kg</span>
    `;
    
    const toggleHabit = () => {
      h.checked = !h.checked;
      saveState();
      refreshDashboard();
      
      if (h.checked) {
        appendAssistantMessage(`🌱 Awesome choice! By completing: <em>"${h.text}"</em>, you've saved **${h.impact} kg CO₂e** this week!`);
      }
    };
    
    card.addEventListener('click', toggleHabit);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleHabit();
      }
    });
    
    container.appendChild(card);
  });
  
  document.getElementById('habits-completed-summary').textContent = `${checkedCount} of ${state.habits.length} active`;
}

/**
 * Render the paginated activity history list from state.logs.
 * Displays entries newest-first, each with a delete button that removes
 * the log from both state and the server database.
 */
function renderHistoryList() {
  const container = document.getElementById('history-list-container');
  const emptyText  = document.getElementById('empty-history-text');

  // Remove existing items (except the empty-state placeholder)
  container.querySelectorAll('.history-item').forEach(i => i.remove());

  document.getElementById('logs-count').textContent = `${state.logs.length} items logged`;

  if (state.logs.length === 0) {
    emptyText.style.display = 'block';
    return;
  }

  emptyText.style.display = 'none';

  // Render starting with newest
  state.logs.slice().reverse().forEach(log => {
    const date    = new Date(log.timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const catColor = getCategoryColor(log.category);
    const co2Sign  = log.co2 >= 0 ? '+' : '';

    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.logId = log.id;

    item.innerHTML = `
      <div class="history-meta">
        <span class="history-name">${escapeHtml(log.description)}</span>
        <span class="history-date">${timeStr} • ${escapeHtml(log.category)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="history-value-badge" style="background: rgba(255,255,255,0.03); color: ${catColor}; border: 1px solid ${catColor}40;">
          ${co2Sign}${log.co2.toFixed(1)} kg
        </span>
        <button
          class="history-delete-btn"
          aria-label="Delete log entry: ${escapeHtml(log.description)}"
          title="Delete this log entry"
          style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:0.85rem; padding:2px 5px; border-radius:4px; transition:color 0.15s;"
        >✕</button>
      </div>
    `;

    // Delete handler
    item.querySelector('.history-delete-btn').addEventListener('click', () => {
      const logId = log.id;
      state.logs = state.logs.filter(l => l.id !== logId);
      saveState();
      refreshDashboard();
      // Best-effort server sync
      const userId = (state.google_user && state.google_user.name) || 'guest';
      fetch(`/api/logs?userId=${encodeURIComponent(userId)}&logId=${encodeURIComponent(logId)}`,
        { method: 'DELETE' }
      ).catch(() => {});
    });

    container.appendChild(item);
  });
}

// Initial Greeting Message from Chatbot
/**
 * Send the initial welcome message in the chat panel after successful onboarding.
 * Summarises the calculated annual baseline, country comparison, weekly budget,
 * and encourages the user to start logging activities.
 */
function sendSystemGreeting() {
  const p = state.profile;
  const weeklyTarget = (p.baselineAnnual / 52) * (1 - p.reductionGoal / 100);
  
  const greetMsg = `
    🎉 <strong>Welcome to DeCarbonizer!</strong><br><br>
    I have calculated your annual baseline carbon footprint at <strong>${Math.round(p.baselineAnnual).toLocaleString()} kg CO₂e</strong>.<br>
    • Your country's average is ~${Math.round(COUNTRY_AVERAGES[p.location]).toLocaleString()} kg.<br>
    • The global sustainable target is <strong>2,000 kg</strong> per year.<br><br>
    With your <strong>${p.reductionGoal}%</strong> reduction goal, your target weekly budget is <strong>${weeklyTarget.toFixed(1)} kg CO₂e</strong>.<br><br>
    🌱 <em>Let's work together to reach it! Check out your custom habits list on the dashboard, or type what you did today (e.g., "I drove 25 km") to start tracking.</em>
  `;
  appendAssistantMessage(greetMsg);
}

/**
 * Initialise the main application chat console.
 * Binds the send button, Enter-key shortcut, quick-log badge clicks,
 * reset button, and shows the appropriate greeting message.
 */
function initMainApp() {
  const sendBtn = document.getElementById('chat-send-btn');
  const inputField = document.getElementById('chat-input-field');
  const resetBtn = document.getElementById('reset-profile-btn');
  
  // Reset onboarding
  resetBtn.addEventListener('click', () => {
    if (confirm("Reset profile and re-run onboarding? This clears your logs and history.")) {
      localStorage.removeItem('decarbonizer_state');
      state = {
        onboarded: false,
        profile: { location: 'GL', householdSize: 1, transportMode: 'gas_medium', weeklyKm: 50, dietType: 'meat_average', energySource: 'grid', monthlyFlights: 0, shoppingHabit: 'average', baselineAnnual: 4700, reductionGoal: 15 },
        logs: [],
        habits: []
      };
      saveState();
      
      // Reset Google Profile UI
      const profileContainer = document.getElementById('google-user-profile');
      const signInBtn = document.getElementById('google-signin-btn-container');
      const guestBtn = document.getElementById('guest-login-btn');
      const emojiSpan = document.getElementById('guest-avatar-emoji');
      if (profileContainer) profileContainer.style.display = 'none';
      if (signInBtn) signInBtn.style.display = 'block';
      if (guestBtn) guestBtn.style.display = 'block';
      if (emojiSpan) emojiSpan.remove();
      
      // Clear backend database
      const userId = (state.google_user && state.google_user.name) || 'guest';
      fetch(`/api/reset?userId=${encodeURIComponent(userId)}`, { method: 'POST' }).catch(() => {});

      // Clear chat
      document.getElementById('chat-messages-container').innerHTML = '';
      currentStep = 0;
      document.getElementById('onboarding-overlay').classList.remove('hidden');
      renderStep(0);
    }
  });

  // Send message events
  sendBtn.addEventListener('click', handleUserSendMessage);
  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleUserSendMessage();
  });
  
  // Quick log badge clicks & keyboard accessibility
  const badges = document.querySelectorAll('.quick-log-badge');
  badges.forEach(badge => {
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('role', 'button');
    const triggerLog = () => {
      inputField.value = badge.dataset.log;
      handleUserSendMessage();
    };
    badge.addEventListener('click', triggerLog);
    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerLog();
      }
    });
  });

  // If already onboarded, send welcome back or initial messages
  if (state.onboarded && state.logs.length === 0) {
    sendSystemGreeting();
  } else if (state.onboarded) {
    appendAssistantMessage(`👋 Welcome back to DeCarbonizer! You have logged <strong>${state.logs.length}</strong> activities this week. What green choice did you make today?`);
  }
}

/**
 * Read, trim and dispatch the user's chat input message.
 * Clears the input field and delegates to `processActivityLog` after a brief
 * UI delay so the user message bubble renders first.
 */
function handleUserSendMessage() {
  const inputField = document.getElementById('chat-input-field');
  const query = inputField.value.trim();
  if (!query) return;
  
  // Append user message
  appendUserMessage(query);
  inputField.value = '';
  
  // Show parsing / processing state briefly
  setTimeout(() => {
    processActivityLog(query);
  }, 400);
}

/**
 * Append a user chat bubble to the message list.
 * Input is HTML-escaped before rendering to prevent XSS.
 * @param {string} text - Raw plaintext message from the user.
 */
function appendUserMessage(text) {
  const container = document.getElementById('chat-messages-container');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message user';
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  msgDiv.innerHTML = `
    <div class="bubble">${escapeHtml(text)}</div>
    <span class="msg-time">${time}</span>
  `;
  
  container.appendChild(msgDiv);
  scrollToBottom();
}

/**
 * Append an assistant response bubble to the message list.
 * Supports a safe subset of Markdown: **bold** and *italic*.
 * The HTML is trusted (assistant-generated), not user-supplied.
 * @param {string} html - HTML content for the assistant bubble.
 */
function appendAssistantMessage(html) {
  const container = document.getElementById('chat-messages-container');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message assistant';
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Standard format formatting markdown-like elements
  let formattedHtml = html
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
    
  msgDiv.innerHTML = `
    <div class="bubble">${formattedHtml}</div>
    <span class="msg-time">${time}</span>
  `;
  
  container.appendChild(msgDiv);
  scrollToBottom();
}

/**
 * Scroll the chat messages container to its most recent message.
 */
function scrollToBottom() {
  const container = document.getElementById('chat-messages-container');
  container.scrollTop = container.scrollHeight;
}

/**
 * Escape HTML special characters to prevent XSS injection.
 * @param {string} text - Raw user-supplied string.
 * @returns {string} HTML-safe escaped string.
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/**
 * Parse a natural-language activity description, extract its carbon
 * footprint value, log it to the state, and reply with contextual tips.
 * @param {string} text - Raw chat message from the user.
 */
function processActivityLog(text) {
  const query = text.toLowerCase();
  
  // 0. WEEKLY SUMMARY REQUEST
  if (query.includes('weekly') || query.includes('summary') || query.includes('report')) {
    let totals = {
      Transport: 0,
      Energy: 0,
      Food: 0,
      Consumption: 0,
      Travel: 0,
      Waste: 0
    };
    
    state.logs.forEach(log => {
      if (totals[log.category] !== undefined) {
        totals[log.category] += log.co2;
      }
    });
    
    const loggedTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    
    // If no logs, estimate based on baseline profile to give an insightful starter report
    let isBaselineReport = false;
    if (loggedTotal === 0) {
      isBaselineReport = true;
      const p = state.profile;
      
      const transFactor = EMISSION_FACTORS.transport[p.transportMode] || 0.18;
      totals.Transport = (p.weeklyKm * transFactor);
      
      const dietFactor = EMISSION_FACTORS.diet[p.dietType] || EMISSION_FACTORS.diet.meat_average;
      totals.Food = dietFactor * 7;
      
      totals.Energy = (EMISSION_FACTORS.energy[p.energySource] || 140) * 12 / 52;
      totals.Travel = p.monthlyFlights * 12 * EMISSION_FACTORS.flights.average / 52;
      totals.Consumption = (EMISSION_FACTORS.shopping[p.shoppingHabit] || 55) * 12 / 52;
      totals.Waste = EMISSION_FACTORS.waste.standard * 12 / 52;
    }
    
    // Find top category
    let topCat = 'Food';
    let maxVal = -1;
    Object.keys(totals).forEach(cat => {
      if (totals[cat] > maxVal) {
        maxVal = totals[cat];
        topCat = cat;
      }
    });
    
    const totalWeekly = Object.values(totals).reduce((a, b) => a + b, 0);
    
    // Build 3 ranked reduction habits from user's current habits list
    // Sort habits by impact descending
    const sortedHabits = [...state.habits]
      .filter(h => !h.checked)
      .sort((a, b) => b.impact - a.impact);
      
    let actionsHtml = '';
    const top3 = sortedHabits.slice(0, 3);
    
    if (top3.length > 0) {
      top3.forEach((h, index) => {
        actionsHtml += `${index + 1}. **${h.text}** (Saves ~${h.impact} kg CO₂e/wk)<br>`;
      });
    } else {
      actionsHtml = "You've already activated all suggested reduction actions! Amazing job! 🌿<br>";
    }
    
    // Relatable framing
    let framingText = '';
    if (topCat === 'Food') {
      framingText = "Skipping beef once a week saves ~2.5 kg CO₂e — equal to driving 12 km.";
    } else if (topCat === 'Transport') {
      framingText = "Taking public transit instead of driving 30 km saves ~5.4 kg CO₂e — equal to planting 0.3 trees.";
    } else if (topCat === 'Energy') {
      framingText = "Washing clothes in cold water saves ~3.5 kg CO₂e — equal to powering a smartphone for a year!";
    } else {
      framingText = "Buying secondhand instead of new saves ~10.3 kg CO₂e — equal to charging 1,200 smartphones!";
    }
    
    const summaryMsg = `
      📊 <strong>EcoTrack Weekly Carbon Summary</strong><br>
      \${isBaselineReport ? '*(Estimated based on your onboarding profile baseline)*' : '*(Calculated from your logged activities this week)*'}<br><br>
      • **Total weekly footprint:** ${totalWeekly.toFixed(1)} kg CO₂e<br>
      • **Top emission driver:** ${topCat} (${totals[topCat].toFixed(1)} kg CO₂e)<br><br>
      💡 **Relatable Insight:**<br>
      ${framingText}<br><br>
      🎯 **Top 3 Recommended Actions to Reduce Impact:**<br>
      ${actionsHtml}<br>
      <em>Tip: You can activate these actions directly in your dashboard Checklist on the left!</em>
    `;
    
    appendAssistantMessage(summaryMsg);
    return;
  }

  // Log metadata variables
  let category = '';
  let description = '';
  let co2 = 0;
  let tip = '';
  
  // Helper to extract first number from query
  const numMatch  = query.match(/(\d+(?:\.\d+)?)/);
  const numberVal = numMatch ? parseFloat(numMatch[1]) : null;

  // 1. TRANSPORT PARSE
  if (
    query.includes('drive') || query.includes('drove') || query.includes('car') ||
    query.includes('km') || query.includes('mile') || query.includes('travelled') ||
    query.includes('transit') || query.includes('bus') || query.includes('train') ||
    query.includes('commut') || query.includes('cycled') || query.includes('biked') ||
    query.includes('walked to') || query.includes('subway') || query.includes('tram')
  ) {
    category = 'Transport';
    let distanceKm = numberVal || 15; // default 15 km if no distance provided

    // Convert miles to km if the user specified miles
    if (query.includes('mile')) {
      distanceKm = distanceKm * KM_PER_MILE;
    }

    let factorName = state.profile.transportMode;
    let descMode   = 'gas car';

    if (query.includes('electric') || query.includes('ev')) {
      factorName = 'electric';
      descMode   = 'Electric vehicle';
    } else if (query.includes('hybrid')) {
      factorName = 'hybrid';
      descMode   = 'Hybrid vehicle';
    } else if (
      query.includes('bus') || query.includes('train') || query.includes('transit') ||
      query.includes('subway') || query.includes('tram') || query.includes('commuted by')
    ) {
      factorName = 'transit';
      descMode   = 'Public Transit';
    } else if (
      query.includes('walk') || query.includes('bike') || query.includes('cycl') ||
      query.includes('biked') || query.includes('cycled to')
    ) {
      factorName = 'walking_cycling';
      descMode   = 'Biking/Walking';
    } else {
      // Fall back to the user's onboarding transport mode
      if (factorName.includes('suv'))      descMode = 'SUV gas car';
      else if (factorName.includes('medium'))   descMode = 'gasoline car';
      else if (factorName.includes('hybrid'))   descMode = 'Hybrid vehicle';
      else if (factorName.includes('electric')) descMode = 'Electric vehicle';
    }

    const factor = EMISSION_FACTORS.transport[factorName] || EMISSION_FACTORS.transport.gas_medium;
    co2 = distanceKm * factor;
    description = `Drove ${Math.round(distanceKm)} km in ${descMode}`;

    if (factorName === 'walking_cycling') {
      tip = "Beautiful choice! Biking or walking has a zero-carbon impact. You saved about **3.3 kg CO₂e** compared to driving this distance in a medium gas car.";
    } else if (factorName === 'transit') {
      tip = "Great decision! Taking public transit emits up to 80% less carbon than driving alone. Keep it up!";
    } else {
      const savings = distance * (EMISSION_FACTORS.transport.gas_medium - EMISSION_FACTORS.transport.transit);
      tip = `Driving is carbon-intensive. Next time, could you take transit? Swap this trip to public transit to save **${savings.toFixed(1)} kg CO₂e**!`;
    }
  }
  
  // 2. DIET / FOOD PARSE
  else if (
    query.includes('burger') || query.includes('beef') || query.includes('steak') ||
    query.includes('meat') || query.includes('chicken') || query.includes('pork') ||
    query.includes('salad') || query.includes('vegan') || query.includes('vegetarian') ||
    query.includes('ate') || query.includes('had') || query.includes('lunch') ||
    query.includes('dinner') || query.includes('meal') || query.includes('pizza') ||
    query.includes('pasta') || query.includes('ordered') || query.includes('takeaway') ||
    query.includes('takeout') || query.includes('sushi') || query.includes('kebab')
  ) {
    category = 'Food';

    if (query.includes('beef') || query.includes('steak') || query.includes('hamburger') || query.includes('burger')) {
      co2 = EMISSION_FACTORS.meals.beef;
      description = 'Beef burger meal';
      tip = 'Beef has the highest carbon footprint of any food (30× more than tofu). Swapping beef for chicken saves **2.3 kg CO₂e**—equal to driving 12 km!';
    } else if (
      query.includes('chicken') || query.includes('pork') || query.includes('fish') ||
      query.includes('poultry') || (query.includes('meat') && !query.includes('no meat'))
    ) {
      co2 = EMISSION_FACTORS.meals.chicken;
      description = 'Meat/Chicken meal';
      tip = 'Poultry is much better than red meat. Consider a vegetarian alternative next time to save an extra **0.4 kg CO₂e**.';
    } else if (
      query.includes('vegan') || query.includes('plant-based') || query.includes('tofu') ||
      (query.includes('salad') && !query.includes('chicken'))
    ) {
      co2 = EMISSION_FACTORS.meals.vegan;
      description = 'Vegan plant-based meal';
      tip = 'Wonderful green selection! Plant-based meals have the lowest impact. You saved approximately **2.9 kg CO₂e** compared to a beef meal!';
    } else if (
      query.includes('vegetarian') || query.includes('veg') || query.includes('cheese') ||
      query.includes('pizza') || query.includes('pasta') || query.includes('eggs') ||
      query.includes('sushi') || query.includes('kebab')
    ) {
      co2 = EMISSION_FACTORS.meals.vegetarian;
      description = 'Vegetarian/Mixed meal';
      tip = 'Great choice! Reducing red meat is one of the most effective personal climate actions you can take.';
    } else {
      co2 = EMISSION_FACTORS.meals.average;
      description = 'Standard meal';
      tip = 'Every meal choice counts. Emphasizing beans, grains, and greens keeps your footprint low!';
    }
  }

  // 3. CONSUMPTION / SHOPPING PARSE
  else if (
    query.includes('bought') || query.includes('purchase') || query.includes('jacket') ||
    query.includes('shoes') || query.includes('shirt') || query.includes('clothes') ||
    query.includes('shopping') || query.includes('jeans') || query.includes('furniture') ||
    query.includes('phone') || query.includes('computer') || query.includes('laptop') ||
    query.includes('sofa') || query.includes('desk') || query.includes('appliance')
  ) {
    category = 'Consumption';

    if (query.includes('secondhand') || query.includes('thrifted') || query.includes('used') || query.includes('thrift')) {
      co2 = EMISSION_FACTORS.purchases.secondhand_clothing;
      description = 'Secondhand clothing item';
      tip = 'Secondhand is spectacular! It prevents production and shipping emissions, saving over **10 kg CO₂e** compared to a new clothing item.';
    } else if (
      query.includes('phone') || query.includes('computer') || query.includes('laptop') ||
      query.includes('electronics') || query.includes('tv') || query.includes('appliance')
    ) {
      co2 = EMISSION_FACTORS.purchases.electronics;
      description = 'New electronics purchase';
      tip = 'Electronics require massive manufacturing footprints. Maximise the lifespan of your devices and recycle them responsibly when they break.';
    } else if (
      query.includes('furniture') || query.includes('chair') || query.includes('table') ||
      query.includes('sofa') || query.includes('desk')
    ) {
      co2 = EMISSION_FACTORS.purchases.furniture;
      description = 'New furniture piece';
      tip = 'Thrifting vintage furniture is a stylish, sustainable alternative that saves carbon and wood resources.';
    } else if (
      query.includes('jacket') || query.includes('shoes') || query.includes('shirt') ||
      query.includes('clothes') || query.includes('jeans')
    ) {
      co2 = EMISSION_FACTORS.purchases.new_clothing;
      description = 'New clothing purchase';
      tip = 'Fast fashion has high water and carbon impacts. Try buying high-quality, durable garments or shopping secondhand.';
    } else {
      co2 = EMISSION_FACTORS.purchases.miscellaneous;
      description = 'New item purchase';
      tip = 'Before buying, ask yourself: do I really need this new item, or can I rent, repair, or buy it secondhand?';
    }
  }

  // 4. TRAVEL / FLIGHT PARSE
  else if (query.includes('flight') || query.includes('flew') || query.includes('plane') || query.includes('flying')) {
    category = 'Travel';
    
    if (query.includes('long') || query.includes('long-haul') || query.includes('cross-country') || (numberVal && numberVal > 4)) {
      co2 = EMISSION_FACTORS.flights.long_haul;
      description = "Long-haul flight";
      tip = "Long flights emit massive carbon volumes in a single block. Consider carbon offsets or choosing video calls for business meetings.";
    } else if (query.includes('short') || query.includes('short-haul') || (numberVal && numberVal <= 4)) {
      co2 = EMISSION_FACTORS.flights.short_haul;
      description = "Short-haul flight";
      tip = "For distances under 500 km, taking a high-speed train instead of a flight reduces emissions by **90%**!";
    } else {
      co2 = EMISSION_FACTORS.flights.average;
      description = "Flight logged";
      tip = "Reducing flight frequency is the single fastest way to shrink a large individual carbon footprint.";
    }
  }

  // 5. WASTE / RECYCLING PARSE
  else if (query.includes('recycle') || query.includes('recycled') || query.includes('compost') || query.includes('trash') || query.includes('waste')) {
    category = 'Waste';
    
    if (query.includes('recycle') || query.includes('recycled') || query.includes('compost')) {
      co2 = 0.5; // low processing cost
      description = "Recycling and composting bin";
      tip = "Awesome job sorting waste! Composting organic waste prevents methane emissions (a greenhouse gas 28x more potent than CO2) in landfills.";
    } else {
      co2 = 2.0;
      description = "General trash bag";
      tip = "Minimizing landfill waste is key. Try avoiding single-use plastics and packaging whenever possible.";
    }
  }
  
  // 6. ENERGY PARSE
  else if (query.includes('electricity') || query.includes('heater') || query.includes('ac') || query.includes('air conditioning') || query.includes('power') || query.includes('energy') || query.includes('wash') || query.includes('dryer')) {
    category = 'Energy';
    co2 = numberVal ? numberVal * 0.4 : 3.0; // Estimate ~3kg per log
    description = "Home energy usage log";
    tip = "Setting thermostats just 1°C lower can reduce heating/cooling energy consumption by up to 10%!";
  }

  // 7. FALLBACK PARSING
  else {
    // We couldn't recognize it automatically
    const fallbackMsgs = [
      `🤔 I couldn't quite parse the carbon impact of that activity. Could you clarify it? For example:
       • <em>"I drove 20 km"</em>
       • <em>"had a beef burger"</em>
       • <em>"bought a secondhand jacket"</em>
       
       Alternatively, click any of the **Quick Action Buttons** below the chat box to log standard activities directly!`,
       `I want to make sure I log this accurately! Is this related to:
       🚗 **Transport** (e.g. driving distance),
       🍔 **Food** (e.g. meat vs vegetarian meal),
       🛍️ **Shopping** (e.g. buying clothing/tech),
       or ⚡ **Energy**? 
       
       Please specify so I can add it to your dashboard.`
    ];
    appendAssistantMessage(fallbackMsgs[Math.floor(Math.random() * fallbackMsgs.length)]);
    return;
  }
  
  // Add log to state
  const newLog = {
    id: 'log_' + Date.now(),
    category: category,
    description: description,
    co2: co2,
    timestamp: new Date().toISOString()
  };
  
  state.logs.push(newLog);
  saveState();
  refreshDashboard();
  persistLogToServer(newLog);
  
  // Render Assistant validation response
  const co2Sign = co2 >= 0 ? '+' : '';
  const responses = [
    `✔️ **Logged:** *${description}* (${co2Sign}**${co2.toFixed(1)} kg CO₂e**).<br><br>${tip}`,
    `🌍 Saved to category **${category}**: *${description}* (${co2Sign}**${co2.toFixed(1)} kg CO₂e**).<br><br>${tip}`,
    `👍 Got it! *${description}* (${co2Sign}**${co2.toFixed(1)} kg CO₂e**) has been tracked.<br><br>${tip}`
  ];

  // Check milestone thresholds and generate a celebration message if reached
  const milestoneMessage = checkMilestones();
  
  appendAssistantMessage(responses[Math.floor(Math.random() * responses.length)] + milestoneMessage);
}

/**
 * Check whether any milestone thresholds have been newly crossed,
 * trigger the visual pulse animation, and return a celebration message.
 * Called after every activity log is added.
 * @returns {string} An HTML milestone message string, or '' if no milestone reached.
 */
function checkMilestones() {
  let milestoneMessage = '';
  const loggedTotal = state.logs.reduce((acc, curr) => acc + curr.co2, 0);
  void loggedTotal; // suppress unused-variable lint; reserved for future log-total milestones

  let habitsSavings = 0;
  state.habits.forEach(h => { if (h.checked) habitsSavings += h.impact; });

  if (habitsSavings >= 10 && !state.milestone_10kg) {
    state.milestone_10kg = true;
    milestoneMessage = `<br><br>🏆 <strong>Milestone Unlocked!</strong> You have saved your first <strong>10 kg CO₂e</strong> through your habit changes! That's equivalent to planting a new tree seedling growing for 10 years! 🌳 Keep up the fantastic effort!`;
    saveState();
    triggerPulseMilestone();
  }
  return milestoneMessage;
}

/**
 * Trigger a CSS pulse animation on the savings stat card
 * to visually celebrate a milestone achievement.
 */
function triggerPulseMilestone() {
  const savingsCard = document.querySelector('.stats-grid .stat-card:nth-child(3)');
  if (savingsCard) {
    savingsCard.classList.add('pulse-milestone');
    setTimeout(() => savingsCard.classList.remove('pulse-milestone'), 4500);
  }
}

// --- Google Services Integration ---

// Google Charts Loader Setup
window.googleChartsLoaded = false;
if (typeof google !== 'undefined') {
  google.charts.load('current', {'packages':['corechart']});
  google.charts.setOnLoadCallback(() => {
    window.googleChartsLoaded = true;
    if (state.onboarded) {
      refreshDashboard();
    }
  });
}

function drawGoogleChart(trans, energy, food, cons, travel, waste) {
  if (typeof google === 'undefined' || !google.visualization) return;
  
  // Clamp category inputs to zero to prevent negative slice values
  const tVal = Math.max(0, trans);
  const eVal = Math.max(0, energy);
  const fVal = Math.max(0, food);
  const cVal = Math.max(0, cons);
  const trVal = Math.max(0, travel);
  const wVal = Math.max(0, waste);
  
  const hasData = (tVal + eVal + fVal + cVal + trVal + wVal) > 0;
  
  let dataTable;
  if (!hasData) {
    dataTable = google.visualization.arrayToDataTable([
      ['Category', 'CO2e (kg)'],
      ['No Logs Yet', 1]
    ]);
  } else {
    dataTable = google.visualization.arrayToDataTable([
      ['Category', 'CO2e (kg)'],
      ['Transport', tVal],
      ['Energy', eVal],
      ['Food', fVal],
      ['Consumption', cVal],
      ['Travel', trVal],
      ['Waste', wVal]
    ]);
  }
  
  const options = {
    backgroundColor: 'transparent',
    pieHole: 0.65,
    colors: !hasData 
      ? ['rgba(255, 255, 255, 0.05)'] 
      : ['#38bdf8', '#fbbf24', '#f97316', '#c084fc', '#f43f5e', '#94a3b8'],
    legend: 'none',
    pieSliceText: 'none',
    chartArea: {width: '100%', height: '100%', left: 0, top: 0, right: 0, bottom: 0},
    enableInteractivity: hasData,
    tooltip: {
      textStyle: {color: '#f1f5f9', fontName: 'Inter', fontSize: 12},
      showColorCode: true
    }
  };

  const chartContainer = document.getElementById('google-pie-chart');
  if (chartContainer) {
    const chart = new google.visualization.PieChart(chartContainer);
    chart.draw(dataTable, options);
  }
}

// Google Sign-In Callback handler
window.handleCredentialResponse = function(response) {
  try {
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const profileData = JSON.parse(jsonPayload);
    
    state.google_user = {
      name: profileData.name,
      email: profileData.email,
      picture: profileData.picture
    };
    saveState();
    
    showGoogleUser(profileData.name, profileData.picture);
    
    appendAssistantMessage(`👋 Hello **${profileData.name}**! Signed in successfully with your Google Account **${profileData.email}**.`);
  } catch (e) {
    console.error("Error decoding Google JWT credential:", e);
  }
};

function showGoogleUser(name, picture) {
  const profileContainer = document.getElementById('google-user-profile');
  const nameEl = document.getElementById('google-user-name');
  const avatarEl = document.getElementById('google-user-avatar');
  const signInBtn = document.getElementById('google-signin-btn-container');
  const guestBtn = document.getElementById('guest-login-btn');
  
  if (profileContainer && nameEl && avatarEl) {
    nameEl.textContent = name.split(' ')[0]; // Use first name
    
    // Check if dynamic picture is a URL
    if (picture.startsWith('http') || picture.startsWith('data:')) {
      avatarEl.src = picture;
      avatarEl.style.display = 'block';
      const emojiSpan = document.getElementById('guest-avatar-emoji');
      if (emojiSpan) emojiSpan.remove();
    } else {
      // Emoji representation
      avatarEl.style.display = 'none';
      let emojiSpan = document.getElementById('guest-avatar-emoji');
      if (!emojiSpan) {
        emojiSpan = document.createElement('span');
        emojiSpan.id = 'guest-avatar-emoji';
        emojiSpan.style.fontSize = '1.35rem';
        emojiSpan.style.lineHeight = '1';
        profileContainer.insertBefore(emojiSpan, nameEl);
      }
      emojiSpan.textContent = picture;
    }
    
    profileContainer.style.display = 'flex';
    if (signInBtn) signInBtn.style.display = 'none';
    if (guestBtn) guestBtn.style.display = 'none';
  }
}

function initGoogleServices() {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    setTimeout(initGoogleServices, 300);
    return;
  }
  
  google.accounts.id.initialize({
    client_id: "87654321-mockclientid.apps.googleusercontent.com",
    callback: window.handleCredentialResponse
  });
  
  const signInBtnContainer = document.getElementById("google-signin-btn-container");
  if (signInBtnContainer) {
    google.accounts.id.renderButton(
      signInBtnContainer,
      { theme: "dark", size: "medium", shape: "rectangular" }
    );
  }

  if (state.google_user) {
    showGoogleUser(state.google_user.name, state.google_user.picture);
  }
}

function initGuestLogin() {
  const guestBtn = document.getElementById('guest-login-btn');
  const overlay = document.getElementById('guest-login-overlay');
  const card = document.getElementById('guest-login-card');
  const cancelBtn = document.getElementById('guest-cancel-btn');
  const saveBtn = document.getElementById('guest-save-btn');
  const avatarOptions = document.querySelectorAll('#guest-avatar-selector .avatar-option');
  
  if (!guestBtn || !overlay || !card || !cancelBtn || !saveBtn) return;

  initFocusTrap(overlay, card);
  
  // 1. Toggle visibility
  guestBtn.addEventListener('click', () => {
    overlay.style.display = 'flex';
    const inputName = document.getElementById('guest-input-name');
    if (inputName) inputName.focus();
  });
  
  cancelBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
  });
  
  // 2. Avatar Selection & Keyboard Navigation
  avatarOptions.forEach(opt => {
    opt.setAttribute('role', 'radio');
    opt.setAttribute('aria-checked', opt.classList.contains('selected') ? 'true' : 'false');
    opt.setAttribute('tabindex', '0');
    
    const selectAvatar = () => {
      avatarOptions.forEach(o => {
        o.classList.remove('selected');
        o.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('selected');
      opt.setAttribute('aria-checked', 'true');
    };
    
    opt.addEventListener('click', selectAvatar);
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectAvatar();
      }
    });
  });
  
  // 3. Save Guest Profile
  saveBtn.addEventListener('click', () => {
    const nameVal = document.getElementById('guest-input-name').value.trim() || "EcoHero";
    const selectedOpt = document.querySelector('#guest-avatar-selector .avatar-option.selected');
    const pictureVal = selectedOpt ? selectedOpt.dataset.emoji : "🌳";
    
    state.google_user = {
      name: nameVal,
      picture: pictureVal,
      isGuest: true
    };
    
    saveState();
    showGoogleUser(nameVal, pictureVal);
    overlay.style.display = 'none';
    
    appendAssistantMessage(`👋 Profile updated manually! Welcome, **${nameVal}** ${pictureVal}! Your customized Eco Profile is now active.`);
  });
}

// --- Ecosystem Event Listeners & Integrations ---

/**
 * Wire up mobile tab navigation buttons.
 * Shows the panel corresponding to the active tab and hides the other two,
 * providing a single-column layout on narrow screens.
 */
function initMobileTabs() {
  const tabs = document.querySelectorAll('.mobile-tab-btn');
  const panels = document.querySelectorAll('.mobile-panel');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      
      // Update tab active state and accessibility attributes
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      
      // Toggle panels
      panels.forEach(p => {
        if (p.id === targetId) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
      
      // Resize 3D canvas if switching to the ecosystem panel
      if (targetId === 'ecosystem-panel' && window.ecosystem3D) {
        window.ecosystem3D.onWindowResize();
      }

      // Redraw Google Donut Chart if switching to dashboard panel
      if (targetId === 'dashboard-panel') {
        refreshDashboard();
      }
    });
  });
}

/**
 * Attach click handlers and keyboard shortcuts to the ecosystem action buttons
 * ("Water Tree" and "Cleanse Air") and wire the CO₂ simulator slider.
 */
function initEcosystemEvents() {
  const btnLive = document.getElementById('btn-mode-live');
  const btnSim = document.getElementById('btn-mode-sim');
  const simPanel = document.getElementById('sim-control-panel');
  const simSlider = document.getElementById('sim-co2-slider');
  const simValText = document.getElementById('sim-co2-val');
  const btnWater = document.getElementById('btn-water-tree');
  const btnCleanse = document.getElementById('btn-cleanse-air');
  
  // Sub-tabs
  const btnSubtabVis = document.getElementById('btn-subtab-vis');
  const btnSubtabInsights = document.getElementById('btn-subtab-insights');
  const visContent = document.getElementById('ecosystem-vis-content');
  const insightsContent = document.getElementById('ecosystem-insights-content');
  const modeSelector = document.getElementById('eco-mode-selector-wrapper');

  if (btnSubtabVis && btnSubtabInsights && visContent && insightsContent) {
    btnSubtabVis.addEventListener('click', () => {
      btnSubtabVis.classList.add('active');
      btnSubtabVis.setAttribute('aria-selected', 'true');
      btnSubtabInsights.classList.remove('active');
      btnSubtabInsights.setAttribute('aria-selected', 'false');
      
      visContent.style.display = 'flex';
      insightsContent.style.display = 'none';
      if (modeSelector) modeSelector.style.display = 'flex';
      
      // Resize WebGL canvas
      if (window.ecosystem3D) window.ecosystem3D.onWindowResize();
    });

    btnSubtabInsights.addEventListener('click', () => {
      btnSubtabInsights.classList.add('active');
      btnSubtabInsights.setAttribute('aria-selected', 'true');
      btnSubtabVis.classList.remove('active');
      btnSubtabVis.setAttribute('aria-selected', 'false');
      
      visContent.style.display = 'none';
      insightsContent.style.display = 'flex';
      if (modeSelector) modeSelector.style.display = 'none';
      
      // Render components
      renderTreeHistory();
      
      // Draw line chart
      setTimeout(() => {
        drawGlobalWarmingChart();
      }, 60);
    });
  }

  if (btnLive && btnSim) {
    btnLive.addEventListener('click', () => {
      btnLive.classList.add('active');
      btnLive.setAttribute('aria-checked', 'true');
      btnSim.classList.remove('active');
      btnSim.setAttribute('aria-checked', 'false');
      if (simPanel) simPanel.style.display = 'none';
      if (window.ecosystem3D) {
        window.ecosystem3D.isSimulator = false;
        // Sync back to live values
        refreshDashboard();
      }
    });

    btnSim.addEventListener('click', () => {
      btnSim.classList.add('active');
      btnSim.setAttribute('aria-checked', 'true');
      btnLive.classList.remove('active');
      btnLive.setAttribute('aria-checked', 'false');
      if (simPanel) simPanel.style.display = 'block';
      if (window.ecosystem3D) {
        window.ecosystem3D.isSimulator = true;
        // Sync to current slider value
        const val = parseFloat(simSlider.value);
        const simHealth = Math.max(0.0, 1.0 - (val / 100.0));
        window.ecosystem3D.updateEcosystem(simHealth, val);
        updateHumanLifespan(val);
      }
    });
  }

  if (simSlider) {
    simSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (simValText) simValText.textContent = `${val.toFixed(1)} kg`;
      if (window.ecosystem3D && window.ecosystem3D.isSimulator) {
        const simHealth = Math.max(0.0, 1.0 - (val / 100.0));
        window.ecosystem3D.updateEcosystem(simHealth, val);
        updateHumanLifespan(val);
      }
    });
    // Set initial text
    if (simValText) simValText.textContent = `${parseFloat(simSlider.value).toFixed(1)} kg`;
  }

  if (btnWater) {
    btnWater.addEventListener('click', () => {
      if (window.ecosystem3D) {
        window.ecosystem3D.waterTree();
        
        // Log a negative carbon activity representing saving carbon
        const waterLog = {
          id: 'log_' + Date.now(),
          category: 'Waste',
          description: 'Watered and cared for tree ecosystem',
          co2: -2.0, // reduces total weekly carbon
          timestamp: new Date().toISOString()
        };
        
        state.logs.push(waterLog);
        saveState();
        refreshDashboard();
        persistLogToServer(waterLog);
        
        // Add a friendly notification in chat
        appendAssistantMessage("💧 *Water Tree active!* You've completed a watering activity, offsetting **2.0 kg CO₂e** from your weekly emissions tracker! Watch your tree flourish.");
      }
    });
  }

  if (btnCleanse) {
    btnCleanse.addEventListener('click', () => {
      if (window.ecosystem3D) {
        window.ecosystem3D.cleanseAir();
        appendAssistantMessage("🌬️ *Cleanse Air active!* Fresh winds dispel the dark CO₂ smog from the tree landscape. Keep logging green choices to maintain a clean climate!");
      }
    });
  }

  // Load initial weather fetching
  setTimeout(() => {
    fetchLiveWeather();
  }, 800);
}

// --- Daily Tree History Logic ---

function setupDefaultTreeHistory() {
  const history = [];
  const today = new Date();
  
  for (let i = 5; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    let health, status;
    if (i === 5) { health = 0.94; status = 'Pristine'; }
    else if (i === 4) { health = 0.88; status = 'Pristine'; }
    else if (i === 3) { health = 0.72; status = 'Stressed'; }
    else if (i === 2) { health = 0.65; status = 'Stressed'; }
    else { health = 0.84; status = 'Pristine'; }
    
    history.push({
      date: dateStr,
      health: health,
      status: status
    });
  }
  
  state.treeHistory = history;
}

function updateTodayTreeHistory(health) {
  if (!state.treeHistory) state.treeHistory = [];
  
  const todayStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
  const existing = state.treeHistory.find(h => h.date === todayStr);
  
  let status = 'Pristine';
  if (health >= 0.85) status = 'Pristine';
  else if (health >= 0.6) status = 'Stressed';
  else if (health >= 0.3) status = 'Dying';
  else status = 'Decayed';

  if (existing) {
    existing.health = health;
    existing.status = status;
  } else {
    state.treeHistory.push({
      date: todayStr,
      health: health,
      status: status
    });
    if (state.treeHistory.length > 7) {
      state.treeHistory.shift();
    }
  }
  saveState();
  renderTreeHistory();
}

function renderTreeHistory() {
  const container = document.getElementById('tree-history-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!state.treeHistory || state.treeHistory.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:15px 0;">No history logged.</div>';
    return;
  }
  
  state.treeHistory.slice().reverse().forEach(item => {
    const row = document.createElement('div');
    row.className = 'tree-history-item';
    
    let color = 'var(--primary)';
    let bg = 'rgba(16, 185, 129, 0.1)';
    let border = 'rgba(16, 185, 129, 0.2)';
    
    if (item.status === 'Stressed') {
      color = 'var(--color-energy)';
      bg = 'rgba(251, 191, 36, 0.1)';
      border = 'rgba(251, 191, 36, 0.2)';
    } else if (item.status === 'Dying') {
      color = 'var(--color-food)';
      bg = 'rgba(249, 115, 22, 0.1)';
      border = 'rgba(249, 115, 22, 0.2)';
    } else if (item.status === 'Decayed') {
      color = 'var(--color-travel)';
      bg = 'rgba(244, 63, 94, 0.1)';
      border = 'rgba(244, 63, 94, 0.2)';
    }
    
    const pct = Math.round(item.health * 100);
    
    row.innerHTML = `
      <span class="tree-history-date">${item.date}</span>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:1.1rem;">🌳</span>
        <span class="tree-history-health" style="background:${bg}; color:${color}; border:1px solid ${border};">
          Health: ${pct}% (${item.status})
        </span>
      </div>
    `;
    
    container.appendChild(row);
  });
}

// --- Human Lifespan Projector Logic ---

/**
 * Update the Human Lifespan Projector panel based on the weekly logged
 * carbon total. Uses WHO lifespan reference and a linear reduction model.
 * @param {number} loggedTotal - Total kg CO₂e logged this week.
 */
function updateHumanLifespan(loggedTotal) {
  const lifespanValEl = document.getElementById('lifespan-val');
  const offsetEl = document.getElementById('lifespan-offset-lbl');
  const titleEl = document.getElementById('lifespan-status-title');
  const descEl = document.getElementById('lifespan-status-desc');
  const circleEl = document.querySelector('.lifespan-val-circle');
  
  if (!lifespanValEl || !offsetEl || !titleEl || !descEl) return;
  
  let reduction = 0;
  if (loggedTotal > 15.0) {
    reduction = Math.min(20.0, (loggedTotal - 15.0) * 0.12);
  }
  
  const currentLifespan = (BASE_HUMAN_LIFESPAN - reduction).toFixed(1);
  lifespanValEl.textContent = currentLifespan;
  
  if (reduction > 0) {
    offsetEl.textContent = `-${reduction.toFixed(1)} years`;
    offsetEl.style.background = 'rgba(244, 63, 94, 0.1)';
    offsetEl.style.color = 'var(--color-travel)';
  } else {
    offsetEl.textContent = 'Optimal (+0.0)';
    offsetEl.style.background = 'rgba(16, 185, 129, 0.1)';
    offsetEl.style.color = 'var(--primary)';
  }
  
  let statusTitle = 'Optimal Health Condition';
  let statusDesc = 'Your carbon emissions are within sustainable targets. Air purity and planetary heat strain support full life expectancy potential.';
  let themeColor = 'var(--primary)';
  let glowColor = 'var(--primary-glow)';
  
  if (reduction > 10.0) {
    statusTitle = 'Severe Climate Strain';
    statusDesc = 'Critical carbon footprints expose populations to heightened levels of heat stress, air particulate contamination, and resource strain, severely cutting lifespan projections.';
    themeColor = 'var(--color-travel)';
    glowColor = 'rgba(244, 63, 94, 0.3)';
  } else if (reduction > 4.0) {
    statusTitle = 'Moderate Heat & Smog Impact';
    statusDesc = 'Elevated weekly emissions contribute directly to air quality decay and heat stresses, increasing susceptibility to pulmonary and atmospheric strain.';
    themeColor = 'var(--color-food)';
    glowColor = 'rgba(249, 115, 22, 0.3)';
  } else if (reduction > 0.5) {
    statusTitle = 'Mild Environmental Strain';
    statusDesc = 'Slightly exceeding sustainable limits registers minor resource and ecological imbalances, leading to minor negative respiratory offsets over time.';
    themeColor = 'var(--color-energy)';
    glowColor = 'rgba(251, 191, 36, 0.3)';
  }
  
  titleEl.textContent = statusTitle;
  titleEl.style.color = themeColor;
  descEl.textContent = statusDesc;
  
  if (circleEl) {
    circleEl.style.borderColor = themeColor;
    circleEl.style.boxShadow = `0 0 15px ${glowColor}`;
  }
}

// --- Live Geolocation & Weather Controller ---


/**
 * Fetch live weather data for the user's location using the browser Geolocation API.
 * Falls back to a default capital-city coordinate based on the user's country profile
 * if geolocation is denied, unavailable, or times out after 8 seconds.
 */
function fetchLiveWeather() {
  const iconEl = document.getElementById('weather-icon');
  const tempEl = document.getElementById('weather-temp');
  const condEl = document.getElementById('weather-condition');
  
  if (!iconEl || !tempEl || !condEl) return;
  
  const defaults = {
    US: { lat: 38.9072, lon: -77.0369, city: "Washington D.C." },
    UK: { lat: 51.5074, lon: -0.1278, city: "London" },
    EU: { lat: 50.8503, lon: 4.3517, city: "Brussels" },
    IN: { lat: 28.6139, lon: 77.2090, city: "New Delhi" },
    GL: { lat: 46.2044, lon: 6.1432, city: "Geneva" }
  };
  
  const userLoc = state.profile.location || 'GL';
  const def = defaults[userLoc] || defaults.GL;
  
  const successCallback = (position) => {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    getWeatherData(lat, lon, "Your Location");
  };
  
  const errorCallback = (err) => {
    console.warn(`Geolocation failed: ${err.message}. Using default capital coordinate.`);
    getWeatherData(def.lat, def.lon, def.city);
  };
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, { timeout: 8000 });
  } else {
    errorCallback({ message: "Unsupported browser API" });
  }
}

/**
 * Fetch weather data for a specific coordinate from the Open-Meteo API and
 * update the weather widget, Google Maps iframe, and 3D ecosystem scene.
 * @param {number} lat   - Latitude of the target location.
 * @param {number} lon   - Longitude of the target location.
 * @param {string} label - Human-readable location name for the weather widget.
 */
function getWeatherData(lat, lon, label) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,weather_code,wind_speed_10m`;
  
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data && data.current) {
        const c = data.current;
        const temp = c.temperature_2m;
        const code = c.weather_code;
        const isDay = c.is_day;
        const wind = c.wind_speed_10m;
        
        const w = resolveWeatherCode(code);
        
        const tempEl = document.getElementById('weather-temp');
        const iconEl = document.getElementById('weather-icon');
        const condEl = document.getElementById('weather-condition');
        
        if (tempEl) tempEl.textContent = `${Math.round(temp)}°C`;
        if (iconEl) iconEl.textContent = w.icon;
        if (condEl) condEl.textContent = `${w.text} • ${label}`;
        
        const mapIframe = document.getElementById('google-maps-iframe');
        if (mapIframe) {
          mapIframe.src = `https://maps.google.com/maps?q=${lat},${lon}&z=11&output=embed`;
        }
        
        if (window.ecosystem3D) {
          window.ecosystem3D.updateWeather(temp, code, isDay, wind);
        }
      }
    })
    .catch(err => {
      console.error("Error fetching weather:", err);
      const tempEl = document.getElementById('weather-temp');
      const condEl = document.getElementById('weather-condition');
      if (tempEl) tempEl.textContent = "18°C";
      if (condEl) condEl.textContent = "Sunny • Connection Offline";
    });
}

/**
 * Resolve a WMO Weather Interpretation Code (used by Open-Meteo API) into
 * a human-readable text label and representative emoji icon.
 * Falls back to Sunny/☀️ for any unrecognised code.
 * @param   {number} code - WMO weather code from the Open-Meteo current weather response.
 * @returns {{ icon: string, text: string }} Display object with emoji icon and label.
 */
function resolveWeatherCode(code) {
  if (code === 0) return { icon: "☀️", text: "Sunny" };
  if ([1, 2, 3].includes(code)) return { icon: "⛅", text: "Cloudy" };
  if ([45, 48].includes(code)) return { icon: "🌫️", text: "Foggy" };
  if ([51, 53, 55].includes(code)) return { icon: "🌧️", text: "Drizzle" };
  if ([61, 63, 65].includes(code)) return { icon: "🌧️", text: "Rain" };
  if ([71, 73, 75, 77].includes(code)) return { icon: "❄️", text: "Snowy" };
  if ([80, 81, 82].includes(code)) return { icon: "🚿", text: "Showers" };
  if ([85, 86].includes(code)) return { icon: "❄️", text: "Snow Showers" };
  if ([95, 96, 99].includes(code)) return { icon: "⛈️", text: "Stormy" };
  return { icon: "☀️", text: "Clear" };
}

/**
 * Render the global temperature anomaly area chart using the Google Charts API.
 * Uses historical NOAA GISS Surface Temperature Analysis data (1880–2026).
 * No-ops silently if the Google Charts library has not yet loaded.
 */
function drawGlobalWarmingChart() {
  if (typeof google === 'undefined' || !google.visualization || !document.getElementById('climate-warming-chart')) return;
  
  const climateData = google.visualization.arrayToDataTable([
    ['Year', 'Temp Anomaly (°C)'],
    ['1880', -0.16],
    ['1900', -0.07],
    ['1920', -0.27],
    ['1940', 0.13],
    ['1960', -0.02],
    ['1980', 0.27],
    ['2000', 0.40],
    ['2010', 0.72],
    ['2020', 1.02],
    ['2025', 1.25],
    ['2026', 1.38]
  ]);

  const options = {
    backgroundColor: 'transparent',
    hAxis: {
      textStyle: {color: '#94a3b8', fontName: 'Inter', fontSize: 10},
      gridlines: {color: 'rgba(255,255,255,0.03)'}
    },
    vAxis: {
      textStyle: {color: '#94a3b8', fontName: 'Inter', fontSize: 10},
      gridlines: {color: 'rgba(255,255,255,0.03)'},
      format: '#.##°C'
    },
    colors: ['#f43f5e'],
    legend: 'none',
    areaOpacity: 0.12,
    chartArea: {width: '88%', height: '75%', left: 40, top: 15, right: 10, bottom: 25},
    lineWidth: 2.5,
    tooltip: {
      textStyle: {color: '#f1f5f9', fontName: 'Inter', fontSize: 11},
      showColorCode: true
    }
  };

  const chartContainer = document.getElementById('climate-warming-chart');
  if (chartContainer) {
    const chart = new google.visualization.AreaChart(chartContainer);
    chart.draw(climateData, options);
  }
}

/**
 * Update the planetary projection panel from the current weekly CO₂ total.
 * Computes annualised emissions, trees-needed offset, and a nano-scale
 * temperature contribution, then sets the visual impact badge accordingly.
 * @param {number} loggedTotal - Total CO₂e (kg) logged in the current weekly window.
 */
function updatePlanetaryProjection(loggedTotal) {
  const yearlyCo2El   = document.getElementById('proj-yearly-co2');
  const treesNeededEl = document.getElementById('proj-trees-needed');
  const tempRiseEl    = document.getElementById('proj-temp-rise');
  const badgeEl       = document.getElementById('projection-impact-badge');

  if (!yearlyCo2El || !treesNeededEl || !tempRiseEl || !badgeEl) return;

  const yearlyCo2Kg     = loggedTotal * WEEKS_PER_YEAR;
  const yearlyCo2Tonnes = (yearlyCo2Kg / 1000).toFixed(2);
  const treesRequired   = Math.round(yearlyCo2Kg / TREE_ANNUAL_CO2_ABSORPTION_KG);
  const tempRiseNano    = (yearlyCo2Kg * 0.0015).toFixed(3);

  yearlyCo2El.textContent  = `${yearlyCo2Tonnes} tonnes`;
  treesNeededEl.textContent = `${treesRequired.toLocaleString()} trees`;
  tempRiseEl.textContent    = tempRiseNano;

  if (loggedTotal <= WEEKLY_SUSTAINABLE_KG) {
    badgeEl.textContent       = 'Sustainable';
    badgeEl.style.background  = 'rgba(16, 185, 129, 0.1)';
    badgeEl.style.color       = 'var(--primary)';
  } else if (loggedTotal <= WEEKLY_SUSTAINABLE_KG * 2) {
    badgeEl.textContent       = 'Moderate Impact';
    badgeEl.style.background  = 'rgba(251, 191, 36, 0.1)';
    badgeEl.style.color       = 'var(--color-energy)';
  } else {
    badgeEl.textContent       = 'High Strain';
    badgeEl.style.background  = 'rgba(244, 63, 94, 0.1)';
    badgeEl.style.color       = 'var(--color-travel)';
  }
}

