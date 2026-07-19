// ════════════════════════════════════════════════════════════════════════
// LOG.JS — the Log interface (today's list, water, backdating) plus the
// meal/day detail overlay.
// Merged during file consolidation (July 2026) from: log.js and
// entry-detail.js. Note: the day-detail view here (openDayDetail /
// _eddRenderView etc.) is also opened from the Progress tab's History list
// (see progress.js) — it's kept in this file because the meal-level detail
// panel it shares a state machine with is fundamentally a Log feature.
// ════════════════════════════════════════════════════════════════════════

// ── WATER: BACKDATE LOG ───────────────────────────────────────────────────
// One unified flow (matches the Meal/Workout tabs' "📅 Backdate Log"):
// pick a date, then the MAIN water buttons above (+500/-250/+250/+750/+1000)
// accumulate into a pending in-memory total for that date instead of writing
// to today. Submit commits the pending total as a single water entry for the
// picked date. Replaces the old dual "tap retro buttons / type+Set amount"
// UIs, neither of which behaved like the main water buttons.
let waterRetroPendingMl = 0;

function isWaterBackdating() {
  const row = document.getElementById('wtr-retro-row');
  return !!(row && row.style.display !== 'none');
}

function getWaterRetroDate() {
  const input = document.getElementById('wtr-retro-date-input');
  return (input && input.value) ? input.value : todayStr();
}

function toggleWaterRetroDate() {
  const row = document.getElementById('wtr-retro-row');
  if (!row) return;
  const opening = row.style.display === 'none';
  row.style.display = opening ? 'flex' : 'none';
  if (opening) {
    const dateInput = document.getElementById('wtr-retro-date-input');
    if (dateInput && !dateInput.value) {
      const d = new Date(); d.setDate(d.getDate() - 1);
      dateInput.value = toLocalDateStr(d);
    }
    waterRetroPendingMl = 0;
    syncWaterRetroPendingUI();
    renderWater();
  } else {
    clearWaterRetroDate();
  }
}

function clearWaterRetroDate() {
  const row = document.getElementById('wtr-retro-row');
  const pendingRow = document.getElementById('wtr-retro-pending-row');
  const dateInput = document.getElementById('wtr-retro-date-input');
  if (row) row.style.display = 'none';
  if (pendingRow) pendingRow.style.display = 'none';
  if (dateInput) dateInput.value = '';
  waterRetroPendingMl = 0;
  syncWaterResetNote();
  renderWater();
}

function onWaterRetroDateChange() {
  waterRetroPendingMl = 0;
  syncWaterRetroPendingUI();
  renderWater();
}

function syncWaterRetroPendingUI() {
  const pendingRow = document.getElementById('wtr-retro-pending-row');
  const dateLabel = document.getElementById('wtr-retro-pending-date');
  const amountLabel = document.getElementById('wtr-retro-pending-amount');
  if (pendingRow) pendingRow.style.display = 'flex';
  if (dateLabel) dateLabel.textContent = getWaterRetroDate();
  if (amountLabel) amountLabel.textContent = waterRetroPendingMl + ' ml';
  syncWaterResetNote();
}

// While backdating, swap the "Resets every day at midnight" note for a
// clear reminder of which date the buttons above are currently feeding —
// the main affordance the bug report asked for: same buttons, different
// destination, with no ambiguity about which one is active.
function syncWaterResetNote() {
  const note = document.getElementById('water-reset-note');
  if (!note) return;
  note.textContent = isWaterBackdating()
    ? 'Logging for ' + getWaterRetroDate() + ' — tap the buttons above, then Submit'
    : 'Resets every day at midnight';
}

function submitWaterRetroAmount() {
  if (waterRetroPendingMl <= 0) { showToast('Tap the water buttons above to add an amount first'); return; }
  const date = getWaterRetroDate();
  const person = S.currentPerson;
  const current = getWaterMlForEntry(getWaterEntry(person, date));
  setWaterMlForDate(person, date, current + waterRetroPendingMl);
  showToast('Logged ' + waterRetroPendingMl + ' ml for ' + date);
  // Stay in backdating mode (same date) so multiple entries can be logged
  // in a row — just reset the pending total back to 0, same as the giant
  // number resetting after a normal day rolls over.
  waterRetroPendingMl = 0;
  syncWaterRetroPendingUI();
  renderWater();
}

// Same write path as setWaterMl(), generalised to take an explicit date
// instead of always today — setWaterMl() itself is left untouched so the
// main Water tab keeps behaving exactly as before for today's entry.
function setWaterMlForDate(person, date, ml) {
  const amount = Math.max(0, ml);
  let e = getWaterEntry(person, date);
  if (e) { e.ml = amount; }
  else { e = { id: Date.now()+Math.random(), record_type:'water', person, date, ml: amount, logged_at: new Date().toTimeString().slice(0,5) }; S.entries.push(e); }
  checkDailyTargets(person, date);
  save();
  if (date === todayStr()) renderWater();
}

// ── PARSE AI OUTPUT (meals + workouts) ────────────────────────────────────
function normaliseLine(line) {
  const obj = {};
  const pairs = line.split('|').slice(1);
  pairs.forEach(p => {
    const [k, ...rest] = p.split(':');
    const v = rest.join(':').trim();
    if (!k || v === undefined || v === '') return;
    const key = k.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    // Time and Notes must stay strings even if they contain digits —
    // e.g. "10:25" was being coerced to the number 1025, which then
    // crashed downstream code expecting a string with .split(':').
    if (key === 'time' || key === 'notes') { obj[key] = v; return; }
    const num = parseFloat(v.replace(/[^\d.\-]/g,''));
    obj[key] = (!isNaN(num) && /\d/.test(v)) ? num : v;
  });
  return obj;
}

// Guards against malformed AI output ever reaching stored history. A "meal"
// name that's just digits/punctuation, blank, or a single character is
// almost always a parsing artifact (e.g. the AI split "4 mejillones" into
// a separate line with just "4" as the name) — never a real food item.
// Returns true if this looks like a genuine food entry worth keeping.
function isPlausibleMealName(name) {
  const n = (name || '').toString().trim();
  if (n.length < 3) return false;
  if (/^[\d\s.,;:%-]+$/.test(n)) return false; // digits/punctuation only
  if (!/[a-zA-ZÀ-ÿ]/.test(n)) return false; // must contain actual letters
  return true;
}

// Coerces any value (number, numeric string, non-numeric string, undefined)
// into a guaranteed real number. Used for every numeric meal field so a
// stray non-numeric string from AI parsing (see normaliseLine's fallback)
// can never reach S.entries and silently turn into NaN downstream.
function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// Maps free-text AI-extracted workout type + intensity into the app's
// canonical scheme (Walking/Cardio[Zone2|HIIT]/Strength/Mobility), so
// AI-logged workouts get correctly classified by the Potate score —
// previously raw.type/raw.intensity were stored as-is (e.g. "Cycling" /
// "High"), which never matched the Zone2/HIIT pillar checks and silently
// fell through both buckets.
function normaliseAIWorkout(rawType, rawIntensity) {
  const t = (rawType || '').toLowerCase();
  const i = (rawIntensity || '').toLowerCase();

  const STRENGTH_WORDS = ['strength','weights','weight training','lifting','gym','resistance'];
  const MOBILITY_WORDS = ['mobility','stretch','yoga'];
  const WALK_WORDS = ['walk','walking','steps'];
  const CARDIO_WORDS = ['run','running','jog','cycling','bike','biking','swim','swimming',
    'rowing','elliptical','cardio','hiit','spin','interval'];

  let workoutType = rawType || 'Workout';
  let intensity = '';

  if (WALK_WORDS.some(w => t.includes(w))) {
    workoutType = 'Walking';
  } else if (STRENGTH_WORDS.some(w => t.includes(w))) {
    workoutType = 'Strength';
  } else if (MOBILITY_WORDS.some(w => t.includes(w))) {
    workoutType = 'Mobility';
  } else if (CARDIO_WORDS.some(w => t.includes(w)) || i) {
    // Any cardio-flavoured activity (or anything carrying an intensity at
    // all) is filed under Cardio, with intensity mapped to Zone2/HIIT:
    // High/Hard/Intense → HIIT, everything else (Low/Medium/easy/steady) → Zone2.
    workoutType = 'Cardio';
    intensity = (i.includes('high') || i.includes('hard') || i.includes('intense') || i === 'hiit')
      ? 'HIIT' : 'Zone2';
  }

  return { workoutType, intensity };
}

function parseAIOutput(text) {
  const results = [];
  const rejected = [];
  const lines = text.trim().split('\n').filter(l => l.trim());
  lines.forEach(line => {
    const head = line.trim().match(/^(GABI|NACHO|MEAL|WORKOUT)/i);
    if (!head) return;
    const tag = head[1].toUpperCase();

    if (tag === 'WORKOUT') {
      const raw = normaliseLine(line);
      const personField = (raw.person || S.currentPerson || 'gabi').toString().toLowerCase();
      const people = personField === 'both' ? ['gabi','nacho'] : [personField];
      const { workoutType, intensity } = normaliseAIWorkout(raw.type, raw.intensity);
      const aiDurationMin = num(raw.duration ?? raw.duration_min);
      people.forEach(person => {
        if (person !== 'gabi' && person !== 'nacho') return;
        results.push({
          id: Date.now() + Math.random(),
          record_type: 'workout',
          person,
          date: logDateStr('wk'),
          workout_type: workoutType,
          duration_min: aiDurationMin,
          intensity,
          calories_burned: num(raw.calories_burned ?? raw.caloriesburned),
          // AI-parsed free text never has a native "Steps" field like the
          // manual Walking logger — if the description named an exact step
          // count (e.g. "walked 8214 steps") prefer that, otherwise estimate
          // from whatever duration the AI extracted, same as the manual
          // logger does. This keeps Walking in steps everywhere regardless
          // of which logging path an entry came from.
          steps_logged: workoutType === 'Walking' ? estimateWalkingSteps(raw.notes, aiDurationMin) : 0,
          notes: raw.notes || '',
          logged_at: logTimeStr('wk')  // always actual device time, never AI-guessed
        });
      });
      return;
    }

    // MEAL line — either a generic "MEAL" tag (assigned to whoever is
    // currently selected in the app) or an explicit GABI/NACHO tag, kept
    // for backward compatibility and for manual overrides.
    const person = (tag === 'MEAL') ? (S.currentPerson || 'gabi') : tag.toLowerCase();
    const raw = normaliseLine(line);
    // Always use actual device time — the AI's Time field is ignored entirely
    // because it guesses from photo context and is unreliable.
    const nowTime = new Date().toTimeString().slice(0,5);
    const hour = new Date().getHours();
    // Hypo correction (fast sugar + slow carb for a low blood-sugar episode):
    // still logged as a meal for nutrition tracking, but excluded from the
    // calorie-vs-target math everywhere that's calculated. Recognised via a
    // "Hypo: yes/true/1" field on the line, OR the meal name containing the
    // word "hypo" or "correction" as a fallback if the field is missing.
    const hypoField = (raw.hypo ?? raw.hypo_correction ?? '').toString().toLowerCase();
    const isHypo = ['yes','true','1','y'].includes(hypoField) ||
      /\b(hypo|correction)\b/i.test(raw.meal || '');

    // Daily supplement stack (magnesium/ashwagandha/multivitamin etc.):
    // tagged as "vitamins" rather than the usual time-of-day meal label,
    // so it reads correctly under the meal name regardless of what time
    // it's logged or backfilled at.
    const isVitamins = /\b(vitamin|multivitamin|ashwagandha)\b/i.test(raw.meal || '');

    if (!isPlausibleMealName(raw.meal)) {
      rejected.push(line.trim());
      return;
    }

    results.push({
      id: Date.now() + Math.random(),
      record_type: 'meal',
      person,
      date: logDateStr('meal'),
      meal: raw.meal || 'Meal',
      meal_type: isVitamins ? 'vitamins' : (hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 19 ? 'dinner' : 'snack'),
      logged_at: logTimeStr('meal'),  // always actual device time, never AI-guessed
      // num(): every numeric meal field MUST be a real number, never a raw
      // string. normaliseLine() falls back to storing the raw string when it
      // can't confidently parse a value out of the AI's text (e.g. "trace",
      // "N/A", or any non-numeric reply) — left unguarded here, that string
      // flows straight into S.entries and poisons every downstream sum
      // (micronutrient averages, the POTATES score) with NaN the moment any
      // arithmetic touches it. parseFloat(...)||0 guarantees a number no
      // matter what shape the raw value arrives in.
      calories: num(raw.calories),
      protein_g: num(raw.protein ?? raw.protein_g),
      carbs_g: num(raw.carbs ?? raw.carbs_g),
      netcarbs_g: num(raw.netcarbs ?? raw.netcarbs_g ?? raw.carbs ?? raw.carbs_g),
      fat_g: num(raw.fat ?? raw.fat_g),
      fibre_g: num(raw.fibre ?? raw.fibre_g),
      magnesium_mg: num(raw.magnesium ?? raw.magnesium_mg),
      vitd_mcg: num(raw.vitd ?? raw.vitd_mcg),
      iron_mg: num(raw.iron ?? raw.iron_mg),
      calcium_mg: num(raw.calcium ?? raw.calcium_mg),
      zinc_mg: num(raw.zinc ?? raw.zinc_mg),
      b12_mcg: num(raw.b12 ?? raw.b12_mcg),
      omega3_g: num(raw.omega3 ?? raw.omega3_g),
      potassium_mg: num(raw.potassium ?? raw.potassium_mg),
      vitc_mg: num(raw.vitc ?? raw.vitc_mg),
      folate_mcg: num(raw.folate ?? raw.folate_mcg),
      hypo_correction: isHypo,
      full_day: false
    });
  });
  results.rejected = rejected;
  return results;
}

