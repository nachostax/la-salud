// ════════════════════════════════════════════════════════════════════════
// SETTINGS.JS — the Settings interface (profile targets, quick-log edits,
// API key/sync, XLSX export, retro-date helpers).
// During file consolidation (July 2026), the History-tab rendering code that
// used to live here (renderHistory/toggleHistoryDay/deleteHistoryEntry/
// toggleHistoryFullDay + the lastHistoryCheckTick flag) was moved to
// progress.js — 'History' is the internal id for the Progress bottom-nav
// tab (see SEC_ORDER in ui.js), not a Settings feature, and it never
// belonged in this file.
// ════════════════════════════════════════════════════════════════════════

// ── SETTINGS OVERLAY ──────────────────────────────────────────────────────
// Plain-language, no macro/calorie typing required from either person — the
// app stays "not intelligent" on purpose, so every field here is a simple
// number or short text, never a calculation they have to do themselves.
function openSettings() {
  openSettingsTab(document.getElementById('hdr-settings-btn'));
}
function closeSettings() {
  // No-op now that Settings is a normal tab (nothing to "close" into) —
  // kept so any old onclick="closeSettings()" references don't error.
}
function renderSettingsBody() {
  document.getElementById('settings-body').innerHTML = `
    <button class="btn btn-primary" style="width:100%;margin-top:6px" onclick="saveSettings()">Save settings</button>
  `;
}

