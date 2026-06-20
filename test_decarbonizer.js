const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mock browser global environment for Node.js context execution
global.document = {
  addEventListener: () => {},
  getElementById: (id) => {
    return {
      addEventListener: () => {},
      setAttribute: () => {},
      appendChild: () => {},
      classList: {
        add: () => {},
        remove: () => {}
      },
      style: {},
      dataset: {}
    };
  },
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } })
};
global.window = {
  addEventListener: () => {},
  ecosystem3D: {
    updateEcosystem: () => {},
    isSimulator: false
  }
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
global.google = {
  charts: {
    load: () => {},
    setOnLoadCallback: () => {}
  }
};

// Load and execute app.js code
const appJsPath = path.join(__dirname, 'app.js');
let appJsCode = fs.readFileSync(appJsPath, 'utf8');

// Expose block-scoped variables to the test context
appJsCode = appJsCode
  .replace(/\blet\s+state\b/, 'global.state')
  .replace(/\bconst\s+EMISSION_FACTORS\b/, 'global.EMISSION_FACTORS');

// Run production code inside global mockup sandbox
eval(appJsCode);

// Bind them locally for the test code to access
const state = global.state;
const EMISSION_FACTORS = global.EMISSION_FACTORS;

console.log("=== Running DeCarbonizer Tests ===");

// 1. Test HTML Escaping Helper (Security Pillar)
try {
  console.log("Testing escapeHtml...");
  assert.strictEqual(escapeHtml("<div>hello</div>"), "&lt;div&gt;hello&lt;/div&gt;");
  assert.strictEqual(escapeHtml("hello & goodbye"), "hello &amp; goodbye");
  assert.strictEqual(escapeHtml('"test"'), "&quot;test&quot;");
  assert.strictEqual(escapeHtml("'test'"), "&#039;test&#039;");
  console.log("✓ escapeHtml tests passed.");
} catch (e) {
  console.error("✗ escapeHtml tests failed:", e);
  process.exit(1);
}

// 2. Test calculateBaseline Mathematical Logic (Efficiency & Quality Pillars)
try {
  console.log("Testing calculateBaseline math...");
  // Set clean mock profile state
  state.profile = {
    location: 'GL',
    householdSize: 1,
    transportMode: 'gas_medium',
    weeklyKm: 50,
    dietType: 'meat_average',
    energySource: 'grid',
    monthlyFlights: 0,
    shoppingHabit: 'average',
    baselineAnnual: 0,
    reductionGoal: 15
  };
  
  const baseline = calculateBaseline();
  // Math Breakdown:
  // - transport = 50 * 52 * 0.18 = 468
  // - diet = (2000/365) * 365 = 2000
  // - energy = 140 * 12 = 1680
  // - flights = 0
  // - consumption = 55 * 12 = 660
  // - waste = 40 * 12 = 480
  // - Expected total = 468 + 2000 + 1680 + 0 + 660 + 480 = 5288
  assert.strictEqual(baseline, 5288);
  console.log("✓ calculateBaseline math tests passed.");
} catch (e) {
  console.error("✗ calculateBaseline tests failed:", e);
  process.exit(1);
}

// 3. Test EMISSION_FACTORS Constants Reference (Quality Pillar)
try {
  console.log("Testing EMISSION_FACTORS constants...");
  assert.strictEqual(EMISSION_FACTORS.transport.gas_suv, 0.26);
  assert.strictEqual(EMISSION_FACTORS.meals.beef, 3.2);
  assert.strictEqual(EMISSION_FACTORS.energy.grid, 140);
  console.log("✓ EMISSION_FACTORS reference tests passed.");
} catch (e) {
  console.error("✗ EMISSION_FACTORS tests failed:", e);
  process.exit(1);
}

console.log("=== All Tests Passed Successfully! ===");
process.exit(0);