// ── ADD ENTRY ──────────────────────────────────────────────────────────────
function commitEntries(parsed) {
  // Stamp day_kcal_target once per person per day — on the first entry logged
  // that day. Subsequent entries that day inherit the already-stamped value.
  // The scorer falls back to today's live target when this is absent (intentional,
  // for older entries), but stamping here means the snapshot is accurate over time.
  const stamped = parsed.map(e => {
    if (e.record_type !== 'meal') return e;
    const alreadyStamped = S.entries.some(x =>
      x.record_type === 'meal' && x.person === e.person && x.date === e.date && x.day_kcal_target > 0
    );
    if (alreadyStamped) return e;
    const m = S.mission[e.person];
    if (!m || !m.kcal) return e;
    return { ...e, day_kcal_target: m.kcal, day_protein_target: m.protein, day_carbs_target: m.carbs, day_fat_target: m.fat };
  });
  S.entries.push(...stamped);
}

function applyFullDayStatus() {
  // markDayComplete() is now the single source of truth for full_day status;
  // Submit Log no longer reads a separate checkbox (removed — it was a stray
  // leftover from the old "That's all I ate today" flow). Just report
  // whatever the day's current full_day state already is.
  const today = entriesFor(S.currentPerson, [todayStr()], 'meal');
  return today.length > 0 && today.some(e => e.full_day);
}

// ── MARK DAY AS COMPLETE — top-of-panel button, decoupled from Submit Log ──
// Toggles full_day immediately on tap, independent of whether there's
// anything in the paste box. Drives the same full_day field the checkbox
// and Submit Log flow use, so they all stay in sync no matter which one
// the person reaches for.
function markDayComplete() {
  const today = entriesFor(S.currentPerson, [todayStr()], 'meal');
  const wasFull = today.length > 0 && today.some(e => e.full_day);
  const next = !wasFull;

  if (!today.length) {
    const modeMsg = currentLogMode === 'meal'
      ? 'Log at least one meal today before marking the day complete'
      : 'Log at least one meal today before marking the day complete (switch to Meal to add one)';
    showToast(modeMsg);
    return;
  }

  S.entries.forEach(e => {
    if (e.date === todayStr() && e.person === S.currentPerson && e.record_type === 'meal') e.full_day = next;
  });

  save();
  renderVitals();
  renderLogTab();
  syncFullDayCheckbox();
  if (next) {
    const btn = document.getElementById('mark-complete-btn');
    if (btn) {
      btn.classList.remove('check-bounce');
      void btn.getBoundingClientRect();
      btn.classList.add('check-bounce');
    }
  }
  showToast(next ? 'Day marked complete' : 'Full-day mark removed');
}

// Reflects full_day state on the top button itself — badge + label + color
// swap when the day's already marked, so tapping again clearly reads as
// undo. Now lives outside any one mode panel (global to the whole Log tab),
// so this runs regardless of which of Meal/Workout/Water is currently open.
function syncMarkCompleteBtn() {
  const btn = document.getElementById('mark-complete-btn');
  const label = document.getElementById('mark-complete-label');
  if (!btn) return;
  const today = entriesFor(S.currentPerson, [todayStr()], 'meal');
  const isFull = today.length > 0 && today.some(e => e.full_day);
  if (label) label.textContent = isFull ? 'Day complete — tap to undo' : 'Complete Your Day';
  btn.style.background = isFull ? 'var(--sage)' : 'transparent';
  btn.style.border = isFull ? 'none' : '1.5px solid var(--sage)';
  btn.classList.toggle('mark-complete-glow', isFull);
}


async function submitLog() {
  if (aiLogMode === 'auto') { submitLogAuto(); return; }

  const text = document.getElementById('paste-input').value.trim();
  let addedCount = 0;
  let parsed = [];

  if (text) {
    parsed = parseAIOutput(text);
    if (!parsed.length && !parsed.rejected?.length) { showToast('Could not read that — check the format'); return; }
  }

  const wasFullBefore = entriesFor(S.currentPerson, [todayStr()], 'meal').some(e => e.full_day);
  const fullDay = applyFullDayStatus();
  const fullDayChanged = fullDay !== wasFullBefore;

  if (!text && !fullDayChanged) {
    showToast('Nothing to submit — paste a reply or tick/untick the full-day box');
    return;
  }

  // Manual mode has no AI call to time against, so this is always exactly
  // a fixed 3s "digesting" beat before anything actually commits.
  showDigestOverlay('meal');
  await hideDigestOverlay();

  if (text) {
    if (parsed.rejected && parsed.rejected.length) {
      showToast('Skipped ' + parsed.rejected.length + ' unreadable line' + (parsed.rejected.length>1?'s':'') + ' — check the reply and add manually if needed');
    }
    commitEntries(parsed);
    addedCount = parsed.length;
  }

  save();
  renderVitals();
  renderLogTab();
  syncFullDayCheckbox();
  syncHypoQuickBtn();
  document.getElementById('paste-input').value = '';

  // If 👫 was active: simply log the exact same parsed entries again for the
  // other person — same date, same time, same macros, no re-parsing, no
  // second AI call. Whatever date was selected (today or a retro date) is
  // already stamped on each entry in `parsed`, so the clone inherits it.
  if (mealLogForBoth) {
    const orig = S.currentPerson;
    const other = orig === 'gabi' ? 'nacho' : 'gabi';
    const cloned = parsed.map(e => ({ ...e, id: Date.now() + Math.random(), person: other }));
    cloned.forEach(e => { if (!S.entries.find(x => entryKey(x) === entryKey(e))) S.entries.push(e); });
    mealLogForBoth = false;
    const btn = document.getElementById('log-both-btn');
    const submitBtn = document.getElementById('submit-log-btn');
    if (btn) { btn.style.background = 'var(--bark)'; btn.style.color = 'var(--ochre)'; btn.classList.remove('both-active'); }
    if (submitBtn) submitBtn.textContent = 'Submit Log';
    save(); renderVitals(); renderLogTab();
    showToast('Logged for both ✓');
    return;
  }

  if (addedCount) {
    showToast('Added ' + addedCount + ' item' + (addedCount>1?'s':'') + (fullDayChanged ? (fullDay ? ' · day marked complete' : ' · full-day mark removed') : ''));
  } else {
    showToast(fullDay ? 'Day marked complete' : 'Full-day mark removed');
  }
}

// ── LOG MODE (Meal / Workout / Water) ────────────────────────────────────
let currentLogMode = 'meal';

function setLogMode(mode) {
  currentLogMode = mode;
  ['meal','workout','water'].forEach(m => {
    document.getElementById('log-mode-'+m).classList.toggle('active', m === mode);
    const panel = document.getElementById('log-panel-'+m);
    if (panel) panel.style.display = m === mode ? 'block' : 'none';
  });
  if (mode === 'water') renderWater();
  if (mode === 'workout') renderTodayWorkouts();
}

// ── QUICK LOG: coffee & breakfast ─────────────────────────────────────────
window.QUICK_MEALS = {
  coffee: {
    gabi:  { meal:'Coffee with milk', calories:30, protein_g:2, carbs_g:3, netcarbs_g:3, fat_g:1, fibre_g:0, magnesium_mg:8, vitd_mcg:0, iron_mg:0, calcium_mg:50, zinc_mg:0.1, b12_mcg:0.2, omega3_g:0, potassium_mg:80, vitc_mg:0, folate_mcg:2 },
    nacho: { meal:'Coffee with milk and honey', calories:55, protein_g:2, carbs_g:10, netcarbs_g:10, fat_g:1, fibre_g:0, magnesium_mg:8, vitd_mcg:0, iron_mg:0.1, calcium_mg:50, zinc_mg:0.1, b12_mcg:0.2, omega3_g:0, potassium_mg:90, vitc_mg:0, folate_mcg:2 }
  },
  breakfast: {
    gabi:  { meal:'Usual breakfast', calories:374, protein_g:24, carbs_g:23, netcarbs_g:19, fat_g:21, fibre_g:4, magnesium_mg:38, vitd_mcg:2.2, iron_mg:3, calcium_mg:120, zinc_mg:2.1, b12_mcg:1.2, omega3_g:0.3, potassium_mg:380, vitc_mg:18, folate_mcg:80 },
    nacho: { meal:'Usual breakfast', calories:395, protein_g:24, carbs_g:29, netcarbs_g:25, fat_g:21, fibre_g:4, magnesium_mg:40, vitd_mcg:2.2, iron_mg:3, calcium_mg:120, zinc_mg:2.1, b12_mcg:1.2, omega3_g:0.3, potassium_mg:390, vitc_mg:18, folate_mcg:82 }
  },
  multivitamins: {
    gabi:  { meal:'Vitamins', calories:18, protein_g:0.1, carbs_g:4.3, netcarbs_g:4.3, fat_g:0, fibre_g:0, magnesium_mg:175, vitd_mcg:2.1, iron_mg:0, calcium_mg:0, zinc_mg:1.5, b12_mcg:2.2, omega3_g:0, potassium_mg:0, vitc_mg:12, folate_mcg:83.3 },
    nacho: { meal:'Vitamins', calories:18, protein_g:0.1, carbs_g:4.3, netcarbs_g:4.3, fat_g:0, fibre_g:0, magnesium_mg:175, vitd_mcg:2.1, iron_mg:0, calcium_mg:0, zinc_mg:1.5, b12_mcg:2.2, omega3_g:0, potassium_mg:0, vitc_mg:12, folate_mcg:83.3 }
  }
};
const QUICK_MEALS = window.QUICK_MEALS;