// ── TARGETS (dynamic, active-person-only) ─────────────────────────────────
// Called by showSubSec('targets') in ui.js.
// Renders a single mission-block for S.currentPerson, preserving existing
// field IDs (g-kcal / n-kcal etc.) so that calculateMyIntake() and
// renderActivityControls() continue to work unchanged.
function renderTargetsBody() {
  const p = S.currentPerson;
  const pfx = p === 'gabi' ? 'g' : 'n';
  const name = p === 'gabi' ? 'Gabi' : 'Nacho';
  const color = p === 'gabi' ? 'var(--gabi-c)' : 'var(--nacho-c)';
  const m = S.mission[p] || {};
  const s = S.settings;

  const water = s[`waterGoal_${p}`] || s.waterGoal?.[p] || (p === 'gabi' ? 1750 : 2000);
  const cardioSessions  = s.cardioSessions?.[p]  ?? 3;
  const cardioMins      = s.cardioMins?.[p]      ?? 30;
  const hiitSessions    = s.hiitSessions?.[p]    ?? 1;
  const hiitMins        = s.hiitMins?.[p]        ?? 30;
  const strengthSessions= s.strengthSessions?.[p]?? 3;
  const mobilitySessions= s.mobilitySessions?.[p]?? 5;
  const mobilityMins    = s.mobilityMins?.[p]    ?? 15;

  const el = document.getElementById('targets-body');
  if (!el) return;
  el.innerHTML = `
    <div class="mission-block visible" data-person="${p}">
      <div class="mission-title" style="font-size:18px">
        <div class="dot" style="background:${color}"></div>${name}
      </div>

      <div class="trend-card-title" style="margin-top:4px">About You</div>

      <div class="mfield">
        <label>Weight (kg)</label>
        <div class="weight-log-row">
          <input type="number" id="${pfx}-weight" placeholder="${p==='gabi'?'70':'71'}" step="0.1" readonly class="weight-current">
          <input type="text" inputmode="decimal" id="${pfx}-weight-log" placeholder="New kg" onblur="normalizeWeightField(this)">
          <button class="btn btn-save weight-log-btn" onclick="logWeight('${p}')">Log kg</button>
        </div>
        <div id="${pfx}-weight-history" style="margin-top:6px"></div>
      </div>
      <div class="mfield"><label>Height (cm)</label><input type="number" id="${pfx}-height" value="${m.height||''}" placeholder="${p==='gabi'?'165':'172'}" oninput="renderActivityControls('${p}')"></div>
      <div class="mfield"><label>Age</label><input type="number" id="${pfx}-age" value="${m.age||''}" placeholder="${p==='gabi'?'29':'30'}" oninput="renderActivityControls('${p}')"></div>

      <div class="mfield">
        <label>Activity level</label>
        <select id="${pfx}-activity" onchange="markActivityOverride('${p}')">
          <option value="light">Light (~5k steps/day)</option>
          <option value="moderate">Moderate (~10k steps/day)</option>
          <option value="active">Active (~15k steps/day)</option>
          <option value="very_intense">Very intense (~20k+ steps/day)</option>
        </select>
      </div>

      <div class="mfield">
        <label>Gym experience</label>
        <select id="${pfx}-gym-experience" onchange="renderActivityControls('${p}')">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div class="mfield">
        <label>Goal type</label>
        <select id="${pfx}-goal-type" onchange="renderActivityControls('${p}')">
          <option value="lose_fat">Lose fat</option>
          <option value="gain_muscle">Gain muscle</option>
          <option value="gain_weight">Gain weight</option>
          <option value="recomposition">Improve body composition</option>
        </select>
        <div style="font-family:'Baloo 2',sans-serif;font-size:10px;color:var(--mist);margin-top:4px">
          Recomposition doesn't use a target weight — your target is maintenance calories (TDEE, no deficit), aimed at holding weight steady while training shifts fat→muscle.
        </div>
      </div>

      <div class="trend-card-title" style="margin-top:4px">Weight Target</div>

      <div class="mfield">
        <label>Target weight (this drives your calorie target)</label>
        <select id="${pfx}-goal-weight" onchange="renderActivityControls('${p}')"></select>
      </div>
      <div class="mfield">
        <label>Timeframe</label>
        <select id="${pfx}-goal-timeframe" onchange="toggleGoalDateField('${p}'); renderActivityControls('${p}')"></select>
      </div>
      <div class="mfield" id="${pfx}-goal-date-wrap" style="display:none">
        <label>Target date</label>
        <input type="date" id="${pfx}-goal-date" onchange="renderActivityControls('${p}')">
      </div>
      <div id="${pfx}-calc-breakdown" style="font-family:'Baloo 2',sans-serif;font-size:11px;color:var(--mist);margin:8px 0;line-height:1.6"></div>
      <div class="mfield" id="${pfx}-rate-wrap" style="display:none">
        <label style="text-align:center;font-size:16px;font-weight:600;letter-spacing:0.3px;color:var(--bone);text-transform:none;display:block;margin-bottom:10px">Your personalised weekly target</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="${pfx}-rate-kgwk" step="0.01" style="flex:1 1 0%;min-width:0;width:auto"
                 onchange="applyRateOverride('${p}', this.value)">
          <button type="button" id="${pfx}-rate-reset-btn" class="btn" style="display:none;flex-shrink:0;padding:8px 12px;font-size:11px" onclick="resetRateOverride('${p}')">Reset</button>
        </div>
        <div id="${pfx}-rate-note" style="font-family:'Baloo 2',sans-serif;font-size:10px;color:var(--mist);margin-top:4px"></div>
      </div>
      <button type="button" class="btn btn-save" style="width:100%;margin-bottom:14px" onclick="calculateMyIntake('${p}')">Save</button>
      <div id="${pfx}-ai-assist-wrap"><!-- AI Assist injected by calculateMyIntake --></div>

      <div class="mfield"><label>Daily calorie target (kcal) — calculated, not editable</label><input type="number" id="${pfx}-kcal" value="${m.kcal||''}" placeholder="${p==='gabi'?'1450':'1950'}" readonly style="opacity:0.65"></div>
      <div class="mfield"><label>Protein target (g) — calculated, not editable</label><input type="number" id="${pfx}-protein" value="${m.protein||''}" placeholder="${p==='gabi'?'100':'145'}" readonly style="opacity:0.65"></div>
      <div class="mfield"><label>Carbs target (g) — calculated, not editable</label><input type="number" id="${pfx}-carbs" value="${m.carbs||''}" placeholder="${p==='gabi'?'130':'175'}" readonly style="opacity:0.65"></div>
      <div class="mfield"><label>Fat target (g) — calculated, not editable</label><input type="number" id="${pfx}-fat" value="${m.fat||''}" placeholder="${p==='gabi'?'45':'55'}" readonly style="opacity:0.65"></div>
      <div class="mfield"><label>Steps target</label><input type="number" id="set-steps-${p}" value="${m.stepsTarget||''}" placeholder="10000"></div>
    </div>

    <div class="trend-card-title" style="margin-top:18px">Daily &amp; Weekly Targets</div>

    <div class="mfield" style="margin-bottom:8px">
      <label>Daily water (ml)</label>
      <input type="number" id="set-water-${p}" value="${water}" placeholder="${p==='gabi'?'1750':'2000'}">
    </div>

    <div style="font-size:12px;color:var(--mist);font-family:'Baloo 2',sans-serif;letter-spacing:1px;margin:10px 0 6px">Cardio</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div class="mfield" style="margin:0"><label style="font-size:10px">Sessions/week</label><input type="number" id="set-cardio-sessions-${p}" value="${cardioSessions}" placeholder="3"></div>
      <div class="mfield" style="margin:0"><label style="font-size:10px">Minutes each</label><input type="number" id="set-cardio-mins-${p}" value="${cardioMins}" placeholder="30"></div>
    </div>

    <div style="font-size:12px;color:var(--mist);font-family:'Baloo 2',sans-serif;letter-spacing:1px;margin:0 0 6px">HIIT <span style="font-size:10px;opacity:0.7">(VO₂MAX)</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div class="mfield" style="margin:0"><label style="font-size:10px">Sessions/week</label><input type="number" id="set-hiit-sessions-${p}" value="${hiitSessions}" placeholder="1"></div>
      <div class="mfield" style="margin:0"><label style="font-size:10px">Minutes each</label><input type="number" id="set-hiit-mins-${p}" value="${hiitMins}" placeholder="30"></div>
    </div>

    <div style="font-size:12px;color:var(--mist);font-family:'Baloo 2',sans-serif;letter-spacing:1px;margin:0 0 6px">Strength</div>
    <div class="mfield" style="margin-bottom:10px">
      <label style="font-size:10px">Sessions/week</label>
      <input type="number" id="set-strength-sessions-${p}" value="${strengthSessions}" placeholder="3">
    </div>

    <div style="font-size:12px;color:var(--mist);font-family:'Baloo 2',sans-serif;letter-spacing:1px;margin:0 0 6px">Mobility</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div class="mfield" style="margin:0"><label style="font-size:10px">Sessions/week</label><input type="number" id="set-mobility-sessions-${p}" value="${mobilitySessions}" placeholder="5"></div>
      <div class="mfield" style="margin:0"><label style="font-size:10px">Minutes each</label><input type="number" id="set-mobility-mins-${p}" value="${mobilityMins}" placeholder="15"></div>
    </div>

    <button class="btn btn-save" style="width:100%;margin-top:6px" onclick="saveTargets()">Save</button>
    <div id="mission-saved" style="display:none;text-align:center;padding:10px;font-family:'Baloo 2',sans-serif;font-size:11px;color:var(--sage);letter-spacing:2px;margin-top:6px">SAVED</div>
  `;

  // Populate weight (locked to latest weight-log entry, never a typed
  // field) + activity level, and render this person's weight history.
  // Height/age are already prefilled inline above via value="${m.field}".
  // This is the populate-on-open job renderMission() used to do for the
  // old static Profile section (deleted in Phase 1).
  const weightEl = document.getElementById(pfx+'-weight');
  const latestWeight = (typeof getLatestWeight === 'function') ? getLatestWeight(p) : m.weight;
  if (weightEl) weightEl.value = latestWeight != null ? latestWeight : '';
  const actEl = document.getElementById(pfx+'-activity');
  if (actEl) actEl.value = m.activityLevel;
  const gymExpEl = document.getElementById(pfx+'-gym-experience');
  if (gymExpEl) gymExpEl.value = m.gymExperience || 'intermediate';
  const goalTypeEl = document.getElementById(pfx+'-goal-type');
  if (goalTypeEl) goalTypeEl.value = m.goalType || 'lose_fat';
  if (typeof renderWeightHistories === 'function') renderWeightHistories();

  // Re-populate goal dropdowns now that the elements exist in the DOM.
  // (Previously called a populateGoalDropdowns() that was never defined —
  // dead no-op guarded by typeof-check. Fixed to actually populate the
  // single-goal fields: option lists + current values + custom-date
  // visibility.)
  if (typeof populateGoalSelects === 'function') populateGoalSelects();
  const goalWeightEl = document.getElementById(pfx+'-goal-weight');
  const goalTimeframeEl = document.getElementById(pfx+'-goal-timeframe');
  const goalDateEl = document.getElementById(pfx+'-goal-date');
  if (goalWeightEl) goalWeightEl.value = m.goalTargetWeight;
  if (goalTimeframeEl) goalTimeframeEl.value = m.goalTimeframe;
  if (goalDateEl) goalDateEl.value = m.goalTargetDate || '';
  if (typeof toggleGoalDateField === 'function') toggleGoalDateField(p);
  if (typeof renderActivityControls === 'function') renderActivityControls(p);
}

