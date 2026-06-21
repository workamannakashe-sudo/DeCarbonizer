# DeCarbonizer 🌍

**DeCarbonizer** is a personal carbon footprint assistant and interactive dashboard built to help individuals monitor, track, and systematically reduce their daily greenhouse gas emissions (kg CO₂e).

Designed as a single-page application with a modern glassmorphic layout, DeCarbonizer blends a real-time data-driven dashboard with a conversational logging console and a live 3D ecosystem visualiser.

---

## 🌿 Chosen Vertical & Solution Focus

* **Vertical:** Environmental Sustainability & Personal Carbon Footprint Assistant
* **Persona:** **EcoTrack AI** — an encouraging, knowledgeable, and non-judgmental guide that converts natural-language logs into numerical carbon equivalents (kg CO₂e), delivers actionable micro-tips, and suggests weekly reduction habits tailored to the user's lifestyle.

---

## 🚀 Key Features

1. **Warm Conversational Onboarding** — A 7-step wizard gathers profile data (location, household size, commute mode, weekly commute distance, diet style, electricity source, monthly flights, and shopping habits) to compute a personal annual CO₂ baseline.
2. **Interactive Dashboard**
   * **Real-time Carbon Budget Bar** — Highlights weekly carbon consumption vs the global **2-tonne annual sustainable target** (≈ 38.5 kg CO₂e / week).
   * **Category-Specific Breakdown** — Animated SVG donut chart + colour-coded legend for 🚗 Transport, ⚡ Energy, 🍔 Food, 🛍️ Consumption, ✈️ Travel, and 🗑️ Waste.
   * **Weekly Micro-Habits** — Custom habit suggestions (e.g. swapping drives for transit, "Meatless Mondays") with instant savings tracking.
   * **Activity Feed** — Live, deletable list of all daily logging events.
3. **3D Ecosystem Tree Visualiser**
   * Procedural fractal tree that visually degrades or flourishes based on emissions.
   * Leaves shift green → yellow → orange → brown → black as pollution rises, then fall completely with CO₂ smog at high footprint.
   * Flourishing pollen/firefly particles when emissions stay below the sustainable target.
   * **Simulator Mode** — drag a slider (0–150 kg) to preview ecosystem transition effects live.
4. **Conversational Natural Language Parser** — Type *"I drove 40 km today"*, *"had a beef burger for lunch"*, or *"bought a secondhand jacket"*. The app extracts activities, applies IPCC emission coefficients, assigns categories, and returns tailored recommendations.
   * Supports miles → km unit conversion (e.g. *"drove 10 miles"*).
   * Recognises dozens of activity patterns across all six emission categories.
5. **Google Services Integrations** — Google Charts (emission breakdown), Google Translate (multi-language), Google Identity Services (Sign-in with Google).
6. **Log Deletion** — Every activity history entry has a ✕ delete button that removes it from both the local state and the server database.
7. **Offline-first Persistence** — All state, log history, and checked habits persist in `localStorage` so users can close and reopen without data loss.

---

## 🧮 Carbon Emission Models & Factors

All coefficients are derived from **IPCC AR6 WG3**, **EPA eGRID 2023**, and **GHG Protocol** baselines (kg CO₂e):

| Category | Item | Factor |
|---|---|---|
| 🚗 Transport | Gasoline SUV | 0.26 kg/km |
| | Medium gasoline car | 0.18 kg/km |
| | Hybrid vehicle | 0.10 kg/km |
| | Electric vehicle (avg grid) | 0.04 kg/km |
| | Public transit (bus/train) | 0.035 kg/km |
| | Walking / Cycling | 0.0 kg/km |
| 🍔 Food | Beef / Steak meal | 3.2 kg/meal |
| | Meat / Chicken / Pork meal | 0.9 kg/meal |
| | Vegetarian meal (eggs/dairy) | 0.5 kg/meal |
| | Vegan meal (plant-based) | 0.3 kg/meal |
| ⚡ Energy | Standard grid | 140 kg/month |
| | Mixed (solar/grid) | 70 kg/month |
| | 100% green / solar tariff | 8 kg/month |
| ✈️ Travel | Short-haul flight (< 3 h) | 180 kg/flight |
| | Long-haul flight (> 3 h) | 850 kg/flight |
| 🛍️ Consumption | New clothing | 11.5 kg/item |
| | Secondhand / thrifted | 1.2 kg/item |
| | New electronics | 80 kg/item |
| | New furniture | 45 kg/item |