// Apply saved overrides to QUICK_MEALS at startup
function applyQuickLogOverrides() {
  const overrides = S.settings && S.settings.quickLogOverrides;
  if (!overrides) return;
  ['gabi','nacho'].forEach(p => {
    if (!overrides[p]) return;
    if (overrides[p].coffee) QUICK_MEALS.coffee[p] = { ...QUICK_MEALS.coffee[p], ...overrides[p].coffee };
    if (overrides[p].vitamins) QUICK_MEALS.multivitamins[p] = { ...QUICK_MEALS.multivitamins[p], ...overrides[p].vitamins };
  });
}

function quickLogMeal(type) {
  const person = S.currentPerson;
  const date = logDateStr('meal');
  const now = logTimeStr('meal');
  const hour = new Date().getHours();
  const mealType = type === 'multivitamins' ? 'vitamins' : (hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 19 ? 'dinner' : 'snack');
  const people = mealLogForBoth ? [person, person === 'gabi' ? 'nacho' : 'gabi'] : [person];
  people.forEach(p => {
    const data = QUICK_MEALS[type][p];
    const alreadyStamped = S.entries.some(x =>
      x.record_type === 'meal' && x.person === p && x.date === date && x.day_kcal_target > 0
    );
    S.entries.push({
      id: Date.now() + Math.random(),
      record_type: 'meal', person: p,
      date,
      meal: data.meal,
      meal_type: mealType,
      logged_at: now,
      calories: data.calories, protein_g: data.protein_g, carbs_g: data.carbs_g,
      netcarbs_g: data.netcarbs_g, fat_g: data.fat_g, fibre_g: data.fibre_g,
      magnesium_mg: data.magnesium_mg, vitd_mcg: data.vitd_mcg, iron_mg: data.iron_mg,
      calcium_mg: data.calcium_mg, zinc_mg: data.zinc_mg, b12_mcg: data.b12_mcg,
      omega3_g: data.omega3_g, potassium_mg: data.potassium_mg, vitc_mg: data.vitc_mg,
      folate_mcg: data.folate_mcg, hypo_correction: false, full_day: false,
      ...(alreadyStamped || !(S.mission[p] && S.mission[p].kcal) ? {} : {
        day_kcal_target: S.mission[p].kcal,
        day_protein_target: S.mission[p].protein,
        day_carbs_target: S.mission[p].carbs,
        day_fat_target: S.mission[p].fat
      })
    });
  });
  if (mealLogForBoth) {
    mealLogForBoth = false;
    const btn = document.getElementById('log-both-btn');
    const submitBtn = document.getElementById('submit-log-btn');
    if (btn) { btn.style.background = 'var(--bark)'; btn.style.color = 'var(--ochre)'; btn.classList.remove('both-active'); }
    if (submitBtn) submitBtn.textContent = 'Submit Log';
  }
  save();
  renderVitals();
  renderLogTab();
  const data = QUICK_MEALS[type][person];
  showToast(data.meal + ' logged' + (people.length > 1 ? ' for both ✓' : '') + (date !== todayStr() ? ' for ' + date : ''));
}
function quickLogCoffee()        { quickLogMeal('coffee'); }
function quickLogMultivitamins() { quickLogMeal('multivitamins'); }

// ── PREVIOUS MEAL PICKER — Log tab ───────────────────────────────────────
// Lets you re-use anything you've logged before by title, with no typing.
function syncHypoQuickBtn() {
  const hypoBtn = document.getElementById('hypo-quick-btn');
  if (hypoBtn) hypoBtn.style.display = S.currentPerson === 'gabi' ? 'block' : 'none';
}

// ── NATIVE WORKOUT LOGGER ─────────────────────────────────────────────────
// Cardio was previously a single flat MET (7.0) regardless of Zone2 vs HIIT,
// which overestimated Zone 2 (steady, conversational-pace aerobic work is
// closer to 5.5-6 MET; 7+ is closer to a proper tempo/HIIT effort).
// WALK_STEPS_PER_MIN also drives both the estimated walk duration and (via
// the Walking MET below) the steps-based calorie estimate, so the two stay
// consistent with each other — bumped from 130 to 145 spm since 130 was
// underestimating a typical brisk walking cadence, which was inflating both
// the estimated duration and the calorie burn for step-based logging.
const WORKOUT_METS = { Walking: 3.5, Zone2: 5.5, HIIT: 8.5, Strength: 5.0, Stretching: 2.5 };
const WALK_STEPS_PER_MIN = 145;

// Best-effort step count for an AI-parsed Walking entry: prefer an explicit
// step count mentioned in the free-text notes (e.g. "8214 steps"), else
// estimate from the AI-extracted duration using the same WALK_STEPS_PER_MIN
// conversion the manual Walking logger uses.
function estimateWalkingSteps(notes, durationMin) {
  const m = (notes || '').match(/(\d[\d,]*)\s*steps/i);
  if (m) return parseInt(m[1].replace(/,/g, '')) || 0;
  return Math.round((durationMin || 0) * WALK_STEPS_PER_MIN);
}

// Single source of truth for how a workout entry's "amount" is displayed:
// Walking always shows steps (never minutes), every other type shows
// duration in minutes. Used by all workout-entry render spots so Walking
// can't accidentally show up in minutes in one place and steps in another.
function workoutAmountLabel(e) {
  if (e.workout_type === 'Walking') {
    return e.steps_logged ? e.steps_logged.toLocaleString() + ' steps' : '';
  }
  return e.duration_min ? e.duration_min + ' min' : '';
}

function burnEstimate(type, durationMin) {
  const weight = S.mission[S.currentPerson].weight || 70;
  return Math.round(((WORKOUT_METS[type] || 4) * weight * durationMin) / 60);
}
function burnEstimateFromSteps(steps) {
  const weight = S.mission[S.currentPerson].weight || 70;
  const durationMin = steps / WALK_STEPS_PER_MIN;
  return Math.round((WORKOUT_METS.Walking * weight * durationMin) / 60);
}

let selectedWorkoutType = null;
// Walking is always logged and displayed in steps — no duration mode.