// Shows the custom-date field only when timeframe === 'custom'. Called on
// render and whenever the timeframe select changes.
function toggleGoalDateField(p) {
  const pfx = p === 'gabi' ? 'g' : 'n';
  const wrap = document.getElementById(pfx+'-goal-date-wrap');
  const sel = document.getElementById(pfx+'-goal-timeframe');
  if (wrap) wrap.style.display = (sel && sel.value === 'custom') ? '' : 'none';
}

// Saves all targets fields for the active person only.
// NOTE TO TEAM D — showSubSec() navigation bug (ui.js):
//   Rapid back-taps cause _subsecStack to desync and the 'subsec-transitioning'
//   class gets permanently stuck on the stage element, breaking all further nav.
//   Fix in showSubSec() before adding transition classes:
//     1. Always remove 'subsec-transitioning' from the stage first.
//     2. Clear all animation classes from both outgoing and target elements.
//     3. Guard against outgoing === target (same section re-triggered — early return).
//   This ensures each transition starts from a clean slate regardless of tap speed.
function saveTargets() {
  const p = S.currentPerson;
  const pfx = p === 'gabi' ? 'g' : 'n';
  const m = S.mission[p];

  const v = id => {
    const el = document.getElementById(id);
    return el ? parseFloat(el.value) || undefined : undefined;
  };
  const sv = id => {
    const el = document.getElementById(id);
    return el ? el.value : undefined;
  };

  if (v(`${pfx}-kcal`)    !== undefined) m.kcal    = v(`${pfx}-kcal`);
  if (v(`${pfx}-protein`) !== undefined) m.protein = v(`${pfx}-protein`);
  if (v(`${pfx}-carbs`)   !== undefined) m.carbs   = v(`${pfx}-carbs`);
  if (v(`${pfx}-fat`)     !== undefined) m.fat     = v(`${pfx}-fat`);

  const stepsEl = document.getElementById(`set-steps-${p}`);
  if (stepsEl && stepsEl.value) m.stepsTarget = parseFloat(stepsEl.value) || m.stepsTarget;

  const goalEl = document.getElementById(`${pfx}-goal-weight`);
  if (goalEl && goalEl.value) m.goalTargetWeight = parseFloat(goalEl.value);
  const goalTimeframeEl = document.getElementById(`${pfx}-goal-timeframe`);
  if (goalTimeframeEl && goalTimeframeEl.value) m.goalTimeframe = goalTimeframeEl.value;
  const goalDateEl = document.getElementById(`${pfx}-goal-date`);
  if (goalDateEl && goalDateEl.value) m.goalTargetDate = goalDateEl.value;
  m.goalSetDate = m.goalSetDate || todayStr();
  m.goalTargetDate = resolveGoalTargetDate(m);

  // Water
  const waterEl = document.getElementById(`set-water-${p}`);
  if (waterEl && waterEl.value) {
    if (!S.settings.waterGoal) S.settings.waterGoal = {};
    S.settings.waterGoal[p] = parseFloat(waterEl.value) || (p === 'gabi' ? 1750 : 2000);
  }

  // Workout breakdown targets
  const ensureKey = key => { if (!S.settings[key]) S.settings[key] = {}; };
  const saveField = (settingsKey, elId) => {
    const el = document.getElementById(elId);
    if (el && el.value) { ensureKey(settingsKey); S.settings[settingsKey][p] = parseFloat(el.value); }
  };

  saveField('cardioSessions',   `set-cardio-sessions-${p}`);
  saveField('cardioMins',       `set-cardio-mins-${p}`);
  saveField('hiitSessions',     `set-hiit-sessions-${p}`);
  saveField('hiitMins',         `set-hiit-mins-${p}`);
  saveField('strengthSessions', `set-strength-sessions-${p}`);
  saveField('mobilitySessions', `set-mobility-sessions-${p}`);
  saveField('mobilityMins',     `set-mobility-mins-${p}`);

  save();
  renderVitals();

  const savedEl = document.getElementById('mission-saved');
  if (savedEl) { savedEl.style.display = 'block'; setTimeout(() => savedEl.style.display = 'none', 2000); }
  showToast('Targets saved ✓');
}