---

## 🛠️ Technology Stack & Architecture

| Layer | Technology |
|---|---|
| Structure | Semantic HTML5 |
| Styling | Vanilla CSS (glassmorphism, custom animations) |
| Logic | Vanilla ES6+ JavaScript |
| 3D Engine | Three.js (via CDN) |
| Server | Node.js built-in `http` module |
| Storage | `localStorage` (client) + JSON flat-file DB (server) |
| Charts | Google Charts API |
| Auth | Google Identity Services |
| Weather | Open-Meteo API (free, no key required) |
| Maps | Google Maps Embed API |

Zero heavy framework dependencies — no React, Vue, Tailwind, or build step required.

---

## 🏁 Running the Application

### Option A: Node.js (Recommended)
```bash
# Install (no external dependencies — pure Node.js built-ins)
npm install

# Start the server
npm start
# → Open http://localhost:8080
```

### Option B: Docker
```bash
# Build the image
docker build -t decarbonizer .

# Run the container
docker run -p 8080:8080 decarbonizer
# → Open http://localhost:8080
```

### Option C: Python (dev only)
```bash
python -m http.server 8080
```

---

## 🧪 Testing

Run the full test suite (69 tests across 15 sections):

```bash
npm test
```

The suite covers:

| Section | Description |
|---|---|
| §1–3 | Security — `escapeHtml`, `sanitizeUserId`, `validateLog` |
| §4 | Code quality — `EMISSION_FACTORS` structure |
| §5–6 | Efficiency — `calculateBaseline`, weekly budget constants |
| §7–8 | Problem alignment — country averages, habits template |
| §9–10 | Code quality — `VALID_CATEGORIES`, default state shape |
| §11 | NLP parsing — emission factor values, miles→km conversion |
| §12 | Security edge cases — co2 range bounds, id format guards |
| §13 | `resolveWeatherCode` — all WMO weather categories |
| §14 | `getCategoryColor` — all 6 categories + fallback |
| §15 | State persistence — save/load round-trip |

---

## 🔒 Security Model

* **HTTP Security Headers** — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy applied to every response.
* **Input Sanitization** — `userId` filtered by allowlist regex; `logId` validated by pattern before any DB operation.
* **Log Validation** — `validateLog()` enforces co2 range `[-500, 10000]`, id format, category allowlist, description length, and field types before persistence.
* **Body Size Limit** — POST bodies rejected at 64 KB to prevent DoS.
* **Path Traversal Prevention** — Static file handler resolves to absolute paths and confirms they start within the project root.
* **XSS Prevention** — All user-supplied strings are `escapeHtml()`-sanitized before DOM insertion. Assistant HTML is generated internally and never directly reflects user input.
* **Non-root Docker** — The container runs as a dedicated `appuser` for least-privilege execution.

---

## 💡 Key Assumptions

1. **Weekly Carbon Budget** — Sustainable limit set at **38.5 kg CO₂e/week** (IPCC 2°C pathway: 2000 kg/yr ÷ 52 weeks).
2. **Transport Default** — If car type is unspecified in a log, the system falls back to the mode selected during onboarding.
3. **Flight Estimates** — Monthly flights from onboarding are converted to annual footprints using average flight emissions (~450 kg CO₂e covering a mix of short- and long-haul distances).
4. **Offline Resilience** — The server backend (JSON DB) is optional; the app is fully functional using only `localStorage`.

---

## 📁 Project Structure

```
DeCarbonizer/
├── index.html          # Single-page app shell + all markup
├── styles.css          # Glassmorphic design system + animations
├── app.js              # Application logic, NLP parser, state management
├── tree.js             # Three.js 3D ecosystem tree engine
├── server.js           # Node.js HTTP server + REST API
├── test_decarbonizer.js# 69-test suite (no external test framework)
├── package.json        # npm metadata and scripts
├── Dockerfile          # Multi-stage production container image
└── data/               # Auto-created JSON flat-file database
    └── database.json
```

---

## 🤝 Contributing

1. Fork the repository and create your branch: `git checkout -b feature/my-improvement`
2. Run tests before submitting: `npm test`
3. Ensure all 69+ tests pass with zero failures
4. Submit a pull request with a clear description of your change