let selectedCardioSub = null;
function selectCardioSub(sub) {
  selectedCardioSub = sub;
  document.querySelectorAll('.wk-cardio-sub-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(sub === 'Zone2' ? 'wk-csub-zone2' : 'wk-csub-hiit');
  if (el) el.classList.add('active');
}
function selectWorkoutType(btn) {
  selectedWorkoutType = btn.dataset.type;
  document.querySelectorAll('.wk-type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const isWalking = selectedWorkoutType === 'Walking';
  const isOther   = selectedWorkoutType === 'Other';
  const isCardio  = selectedWorkoutType === 'Cardio';
  document.getElementById('wk-walking-opts').style.display   = isWalking ? 'block' : 'none';
  document.getElementById('wk-cardio-subtype').style.display = isCardio  ? 'block' : 'none';
  document.getElementById('wk-duration-opts').style.display  = (!isWalking && !isOther) ? 'block' : 'none';
  document.getElementById('wk-other-opts').style.display     = isOther ? 'block' : 'none';
  if (!isCardio) { selectedCardioSub = null; document.querySelectorAll('.wk-cardio-sub-btn').forEach(b=>b.classList.remove('active')); }
  document.getElementById('wk-submit-btn').style.display    = 'flex';
  document.getElementById('wk-log-both-btn').style.display  = 'flex';
  // Reset both-flag when picking a new workout type
  workoutLogForBoth = false;
  const btn2 = document.getElementById('wk-log-both-btn');
  const submitBtn = document.getElementById('wk-submit-btn');
  if (btn2) { btn2.style.background = ''; btn2.style.color = ''; }
  if (submitBtn) submitBtn.textContent = 'Log workout';
}

async function submitWorkout() {
  if (!selectedWorkoutType) { showToast('Pick a workout type first'); return; }
  if (selectedWorkoutType === 'Other') { submitOtherWorkout(); return; }
  if (selectedWorkoutType === 'Cardio' && !selectedCardioSub) { showToast('Pick Zone 2 or High Intensity first'); return; }
  // Re-entrancy guard: the digesting cover below stays up for a fixed 3s,
  // and neither wk-submit-btn nor wk-log-both-btn were disabled during that
  // window — a second tap (impatient double-tap, or a stray duplicate touch
  // event) could kick off a second overlapping submitWorkout() call. Both
  // calls shared the same module-level digestOverlayStart/digestOverlaySeq,
  // so they'd resolve together and finish by both writing entries and both
  // running the reset logic — which is what made the form seem to stop
  // responding to further taps right after. Bail out immediately if a
  // submission is already in flight.
  if (submitWorkout._inFlight) return;
  submitWorkout._inFlight = true;
  const submitBtnGuard = document.getElementById('wk-submit-btn');
  const bothBtnGuard = document.getElementById('wk-log-both-btn');
  if (submitBtnGuard) submitBtnGuard.disabled = true;
  if (bothBtnGuard) bothBtnGuard.disabled = true;
  // Releases the re-entrancy guard + re-enables the buttons without
  // otherwise touching the form — used on every early-return validation
  // failure below so a "pick a type" / "enter steps" toast doesn't also
  // leave the form stuck disabled.
  const releaseGuard = () => {
    submitWorkout._inFlight = false;
    if (submitBtnGuard) submitBtnGuard.disabled = false;
    if (bothBtnGuard) bothBtnGuard.disabled = false;
  };
  const now = logTimeStr('wk');
  let durationMin = 0, caloriesBurned = 0, notes = '';

  if (selectedWorkoutType === 'Walking') {
    const steps = parseInt(document.getElementById('wk-steps').value) || 0;
    if (!steps) { showToast('Enter number of steps'); releaseGuard(); return; }
    // durationMin is kept internally only as an input to the MET calorie
    // formula below — steps are the one source of truth for Walking
    // everywhere it's displayed (today's log, history, Vitals, Progress).
    durationMin = Math.round(steps / WALK_STEPS_PER_MIN);
    caloriesBurned = burnEstimateFromSteps(steps);
  } else {
    durationMin = parseInt(document.getElementById('wk-duration').value) || 0;
    if (!durationMin) { showToast('Enter duration'); releaseGuard(); return; }
    // Cardio's MET depends on subtype (Zone2 vs HIIT) — selectedCardioSub is
    // validated at the top of this function before we ever get here.
    const metType = selectedWorkoutType === 'Cardio' ? selectedCardioSub : selectedWorkoutType;
    caloriesBurned = burnEstimate(metType, durationMin);
  }

  // Every field we need is validated and captured above — safe to show the
  // "digesting" cover now. Manual mode has no AI call to time against, so
  // this is always exactly a fixed 3s beat before the entry actually saves.
  //
  // Everything from here down is wrapped in try/finally: _inFlight (and the
  // two buttons it disabled above) MUST be released no matter what happens
  // — an uncaught error partway through used to leave _inFlight stuck at
  // `true` forever, which made every subsequent tap on "Log workout" a
  // silent no-op with no toast and no error, i.e. exactly "can't log any
  // more workouts".
  try {
    showDigestOverlay('workout', selectedWorkoutType);
    await hideDigestOverlay();

    const wType = selectedWorkoutType;
    const stepsVal = wType === 'Walking' ? (parseInt(document.getElementById('wk-steps').value) || 0) : 0;
    const intensityVal = wType === 'Cardio' ? selectedCardioSub : 'Medium';
    const entry = {
      id: Date.now() + Math.random(),
      record_type: 'workout', person: S.currentPerson,
      date: logDateStr('wk'), workout_type: wType,
      duration_min: durationMin, intensity: intensityVal,
      calories_burned: caloriesBurned, notes, logged_at: now,
      steps_logged: stepsVal
    };
    // entry.id is freshly generated above (Date.now()+Math.random()), so it's
    // already guaranteed unique — no dedup check needed here. There used to
    // be an `entryKey()`-based guard on this push, but entryKey() intentionally
    // ignores id (it's built for merging entries arriving from *different*
    // devices/sources, where ids legitimately differ for the same logical
    // entry). Gating a brand-new local push on it meant logging two workouts
    // of the same type in the same clock-minute (e.g. two Cardio sessions
    // back to back) collided on identical date+person+type+time and the
    // second one was silently thrown away — the toast still said "logged",
    // but nothing was actually saved, which is exactly what made it look
    // like the app stopped accepting new workouts.
    S.entries.push(entry);
    checkDailyTargets(S.currentPerson, entry.date);

    // If 👫 was active, clone for the other person too
    if (workoutLogForBoth) {
      const other = S.currentPerson === 'gabi' ? 'nacho' : 'gabi';
      const clone = Object.assign({}, entry, { id: Date.now() + Math.random(), person: other });
      clone.calories_burned = burnEstimateForPerson(other, wType, durationMin, stepsVal);
      S.entries.push(clone);
      checkDailyTargets(other, entry.date);
    }

    save();
    renderVitals();
    renderTodayWorkouts();

    const toastMsg = workoutLogForBoth ? (wType + ' logged for both ✓') : (wType + ' logged · ~' + caloriesBurned + ' kcal burned');

    // Reset form and both-flag
    workoutLogForBoth = false;
    document.querySelectorAll('.wk-type-btn').forEach(b => b.classList.remove('selected'));
    selectedWorkoutType = null;
    ['wk-walking-opts','wk-cardio-subtype','wk-duration-opts','wk-other-opts','wk-submit-btn','wk-log-both-btn'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.style.display = 'none'; if (el.tagName === 'BUTTON') { el.disabled = false; el.style.background = ''; el.style.color = ''; } }
    });
    const submitBtn = document.getElementById('wk-submit-btn');
    if (submitBtn) submitBtn.textContent = 'Log workout';
    selectedCardioSub = null;
    document.querySelectorAll('.wk-cardio-sub-btn').forEach(b=>b.classList.remove('active'));
    ['wk-steps','wk-duration'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const otherEl = document.getElementById('wk-other-desc'); if (otherEl) otherEl.value = '';
    showToast(toastMsg);
  } catch (err) {
    console.error('[submitWorkout] failed', err);
    showToast('Something went wrong logging that workout — try again');
  } finally {
    // Guaranteed to run whether the try block succeeded, threw, or returned
    // early — this is what makes the re-entrancy guard safe to use at all.
    submitWorkout._inFlight = false;
    if (submitBtnGuard) submitBtnGuard.disabled = false;
    if (bothBtnGuard) bothBtnGuard.disabled = false;
  }
}

// ── OTHER WORKOUT: AI parses free-text description ────────────────────────
async function submitOtherWorkout() {
  const forBoth = workoutLogForBoth;
  const desc = (document.getElementById('wk-other-desc').value || '').trim();
  if (!desc) { showToast('Describe what you did first'); return; }
  const key = getGeminiKey();
  if (!key) { showToast('Add your Gemini API key in Settings first'); return; }
  const btn  = document.getElementById('wk-submit-btn');
  const btn2 = document.getElementById('wk-log-both-btn');
  setBtnThinking(btn, true, 'Thinking…');
  showDigestOverlay('workout');
  if (btn2) btn2.disabled = true;
  const person = S.currentPerson;
  const weight = S.mission[person].weight || 70;
  const prompt = buildOtherWorkoutPrompt(desc, person, weight, forBoth);
  try {
    const reply = await askGemini(prompt);
    const parsed = parseAIOutput(reply);
    if (!parsed.length) { showToast('Could not parse workout — try being more specific'); return; }
    // Freshly-parsed entries already have unique ids — see the matching
    // note in submitWorkout() above for why the entryKey() dedup guard
    // isn't used on brand-new local pushes (it silently drops same-type
    // entries logged in the same clock-minute).
    parsed.forEach(e => S.entries.push(e));
    checkDailyTargets(person, parsed[0].date);
    if (forBoth) {
      const other = person === 'gabi' ? 'nacho' : 'gabi';
      const wOther = S.mission[other].weight || 70;
      const p2 = buildOtherWorkoutPrompt(desc, other, wOther, false);
      try {
        const r2 = await askGemini(p2);
        const p2parsed = parseAIOutput(r2);
        p2parsed.forEach(e => S.entries.push(e));
        checkDailyTargets(other, p2parsed[0] ? p2parsed[0].date : todayStr());
      } catch(e2) { /* best effort */ }
    }
    save(); renderVitals(); renderTodayWorkouts();
    // Reset
    workoutLogForBoth = false;
    document.querySelectorAll('.wk-type-btn').forEach(b => b.classList.remove('selected'));
    selectedWorkoutType = null;
    ['wk-walking-opts','wk-cardio-subtype','wk-duration-opts','wk-other-opts','wk-submit-btn','wk-log-both-btn'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.style.display = 'none'; if (el.tagName === 'BUTTON') { el.disabled = false; el.style.background = ''; el.style.color = ''; } }
    });
    const submitBtn = document.getElementById('wk-submit-btn');
    if (submitBtn) setBtnThinking(submitBtn, false, 'Log workout');
    selectedCardioSub = null;
    document.querySelectorAll('.wk-cardio-sub-btn').forEach(b=>b.classList.remove('active'));
    const otherEl = document.getElementById('wk-other-desc'); if (otherEl) otherEl.value = '';
    showToast('Workout logged' + (forBoth ? ' for both' : '') + ' ✓');
  } catch(err) {
    showToast('AI error — check your key and connection');
  } finally {
    await hideDigestOverlay();
    setBtnThinking(btn, false, 'Log workout');
    if (btn2) btn2.disabled = false;
  }
}

function buildOtherWorkoutPrompt(desc, person, weightKg, forBoth) {
  const personName = person === 'gabi' ? 'Gabi' : 'Nacho';
  const now = logTimeStr('wk');
  return `You are a workout logging assistant. Convert the free-text workout description below into one or more structured log lines. Output ONLY the log line(s) — no explanation, no commentary, no questions, no extra text whatsoever.

PERSON: ${personName} (body weight ~${weightKg}kg)
TIME: ${now}
DESCRIPTION: ${desc}

OUTPUT FORMAT — one line per distinct workout segment:
WORKOUT|person:${person}|type:<type>|duration:<minutes>|intensity:<Low/Medium/High>|calories_burned:<integer>|notes:<brief note>

RULES:
1. "type" must be one of: Walking, Cardio-Zone2, Cardio-HIIT, Strength, Mobility, Cycling, Swimming, Yoga, Other
   — choose the single best match. Cardio-Zone2 = steady aerobic; Cardio-HIIT = intervals/sprints/high-intensity work. Never invent new type names.
2. "duration" is an integer (minutes). If the description says e.g. "1 hour", output 60.
3. "calories_burned" — estimate using MET × weight × hours. Common METs: Walking=3.5, Cycling=6.0, Cardio-Zone2=5.5, Cardio-HIIT=8.5, Strength=5.0, Mobility=3.0, Stretching=2.5, Yoga=2.5, Swimming=7.0, Other=4.0. Round to nearest integer.
4. "intensity" — infer from the description (e.g. "easy" → Low, "hard/intervals/sprint" → High, otherwise Medium).
5. "notes" — a single concise phrase summarising the activity (max 60 chars). Never leave blank.
6. If the description clearly describes two distinct activities (e.g. "30 min run + 15 min stretching"), output TWO lines, one per activity.
7. Output ONLY lines starting with WORKOUT| — no headers, no preamble, no trailing text.
8. Never ask a question. If anything is ambiguous, make your best estimate and proceed.

Example valid output:
WORKOUT|person:gabi|type:Cycling|duration:40|intensity:Medium|calories_burned:280|notes:40 min bike ride moderate pace
WORKOUT|person:gabi|type:Stretching|duration:15|intensity:Low|calories_burned:37|notes:post-ride stretching`;
}

// ── LOG BOTH: re-submit the current meal log for the OTHER person too ──────
// Tracks whether the 👫 button has been pressed (log for both on next submit)
let mealLogForBoth = false;

function submitLogBoth() {
  mealLogForBoth = !mealLogForBoth;
  const btn = document.getElementById('log-both-btn');
  const submitBtn = document.getElementById('submit-log-btn');
  if (mealLogForBoth) {
    if (btn) { btn.style.background = 'var(--ochre)'; btn.style.color = 'var(--bark)'; btn.classList.add('both-active'); }
    if (submitBtn) submitBtn.textContent = 'Submit Log (both)';
  } else {
    if (btn) { btn.style.background = 'var(--bark)'; btn.style.color = 'var(--ochre)'; btn.classList.remove('both-active'); }
    if (submitBtn) submitBtn.textContent = 'Submit Log';
  }
}

// (Removed: an earlier, unused "_submitLogForOther" approach re-ran the AI
// from scratch for the second person. The 👫 toggle now simply clones the
// already-parsed entries instead — see submitLog() and submitLogAuto().)

let workoutLogForBoth = false;

function logWorkoutBoth() {
  workoutLogForBoth = !workoutLogForBoth;
  const btn2 = document.getElementById('wk-log-both-btn');
  const submitBtn = document.getElementById('wk-submit-btn');
  if (workoutLogForBoth) {
    if (btn2) { btn2.style.background = 'var(--ochre)'; btn2.style.color = 'var(--bark)'; btn2.classList.add('both-active'); }
    if (submitBtn) submitBtn.textContent = 'Log workout (both)';
  } else {
    if (btn2) { btn2.style.background = 'var(--bark)'; btn2.style.color = 'var(--ochre)'; btn2.classList.remove('both-active'); }
    if (submitBtn) submitBtn.textContent = 'Log workout';
  }
}

function burnEstimateForPerson(person, type, durationMin, steps) {
  const weight = S.mission[person].weight || 70;
  const metType = type === 'Cardio' ? selectedCardioSub : type;
  if (type === 'Walking' && steps > 0) {
    return Math.round((WORKOUT_METS.Walking * weight * (steps / WALK_STEPS_PER_MIN)) / 60);
  }
  return Math.round(((WORKOUT_METS[metType] || 4) * weight * durationMin) / 60);
}

function renderTodayWorkouts() {
  const el = document.getElementById('today-entries-workout');
  if (!el) return;
  const workouts = entriesFor(S.currentPerson, [todayStr()], 'workout');
  if (!workouts.length) {
    el.innerHTML = '<div class="empty-state">No workouts logged today yet.</div>';
    return;
  }
  el.innerHTML = workouts.sort((a,b)=>(a.logged_at||'').localeCompare(b.logged_at||'')).map(e => `
    <div class="meal-entry" onclick="openEntryDetail(${e.id})" style="cursor:pointer">
      <div class="meal-entry-top">
        <span class="meal-name">🏃 ${e.workout_type}</span>
        <button class="meal-delete" onclick="event.stopPropagation();deleteEntry(${e.id})">×</button>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span class="meal-time">${workoutAmountLabel(e)}${e.notes ? ' · '+e.notes : ''} · ${e.logged_at||''}</span>
        <span class="meal-kcal">${e.calories_burned ? Math.round(e.calories_burned)+' kcal burned' : ''}</span>
      </div>
    </div>`).join('');
}

// ── WATER TRACKING ────────────────────────────────────────────────────────
// A real logged entry (record_type:'water'), synced to Firestore and
// exported in CSV/XLSX.
// getWaterGoal() itself lives in ui.js (shared with Progress/Vitals/Settings
// export) — this file used to carry its own duplicate copy which silently
// won the global-scope collision and dropped the legacy waterGoal_${person}
// fallback + the nacho-specific default. Removed during the redundancy audit.