// ── QUICK LOG EDITS ────────────────────────────────────────────────────────
function renderQuickLogBody() {
  const p = S.currentPerson;
  const qm = window.QUICK_MEALS || {};
  const coffee = qm.coffee || {};
  const vitamins = qm.multivitamins || {};
  const s = S.settings;

  document.getElementById('quicklog-body').innerHTML = `
    ${p === 'nacho' ? `
    <div class="trend-card">
      <div style="font-family:'Baloo 2',sans-serif;font-style:italic;font-size:15px;margin-bottom:6px">☕ Nacho's coffee</div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <label style="font-size:13px;color:var(--sand)">Include honey</label>
        <input type="checkbox" id="ql-nacho-coffee-honey" ${(s.quickLogOverrides?.nacho?.coffeeHoney !== false) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--nacho-c)">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div class="mfield" style="margin:0"><label style="font-size:10px">kcal</label><input type="number" id="ql-nacho-coffee-cal" value="${(s.quickLogOverrides?.nacho?.coffee?.calories) ?? coffee.nacho?.calories ?? 55}" style="margin:0"></div>
        <div class="mfield" style="margin:0"><label style="font-size:10px">carbs g</label><input type="number" id="ql-nacho-coffee-carbs" value="${(s.quickLogOverrides?.nacho?.coffee?.carbs_g) ?? coffee.nacho?.carbs_g ?? 10}" style="margin:0"></div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="saveQuickLogCoffee()">Save coffee</button>
    </div>
    ` : ''}

    ${p === 'gabi' ? `
    <div class="trend-card">
      <div style="font-family:'Baloo 2',sans-serif;font-style:italic;font-size:15px;margin-bottom:6px">🩸 Gabi's hypo correction</div>

      <input type="text" id="ql-hypokit" value="${s.hypoKit?.gabi||''}" placeholder="e.g. 2 cookies (~12.5g sugar)" style="margin-bottom:8px">
      <div style="display:flex;gap:6px">
        <input type="number" id="ql-hypokcal" value="${s.hypoMacros?.gabi?.calories ?? 50}" placeholder="kcal" style="margin-bottom:0">
        <input type="number" id="ql-hypocarbs" value="${s.hypoMacros?.gabi?.carbs_g ?? 13}" placeholder="carbs g" style="margin-bottom:0">
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="saveQuickLogHypo()">Save hypo correction</button>
    </div>
    ` : ''}

    <div class="trend-card">
      <div style="font-family:'Baloo 2',sans-serif;font-style:italic;font-size:15px;margin-bottom:6px">💊 ${p === 'gabi' ? 'Gabi' : 'Nacho'}'s vitamins</div>

      <div class="mfield" style="margin-bottom:8px"><label>Meal name / label</label><input type="text" id="ql-vit-name" value="${(s.quickLogOverrides?.[p]?.vitamins?.meal) ?? vitamins[p]?.meal ?? 'Vitamins'}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div class="mfield" style="margin:0"><label style="font-size:10px">kcal</label><input type="number" id="ql-vit-cal" value="${(s.quickLogOverrides?.[p]?.vitamins?.calories) ?? vitamins[p]?.calories ?? 18}" style="margin:0"></div>
        <div class="mfield" style="margin:0"><label style="font-size:10px">carbs g</label><input type="number" id="ql-vit-carbs" value="${(s.quickLogOverrides?.[p]?.vitamins?.carbs_g) ?? vitamins[p]?.carbs_g ?? 4.3}" style="margin:0"></div>
        <div class="mfield" style="margin:0"><label style="font-size:10px">protein g</label><input type="number" id="ql-vit-protein" value="${(s.quickLogOverrides?.[p]?.vitamins?.protein_g) ?? vitamins[p]?.protein_g ?? 0}" step="0.1" style="margin:0"></div>
        <div class="mfield" style="margin:0"><label style="font-size:10px">magnesium mg</label><input type="number" id="ql-vit-mag" value="${(s.quickLogOverrides?.[p]?.vitamins?.magnesium_mg) ?? vitamins[p]?.magnesium_mg ?? 175}" style="margin:0"></div>
        <div class="mfield" style="margin:0"><label style="font-size:10px">vit D mcg</label><input type="number" id="ql-vit-vitd" value="${(s.quickLogOverrides?.[p]?.vitamins?.vitd_mcg) ?? vitamins[p]?.vitd_mcg ?? 2.1}" step="0.1" style="margin:0"></div>
        <div class="mfield" style="margin:0"><label style="font-size:10px">B12 mcg</label><input type="number" id="ql-vit-b12" value="${(s.quickLogOverrides?.[p]?.vitamins?.b12_mcg) ?? vitamins[p]?.b12_mcg ?? 2.2}" step="0.1" style="margin:0"></div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="saveQuickLogVitamins()">Save vitamins</button>
    </div>
  `;
}

