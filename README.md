# DeCarbonizer 🌍

DeCarbonizer is a personal carbon footprint assistant and interactive dashboard built to help individuals monitor, track, and systematically reduce their daily greenhouse gas emissions (CO₂e).

Designed as a single-page application with a modern, glassmorphic layout, DeCarbonizer blends a real-time data-driven dashboard with a conversational logging console.

## 🌿 Chosen Vertical & Solution Focus

* **Vertical:** Environmental Sustainability & Personal Carbon Footprint Assistant
* **Persona:** **EcoTrack AI** — an encouraging, knowledgeable, and non-judgmental guide that converts natural language logs into numerical carbon equivalents (kg CO₂e), delivers actionable micro-tips, and suggests weekly reduction habits tailored to the user's lifestyle.

---

## 🚀 Key Features

1. **Warm Conversational Onboarding:** A 7-step wizard gathers profile data (Location, Household Size, Commute Mode, Weekly Commute Distance, Diet Style, Electricity Grid Source, Monthly Flights, and Shopping Habits) to compute an annual CO₂ baseline.
2. **Interactive Dashboard:**
   * **Real-time Carbon Budget Bar:** Highlights weekly carbon consumption compared to the global **2-tonne annual sustainable target** (38.5 kg CO₂e per week limit).
   * **Category-Specific Breakdown:** An animated SVG donut chart and matching color-coded legend categorize emissions into 🚗 Transport, ⚡ Energy, 🍔 Food, 🛍️ Consumption, ✈️ Travel, and 🗑️ Waste.
   * **Weekly Micro-Habits:** Custom habit suggestions (e.g., swapping drives for public transit, "Meatless Mondays", etc.) that instantly log savings upon completion.
    * **Activity Feed:** Live list of all daily logging events.
3. **3D Ecosystem Tree Visualizer & Simulator:**
   * **Real-time 3D Feedback**: A procedural fractal tree that visually degrades or flourishes. As emissions rise, leaves shift colors (green -> yellow -> orange -> brown -> black) and physically fall. At high pollution levels, the leaves drop completely and a thick grey CO₂ smog rises from cracked soil.
   * **Flourishing Effects**: When carbon footprint is kept low (below sustainable limits), the tree blossoms and floats glowing green firefly/pollen particles.
   * **Manual Simulator Mode**: Allows users to override live statistics and drag a simulator slider (0 kg to 150 kg) to see the transition effects live.
   * **Interactive Buttons**: Users can "Water Tree" to trigger 3D rain (reducing carbon logs by 2.0 kg) or click "Cleanse Air" to push smog away with expanding wind waves.
4. **Conversational Logging (Natural Language Parser):** Users can type sentences like *"I drove 40 km today"*, *"had a beef burger for lunch"*, or *"bought a secondhand jacket"*. The app dynamically extracts activities, weights them with emission coefficients, assigns categories, and returns tailored recommendations.
5. **Google Services Integrations:**
   * **Google Charts API:** Renders interactive, animated carbon emission category breakdowns.
   * **Google Translate Element:** Provides complete multi-language accessibility instantly.
   * **Google Identity Services:** Adds official client-side "Sign in with Google" prompts to customize profile avatars.
6. **Offline-first Local Persistence:** All user states, log history, and checked habits persist in `localStorage`, enabling users to close and reopen the app without data loss.

---

## 🧮 Carbon Emission Models & Factors

All coefficients are derived from **IPCC** and **EPA** standard baselines (measured in kg CO₂e):

### 🚗 Transportation (per km)
* **Gasoline SUV / Large Car:** 0.26 kg
* **Medium / Small Gasoline Car:** 0.18 kg
* **Hybrid Vehicle:** 0.10 kg
* **Electric Vehicle:** 0.04 kg (average grid charge intensity)
* **Public Transit (Bus/Train):** 0.035 kg
* **Active Commute (Walking/Biking):** 0.0 kg

### 🍔 Food & Diet (per meal / per day baseline)
* **Beef / Steak Meal:** 3.2 kg (high methane intensity)
* **Meat / Chicken / Pork Meal:** 0.9 kg
* **Vegetarian Meal (Eggs/Dairy):** 0.5 kg
* **Vegan Meal (Plant-based):** 0.3 kg
* **Profile Baselines (Annual):** Meat-heavy (2800 kg/yr), Average Omnivore (2000 kg/yr), Flexitarian (1400 kg/yr), Vegetarian (1100 kg/yr), Vegan (750 kg/yr).

### ⚡ Home Energy & Waste (per month / person)
* **Standard Grid Energy:** 140 kg
* **Mixed Source (Solar/Grid):** 70 kg
* **100% Green / Solar Tariff:** 8 kg
* **Waste (Standard Landfill):** 40 kg
* **Waste (Compost & Recycling active):** 15 kg

### 🛍️ Consumption & Shopping (per item / per month)
* **New clothing purchase:** 11.5 kg
* **Secondhand/thrifted item:** 1.2 kg
* **New electronics purchase:** 80 kg
* **New furniture piece:** 45 kg

### ✈️ Travel & Flights (per flight)
* **Short-haul flight (< 3 hours):** 180 kg
* **Long-haul flight (> 3 hours):** 850 kg

---

## 🛠️ Technology Stack & Architecture

To satisfy submission guidelines and maximize run efficiency:
* **Core Languages:** Semantic HTML5, Vanilla ES6+ JavaScript, Vanilla CSS.
* **3D Graphics & Engine:** Three.js and OrbitControls loaded via lightweight CDN integration.
* **No Heavy Framework Dependencies:** Zero React/Vue/Tailwind compile chains to bloat build sizes, keeping the repository lightweight, fast-loading, and responsive.
* **Rich Glassmorphic Styles:** Modern gradients, backdrop filters, outline shadows, custom scrollbars, and keyframe animations create a premium visual workspace.

---

## 💡 Key Assumptions

1. **Weekly Carbon Budget:** The sustainable weekly limit is set at **38.5 kg CO₂e**, representing a person's share under the global 2-tonne sustainable yearly target ($2000 \text{ kg} / 52 \text{ weeks} \approx 38.5 \text{ kg}$).
2. **Transportation Default:** If the user logs a drive without specifying a car type in their text (e.g., *"I drove 30 km"*), the system falls back to the transport mode selected in their onboarding profile.
3. **Flight Estimates:** Monthly flights from onboarding are converted to annual footprints assuming average flight emissions (~450 kg CO₂e) covering a mix of short- and long-haul distances.

---

## 🏁 Running the Application Locally

Since DeCarbonizer is built on native web technologies, it can be run in multiple ways:

### Option A: Native Node Server (Recommended)
This uses the included HTTP server to serve files cleanly on port 8080.
1. Run the start command:
   ```bash
   npm start
   ```
2. Open your browser to `http://localhost:8080`.

### Option B: Direct File Open
Simply double-click or drag-and-drop the [index.html](index.html) file into your browser of choice.

### Option C: Python Static Server
If you prefer Python, run the following command in the repository root:
```bash
python -m http.server 8080
```
Then navigate to `http://localhost:8080` in your browser.