function getWaterEntry(person, date) {
  return S.entries.find(e => e.record_type==='water' && e.person===person && e.date===date);
}
// Returns ml for a water entry.
function getWaterMlForEntry(e) {
  if (!e) return 0;
  return e.ml || 0;
}
function getWaterMl() {
  return getWaterMlForEntry(getWaterEntry(S.currentPerson, todayStr()));
}
function setWaterMl(ml) {
  const amount = Math.max(0, ml);
  const date = todayStr(), person = S.currentPerson;
  let e = getWaterEntry(person, date);
  if (e) { e.ml = amount; }
  else { e = { id: Date.now()+Math.random(), record_type:'water', person, date, ml: amount, logged_at: new Date().toTimeString().slice(0,5) }; S.entries.push(e); }
  checkDailyTargets(person, date);
  save();
  renderWater();
}
function addWaterMl(delta) {
  if (isWaterBackdating()) {
    waterRetroPendingMl = Math.max(0, waterRetroPendingMl + delta);
    syncWaterRetroPendingUI();
    renderWater();
    return;
  }
  setWaterMl(getWaterMl() + delta);
}

function renderWater() {
  // While backdating, the giant number/glass mirror the in-memory pending
  // total for the picked date instead of today's real total — same widget,
  // same animation, just pointed at a different number until Submit.
  const ml   = isWaterBackdating() ? waterRetroPendingMl : getWaterMl();
  const goal = getWaterGoal(S.currentPerson);
  const pct  = Math.min(100, Math.round((ml / goal) * 100));
  const countEl = document.getElementById('water-count');
  const fillEl  = document.getElementById('water-glass-fill');
  const goalEl  = document.getElementById('water-goal-label');
  if (goalEl)  goalEl.textContent  = 'Goal: ' + goal + ' ml';
  if (countEl) animateCountTo(countEl, ml, { duration: 500, formatter: v => v + ' ml' });
  if (fillEl) {
    // Capped short of 100% (same rule as the vitals-card glass) so the
    // wave never gets clipped flat against the top of the glass once the
    // goal is hit or exceeded.
    const visualPct = Math.min(pct, 92);
    requestAnimationFrame(() => { fillEl.style.height = visualPct + '%'; });
  }
}

// ── DAILY TARGETS (water / steps / workout) — simple booleans per day,
// synced and exported, used for the Potates Score and target hit rate. ──
function checkDailyTargets(person, date) {
  if (!S.dailyTargets[person]) S.dailyTargets[person] = {};
  const water = getWaterMlForEntry(getWaterEntry(person, date)) >= getWaterGoal(person);
  const dayWorkouts = S.entries.filter(e => e.record_type==='workout' && e.person===person && e.date===date);
  const stepsToday = sum(dayWorkouts.filter(w=>w.workout_type==='Walking'), 'steps_logged') ||
    (dayWorkouts.find(w=>w.notes && /steps/.test(w.notes)) ? parseInt((dayWorkouts.find(w=>w.notes && /steps/.test(w.notes)).notes.match(/\d+/)||[0])[0]) : 0);
  const stepGoal = (S.settings.stepGoal && S.settings.stepGoal[person]) || 10000;
  S.dailyTargets[person][date] = {
    water,
    steps: stepsToday >= stepGoal,
    workout: dayWorkouts.length > 0
  };
}
function backfillDailyTargets() {
  S.entries.filter(e => e.record_type === 'water').forEach(e => {
    if (!S.dailyTargets[e.person] || !S.dailyTargets[e.person][e.date]) {
      checkDailyTargets(e.person, e.date);
    }
  });
}

function addEntryFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseAIOutput(e.target.result);
    if (!parsed.length && !parsed.rejected?.length) { showToast('Could not read that — check the format'); return; }
    commitEntries(parsed);
    save();
    renderVitals();
    renderLogTab();
    syncFullDayCheckbox();
    const skipped = parsed.rejected && parsed.rejected.length ? (' · skipped ' + parsed.rejected.length + ' unreadable') : '';
    showToast('Added ' + parsed.length + ' item' + (parsed.length>1?'s':'') + skipped);
  };
  reader.readAsText(file);
  event.target.value = '';
}

function deleteEntry(id) {
  if (!_requireOnlineForDelete()) return;

  // Remove from local state immediately so the UI updates at once.
  const _deletedEntry = S.entries.find(e => e.id === id);
  if (_deletedEntry) _pendingDeleteEntryKeys.add(entryKey(_deletedEntry));
  _pendingDeleteIds.add(id);
  S.entries = S.entries.filter(e => e.id !== id);

  if (S.usingSubcollections && window.__firebaseSync) {
    // Fire the Firestore delete.  Do NOT write to localStorage here — the
    // subcollection onSnapshot (server-confirmed only, fromCache skipped) will
    // receive the authoritative post-delete state and write localStorage then.
    // Writing localStorage now with S.entries (which we just mutated locally)
    // would cache the interim state and could reseed stale data on next load.
    const { db, collection, doc, deleteDoc } = window.__firebaseSync;
    deleteDoc(doc(collection(db, 'la-salud', 'sharedData', 'entries'), String(id)))
      .then(() => { setTimeout(_fetchFromServer, 300); }) // re-poll to confirm deletion
      .catch(err => { console.error('[sync] deleteEntry failed', id, err); _pendingDeleteIds.delete(id); if (_deletedEntry) _pendingDeleteEntryKeys.delete(entryKey(_deletedEntry)); showToast('Delete failed — check connection'); _fetchFromServer(); });
  } else {
    // Legacy single-doc mode: save() overwrites the whole entries array.
    save();
  }

  renderVitals();
  renderLogTab();
  renderTodayWorkouts();
}

function syncFullDayCheckbox() {
  syncMarkCompleteBtn();
}

// ── STORAGE USAGE WARNING ─────────────────────────────────────────────────
// The entire shared dataset (every meal/workout/weight entry ever logged)
// lives in ONE Firestore document, which has a hard 1MiB size limit. This
// estimates the document's size locally (same shape pushed in pushToCloud)
// and surfaces a warning well before the limit is hit, pointing at the
// "Migrate data" feature in Vitals.
const FIRESTORE_DOC_LIMIT_BYTES = 1048576; // Firestore hard cap, 1 MiB
function estimatedDocBytes() {
  const payload = JSON.stringify({ entries: S.entries, mission: S.mission, weightLog: S.weightLog||[] });
  try { return new Blob([payload]).size; } catch(e) { return payload.length; } // length is a close-enough fallback for plain ASCII JSON
}
function renderStorageStatus() {
  const el = document.getElementById('storage-status');
  if (!el) return;
  const bytes = estimatedDocBytes();
  const pct = Math.round((bytes / FIRESTORE_DOC_LIMIT_BYTES) * 100);
  if (pct < 70) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const kb = Math.round(bytes/1024);
  const full = pct >= 90;
  el.style.display = 'block';
  el.style.cssText = `display:block;font-size:12px;line-height:1.5;padding:8px 10px;border:1px solid ${full?'var(--terra)':'var(--ochre)'};border-radius:3px;margin-bottom:10px;color:${full?'var(--terra)':'var(--ochre)'}`;
  el.innerHTML = full
    ? `⚠ Storage ${pct}% full (${kb}KB of ~1024KB) — cloud sync may start failing soon. Go to Settings → "Storage migration" to fix this now.`
    : `Storage ${pct}% full (${kb}KB of ~1024KB) — approaching the cloud sync limit. Worth visiting Settings → "Storage migration" soon.`;
}

// ── ONE-TAP FIRESTORE SUBCOLLECTION MIGRATION ────────────────────────────
// Current shape: la-salud/sharedData holds one giant doc with entries[],
// weightLog[], mission as JSON arrays — fine until it nears the 1MiB
// Firestore doc cap. This button is invisible/grey until the doc is over
// 70% full, then turns red and pulses. One tap migrates:
//   la-salud/sharedData/entries/{id}    — one doc per meal/workout/water entry
//   la-salud/sharedData/weightLog/{id}  — one doc per weight entry
//   la-salud/sharedData/mission         — stays as the parent doc's mission
//     field (tiny, rarely changes — no need to split it out)
// After migration, the parent doc's entries/weightLog arrays are cleared
// (mission stays) and S.usingSubcollections flips on; pushToCloud/onSnapshot
// branch on that flag from then on. This is the only place that flag is set.
function renderMigrateButtonState() {
  const btn = document.getElementById('migrate-btn');
  const status = document.getElementById('migrate-status');
  if (!btn) return;
  if (S.usingSubcollections) {
    btn.textContent = 'Already migrated ✓';
    btn.disabled = true;
    btn.classList.remove('migrate-urgent');
    status.textContent = 'This device is using the subcollection storage format.';
    return;
  }
  const bytes = estimatedDocBytes();
  const pct = Math.round((bytes / FIRESTORE_DOC_LIMIT_BYTES) * 100);
  if (pct >= 70) {
    btn.textContent = `⚠ Migrate storage now (${pct}% full)`;
    btn.classList.add('migrate-urgent');
    status.textContent = 'The shared document is getting close to the 1MiB Firestore limit. Tap to migrate — this takes a few seconds and is safe to do anytime.';
  } else {
    btn.textContent = 'Storage migration (not needed yet)';
    btn.classList.remove('migrate-urgent');
    status.textContent = `Currently ${pct}% of the storage limit. Nothing to do.`;
  }
}

async function runStorageMigration() {
  if (S.usingSubcollections) { showToast('Already migrated'); return; }
  if (!window.__firebaseSync) { showToast('Not connected to the cloud right now — try again when online'); return; }
  const { db, collection, doc, writeBatch, setDoc, sharedDocRef, deleteField } = window.__firebaseSync;
  const btn = document.getElementById('migrate-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Migrating…'; }
  try {
    // Firestore batches cap at 500 writes — chunk if there's a lot of data.
    const chunks = [];
    const all = [...S.entries.map(e=>({...e, _coll:'entries'})), ...S.weightLog.map(w=>({...w, _coll:'weightLog'}))];
    for (let i=0;i<all.length;i+=450) chunks.push(all.slice(i,i+450));
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(item => {
        const { _coll, ...data } = item;
        const ref = doc(collection(db, 'la-salud', 'sharedData', _coll), String(data.id));
        batch.set(ref, data);
      });
      await batch.commit();
    }
    // Clear the old arrays from the parent doc, keep mission on it.
    await setDoc(sharedDocRef, { mission: S.mission, entries: deleteField(), weightLog: deleteField(), updatedAt: Date.now() }, { merge: true });
    S.usingSubcollections = true;
    saveLocalOnly();
    showToast('Migration complete — storage is future-proofed');
  } catch (err) {
    showToast('Migration failed — check connection and try again');
    console.error(err);
  }
  renderMigrateButtonState();
}