function saveQuickLogCoffee() {
  if (!S.settings.quickLogOverrides) S.settings.quickLogOverrides = {};
  if (!S.settings.quickLogOverrides.nacho) S.settings.quickLogOverrides.nacho = {};
  const hasHoney = document.getElementById('ql-nacho-coffee-honey').checked;
  const cal = parseFloat(document.getElementById('ql-nacho-coffee-cal').value);
  const carbs = parseFloat(document.getElementById('ql-nacho-coffee-carbs').value);
  S.settings.quickLogOverrides.nacho.coffeeHoney = hasHoney;
  S.settings.quickLogOverrides.nacho.coffee = {
    meal: hasHoney ? 'Coffee with milk and honey' : 'Coffee with milk',
    calories: isNaN(cal) ? (hasHoney ? 55 : 30) : cal,
    protein_g: 2, carbs_g: isNaN(carbs) ? (hasHoney ? 10 : 3) : carbs,
    netcarbs_g: isNaN(carbs) ? (hasHoney ? 10 : 3) : carbs,
    fat_g: 1, fibre_g: 0, magnesium_mg: 8, vitd_mcg: 0, iron_mg: 0.1,
    calcium_mg: 50, zinc_mg: 0.1, b12_mcg: 0.2, omega3_g: 0, potassium_mg: 90, vitc_mg: 0, folate_mcg: 2
  };
  // Apply override to the live QUICK_MEALS object
  if (window.QUICK_MEALS) window.QUICK_MEALS.coffee.nacho = { ...S.settings.quickLogOverrides.nacho.coffee };
  save();
  showToast(hasHoney ? 'Coffee with honey saved ✓' : 'Coffee without honey saved ✓');
}

function saveQuickLogHypo() {
  const desc = document.getElementById('ql-hypokit').value;
  const cal = parseFloat(document.getElementById('ql-hypokcal').value);
  const carbs = parseFloat(document.getElementById('ql-hypocarbs').value);
  S.settings.hypoKit.gabi = desc;
  if (!S.settings.hypoMacros) S.settings.hypoMacros = {};
  S.settings.hypoMacros.gabi = { calories: isNaN(cal) ? 50 : cal, carbs_g: isNaN(carbs) ? 13 : carbs };
  save();
  syncHypoQuickBtn();
  showToast('Hypo correction saved ✓');
}

function saveQuickLogVitamins() {
  const p = S.currentPerson;
  if (!S.settings.quickLogOverrides) S.settings.quickLogOverrides = {};
  if (!S.settings.quickLogOverrides[p]) S.settings.quickLogOverrides[p] = {};
  const name = document.getElementById('ql-vit-name').value.trim() || 'Vitamins';
  const cal = parseFloat(document.getElementById('ql-vit-cal').value);
  const carbs = parseFloat(document.getElementById('ql-vit-carbs').value);
  const protein = parseFloat(document.getElementById('ql-vit-protein').value);
  const mag = parseFloat(document.getElementById('ql-vit-mag').value);
  const vitd = parseFloat(document.getElementById('ql-vit-vitd').value);
  const b12 = parseFloat(document.getElementById('ql-vit-b12').value);
  const vitOverride = {
    meal: name,
    calories: isNaN(cal) ? 18 : cal,
    protein_g: isNaN(protein) ? 0.1 : protein,
    carbs_g: isNaN(carbs) ? 4.3 : carbs,
    netcarbs_g: isNaN(carbs) ? 4.3 : carbs,
    fat_g: 0, fibre_g: 0,
    magnesium_mg: isNaN(mag) ? 175 : mag,
    vitd_mcg: isNaN(vitd) ? 2.1 : vitd,
    iron_mg: 0, calcium_mg: 0,
    zinc_mg: 1.5, b12_mcg: isNaN(b12) ? 2.2 : b12,
    omega3_g: 0, potassium_mg: 0, vitc_mg: 12, folate_mcg: 83.3
  };
  S.settings.quickLogOverrides[p].vitamins = vitOverride;
  // Apply override to the live QUICK_MEALS object
  if (window.QUICK_MEALS) window.QUICK_MEALS.multivitamins[p] = { ...vitOverride };
  save();
  showToast('Vitamins updated ✓');
}