// ── RENDER: LOG TAB (today's running list) ────────────────────────────────
function renderLogTab() {
  renderStorageStatus();
  syncMarkCompleteBtn();
  if (!cloudReady) {
    const el = document.getElementById('today-entries');
    if (el) el.innerHTML = '<div class="empty-state" style="color:var(--mist);font-size:12px;font-family:\'Baloo 2\',sans-serif;letter-spacing:1px">⟳&nbsp;Syncing…</div>';
    return;
  }
  const el = document.getElementById('today-entries');
  const meals = entriesFor(S.currentPerson, [todayStr()], 'meal');
  const workouts = entriesFor(S.currentPerson, [todayStr()], 'workout');
  const all = [...meals, ...workouts].sort((a,b) => (a.logged_at||'').localeCompare(b.logged_at||''));

  const personC = S.currentPerson === 'gabi' ? 'var(--gabi-c)' : 'var(--nacho-c)';
  const todayFull = meals.some(e => e.full_day && e.date === todayStr());
  const showCongrats = todayFull;
  const celebrationHtml = showCongrats ? `<div id="congrats-banner" style="text-align:center;padding:20px 10px 16px;margin-bottom:10px;border-bottom:1px solid var(--clay)">
      <img src="https://raw.githubusercontent.com/nachostax/la-salud2/main/potato.gif" alt="🥔" style="width:88px;height:auto;display:block;margin:0 auto 14px">
      <div style="font-family:'Baloo 2',sans-serif;font-size:30px;font-style:italic;color:${personC};letter-spacing:0.5px;line-height:1.1">Congratulations</div>
      <div style="font-family:'Baloo 2',sans-serif;font-size:11px;letter-spacing:1.2px;color:var(--mist);text-transform:uppercase;margin-top:8px;opacity:0.7">Complete your day</div>
    </div>` : '';
  const bannerSlot = document.getElementById('congrats-banner-slot');
  if (bannerSlot) bannerSlot.innerHTML = celebrationHtml;

  if (!all.length) {
    el.innerHTML = '<div class="empty-state">Nothing logged for ' + (S.currentPerson==='gabi'?'Gabi':'Nacho') + ' today yet.</div>';
    if (showCongrats) launchConfetti();
    return;
  }

  el.innerHTML = all.map(e => {
    if (e.record_type === 'workout') {
      return `<div class="meal-entry" onclick="openEntryDetail(${e.id})" style="cursor:pointer">
        <div class="meal-entry-top">
          <span class="meal-name">🏃 ${e.workout_type}</span>
          <button class="meal-delete" onclick="event.stopPropagation();deleteEntry(${e.id})">×</button>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span class="meal-time">${workoutAmountLabel(e) ? workoutAmountLabel(e)+' · ' : ''}${e.intensity||''} · ${e.logged_at||''}</span>
          <span class="meal-kcal">${e.calories_burned ? Math.round(e.calories_burned)+' kcal burned' : ''}</span>
        </div>
      </div>`;
    }
    return `<div class="meal-entry" onclick="openEntryDetail(${e.id})" style="cursor:pointer">
      <div class="meal-entry-top">
        <span class="meal-name">${e.hypo_correction ? '🩸 ' : ''}${e.meal || e.name || 'Unnamed entry'}</span>
        <button class="meal-delete" onclick="event.stopPropagation();deleteEntry(${e.id})">×</button>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span class="meal-time">${e.meal_type||''} · ${e.logged_at||''}${e.hypo_correction ? ' · hypo correction, excluded from target' : ''}</span>
        <span class="meal-kcal">${Math.round(e.calories||0)} kcal</span>
      </div>
    </div>`;
  }).join('');
  if (showCongrats) launchConfetti();
}


// ──────────────── MEAL / DAY DETAIL OVERLAY (from entry-detail.js) ─────────
// ── ENTRY DETAIL — fullscreen meal viewer + editor ──────────────────────
// Owns all logic for the fullscreen meal detail/edit panel, wired in from
// both the Log tab (today's list) and the History tab (past day cards).
// Only meal entries (record_type:'meal') are supported — workouts have no
// detail view per spec.

const MEAL_TYPE_LABEL = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner', snack:'Snack', vitamins:'Vitamins' };

// Full-day RDA targets for micronutrients — same table/labels/Gabi-iron
// exception used in vitals.js's micronutrient trend card, so "% of full day
// target" here matches what Vitals already shows elsewhere.
const ED_RDA = {
  magnesium_mg:{label:'Magnesium',  rda:375},  vitd_mcg:{label:'Vitamin D',   rda:15},
  iron_mg:     {label:'Iron',       rda:8},    calcium_mg:{label:'Calcium',  rda:1000},
  zinc_mg:     {label:'Zinc',       rda:10},   b12_mcg:{label:'B12',         rda:2.4},
  omega3_g:    {label:'Omega-3',    rda:1.6},  potassium_mg:{label:'Potassium', rda:3500},
  vitc_mg:     {label:'Vitamin C',  rda:80},   folate_mcg:{label:'Folate',   rda:400}
};

// Scratch state for the panel currently open — null when closed.
let _edId = null;        // id of the entry currently shown (meal detail)
let _edMode = 'view';    // 'view' | 'edit' (meal detail)

// Day-detail scratch state — separate from the meal-detail state above so
// the same panel can hold either view without the two stepping on each
// other. _eddReturnTo remembers "this meal was opened from a day view" so
// closing the meal detail goes back to the day instead of closing the
// whole panel.
let _eddPerson = null;   // person currently shown in day detail
let _eddDate = null;     // date (YYYY-MM-DD) currently shown in day detail
let _eddMode = 'view';   // 'view' | 'edit' (day detail)
let _eddReturnTo = null; // {person, date} to reopen when a meal opened from
                          // within a day view is backed/closed out of — null
                          // when the meal/day was opened directly (Log tab,
                          // History header) with nothing to return to.

function _edFindEntry(id) {
  return S.entries.find(e => e.id === id && (e.record_type === 'meal' || e.record_type === 'workout'));
}

// ── Panel animation helpers ───────────────────────────────────────────────
// The #entry-detail-panel itself only animates when the whole panel opens
// or closes (push in from right, pop out to right). When navigating between
// views *inside* an already-open panel (day → meal → back to day), we
// animate only the inner content using a temporary sliding overlay so the
// panel itself stays put and the "underneath" view is always already there.

function _edpShow() {
  const panel = document.getElementById('entry-detail-panel');
  if (!panel) return;
  panel.classList.remove('edp-pop-out','edp-push-in');
  panel.style.display = 'block';
  void panel.offsetWidth;
  panel.classList.add('edp-push-in');
  panel.addEventListener('animationend', () => panel.classList.remove('edp-push-in'), { once: true });
}

function _edpHide(onDone) {
  const panel = document.getElementById('entry-detail-panel');
  if (!panel) { if (onDone) onDone(); return; }
  panel.classList.remove('edp-push-in','edp-pop-out');
  void panel.offsetWidth;
  panel.classList.add('edp-pop-out');
  panel.addEventListener('animationend', () => {
    panel.classList.remove('edp-pop-out');
    if (onDone) onDone();
  }, { once: true });
}

// Inner-panel pop: render destination content immediately into #entry-detail-inner,
// then slide a snapshot of the old content out to the right over it.
// Result: destination is already "behind", old view peels away to reveal it.
function _edpInnerPop(renderFn) {
  const inner = document.getElementById('entry-detail-inner');
  if (!inner) { renderFn(); return; }

  // Snapshot current content into an absolutely-positioned overlay
  const panel = document.getElementById('entry-detail-panel');
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:absolute',
    'top:0','left:0','right:0','bottom:0',
    'z-index:5',
    'background:var(--soil)',
    'overflow-y:auto',
    '-webkit-overflow-scrolling:touch',
  ].join(';');
  overlay.innerHTML = inner.innerHTML;
  if (panel) panel.appendChild(overlay);

  // Render destination into inner immediately (sits behind overlay)
  renderFn();

  // Animate overlay out to the right
  void overlay.offsetWidth;
  overlay.style.transition = 'transform 0.34s cubic-bezier(.32,.72,0,1)';
  overlay.style.transform = 'translateX(100%)';
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
}

// Inner-panel push: slide new content in from the right over the current content.
function _edpInnerPush(renderFn) {
  const inner = document.getElementById('entry-detail-inner');
  const panel = document.getElementById('entry-detail-panel');
  if (!inner || !panel) { renderFn(); return; }

  // Create overlay starting off-screen right, render new content into it
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:absolute',
    'top:0','left:0','right:0','bottom:0',
    'z-index:5',
    'background:var(--soil)',
    'overflow-y:auto',
    '-webkit-overflow-scrolling:touch',
    'transform:translateX(100%)',
  ].join(';');
  panel.appendChild(overlay);

  // Temporarily redirect render into overlay
  const realId = inner.id;
  inner.id = '__edp_bg';
  overlay.id = realId;
  renderFn();
  overlay.id = '';
  inner.id = realId;

  // Slide overlay in from right
  void overlay.offsetWidth;
  overlay.style.transition = 'transform 0.34s cubic-bezier(.32,.72,0,1)';
  overlay.style.transform = 'translateX(0)';
  overlay.addEventListener('transitionend', () => {
    inner.innerHTML = overlay.innerHTML;
    overlay.remove();
  }, { once: true });
}


// Every nutrient field that scales proportionally with portion size. Kept
// in one place so the edit-mode slider and the save path treat the same
// set of fields consistently.
const ED_SCALABLE_FIELDS = [
  'calories','protein_g','carbs_g','netcarbs_g','fat_g','fibre_g',
  'magnesium_mg','vitd_mcg','iron_mg','calcium_mg','zinc_mg','b12_mcg',
  'omega3_g','potassium_mg','vitc_mg','folate_mcg'
];

// Legacy entries (pre-standardisation) stored meal_type as a number rather
// than a string key — map those back onto the modern string keys so every
// lookup against MEAL_TYPE_LABEL / typeOpts below works the same regardless
// of when the entry was logged.
const MEAL_TYPE_LEGACY = { 1:'breakfast', 2:'lunch', 3:'dinner', 4:'snack', 5:'vitamins' };

function openEntryDetail(entryId) {
  const e = _edFindEntry(entryId);
  if (!e) return;
  if (typeof e.meal_type === 'number') {
    e.meal_type = MEAL_TYPE_LEGACY[e.meal_type] || 'snack';
  }
  const panel = document.getElementById('entry-detail-panel');
  const panelOpen = panel && panel.style.display === 'block';
  _eddReturnTo = (panelOpen && _eddPerson && _eddDate) ? { person: _eddPerson, date: _eddDate } : null;
  _edId = entryId;
  _edMode = 'view';
  const renderFn = e.record_type === 'workout'
    ? () => _edRenderWorkoutView(e)
    : () => _edRenderView(e);
  if (panelOpen) {
    _edpInnerPush(renderFn);
  } else {
    renderFn();
    _edpShow();
  }
}

function closeEntryDetail() {
  if (_eddReturnTo) {
    // Returning to day detail — pop meal content away inside the panel,
    // revealing the day content already rendered beneath.
    const { person, date } = _eddReturnTo;
    _eddReturnTo = null;
    _eddPerson = person;
    _eddDate = date;
    _eddMode = 'view';
    _edpInnerPop(() => _eddRenderView());
    return;
  }
  // No day to return to — close the whole panel
  _edpHide(() => {
    const panel = document.getElementById('entry-detail-panel');
    if (panel) panel.style.display = 'none';
    const inner = document.getElementById('entry-detail-inner');
    if (inner) inner.innerHTML = '';
    _edId = null;
    _edMode = 'view';
  });
}