// ── API KEY & SYNC (moved out of the old single Settings screen) ───────────
// Three providers, one paste box. Groq (gsk_) and Cerebras (csk-) have
// unambiguous fixed prefixes, so those are matched explicitly; anything
// else is bucketed as Gemini by default (Google's own key formats vary —
// standard AI Studio keys start "AIzaSy...", but other Google auth flows
// issue differently-shaped keys/tokens, e.g. "AQ."-prefixed strings).
// Order within a bucket is preserved, and that order is the fallback
// order. Nothing here is hardcoded; everything comes from what gets
// pasted into the textarea.
function classifyApiKey(k) {
  if (/^gsk_/.test(k)) return 'groq';
  if (/^csk-/.test(k)) return 'cerebras';
  if (k && k.length >= 8) return 'gemini';
  return null;
}
function getGeminiKeys() {
  try {
    const raw = localStorage.getItem('gemini_api_keys');
    if (raw) {
      const keys = JSON.parse(raw);
      if (Array.isArray(keys)) return keys.filter(Boolean);
    }
  } catch (e) {}
  // Fall back to the old single-key slot, in case this device only ever
  // had a key saved before the multi-key list existed.
  const single = localStorage.getItem('gemini_api_key');
  return single ? [single] : [];
}
function getGroqKeysForDisplay() {
  try { const raw = localStorage.getItem('groq_api_keys'); if (raw) { const k = JSON.parse(raw); if (Array.isArray(k)) return k.filter(Boolean); } } catch (e) {}
  return [];
}
function getCerebrasKeysForDisplay() {
  try { const raw = localStorage.getItem('cerebras_api_keys'); if (raw) { const k = JSON.parse(raw); if (Array.isArray(k)) return k.filter(Boolean); } } catch (e) {}
  return [];
}
function renderApiKeyBody() {
  const geminiKeys = getGeminiKeys();
  const groqKeys = getGroqKeysForDisplay();
  const cerebrasKeys = getCerebrasKeysForDisplay();
  const allKeys = [...geminiKeys, ...groqKeys, ...cerebrasKeys];
  const hasAnyKeySaved = allKeys.length > 0;
  const summary = [
    geminiKeys.length ? `${geminiKeys.length} Gemini` : null,
    groqKeys.length ? `${groqKeys.length} Groq` : null,
    cerebrasKeys.length ? `${cerebrasKeys.length} Cerebras` : null
  ].filter(Boolean).join(' · ') || 'none';
  document.getElementById('apikey-body').innerHTML = `
    <div class="trend-card">
      <div style="font-family:'Baloo 2',sans-serif;font-style:italic;font-size:15px;margin-bottom:10px">Automatic food sorting</div>

      <div id="gemini-key-saved-view" class="themed-soil-box" style="display:${hasAnyKeySaved?'flex':'none'};align-items:center;justify-content:space-between;padding:9px 11px">
        <span style="font-size:13px;color:var(--sage)">✓ ${summary} saved on this device</span>
        <button type="button" class="btn btn-secondary weight-log-btn" onclick="editGeminiKey()">Change</button>
      </div>
      <div id="gemini-key-edit-view" style="display:${hasAnyKeySaved?'none':'block'}">
        <textarea id="set-gemini-key" rows="6" placeholder="Paste your Gemini, Groq, and/or Cerebras keys — one per line, any order" style="width:100%;background:var(--soil);border:1px solid var(--clay);border-radius:10px;color:var(--bone);font-family:'JetBrains Mono',monospace;font-size:12px;padding:9px 11px;resize:vertical">${allKeys.join('\n')}</textarea>
        <div style="font-family:'Baloo 2',sans-serif;font-size:10px;color:var(--mist);margin:4px 0 8px">
          One key per line, mix providers freely — Groq ("gsk_…") and Cerebras ("csk-…") are matched by their fixed prefix; anything else is treated as a Gemini key. Cerebras is tried first by default (then Groq, then Gemini) — except for photo logging, which only Gemini can handle and skips straight to it. The app stops at the first key that works. Blank or too-short lines are skipped and reported below.
        </div>
        <button type="button" class="btn btn-secondary weight-log-btn" onclick="saveGeminiKeyOnly()">Save</button>
      </div>
    </div>
    <div class="trend-card">
      <div style="font-family:'Baloo 2',sans-serif;font-style:italic;font-size:15px;margin-bottom:10px">Storage migration</div>
      <div id="migrate-status" style="font-size:13px;color:var(--mist);margin-bottom:8px"></div>
      <button class="btn btn-secondary" id="migrate-btn" onclick="runStorageMigration()">Storage migration (checking…)</button>
    </div>
    <div class="trend-card">
      <div style="font-family:'Baloo 2',sans-serif;font-style:italic;font-size:15px;margin-bottom:10px">Backup & recovery</div>

      <label class="file-btn">
        Restore from CSV
        <input type="file" accept=".csv,text/csv" onchange="restoreFromCSV(event)">
      </label>
    </div>
    <div class="trend-card">
      <div style="font-family:'Baloo 2',sans-serif;font-style:italic;font-size:15px;margin-bottom:10px;color:var(--terra)">Migrate data</div>

      <button class="btn btn-secondary" onclick="copyMigrationBundle()">Copy migration bundle</button>
      <button class="btn btn-secondary" onclick="exportMigrationBundle()" style="margin-top:8px">Download migration bundle (.txt)</button>
      <button class="btn btn-secondary" onclick="downloadAppSource()" style="margin-top:8px">Download app source (.html)</button>
    </div>
  `;
  renderMigrateButtonState();
}
function saveGeminiKeyOnly() {
  const raw = document.getElementById('set-gemini-key').value;
  // Trim, drop blanks, dedupe while preserving order (order = fallback
  // order within that provider's bucket), then sort each line into its
  // provider by prefix. Anything unrecognized (e.g. a pasted browser/OAuth
  // token instead of a real API key) is skipped, not silently dropped —
  // saveGeminiKeyOnly reports the count so it's obvious something needs a
  // second look rather than the feature just quietly not working.
  const lines = [...new Set(raw.split(/[\n,]/).map(k => k.trim()).filter(Boolean))];
  const buckets = { gemini: [], groq: [], cerebras: [] };
  let unrecognized = 0;
  lines.forEach(k => {
    const kind = classifyApiKey(k);
    if (kind) buckets[kind].push(k); else unrecognized++;
  });

  localStorage.setItem('gemini_api_keys', JSON.stringify(buckets.gemini));
  localStorage.setItem('groq_api_keys', JSON.stringify(buckets.groq));
  localStorage.setItem('cerebras_api_keys', JSON.stringify(buckets.cerebras));
  // Keep the old single-key slot in sync too (first Gemini key), so nothing
  // else in the app that might still read it directly sees a stale value.
  if (buckets.gemini.length) localStorage.setItem('gemini_api_key', buckets.gemini[0]);
  else localStorage.removeItem('gemini_api_key');

  const totalSaved = buckets.gemini.length + buckets.groq.length + buckets.cerebras.length;
  if (totalSaved) {
    document.getElementById('gemini-key-edit-view').style.display = 'none';
    document.getElementById('gemini-key-saved-view').style.display = 'flex';
  }
  const parts = [
    buckets.gemini.length ? `${buckets.gemini.length} Gemini` : null,
    buckets.groq.length ? `${buckets.groq.length} Groq` : null,
    buckets.cerebras.length ? `${buckets.cerebras.length} Cerebras` : null
  ].filter(Boolean);
  let msg = parts.length ? `Saved: ${parts.join(', ')}` : 'Keys cleared';
  if (unrecognized) msg += ` · ${unrecognized} line${unrecognized>1?'s':''} not recognized as a key, skipped`;
  showToast(msg);
  renderApiKeyBody();
}
function editGeminiKey() {
  document.getElementById('gemini-key-saved-view').style.display = 'none';
  const editView = document.getElementById('gemini-key-edit-view');
  editView.style.display = 'block';
  document.getElementById('set-gemini-key').focus();
}
function saveSettings() {
  save();
  renderWater();
  showToast('Settings saved');
}
function quickLogHypo() {
  const desc = (S.settings.hypoKit.gabi || document.getElementById('set-hypokit-gabi')?.value || '2 cookies').trim() || '2 cookies';
  const macros = (S.settings.hypoMacros && S.settings.hypoMacros.gabi) || { calories: 50, carbs_g: 13 };
  const date = logDateStr('meal');
  const now = logTimeStr('meal');
  S.entries.push({
    id: Date.now()+Math.random(), record_type:'meal', person:'gabi', date,
    meal: desc, meal_type: 'snack', logged_at: now,
    calories: macros.calories, protein_g:0, carbs_g: macros.carbs_g, netcarbs_g: macros.carbs_g, fat_g:0, fibre_g:0,
    magnesium_mg:0, vitd_mcg:0, iron_mg:0, calcium_mg:0, zinc_mg:0, b12_mcg:0,
    omega3_g:0, potassium_mg:0, vitc_mg:0, folate_mcg:0, hypo_correction:true, full_day:false
  });
  save();
  renderVitals(); renderLogTab(); syncHypoQuickBtn();
  showToast('Low logged — ' + desc + (date !== todayStr() ? ' for ' + date : ''));
  const overlay = document.getElementById('settings-overlay');
  if (overlay && overlay.classList.contains('open')) closeSettings();
}

// ── XLSX EXPORT ───────────────────────────────────────────────────────────
// Uses SheetJS (xlsx) loaded from CDN
function exportXLSX() {
  if (typeof XLSX === 'undefined') {
    // Load SheetJS dynamically then retry
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => buildAndDownloadXLSX();
    s.onerror = () => showToast('Could not load XLSX library');
    document.head.appendChild(s);
  } else {
    buildAndDownloadXLSX();
  }
}

function buildAndDownloadXLSX() {
  const wb = XLSX.utils.book_new();
  const entries = S.entries || [];
  const wl = S.weightLog || [];

  // ── TAB 1: All meals ──
  const mealRows = entries.filter(e=>e.record_type==='meal').map(e => ({
    Date: e.date, Person: e.person, Meal: e.meal, Time: e.logged_at,
    Type: e.meal_type, Calories: Math.round(e.calories||0),
    Protein_g: Math.round(e.protein_g||0), Carbs_g: Math.round(e.carbs_g||0),
    NetCarbs_g: Math.round(e.netcarbs_g||0), Fat_g: Math.round(e.fat_g||0),
    Fibre_g: Math.round(e.fibre_g||0), Magnesium_mg: Math.round(e.magnesium_mg||0),
    VitD_mcg: Math.round(e.vitd_mcg||0), Iron_mg: Math.round(e.iron_mg||0),
    Calcium_mg: Math.round(e.calcium_mg||0), Zinc_mg: Math.round(e.zinc_mg||0),
    B12_mcg: Math.round(e.b12_mcg||0), Omega3_g: parseFloat((e.omega3_g||0).toFixed(1)),
    Potassium_mg: Math.round(e.potassium_mg||0), VitC_mg: Math.round(e.vitc_mg||0),
    Folate_mcg: Math.round(e.folate_mcg||0), Full_day: e.full_day?'Y':'N',
    Hypo_correction: e.hypo_correction?'Y':'N'
  }));
  const ws1 = XLSX.utils.json_to_sheet(mealRows);
  styleSheet(ws1, mealRows.length);
  XLSX.utils.book_append_sheet(wb, ws1, 'Meals');

  // ── TAB 2: Daily summaries (complete days only) ──
  const allDates = [...new Set(entries.map(e=>e.date))].sort();
  const summaryRows = [];
  allDates.forEach(d => {
    ['gabi','nacho'].forEach(person => {
      const dm = entries.filter(e=>e.person===person&&e.date===d&&e.record_type==='meal');
      if (!dm.length) return;
      const full = dm.some(e=>e.full_day);
      const target = S.mission[person]?.kcal||0;
      // Hypo corrections are excluded from the calorie target comparison —
      // they're a treatment for a low, not part of the day's intended intake.
      const kcalDm = dm.filter(e=>!e.hypo_correction);
      const totalKcal = Math.round(kcalDm.reduce((a,b)=>a+(b.calories||0),0));
      const hypoCount = dm.length - kcalDm.length;
      summaryRows.push({
        Date: d, Person: person, Full_day: full?'Y':'N',
        Total_kcal: totalKcal, Target_kcal: target,
        Delta_kcal: totalKcal - target,
        Protein_g: Math.round(dm.reduce((a,b)=>a+(b.protein_g||0),0)),
        Carbs_g: Math.round(dm.reduce((a,b)=>a+(b.carbs_g||0),0)),
        Fat_g: Math.round(dm.reduce((a,b)=>a+(b.fat_g||0),0)),
        Meals_logged: dm.length,
        Hypo_corrections: hypoCount
      });
    });
  });
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  styleSheet(ws2, summaryRows.length);
  XLSX.utils.book_append_sheet(wb, ws2, 'Daily Summary');

  // ── TAB 3: Weight log ──
  const weightRows = wl.sort((a,b)=>a.date.localeCompare(b.date)).map(w => ({
    Date: w.date, Person: w.person, Weight_kg: w.kg
  }));
  const ws3 = XLSX.utils.json_to_sheet(weightRows.length ? weightRows : [{Date:'',Person:'',Weight_kg:''}]);
  XLSX.utils.book_append_sheet(wb, ws3, 'Weight Log');

  // ── TAB 4: Workouts ──
  const wkRows = entries.filter(e=>e.record_type==='workout').map(e=>({
    Date: e.date, Person: e.person, Type: e.workout_type,
    Duration_min: e.duration_min||0, Intensity: e.intensity||'',
    Calories_burned: Math.round(e.calories_burned||0), Notes: e.notes||''
  }));
  const ws4 = XLSX.utils.json_to_sheet(wkRows.length ? wkRows : [{Date:'',Person:'',Type:''}]);
  XLSX.utils.book_append_sheet(wb, ws4, 'Workouts');

  // ── TAB 5: Micronutrient averages ──
  const microKeys = ['magnesium_mg','vitd_mcg','iron_mg','calcium_mg','zinc_mg','b12_mcg','omega3_g','potassium_mg','vitc_mg','folate_mcg'];
  const RDA_vals = { magnesium_mg:375, vitd_mcg:15, iron_mg:8, calcium_mg:1000, zinc_mg:10, b12_mcg:2.4, omega3_g:1.6, potassium_mg:3500, vitc_mg:80, folate_mcg:400 };
  const microRows = [];
  ['gabi','nacho'].forEach(person => {
    const completeDays = [...new Set(
      entries.filter(e=>e.person===person&&e.record_type==='meal'&&e.full_day).map(e=>e.date)
    )];
    if (!completeDays.length) return;
    const row = { Person: person, Complete_days: completeDays.length };
    microKeys.forEach(k => {
      const avg = completeDays.reduce((acc,d)=>{
        return acc + entries.filter(e=>e.person===person&&e.date===d&&e.record_type==='meal').reduce((a,b)=>a+(b[k]||0),0);
      },0) / completeDays.length;
      const rda = (k==='iron_mg'&&person==='gabi') ? 18 : RDA_vals[k];
      row[k+'_avg'] = parseFloat(avg.toFixed(1));
      row[k+'_%RDA'] = Math.round((avg/rda)*100);
    });
    microRows.push(row);
  });
  const ws5 = XLSX.utils.json_to_sheet(microRows.length ? microRows : [{Person:'',Note:'No complete days logged yet'}]);
  XLSX.utils.book_append_sheet(wb, ws5, 'Micronutrients');

  // ── TAB 6: Mission targets ──
  const missionRows = ['gabi','nacho'].map(person => {
    const m = S.mission[person];
    return {
      Person: person, Weight_kg: m.weight, Height_cm: m.height, Age: m.age,
      Goal_target_kg: m.goalTargetWeight, Goal_timeframe: m.goalTimeframe, Goal_date: resolveGoalTargetDate(m),
      Activity: m.activityLevel, Daily_kcal: m.kcal,
      Protein_g: m.protein, Carbs_g: m.carbs, Fat_g: m.fat
    };
  });
  const ws6 = XLSX.utils.json_to_sheet(missionRows);
  XLSX.utils.book_append_sheet(wb, ws6, 'Targets');

  // ── TAB 7: Water + daily target hits ──
  const waterRows = entries.filter(e=>e.record_type==='water').sort((a,b)=>a.date.localeCompare(b.date)).map(e => {
    const t = (S.dailyTargets[e.person]&&S.dailyTargets[e.person][e.date]) || {};
    const mlVal = getWaterMlForEntry(e);
    return { Date: e.date, Person: e.person, ml: mlVal, Goal_ml: getWaterGoal(e.person), Water_hit: t.water?'Y':'N', Steps_hit: t.steps?'Y':'N', Workout_hit: t.workout?'Y':'N' };
  });
  const ws7 = XLSX.utils.json_to_sheet(waterRows.length ? waterRows : [{Date:'',Person:'',ml:''}]);
  XLSX.utils.book_append_sheet(wb, ws7, 'Water & Targets');

  XLSX.writeFile(wb, 'la-salud-report-' + todayStr() + '.xlsx');
  showToast('Report downloaded');
}