function _edRenderWorkoutView(e) {
  const inner = document.getElementById('entry-detail-inner');
  if (!inner) return;
  const personColor = _edPersonColor(e.person);
  inner.innerHTML = `
    <div style="padding:52px 20px 40px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
        <button onclick="closeEntryDetail()" style="background:none;border:none;color:rgba(255,255,255,0.75);font-size:22px;cursor:pointer;padding:0;line-height:1">‹</button>
        <button onclick="deleteEntry(${e.id});closeEntryDetail();" style="background:none;border:none;color:var(--terra);font-size:13px;cursor:pointer;padding:0">Delete</button>
      </div>
      <div style="font-size:22px;font-weight:700;color:var(--sand);margin-bottom:6px">${e.workout_type || e.name || 'Workout'}</div>
      <div style="font-size:13px;color:var(--mist);margin-bottom:28px">${e.date || ''} · ${e.logged_at || ''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="trend-card"><div class="trend-stat-label">${e.workout_type === 'Walking' ? 'Steps' : 'Duration'}</div><div style="font-size:24px;font-weight:700;color:${personColor}">${e.workout_type === 'Walking' ? (e.steps_logged ? e.steps_logged.toLocaleString() : '—') : (e.duration_min || '—')}<span style="font-size:13px;font-weight:400;color:var(--mist)">${e.workout_type === 'Walking' ? '' : ' min'}</span></div></div>
        <div class="trend-card"><div class="trend-stat-label">Burned</div><div style="font-size:24px;font-weight:700;color:${personColor}">${e.calories_burned ? Math.round(e.calories_burned) : '—'}<span style="font-size:13px;font-weight:400;color:var(--mist)"> kcal</span></div></div>
        <div class="trend-card"><div class="trend-stat-label">Intensity</div><div style="font-size:18px;font-weight:600;color:var(--sand)">${e.intensity || '—'}</div></div>
        <div class="trend-card"><div class="trend-stat-label">Type</div><div style="font-size:18px;font-weight:600;color:var(--sand)">${e.workout_type || '—'}</div></div>
      </div>
      ${e.notes ? `<div class="trend-card" style="margin-top:12px"><div class="trend-stat-label">Notes</div><div style="font-size:14px;color:var(--sand)">${e.notes}</div></div>` : ''}
    </div>`;
}

// ── shared bits ──────────────────────────────────────────────────────────
function _edPersonColor(person) {
  return person === 'gabi' ? 'var(--gabi-c)' : 'var(--nacho-c)';
}

function _edIronRda(person) {
  return person === 'gabi' ? 18 : ED_RDA.iron_mg.rda;
}

function _edHeader(showEdit) {
  const editBtn = showEdit
    ? `<button onclick="_edEnterEdit()" style="background:none;border:none;color:var(--ochre);font-size:20px;cursor:pointer;padding:0;line-height:1">✎</button>`
    : `<span style="width:20px;display:inline-block"></span>`;
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 16px 0">
    <button onclick="closeEntryDetail()" style="background:none;border:none;color:rgba(255,255,255,0.75);font-size:22px;cursor:pointer;padding:0;line-height:1">‹</button>
    ${editBtn}
  </div>`;
}

// Macro donut — ring math (fill %, overage band, conic-gradient colors)
// lives in computeMacroDonutRing() (ui.js), shared with the Vitals hero
// donut so the two can't visually drift apart. Note the fat color is
// MACRO_FAT_COLOR (ui.js, #8B6BC0 purple) — this used to be var(--terra)
// here, which was wrong: var(--terra) is the app's general warning color,
// not fat's identity color. Built fully inline here since the panel can't
// depend on the .donut/.legend classes living in style.css (kept
// self-contained, same visual language).
function _edDonutHtml(kcal, protein, carbs, fat, targetKcal, person) {
  const emptyColor = person === 'gabi' ? 'var(--gabi-moon-edge)' : 'var(--clay)';
  const { background: bg, hasOverage, excessPct } =
    computeMacroDonutRing(kcal, protein, carbs, fat, targetKcal, emptyColor);
  const DONUT_SIZE = 120;
  const GAP = 4;   // px transparent gap between the main ring and the overage band
  const RING = 12; // px thickness of the overage ring
  const OUTER = DONUT_SIZE + (GAP + RING) * 2;
  const donutOffset = hasOverage ? RING + GAP : 0;
  const holeOffset = donutOffset + 14;

  const outerRingHtml = hasOverage
    ? `<div style="position:absolute;top:0;left:0;width:${OUTER}px;height:${OUTER}px;border-radius:50%;background:conic-gradient(var(--status-red-strong) 0% ${excessPct.toFixed(2)}%, transparent ${excessPct.toFixed(2)}% 100%)"></div>
       <div style="position:absolute;top:${RING}px;left:${RING}px;width:${DONUT_SIZE+GAP*2}px;height:${DONUT_SIZE+GAP*2}px;border-radius:50%;background:var(--soil)"></div>
       ${donutOverageMarkerHtml(excessPct/2, DONUT_SIZE/2+GAP+RING/2, OUTER, 'var(--status-red-strong)')}`
    : '';

  return `
    <div style="display:flex;align-items:center;gap:20px;padding:18px 16px 4px">
      <div style="position:relative;width:${hasOverage ? OUTER : DONUT_SIZE}px;height:${hasOverage ? OUTER : DONUT_SIZE}px;flex-shrink:0">
        ${outerRingHtml}
        <div style="position:absolute;top:${donutOffset}px;left:${donutOffset}px;width:${DONUT_SIZE}px;height:${DONUT_SIZE}px;border-radius:50%;background:${bg}"></div>
        <div style="position:absolute;top:${holeOffset}px;left:${holeOffset}px;width:${DONUT_SIZE-28}px;height:${DONUT_SIZE-28}px;border-radius:50%;background:var(--soil);display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-family:'Baloo 2',sans-serif;font-size:26px;color:var(--bone);line-height:1">${Math.round(kcal)}</div>
          <div style="font-family:'Baloo 2',sans-serif;font-size:9px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-top:2px">kcal</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${_edLegendRow('var(--sage)','Protein', protein,'g')}
        ${_edLegendRow('var(--ochre)','Carbs', carbs,'g')}
        ${_edLegendRow(MACRO_FAT_COLOR,'Fat', fat,'g')}
      </div>
    </div>`;
}

function _edLegendRow(color, label, value, unit) {
  return `<div style="display:flex;align-items:center;gap:7px">
    <div style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></div>
    <span style="font-size:12px;color:var(--mist);min-width:54px">${label}</span>
    <span style="font-size:13px;color:var(--sand);font-family:'Baloo 2',sans-serif">${_edFmtNum(value)}${unit}</span>
  </div>`;
}

function _edFmtNum(n) {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : String(r);
}

// "this meal / full day target" row — used for both macros and
// micronutrients so the two sections look consistent.
function _edFractionRow(label, value, target, unit, decimals) {
  // Legacy entries sometimes stored macro/micro fields as strings (or other
  // non-numeric values) before logging was standardised — coerce defensively
  // so old entries render instead of throwing on .toFixed().
  value = Number(value) || 0;
  target = Number(target) || 0;
  const valStr = decimals ? value.toFixed(decimals) : _edFmtNum(value);
  const tgtStr = target ? (decimals ? target.toFixed(decimals) : _edFmtNum(target)) : '—';
  const pct = target > 0 ? Math.round((value/target)*100) : null;
  const pctColor = pct === null ? 'var(--mist)' : (pct >= 70 ? 'var(--sage)' : 'var(--terra)');
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--bark)">
    <span style="font-size:12px;color:var(--mist)">${label}</span>
    <span style="font-size:12px;font-family:'Baloo 2',sans-serif;color:var(--sand)">
      ${valStr}${unit} <span style="color:var(--clay)">/</span> ${tgtStr}${unit}
      ${pct !== null ? `<span style="color:${pctColor};margin-left:6px">${pct}%</span>` : ''}
    </span>
  </div>`;
}

function _edMacroFractionsHtml(e) {
  const m = S.mission[e.person] || {};
  return `<div style="padding:14px 16px 0">
    <div style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:4px">This meal / full day target</div>
    ${_edFractionRow('Kcal', e.calories||0, (m.kcal||0), '')}
    ${_edFractionRow('Protein', e.protein_g||0, (m.protein||0), 'g')}
    ${_edFractionRow('Carbs', e.carbs_g||0, (m.carbs||0), 'g')}
    ${_edFractionRow('Fat', e.fat_g||0, (m.fat||0), 'g')}
  </div>`;
}

function _edMicroFractionsHtml(e) {
  const rows = Object.entries(ED_RDA).map(([key, {label, rda}]) => {
    const rdaActual = key === 'iron_mg' ? _edIronRda(e.person) : rda;
    const decimals = rda < 20 ? 1 : 0;
    return _edFractionRow(label, e[key]||0, rdaActual, '', decimals);
  }).join('');
  return `<div style="padding:14px 16px 0">
    <div style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:4px">Micronutrients / full day target</div>
    ${rows}
  </div>`;
}

// ── VIEW MODE ────────────────────────────────────────────────────────────
function _edRenderView(e) {
  const color = _edPersonColor(e.person);
  const label = MEAL_TYPE_LABEL[e.meal_type] || '';
  const [y,m,d] = (e.date||'').split('-');
  const dateLabel = (y && m && d) ? new Date(+y,+m-1,+d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) : (e.date||'');
  const mission = S.mission[e.person] || {};

  const html = `
    ${_edHeader(true)}
    <div style="padding:18px 16px 0">
      <div style="font-family:'Baloo 2',sans-serif;font-size:26px;color:var(--bone);line-height:1.15">${e.hypo_correction ? '🩸 ' : ''}${e.meal || e.name || 'Unnamed entry'}</div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
        ${label ? `<span style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:${color};text-transform:uppercase;border:1px solid ${color};border-radius:20px;padding:3px 10px">${label}</span>` : ''}
        <span style="font-size:12px;color:var(--mist)">${dateLabel}${e.logged_at ? ' · '+e.logged_at : ''}</span>
      </div>
    </div>
    ${_edDonutHtml(e.calories||0, e.protein_g||0, e.carbs_g||0, e.fat_g||0, mission.kcal||0, e.person)}
    ${_edMacroFractionsHtml(e)}
    ${_edMicroFractionsHtml(e)}
    <div style="height:20px"></div>
  `;
  document.getElementById('entry-detail-inner').innerHTML = html;
}

// ── EDIT MODE ────────────────────────────────────────────────────────────
function _edEnterEdit() {
  const e = _edFindEntry(_edId);
  if (!e) return;
  _edMode = 'edit';
  _edRenderEdit(e);
}

function _edCancelEdit() {
  const e = _edFindEntry(_edId);
  if (!e) return;
  _edMode = 'view';
  _edRenderView(e);
}

function _edRenderEdit(e) {
  const typeOpts = ['breakfast','lunch','dinner','snack','vitamins']
    .map(t => `<option value="${t}" ${e.meal_type===t?'selected':''}>${MEAL_TYPE_LABEL[t]}</option>`).join('');

  const fieldStyle = 'width:100%;box-sizing:border-box;background:var(--bark);border:1px solid var(--clay);border-radius:10px;color:var(--sand);padding:8px 10px;font-size:14px;font-family:inherit';
  const fieldLabelStyle = 'display:block;font-family:\'Baloo 2\',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:6px';

  const html = `
    ${_edHeader(false)}
    <div style="padding:18px 16px 0;display:flex;flex-direction:column;gap:14px">
      <div>
        <label style="${fieldLabelStyle}">Meal name</label>
        <input type="text" id="ed-f-name" class="themed-field" value="${(e.meal || e.name || 'Unnamed entry').replace(/"/g,'&quot;')}" style="${fieldStyle}">
      </div>
      <div>
        <label style="${fieldLabelStyle}">Meal type</label>
        <select id="ed-f-type" style="${fieldStyle}">${typeOpts}</select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="${fieldLabelStyle}">Kcal</label>
          <input type="number" id="ed-f-kcal" inputmode="decimal" value="${_edFmtNum(e.calories||0)}" style="${fieldStyle}">
        </div>
        <div>
          <label style="${fieldLabelStyle}">Protein (g)</label>
          <input type="number" id="ed-f-protein" inputmode="decimal" value="${_edFmtNum(e.protein_g||0)}" style="${fieldStyle}">
        </div>
        <div>
          <label style="${fieldLabelStyle}">Carbs (g)</label>
          <input type="number" id="ed-f-carbs" inputmode="decimal" value="${_edFmtNum(e.carbs_g||0)}" style="${fieldStyle}">
        </div>
        <div>
          <label style="${fieldLabelStyle}">Fat (g)</label>
          <input type="number" id="ed-f-fat" inputmode="decimal" value="${_edFmtNum(e.fat_g||0)}" style="${fieldStyle}">
        </div>
      </div>

      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <span style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase">Portion size</span>
          <span style="font-size:13px;color:var(--sand)" id="ed-portion-val-edit">100% <span style="color:var(--mist);font-size:11px">(as logged)</span></span>
        </div>
        <input type="range" min="0" max="200" value="100" id="ed-portion-slider-edit" oninput="_edOnPortionInputEdit(this.value)" style="width:100%;accent-color:var(--ochre)">
        <div style="font-size:11px;color:var(--mist);margin-top:6px">Dragging this scales the fields above proportionally from the originally logged amounts.</div>
      </div>

      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn btn-secondary" style="flex:1" onclick="_edCancelEdit()">Cancel</button>
        <button class="btn" style="flex:1" onclick="_edSave()">Save</button>
      </div>
    </div>
    <div style="height:20px"></div>
  `;
  document.getElementById('entry-detail-inner').innerHTML = html;
}

// Edit-mode portion slider: scales the visible kcal/protein/carbs/fat inputs
// (display-only, relative to the entry's original logged values) so they
// can still be hand-tweaked afterward before Save.
function _edOnPortionInputEdit(val) {
  const pct = Number(val) || 0;
  const e = _edFindEntry(_edId);
  if (!e) return;
  const factor = pct / 100;

  const valEl = document.getElementById('ed-portion-val-edit');
  if (valEl) valEl.innerHTML = pct + '%' + (pct === 100 ? ' <span style="color:var(--mist);font-size:11px">(as logged)</span>' : '');

  const kcalEl = document.getElementById('ed-f-kcal');
  if (kcalEl) kcalEl.value = _edFmtNum((e.calories||0) * factor);
  const pEl = document.getElementById('ed-f-protein');
  if (pEl) pEl.value = _edFmtNum((e.protein_g||0) * factor);
  const cEl = document.getElementById('ed-f-carbs');
  if (cEl) cEl.value = _edFmtNum((e.carbs_g||0) * factor);
  const fEl = document.getElementById('ed-f-fat');
  if (fEl) fEl.value = _edFmtNum((e.fat_g||0) * factor);
}

// Commits the edit panel back into S.entries. If the portion slider was
// moved, every nutrient field (not just the four visible macro inputs) is
// scaled from the entry's pre-edit values, so micronutrient totals used
// elsewhere (e.g. Vitals' gap analysis) stay consistent with a scaled meal.
function _edSave() {
  const e = _edFindEntry(_edId);
  if (!e) return;

  const name = (document.getElementById('ed-f-name').value || '').trim() || 'Meal';
  const type = document.getElementById('ed-f-type').value;
  const kcal = parseFloat(document.getElementById('ed-f-kcal').value) || 0;
  const protein = parseFloat(document.getElementById('ed-f-protein').value) || 0;
  const carbs = parseFloat(document.getElementById('ed-f-carbs').value) || 0;
  const fat = parseFloat(document.getElementById('ed-f-fat').value) || 0;

  const portionPct = Number(document.getElementById('ed-portion-slider-edit').value) || 100;
  const factor = portionPct / 100;

  e.meal = name;
  e.meal_type = type;
  e.calories = kcal;
  e.protein_g = protein;
  e.carbs_g = carbs;
  e.fat_g = fat;

  // If the slider moved away from 100, scale every other nutrient field
  // (micronutrients, netcarbs, fibre) from its pre-edit value so the meal's
  // full nutrition profile stays proportionally consistent — only the four
  // fields above are hand-editable directly, the rest follow the slider.
  if (factor !== 1) {
    ED_SCALABLE_FIELDS.forEach(f => {
      if (f === 'calories' || f === 'protein_g' || f === 'carbs_g' || f === 'fat_g') return;
      if (typeof e[f] === 'number') e[f] = e[f] * factor;
    });
  }

  save();
  _edMode = 'view';
  _edRenderView(e);
  renderHistory();
  renderVitals();
  renderLogTab();
}

// ── DAY DETAIL — fullscreen day summary ─────────────────────────────────
// Same #entry-detail-panel overlay as the meal detail above, just a
// different renderer. Totals every meal logged for person+date and shows
// it against that person's daily mission target; each meal underneath is
// its own tappable row that opens the existing meal detail view.

function _eddFindDayMeals(person, date) {
  return S.entries.filter(e =>
    e.record_type === 'meal' && e.person === person && e.date === date && !e.hypo_correction
  );
}

function openDayDetail(person, date) {
  _eddPerson = person;
  _eddDate = date;
  _eddMode = 'view';
  _eddReturnTo = null;
  const panel = document.getElementById('entry-detail-panel');
  const panelOpen = panel && panel.style.display === 'block';
  if (panelOpen) {
    // Already inside the panel (shouldn't normally happen via this path,
    // but guard it) — just re-render in place.
    _eddRenderView();
  } else {
    _eddRenderView();
    _edpShow();
  }
}

function closeDayDetail() {
  _edpHide(() => {
    const panel = document.getElementById('entry-detail-panel');
    if (panel) panel.style.display = 'none';
    const inner = document.getElementById('entry-detail-inner');
    if (inner) inner.innerHTML = '';
    _eddPerson = null;
    _eddDate = null;
    _eddMode = 'view';
  });
}

function _eddHeader(showEdit) {
  const editBtn = showEdit
    ? `<button onclick="_eddEnterEdit()" style="background:none;border:none;color:var(--ochre);font-size:20px;cursor:pointer;padding:0;line-height:1">✎</button>`
    : `<span style="width:20px;display:inline-block"></span>`;
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 16px 0">
    <button onclick="closeDayDetail()" style="background:none;border:none;color:rgba(255,255,255,0.75);font-size:22px;cursor:pointer;padding:0;line-height:1">‹</button>
    ${editBtn}
  </div>`;
}

// Meal row inside the day list. In edit mode each row also gets a ×
// delete button (same deleteHistoryEntry used in History), and tapping
// the row itself still opens that meal's own detail view either way.
function _eddMealRowHtml(e, editing) {
  const label = MEAL_TYPE_LABEL[e.meal_type] || '';
  const name = e.meal || e.name || '—';
  const deleteBtn = editing
    ? `<button class="meal-delete" onclick="event.stopPropagation();_eddDeleteMeal(${e.id})" title="Delete entry">×</button>`
    : '';
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 16px;border-bottom:1px solid var(--bark);cursor:pointer" onclick="openEntryDetail(${e.id})">
    <div>${label?`<span style="font-size:10px;color:var(--mist);font-family:'Baloo 2',sans-serif;letter-spacing:1px;margin-right:6px">${label.toUpperCase()}</span>`:''}<span style="font-size:13px;color:var(--sand)">${name}</span></div>
    <span style="display:flex;align-items:center;flex-shrink:0;margin-left:8px">
      <span style="font-size:12px;color:var(--mist)">${e.calories?Math.round(e.calories)+' kcal':''}</span>
      ${deleteBtn}
    </span>
  </div>`;
}

function _eddRenderView() {
  const person = _eddPerson, date = _eddDate;
  const meals = _eddFindDayMeals(person, date);
  const m = S.mission[person] || {};

  const totals = meals.reduce((a,e) => {
    a.kcal += e.calories||0; a.protein += e.protein_g||0;
    a.carbs += e.carbs_g||0; a.fat += e.fat_g||0;
    return a;
  }, { kcal:0, protein:0, carbs:0, fat:0 });

  const [y,mo,d] = (date||'').split('-');
  const dateLabel = (y && mo && d) ? new Date(+y,+mo-1,+d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : (date||'');
  const color = _edPersonColor(person);

  const mealRows = meals.length
    ? meals.map(e => _eddMealRowHtml(e, false)).join('')
    : `<div style="padding:16px;font-size:12px;color:var(--mist)">No meals logged for ${person==='gabi'?'Gabi':'Nacho'} this day.</div>`;

  const html = `
    ${_eddHeader(true)}
    <div style="padding:18px 16px 0">
      <div style="font-family:'Baloo 2',sans-serif;font-size:24px;color:var(--bone);line-height:1.15">${dateLabel}</div>
      <div style="margin-top:6px"><span style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:${color};text-transform:uppercase">${person==='gabi'?'Gabi':'Nacho'}</span></div>
    </div>
    ${_edDonutHtml(totals.kcal, totals.protein, totals.carbs, totals.fat, m.kcal||0, person)}
    <div style="padding:14px 16px 0">
      <div style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:4px">Day total / full day target</div>
      ${_edFractionRow('Kcal', totals.kcal, (m.kcal||0), '')}
      ${_edFractionRow('Protein', totals.protein, (m.protein||0), 'g')}
      ${_edFractionRow('Carbs', totals.carbs, (m.carbs||0), 'g')}
      ${_edFractionRow('Fat', totals.fat, (m.fat||0), 'g')}
    </div>
    <div style="padding:18px 0 0">
      <div style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:4px;padding:0 16px">Meals</div>
      ${mealRows}
    </div>
    <div style="height:20px"></div>
  `;
  document.getElementById('entry-detail-inner').innerHTML = html;
}

function _eddEnterEdit() {
  if (!_eddPerson || !_eddDate) return;
  _eddMode = 'edit';
  _eddRenderEdit();
}

function _eddCancelEdit() {
  if (!_eddPerson || !_eddDate) return;
  _eddMode = 'view';
  _eddRenderView();
}

// Day-level edit mode only exposes per-meal delete — no macro editing here,
// per spec (macro/portion editing happens one level down, in the meal
// detail view via the pencil button on each meal).
function _eddRenderEdit() {
  const person = _eddPerson, date = _eddDate;
  const meals = _eddFindDayMeals(person, date);
  const [y,mo,d] = (date||'').split('-');
  const dateLabel = (y && mo && d) ? new Date(+y,+mo-1,+d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short',year:'numeric'}) : (date||'');

  const mealRows = meals.length
    ? meals.map(e => _eddMealRowHtml(e, true)).join('')
    : `<div style="padding:16px;font-size:12px;color:var(--mist)">No meals logged for ${person==='gabi'?'Gabi':'Nacho'} this day.</div>`;

  const html = `
    ${_eddHeader(false)}
    <div style="padding:18px 16px 0">
      <div style="font-family:'Baloo 2',sans-serif;font-size:24px;color:var(--bone);line-height:1.15">${dateLabel}</div>
      <div style="font-size:11px;color:var(--mist);margin-top:6px">Tap × to delete a meal. Tap a meal to edit its details.</div>
    </div>
    <div style="padding:18px 0 0">
      <div style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:4px;padding:0 16px">Meals</div>
      ${mealRows}
    </div>
    <div style="padding:14px 16px 0">
      <button class="btn btn-secondary" style="width:100%" onclick="_eddCancelEdit()">Done</button>
    </div>
    <div style="height:20px"></div>
  `;
  document.getElementById('entry-detail-inner').innerHTML = html;
}

// Deletes a meal from inside the day-edit view and re-renders the day in
// place (rather than closing the panel), so deleting several meals in a
// row stays fluid.
function _eddDeleteMeal(id) {
  deleteHistoryEntry(id);
  if (_eddPerson && _eddDate) _eddRenderEdit();
}