function styleSheet(ws, rowCount) {
  // Set column widths
  const cols = Object.keys(ws).filter(k=>k[0]!=='!').map(k=>k.replace(/\d/g,''));
  const uniq = [...new Set(cols)];
  ws['!cols'] = uniq.map(()=>({ wch: 14 }));
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  backfillDailyTargets(); renderWeightHistories(); checkGeminiKeyHint();
  // Apply any saved quick-log overrides (e.g. Nacho's coffee without honey)
  if (typeof applyQuickLogOverrides === 'function') applyQuickLogOverrides();
});

// ── RETROSPECTIVE DATE / TIME ──────────────────────────────────────────────
function _openRetroRow(rowId, dateId, timeId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const open = row.style.display === 'flex';
  row.style.display = open ? 'none' : 'flex';
  if (!open) {
    if (!document.getElementById(dateId).value) {
      const d = new Date(); d.setDate(d.getDate()-1);
      document.getElementById(dateId).value = toLocalDateStr(d);
    }
    if (!document.getElementById(timeId).value) document.getElementById(timeId).value = '12:00';
  }
}
function toggleRetroDate()   { _openRetroRow('retro-date-row','retro-date-input','retro-time-input'); }
function toggleRetroDateWk() { _openRetroRow('retro-date-row-wk','retro-date-input-wk','retro-time-input-wk'); }
function clearRetroDate() {
  ['retro-date-input','retro-time-input'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('retro-date-row').style.display = 'none';
}
function clearRetroDateWk() {
  ['retro-date-input-wk','retro-time-input-wk'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('retro-date-row-wk').style.display = 'none';
}

