// ════════════════════════════════════════════════════════════════════════
// UI.JS — core app shell: state, storage/CSV, nav & shared helpers, animation.
// Merged during file consolidation (July 2026) from: state.js, ui.js, data.js,
// anim.js. Order preserved from the original <script> load order, since a few
// top-level IIFEs (multi-tab lock in state.js, sky canvas + person-switch
// patch in anim.js) run at parse time and depend on globals defined earlier
// in this file. log-fab-anim.js/.css were NOT merged in — they were dead,
// unwired duplicates of the Log FAB overlay logic that already lives in the
// anim.js section below (search 'LOG FAB OVERLAY').
// ════════════════════════════════════════════════════════════════════════

// ─────────────────────────── STATE (from state.js) ─────────────────────────
// ── STATE ──────────────────────────────────────────────────────────────────
let S = {
  mission: {
    gabi:  { weight:70, height:165, age:29, sex:'female',
              activityLevel:'moderate', manualOverrideUntil:null,
              gymExperience:'intermediate', goalType:'lose_fat',
              goalTargetWeight:67, goalTimeframe:'3m', goalSetDate:null, goalTargetDate:null,
              userRateOverrideKgWeek:null,
              adaptiveConfidence:null, lastAdaptiveRecalcDate:null, lastAdaptiveNudge:null,
              kcal:1450, protein:100, carbs:130, fat:45 },
    nacho: { weight:71, height:172, age:30, sex:'male',
              activityLevel:'moderate', manualOverrideUntil:null,
              gymExperience:'intermediate', goalType:'lose_fat',
              goalTargetWeight:69, goalTimeframe:'3m', goalSetDate:null, goalTargetDate:null,
              userRateOverrideKgWeek:null,
              adaptiveConfidence:null, lastAdaptiveRecalcDate:null, lastAdaptiveNudge:null,
              kcal:1950, protein:145, carbs:175, fat:55 }
  },
  entries: [],   // meals AND workouts, distinguished by record_type
  weightLog: [], // { id, person, date, kg }
  currentPerson: 'gabi',
  period: 'day',
  settings: {
    waterGoal: { gabi: 1750, nacho: 1750 },
    movementTargets: {
      gabi:  { zone2_min_week: 150, hiit_min_week: 30, strength_min_week: 90, mobility_sessions_week: 2, mobility_min_session: 15, steps_day: 10000 },
      nacho: { zone2_min_week: 150, hiit_min_week: 30, strength_min_week: 90, mobility_sessions_week: 2, mobility_min_session: 15, steps_day: 10000 }
    },
    hypoKit: { gabi: '2 cookies (~12.5g sugar)', nacho: '' },
    hypoMacros: { gabi: { calories: 50, carbs_g: 13 } } // quick estimate for 12.5g sugar; edit in Settings for exact numbers
  },
  dailyTargets: {}, // dailyTargets[person][date] = { water:bool, steps:bool, workout:bool }
  treatTokens: { gabi: 0, nacho: 0 },
  kitchen: { listed: {}, saved: {}, custom: [], section: 'plan', planTab: 'all', filters: {}, sort: null, cookAutoMode: false, cookAlarm: 'bell' },
  // Workout module — kept per-person (each of Gabi/Nacho follows their own
  // plan), unlike kitchen which is shared. activePlanId/currentSlotIndex
  // track progress through a WORKOUT_PROGRAM_10_WEEK-shaped program;
  // wizard/showAdHoc are legacy from a retired step-wizard flow — kept so
  // already-synced data doesn't break, no longer read by current code.
  // Ad-hoc workout picking now happens via the Workout tab's search+filter
  // list (any row launches directly, see workout.js).
  // sessionLog holds completed Active Workout Tracker sessions (reps/kg/
  // holds actually logged); liveSession holds an in-progress session so
  // it survives the app being backgrounded mid-workout.
  workoutModule: {
    gabi:  { activePlanId: null, currentSlotIndex: 0, subTab: 'new', wizard: { source: null, style: null, focus: null }, sessionLog: [], liveSession: null, viewFullProgram: false, browse: { search: '', styleFilter: [], muscleFilter: [], equipmentFilter: [], openFilter: null, showYtAdd: false }, customWorkouts: [], exerciseBrowse: { search: '', movementFilter: [], muscleFilter: [], equipmentFilter: [], openFilter: null } },
    nacho: { activePlanId: null, currentSlotIndex: 0, subTab: 'new', wizard: { source: null, style: null, focus: null }, sessionLog: [], liveSession: null, viewFullProgram: false, browse: { search: '', styleFilter: [], muscleFilter: [], equipmentFilter: [], openFilter: null, showYtAdd: false }, customWorkouts: [], exerciseBrowse: { search: '', movementFilter: [], muscleFilter: [], equipmentFilter: [], openFilter: null } }
  },
  // Shared (not per-person) library of saved YouTube workout links — a
  // simple bookmark list, not synced/embedded, since the app has no video
  // player of its own. Tapping a row opens the link in a new tab.
  youtubeWorkouts: []
};

// Dates are computed from LOCAL time, not UTC, so logging just after local
// midnight files under today's date correctly (Valencia is UTC+1/+2).
// todayStr() is a function (not a cached const) so it can't go stale if the
// app/tab is left open across midnight.
// Reads the Gemini key saved in Settings (localStorage). No hardcoded
// fallback — each of you enters your own key once on your own device.
function getGeminiKey() {
  return localStorage.getItem('gemini_api_key');
}

// ── MULTI-PROVIDER AI FALLBACK ──────────────────────────────────────────
// All keys are pasted by the user into Settings (settings.js classifies
// them by prefix and buckets them) — nothing is hardcoded here, and
// nothing is stored anywhere but this device's localStorage.
//
// askAI() tries every saved key, in order: all Cerebras keys first, then
// Gemini, then Groq last as a text fallback. It stops at the first
// success. This is a plain retry-with-a-different-
// key/provider chain — same prompt each time, no disguising or varying of
// requests — it exists so one rate-limited or dead key doesn't take the
// feature down, not to get around any provider's usage limits or terms.
// Photo requests bypass this entirely and go straight to Gemini (see
// submitLogAuto/submitKitchenMealLog), since Groq/Cerebras are text-only
// here — Gemini is the only option once a picture is involved.
function hasAnyAIKey() {
  return getGeminiKeys().length > 0 || getGroqKeys().length > 0 || getCerebrasKeys().length > 0;
}
function getGroqKeys() {
  try {
    const raw = localStorage.getItem('groq_api_keys');
    if (raw) { const k = JSON.parse(raw); if (Array.isArray(k)) return k.filter(Boolean); }
  } catch (e) {}
  return [];
}
function getCerebrasKeys() {
  try {
    const raw = localStorage.getItem('cerebras_api_keys');
    if (raw) { const k = JSON.parse(raw); if (Array.isArray(k)) return k.filter(Boolean); }
  } catch (e) {}
  return [];
}

// Single Gemini call. imageParts (optional) is an array of
// { inline_data: { mime_type, data } } blocks — only Gemini supports
// photo input here, so image calls should only ever go through this path.
async function callGeminiText(key, promptText, imageParts) {
  const parts = [{ text: promptText }];
  if (imageParts) parts.push(...imageParts);
  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const apiMsg = data?.error?.message || resp.statusText || 'unknown error';
    throw new Error(`Gemini (${resp.status}): ${apiMsg}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).filter(Boolean).join('\n') || '';
  const blockReason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
  if (!text) throw new Error(blockReason ? `Gemini returned no text (${blockReason})` : 'Gemini returned an empty reply');
  return text;
}

// Groq and Cerebras both speak the same OpenAI-compatible chat-completions
// shape, text-only (no image support in this app's usage of them).
async function callOpenAICompatText(baseUrl, model, key, promptText) {
  const resp = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: promptText }] })
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const apiMsg = data?.error?.message || resp.statusText || 'unknown error';
    throw new Error(`${model} (${resp.status}): ${apiMsg}`);
  }
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`${model} returned an empty reply`);
  return text;
}
async function callGroqText(key, promptText) {
  return callOpenAICompatText('https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile', key, promptText);
}
async function callCerebrasText(key, promptText) {
  return callOpenAICompatText('https://api.cerebras.ai/v1/chat/completions', 'gpt-oss-120b', key, promptText);
}

// Text-only fallback chain used by AI Assist advice, workout free-text
// parsing, and the calorie-target estimate. Throws only once every key on
// every provider has failed, with each individual failure joined in so
// the toast/error is actually diagnosable instead of just "failed".
async function askAI(promptText) {
  const attempts = [];
  for (const key of getCerebrasKeys()) {
    try { return await callCerebrasText(key, promptText); }
    catch (e) { attempts.push('Cerebras: ' + e.message); }
  }
  for (const key of getGeminiKeys()) {
    try { return await callGeminiText(key, promptText); }
    catch (e) { attempts.push('Gemini: ' + e.message); }
  }
  for (const key of getGroqKeys()) {
    try { return await callGroqText(key, promptText); }
    catch (e) { attempts.push('Groq: ' + e.message); }
  }
  if (!attempts.length) throw new Error('No AI API key set — add one in Settings.');
  throw new Error('All providers failed — ' + attempts.join(' | '));
}

// Resolves a person's daily water target: per-person legacy key, then
// settings.waterGoal map, then a sane default.
function getWaterGoal(person) {
  const s = S.settings || {};
  return s[`waterGoal_${person}`] || s.waterGoal?.[person] || (person === 'gabi' ? 1750 : 2000);
}

function pad2(n) { return String(n).padStart(2,'0'); }
function toLocalDateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
function todayStr() { return toLocalDateStr(new Date()); }
function logDateStr(panel) {
  const el = document.getElementById(panel==='wk' ? 'retro-date-input-wk' : 'retro-date-input');
  return (el && el.value) ? el.value : todayStr();
}
function logTimeStr(panel) {
  const el = document.getElementById(panel==='wk' ? 'retro-time-input-wk' : 'retro-time-input');
  return (el && el.value) ? el.value : new Date().toTimeString().slice(0,5);
}

// Shared by the macro donuts in vitals.js and entry-detail.js: positions a
// small "+" marker along a circle, centered on the middle of the red
// overage arc. `midPercent` is the point around the circle (0-100,
// clockwise from 12 o'clock — same convention as the conic-gradient
// stops used for the ring itself) to center the marker on; `radius` is
// the distance from the circle's center; `boxSize` is the width/height of
// the square the circle sits in.
function donutOverageMarkerHtml(midPercent, radius, boxSize, color) {
  const angle = (midPercent / 100) * Math.PI * 2;
  const cx = boxSize / 2, cy = boxSize / 2;
  const x = cx + radius * Math.sin(angle);
  const y = cy - radius * Math.cos(angle);
  return `<div style="position:absolute;top:${y}px;left:${x}px;transform:translate(-50%,-50%);font-family:'Baloo 2',sans-serif;font-size:11px;font-weight:700;color:${color};line-height:1;text-shadow:0 0 3px rgba(0,0,0,0.6);pointer-events:none">+</div>`;
}

// Shared ring math for the macro donut, used by both the Vitals hero card
// and the Log meal/day-detail donut (_edDonutHtml). These two used to be
// independent copy-pasted implementations that had drifted apart on the fat
// color specifically: the Log version used var(--terra), but var(--terra) is
// this app's general "warning / over-target / negative" color (used for
// delete buttons, error text, over-target deltas elsewhere) — it was never a
// fat-identity color. The real fat color, consistently used in the Vitals
// legend dot and the Progress "Fat" trend chart, is the purple #8B6BC0.
// Fixed here as the single source of truth: protein=sage, carbs=ochre,
// fat=#8B6BC0. `emptyColor` is the ring's base color when nothing/little is
// filled yet (pass person-themed color for Gabi's moon-edge tone, or
// var(--clay) as the default). Returns the conic-gradient background plus
// the overage (>10% over target) ring's fill percentage — callers build
// their own markup/sizing around this since Vitals uses CSS classes and the
// Log detail panel is fully inline.
const MACRO_FAT_COLOR = '#8B6BC0';
function computeMacroDonutRing(kcal, protein, carbs, fat, targetKcal, emptyColor) {
  const pKcal = protein * 4, cKcal = carbs * 4, fKcal = fat * 9;
  const macroTotal = pKcal + cKcal + fKcal;

  const target = targetKcal || 0;
  const fillRatio = target > 0 ? kcal / target : 0;
  const filledPct = Math.max(0, Math.min(fillRatio, 1)) * 100;

  let background = emptyColor || 'var(--clay)';
  if (macroTotal > 0 && filledPct > 0) {
    const p1 = (pKcal / macroTotal * filledPct).toFixed(2);
    const p2 = (p1 * 1 + cKcal / macroTotal * filledPct).toFixed(2);
    background = `conic-gradient(var(--sage) 0% ${p1}%, var(--ochre) ${p1}% ${p2}%, ${MACRO_FAT_COLOR} ${p2}% ${filledPct.toFixed(2)}%, var(--clay) ${filledPct.toFixed(2)}% 100%)`;
  }

  const overRatio = fillRatio - 1;
  const hasOverage = overRatio > 0.10;
  const excessPct = hasOverage ? Math.min(overRatio, 1) * 100 : 0;

  return { background, fillRatio, filledPct, hasOverage, excessPct };
}

const STORAGE_KEY = 'la-salud-state-v3';

// Which person THIS PHONE defaults to on load. Deliberately kept outside
// STORAGE_KEY (not part of the synced S blob) so it's a property of the
// device, not the data — surviving cache clears / resets on that phone.
// Set via Settings → API Key & Sync → "This device" (setHomePerson() in
// settings.js). Also settable by opening the app once with ?home=nacho
// (or ?home=gabi) in the URL, e.g. on a home-screen bookmark.
const HOME_PERSON_KEY = 'pf-home-person';
(function tagHomePerson() {
  try {
    const p = new URLSearchParams(window.location.search).get('home');
    if (p === 'gabi' || p === 'nacho') localStorage.setItem(HOME_PERSON_KEY, p);
  } catch (e) {}
})();
function homePerson() {
  try { return localStorage.getItem(HOME_PERSON_KEY) || 'gabi'; } catch (e) { return 'gabi'; }
}

// ── STORAGE ────────────────────────────────────────────────────────────────
// localStorage = instant local cache (app stays usable offline, no flicker).
// Firestore   = shared source of truth between Gabi's and Nacho's phones.
// Pattern: render from local instantly on open, then merge in whatever the
// cloud has, then every change pushes the merged result back up. A live
// listener (onSnapshot) means the OTHER phone's edits also arrive without
// needing to reopen the app.
let cloudReady = false;     // true once the first cloud snapshot has arrived
let suppressPush = false;   // true while applying a cloud snapshot, to avoid
                             // immediately re-pushing what we just received

// ── DATA-LOSS CIRCUIT BREAKER (see pushToCloud()) ───────────────────────────
// _lastConfirmedEntryCount / _lastConfirmedWeightCount are updated ONLY by a
// successful _fetchFromServer() — they represent what the server actually
// has, independent of whatever S.entries/S.weightLog happen to hold at any
// given instant (which may be transiently empty, e.g. right after load()).
// pushToCloud() diffs against these before ever writing, in legacy mode, so
// a stray/early/racing call can never overwrite real cloud data with less.
let _lastConfirmedEntryCount  = 0;
let _lastConfirmedWeightCount = 0;
// One-shot flag: set immediately before a call site that is a genuine,
// user-confirmed wipe (currently only clearHistory()'s legacy branch), and
// consumed (reset to false) the instant pushToCloud() reads it. This is the
// ONLY way to bypass the circuit breaker below — there is no other escape
// hatch, and it can't leak across calls because it's cleared unconditionally
// on read.
let _intentionalWipe = false;

// ── RUNAWAY-LOOP KILL SWITCH ────────────────────────────────────────────────
// The single-call breaker in pushToCloud() only compares one write to the
// last known-good server count. It can't see a bug that calls pushToCloud()
// repeatedly, each call only 1 item smaller than before — every individual
// call looks legal, but strung together they can erase everything in
// seconds. This tracks push activity over time and trips a hard stop the
// moment the pattern looks automated rather than a person editing data by
// hand. The trip state is persisted to localStorage so a page reload can't
// silently un-trip it out from under you.
let _killSwitchTripped = false;
const _pushTimestamps = [];
const PUSH_RATE_WINDOW_MS = 10000;
const PUSH_RATE_MAX = 8;
let _recentPeakEntryCount  = 0;
let _recentPeakWeightCount = 0;
let _peakResetTimer = null;
const PEAK_WINDOW_MS = 60000;
const CUMULATIVE_DROP_MAX = 3;
const KILL_SWITCH_KEY = 'laSaludKillSwitchTripped';

function _tripKillSwitch(reason) {
  _killSwitchTripped = true;
  try { localStorage.setItem(KILL_SWITCH_KEY, JSON.stringify({ reason, at: Date.now() })); } catch(e) {}
  console.error('[sync] KILL SWITCH TRIPPED: ' + reason + '. All further cloud writes refused. Clear manually via __clearKillSwitch() once confirmed safe.');
  setSyncStatus('offline');
  showToast('Sync paused for safety — write pattern looked abnormal. Your local data is untouched.');
}
window.__clearKillSwitch = function() {
  _killSwitchTripped = false;
  _pushTimestamps.length = 0;
  _recentPeakEntryCount = (S.entries||[]).length;
  _recentPeakWeightCount = (S.weightLog||[]).length;
  try { localStorage.removeItem(KILL_SWITCH_KEY); } catch(e) {}
  console.warn('[sync] Kill switch manually cleared.');
};
(function _restoreKillSwitchState() {
  try {
    const raw = localStorage.getItem(KILL_SWITCH_KEY);
    if (raw) {
      _killSwitchTripped = true;
      const info = JSON.parse(raw);
      console.error('[sync] Kill switch still tripped from a previous session: ' + info.reason + ' (' + new Date(info.at).toISOString() + '). Run __clearKillSwitch() once confirmed safe.');
    }
  } catch(e) {}
})();

// ── SESSION-TO-SESSION SANITY CHECK ─────────────────────────────────────────
// Compares what the server has right now to what THIS device last saw, even
// across a full app close/reopen — catches a slow drip of loss that happened
// while nobody had the app open to see the kill switch trip live.
let _sessionCheckDone = false;
const LAST_SESSION_COUNTS_KEY = 'laSaludLastSessionCounts';
const SESSION_DROP_WARN = 5;

function _recordSessionCounts() {
  try {
    localStorage.setItem(LAST_SESSION_COUNTS_KEY, JSON.stringify({
      entries: (S.entries || []).length,
      weightLog: (S.weightLog || []).length,
      at: Date.now()
    }));
  } catch(e) {}
}

function _checkAgainstLastSession(entryCountNow, weightCountNow) {
  let last = null;
  try {
    const raw = localStorage.getItem(LAST_SESSION_COUNTS_KEY);
    if (raw) last = JSON.parse(raw);
  } catch(e) {}
  if (!last) return;

  const entryDrop  = last.entries   - entryCountNow;
  const weightDrop = last.weightLog - weightCountNow;
  if (entryDrop > SESSION_DROP_WARN || weightDrop > SESSION_DROP_WARN) {
    _tripKillSwitch('Last session this device saw ' + last.entries + ' entries / ' + last.weightLog + ' weight logs, server now has ' + entryCountNow + ' / ' + weightCountNow + '.');
    if (typeof alert === 'function') {
      alert('⚠ Data warning: the server has ' + entryDrop + ' fewer entries than last time this device synced. Sync paused automatically — run __clearKillSwitch() in the console once confirmed expected.');
    }
  }
}

// Returns S without entries/weightLog — those are never cached locally.
// Firebase is canonical; caching them causes deleted entries to reappear.
function _stateForStorage() {
  const { entries, weightLog, ...rest } = S; // eslint-disable-line no-unused-vars
  return rest;
}

function saveLocalOnly() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_stateForStorage())); } catch(e) {}
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_stateForStorage())); } catch(e) {}
  if (S.usingSubcollections) pushEntriesToSubcollections();
  pushToCloud();
}

// Post-migration write path: each entry/weight row is its own doc, keyed by
// id, so two phones writing at once just overwrite their own docs rather
// than racing on one giant array field.
//
// IMPORTANT: This function only WRITES entries that are in S.entries.
// It must NEVER be called during a delete operation — doing so would
// re-write the just-deleted doc back to Firebase before deleteDoc() wins
// the race. Deletes go through deleteEntry() / deleteWeight() / clearHistory()
// which call deleteDoc() directly and then pushToCloud() (not this function).
function pushEntriesToSubcollections() {
  if (!window.__firebaseSync) return;
  const { db, collection, doc, setDoc } = window.__firebaseSync;
  S.entries.forEach(e => {
    const clean = stripUndefined(e);
    _pendingEditIds.add(e.id);
    try {
      setDoc(doc(collection(db,'la-salud','sharedData','entries'), String(e.id)), clean)
        .then(() => _pendingEditIds.delete(e.id))
        .catch(err => { console.error('[sync] entry write failed', e.id, err); _pendingEditIds.delete(e.id); });
    } catch (err) {
      console.error('[sync] entry setDoc threw synchronously', e.id, err);
      _pendingEditIds.delete(e.id);
    }
  });
  (S.weightLog||[]).forEach(w => {
    const clean = stripUndefined(w);
    try {
      setDoc(doc(collection(db,'la-salud','sharedData','weightLog'), String(w.id)), clean)
        .catch(err => console.error('[sync] weight write failed', w.id, err));
    } catch (err) {
      console.error('[sync] weight setDoc threw synchronously', w.id, err);
    }
  });
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      S = { ...S, ...JSON.parse(raw) };
      // Always clear entries and weightLog — Firebase is the sole source of
      // truth. Never seed from localStorage; stale cache is what causes
      // deleted entries to reappear on next load.
      S.entries   = [];
      S.weightLog = [];
    }
  } catch(e) {}
  // currentPerson is a device property, not synced data — resolve it fresh
  // every load (covers both the existing-state branch above and a totally
  // fresh install with no saved state yet).
  S.currentPerson = homePerson();
}

// Same identity used by the existing CSV restore/dedup logic, so merges are
// consistent whether data arrives via CSV file or via the cloud.
function entryKey(e) {
  if (e.record_type === 'water') return entrySignature('WATER', e.date, e.person, 'Water', e.logged_at||'');
  return entrySignature(
    e.record_type === 'workout' ? 'WORKOUT' : 'MEAL',
    e.date, e.person,
    e.record_type === 'workout' ? e.workout_type : e.meal,
    e.logged_at
  );
}

// Merge two entry arrays without duplicating or losing anything either
// phone logged, even if both added entries while offline.
function mergeEntries(localEntries, cloudEntries) {
  const byKey = new Map();
  localEntries.forEach(e => byKey.set(entryKey(e), e));
  cloudEntries.forEach(e => {
    const k = entryKey(e);
    if (!byKey.has(k)) byKey.set(k, e);
  });
  return Array.from(byKey.values());
}

// Firestore's setDoc() THROWS SYNCHRONOUSLY (not a rejected promise) if any
// field anywhere in the payload — however deeply nested — is `undefined`.
// Because it throws before returning a promise, a normal .catch() never
// even attaches, so the error escapes as a raw uncaught exception instead
// of our usual showToast()/setSyncStatus('offline') handling. That's the
// "Function setDoc() called with invalid data" popup.
// stripUndefined() recursively removes any undefined value (and logs exactly
// where it found one, once, to the console) so a single stray field never
// blocks the entire sync again.
function stripUndefined(value, path) {
  path = path || 'root';
  if (value === undefined) {
    console.warn('[sync] stripped undefined field at', path);
    return null;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v, i) => stripUndefined(v, path + '[' + i + ']'));
  }
  const out = {};
  Object.keys(value).forEach(k => {
    out[k] = stripUndefined(value[k], path + '.' + k);
  });
  return out;
}

// ── DELETES REQUIRE BEING ONLINE, ALWAYS ────────────────────────────────────
// Deleting and "syncing offline-created data back" are now two completely
// separate mechanisms that never share a code path:
//   - Delete = an explicit, single-item action that can only happen when the
//     app can see the live server. If you're offline, you simply can't
//     delete anything — the button tells you to go back online instead.
//   - Syncing offline data back = pure addition, never removal (see the
//     merge step inside pushToCloud() below). It cannot touch or remove
//     anything that already exists, only add entries that don't exist yet.
// This is what makes "can the app ever silently erase something" answerable
// with a flat no for the offline case: offline, nothing can ever be removed,
// because removal literally isn't an operation the app is willing to attempt
// without a live connection to confirm against.
function _requireOnlineForDelete() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    showToast('Go back online to delete entries.');
    return false;
  }
  if (!cloudReady) {
    showToast('Still connecting — try deleting again in a moment.');
    return false;
  }
  return true;
}

// Entries/weight rows that have been explicitly, online-confirmed deleted
// but whose deletion hasn't been durably written yet. The additive merge
// below consults this so a deletion in progress can never be "healed back"
// by the merge treating it as data that went missing by accident.
const _pendingDeleteEntryKeys = new Set();
const _pendingDeleteWeightIds = new Set();

// Subcollections mode tracks by id directly — each entry is its own doc
// keyed by id there, unlike legacy mode's single big array where
// entryKey() content-hashing was needed to survive the additive merge.
// _fetchFromServer()'s subcollections branch does a wholesale replace of
// S.entries from the server snapshot every ~3s; without these, that
// replace has no way to know a delete or an edit for a given id is still
// in flight, and will silently reinstate a just-deleted entry (server
// hasn't confirmed the delete yet) or revert a just-edited one back to
// its pre-edit content (server hasn't received that entry's write yet) —
// exactly the "delete/edit and it reverts a moment later" symptom.
const _pendingDeleteIds = new Set();
const _pendingEditIds = new Set();

// pushToCloud() now does an async server read before writing (see the
// additive merge below), so two calls fired close together could overlap.
// If the slower one finished last, it could write a payload built from an
// OLDER server snapshot on top of a newer one — silently reverting whatever
// the faster call just added. This queue makes overlapping calls run
// strictly one after another instead, so that can't happen.
let _pushChain = Promise.resolve();
function pushToCloud() {
  _pushChain = _pushChain.then(() => _pushToCloudInner()).catch(err => {
    console.error('[sync] pushToCloud chain error', err);
  });
  return _pushChain;
}

async function _pushToCloudInner() {
  if (suppressPush) return;
  if (!window.__firebaseSync) return;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSyncStatus('offline');
    return;
  }

  // ── DATA-LOSS CIRCUIT BREAKER ──────────────────────────────────────────
  // In legacy (non-subcollection) mode the write below is a full, non-merge
  // setDoc() of the whole shared document — it REPLACES entries/weightLog
  // wholesale, it doesn't patch them. That single fact means ANY code path
  // that ends up calling save()/pushToCloud() while S.entries/S.weightLog
  // are transiently empty or under-populated (a race on reconnect, a stray
  // call during init, a future regression somewhere in the 80+ save() call
  // sites across the app) is a silent, total-data-loss bug for both users.
  //
  // This check is deliberately here — inside pushToCloud() itself — rather
  // than only at whichever call site caused today's incident, so it can't
  // be bypassed by a *different* call site making the same mistake later.
  // Consume the one-shot "this is a real, user-confirmed wipe" flag first;
  // every other code path is treated as NOT intentional.
  const _isIntentionalWipe = _intentionalWipe;
  _intentionalWipe = false;

  if (_killSwitchTripped) { setSyncStatus('offline'); return; }

  // ── RATE CHECK: too many pushes too fast is not a person editing data ────
  const _now = Date.now();
  _pushTimestamps.push(_now);
  while (_pushTimestamps.length && _now - _pushTimestamps[0] > PUSH_RATE_WINDOW_MS) _pushTimestamps.shift();
  if (!_isIntentionalWipe && _pushTimestamps.length > PUSH_RATE_MAX) {
    _tripKillSwitch(_pushTimestamps.length + ' pushToCloud() calls within ' + (PUSH_RATE_WINDOW_MS/1000) + 's');
    return;
  }

  // ── CUMULATIVE-DROP CHECK: catches a slow drip of individually-legal ─────
  // single-item drops that would otherwise dodge the per-call check below.
  const _entryCountNow  = (S.entries || []).length;
  const _weightCountNow = (S.weightLog || []).length;
  if (_isIntentionalWipe) {
    _recentPeakEntryCount = 0; _recentPeakWeightCount = 0;
  } else {
    if (!_peakResetTimer) {
      _recentPeakEntryCount = _entryCountNow;
      _recentPeakWeightCount = _weightCountNow;
      _peakResetTimer = setTimeout(() => { _peakResetTimer = null; }, PEAK_WINDOW_MS);
    } else {
      _recentPeakEntryCount  = Math.max(_recentPeakEntryCount, _entryCountNow);
      _recentPeakWeightCount = Math.max(_recentPeakWeightCount, _weightCountNow);
    }
    if ((_recentPeakEntryCount - _entryCountNow) > CUMULATIVE_DROP_MAX ||
        (_recentPeakWeightCount - _weightCountNow) > CUMULATIVE_DROP_MAX) {
      _tripKillSwitch('entries/weightLog dropped by more than ' + CUMULATIVE_DROP_MAX + ' within ' + (PEAK_WINDOW_MS/1000) + 's (peak ' + _recentPeakEntryCount + '/' + _recentPeakWeightCount + ' -> now ' + _entryCountNow + '/' + _weightCountNow + ')');
      return;
    }
  }

  if (!S.usingSubcollections && !_isIntentionalWipe) {
    // Rule 1: never write before we know what the server actually has.
    // load() always resets S.entries/S.weightLog to [] and relies on the
    // next _fetchFromServer() to refill them — pushing before that
    // completes means pushing those empty arrays as gospel.
    if (!cloudReady) {
      console.error('[sync] BLOCKED pushToCloud(): called before the first server fetch completed — S.entries/S.weightLog are not yet trustworthy. This write has been refused to prevent overwriting the cloud with empty data. If this fires legitimately, the call site needs to await _fetchFromServer() first.');
      setSyncStatus('offline');
      return;
    }
    // Rule 2: never let a write silently collapse entries/weightLog by more
    // than one item versus the last confirmed server state. Every genuine
    // single-item delete (deleteEntry, deleteWeight, deleteHistoryEntry)
    // only ever removes exactly one row, so a bigger drop means S got reset
    // out from under us (or corrupted), not that the user deleted things —
    // and it must never be written back as truth.
    const entryCount  = (S.entries || []).length;
    const weightCount = (S.weightLog || []).length;
    const entryDrop   = _lastConfirmedEntryCount  - entryCount;
    const weightDrop  = _lastConfirmedWeightCount - weightCount;
    if (entryDrop > 1 || weightDrop > 1) {
      console.error('[sync] BLOCKED pushToCloud(): refusing to overwrite the shared document — entries ' + _lastConfirmedEntryCount + ' -> ' + entryCount + ', weightLog ' + _lastConfirmedWeightCount + ' -> ' + weightCount + '. A drop this size in one write is not a normal single-item delete and looks like data loss. Re-fetching from the server to recover instead.');
      setSyncStatus('offline');
      _fetchFromServer();
      return;
    }
  }
  // ── end circuit breaker ─────────────────────────────────────────────────

  const { sharedDocRef, setDoc, getDocFromServer } = window.__firebaseSync;

  // ── ADDITIVE-ONLY MERGE (legacy mode only) ──────────────────────────────
  // The old failure mode was: whatever S.entries happens to be right now
  // gets written as the WHOLE truth, wholesale. Instead: fetch exactly what
  // the server has at this instant, then only ever ADD to it — anything
  // logged locally (e.g. while offline) that the server doesn't have yet.
  // Nothing the server already has can ever be dropped by this step, except
  // an id that a real, online-confirmed delete just registered as pending.
  // Skip this for an intentional wipe (clearHistory) — that's its own
  // explicit, separate, already-online-gated action.
  let entriesForPayload = S.entries;
  let weightLogForPayload = S.weightLog || [];
  if (!S.usingSubcollections && !_isIntentionalWipe) {
    try {
      const freshSnap = await getDocFromServer(sharedDocRef);
      const serverData = freshSnap.exists() ? freshSnap.data() : {};
      const serverEntries   = Array.isArray(serverData.entries)   ? serverData.entries   : [];
      const serverWeightLog = Array.isArray(serverData.weightLog) ? serverData.weightLog : [];

      entriesForPayload = mergeEntries(S.entries || [], serverEntries)
        .filter(e => !_pendingDeleteEntryKeys.has(entryKey(e)));

      const weightById = new Map();
      serverWeightLog.forEach(w => weightById.set(w.id, w));
      (S.weightLog || []).forEach(w => weightById.set(w.id, w)); // local wins on conflict
      weightLogForPayload = Array.from(weightById.values())
        .filter(w => !_pendingDeleteWeightIds.has(w.id));
    } catch (err) {
      console.error('[sync] could not fetch fresh server state for additive merge — aborting this push rather than risk overwriting with a stale local copy', err);
      setSyncStatus('offline');
      return;
    }
  }

  // Build the parent-doc payload. In subcollections mode entries/weightLog
  // live in their own subcollections; only settings/mission/etc go here.
  //
  // workoutModule and dailyTargets are the two fields that mutate live while
  // someone is mid-workout (skill-ladder auto-advance, today's checkmarks).
  // If Nacho and Gabi train at the same time on separate devices, each
  // device's in-memory copy of the OTHER person's slice is a stale snapshot
  // from its last fetch. Writing the whole object back (even with
  // merge:true, which only deep-merges one level of nested maps) risks a
  // stale slice silently overwriting fresher data the other device just
  // wrote. Scoping the write to a single dot-path field — workoutModule.gabi
  // vs workoutModule.nacho — means each device only ever touches its own
  // person's data, so the two writes can never collide regardless of timing.
  const person = S.currentPerson || 'gabi';
  const payload = stripUndefined(S.usingSubcollections ? {
    mission: S.mission,
    settings: S.settings || {},
    treatTokens: S.treatTokens || {},
    [`dailyTargets.${person}`]: (S.dailyTargets && S.dailyTargets[person]) || {},
    [`workoutModule.${person}`]: (S.workoutModule && S.workoutModule[person]) || {},
    kitchenListed: (S.kitchen && S.kitchen.listed) || {},
    kitchenSaved: (S.kitchen && S.kitchen.saved) || {},
    kitchenCustom: (S.kitchen && S.kitchen.custom) || [],
    updatedAt: Date.now()
  } : {
    entries: entriesForPayload,
    mission: S.mission,
    weightLog: weightLogForPayload,
    settings: S.settings || {},
    dailyTargets: S.dailyTargets || {},
    treatTokens: S.treatTokens || {},
    workoutModule: S.workoutModule || {},
    kitchenListed: (S.kitchen && S.kitchen.listed) || {},
    kitchenSaved: (S.kitchen && S.kitchen.saved) || {},
    kitchenCustom: (S.kitchen && S.kitchen.custom) || [],
    updatedAt: Date.now()
  });

  setSyncStatus('pending');
  try {
    const writeOpts = S.usingSubcollections ? { merge: true } : undefined;
    (writeOpts ? setDoc(sharedDocRef, payload, writeOpts) : setDoc(sharedDocRef, payload))
      .then(() => {
        // Write confirmed by server — immediately re-poll so the UI reflects
        // the authoritative server state (e.g. after a delete)
        setTimeout(_fetchFromServer, 300);
      })
      .catch(err => {
        // Previously silent — a rejected write (permission-denied, network,
        // quota, malformed payload, etc) only ever changed the sync dot to
        // red with zero console output, making a real write failure
        // indistinguishable from "app is just offline" and impossible to
        // diagnose from the console.
        console.error('[sync] pushToCloud write rejected:', err && err.code, err && err.message, err);
        setSyncStatus('offline');
      });
  } catch (e) {
    console.error('[sync] setDoc threw synchronously:', e);
    setSyncStatus('offline');
  }
}

let _currentSyncState = null; // tracked so other code (auto-reconnect on
                               // visibility/online events) can check the
                               // current state without re-parsing DOM text.
// Auto-fade: once the dot has sat in 'synced' for 5s straight (no writes,
// no reconnects, nothing), it fades out — everything's fine, no need to
// keep showing a dot for it. Any other state (pending/connecting/stuck/
// offline) cancels the fade-out timer and brings the dot back immediately,
// since those are exactly the states the person should be able to see.
let _syncFadeTimer = null;
function setSyncStatus(state) {
  _currentSyncState = state;
  const el = document.getElementById('sync-status');
  if (!el) return;

  // Clear the offline retry timer whenever we successfully leave the offline state
  if (state !== 'offline') {
    if (_offlineRetryTimer) { clearInterval(_offlineRetryTimer); _offlineRetryTimer = null; }
  }

  // Any state change cancels a pending fade-out — only an uninterrupted
  // 5s of 'synced' should ever hide the dot.
  if (_syncFadeTimer) { clearTimeout(_syncFadeTimer); _syncFadeTimer = null; }
  el.style.opacity = '1';

  if (state === 'synced') {
    el.style.color = '#7FFF00'; // acid green — bright, not themed
    el.innerHTML = '●';
    _syncFadeTimer = setTimeout(() => {
      // Only fade if still synced when the timer fires — setSyncStatus
      // would have already cancelled this timer otherwise, but guard
      // anyway in case of any future call-site changes.
      if (_currentSyncState === 'synced') el.style.opacity = '0';
      _syncFadeTimer = null;
    }, 5000);
  } else if (state === 'pending') {
    el.style.color = '#7FFF00';
    el.innerHTML = '●';
  } else if (state === 'connecting') {
    el.style.color = '#888';
    el.innerHTML = '●';
  } else if (state === 'stuck') {
    el.style.color = '#e05252';
    el.innerHTML = '●';
    if (!_offlineRetryTimer) {
      _offlineRetryTimer = setInterval(() => { if (!cloudReady) doSync(); }, 60000);
    }
  } else {
    // offline
    el.style.color = '#e05252';
    el.innerHTML = '●';
    if (!_offlineRetryTimer) {
      _offlineRetryTimer = setInterval(() => { doSync(); }, 60000);
    }
  }
}

// ── CLOUD SYNC ─────────────────────────────────────────────────────────────
// Fresh rewrite. One active listener at a time, tracked by unsub handle.
// doSync() is the single entry point — called on init and on badge tap.
// It waits for __firebaseSync to be ready (the Firebase module loads async),
// then attaches a Firestore onSnapshot listener. Any previous listener is
// torn down first so there's never more than one active.

// _syncUnsub / _syncPoll removed — replaced by _pollTimer / _fetchFromServer polling engine

// ── SYNC ENGINE: cache-free polling via getDocsFromServer ──────────────────
// We deliberately avoid onSnapshot entirely for reading entries/weightLog.
// Firestore's onSnapshot uses a persistent IndexedDB cache that can serve
// stale deleted documents even after they're gone from the server — exactly
// the "deleted entries keep reappearing" bug. getDocsFromServer() bypasses
// the cache completely, always going to the server. We poll every 3s so both
// phones see each other's changes within a few seconds, and after any local
// write we poll immediately so the confirmed state is always what's displayed.
//
// The parent doc (mission/settings) still uses onSnapshot but we gate on
// fromCache so legacy single-doc mode also works correctly.

let _pollTimer        = null;   // setInterval handle for the poll loop
let _pollInFlight     = false;  // prevent overlapping fetches
let _fbWaitTimer      = null;   // polls until __firebaseSync is ready
let _offlineRetryTimer = null;  // auto-retries every 60s while offline
let _lastSyncHash     = null;   // fingerprint of last fetched data, to skip no-op renders
// Once true, renderVitals is allowed to paint even before the first server
// fetch — it draws from whatever is in S (local cache from localStorage).
// This means the UI is never blank while waiting for Firebase to respond.
let _cacheRendered    = false;

// Stable JSON serialisation — sorts object keys recursively so two objects
// with the same data but different key insertion order produce the same string.
// Used for the sync hash to avoid spurious re-renders when Firestore returns
// the same data with shuffled key order.
function _stableStr(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_stableStr).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + _stableStr(v[k])).join(',') + '}';
}

// Called once per poll cycle — fetches entries + weightLog directly from
// server, applies them to S, re-renders. Never touches Firestore local cache.
async function _fetchFromServer() {
  if (_pollInFlight || !window.__firebaseSync) return;
  _pollInFlight = true;
  try {
    const { db, collection, doc, getDoc, getDocs } = window.__firebaseSync;
    // getDocsFromServer requires the source option — use getDocs with source override.
    // We import getDocsFromServer via the already-loaded module reference.
    const fs = window.__firebaseSync;
    if (!fs.getDocsFromServer) {
      // Not imported yet — skip this tick
      _pollInFlight = false;
      return;
    }

    // Fetch entries subcollection and parent doc in parallel
    const [entriesSnap, parentSnap] = await Promise.all([
      fs.getDocsFromServer(collection(db, 'la-salud', 'sharedData', 'entries')),
      fs.getDocFromServer(doc(db, 'la-salud', 'sharedData')),
    ]);

    suppressPush = true;

    // Entries: server is authoritative for anything it's actually confirmed
    // — but a delete or edit fired moments ago may not have landed on the
    // server yet by the time THIS poll tick started. Blindly replacing
    // S.entries with the raw snapshot would then reinstate a just-deleted
    // entry, or revert a just-edited one back to its pre-edit content,
    // until the next poll happens to catch up. Reconcile against what's
    // still pending locally first:
    const rawFetched = entriesSnap.docs.map(d => d.data());
    const rawFetchedIds = new Set(rawFetched.map(e => e.id));
    const localById = new Map((S.entries || []).map(e => [e.id, e]));

    const reconciled = rawFetched
      // Don't resurrect something we just deleted — the server hasn't
      // caught up to that delete yet.
      .filter(e => !_pendingDeleteIds.has(e.id))
      // Don't revert something we just edited — keep our local copy until
      // the server confirms it has the same (or newer) content.
      .map(e => (_pendingEditIds.has(e.id) && localById.has(e.id)) ? localById.get(e.id) : e);

    // An entry with a write still in flight might not even be in the
    // server snapshot yet at all (brand-new entry, or the very first poll
    // after logging it) — without this it would be silently dropped by
    // the replace below rather than just reverted.
    localById.forEach((localE, id) => {
      if (_pendingEditIds.has(id) && !rawFetchedIds.has(id) && !_pendingDeleteIds.has(id)) {
        reconciled.push(localE);
      }
    });

    S.entries = reconciled;

    // A pending delete only actually resolves once the server confirms the
    // doc is gone — checked against the RAW snapshot (before our own
    // filter above, which would trivially always show it absent).
    if (_pendingDeleteIds.size) {
      Array.from(_pendingDeleteIds).forEach(id => { if (!rawFetchedIds.has(id)) _pendingDeleteIds.delete(id); });
    }

    // Parent doc: settings/mission/etc (no entries/weightLog in subcollection mode)
    let cloud = null;
    if (parentSnap.exists()) {
      cloud = parentSnap.data();
      if (cloud.mission)      S.mission      = cloud.mission;
      if (cloud.settings)     S.settings     = { ...S.settings, ...cloud.settings };
      if (cloud.dailyTargets) S.dailyTargets = cloud.dailyTargets;
      if (cloud.treatTokens)  S.treatTokens  = cloud.treatTokens;
      if (cloud.workoutModule) S.workoutModule = cloud.workoutModule;
      if (!S.kitchen) S.kitchen = { listed: {}, saved: {}, custom: [], section: 'plan', planTab: 'all', filters: {}, sort: null };
      if (cloud.kitchenListed) S.kitchen.listed = cloud.kitchenListed;
      if (cloud.kitchenSaved)  S.kitchen.saved  = cloud.kitchenSaved;
      if (cloud.kitchenCustom) S.kitchen.custom = cloud.kitchenCustom;
      // Legacy single-doc mode: entries lived on the parent doc
      if (cloud.entries && !S.usingSubcollections) {
        S.entries = cloud.entries;
      }
      // First time we see the parent doc without entries/weightLog → subcollections mode
      if (!S.usingSubcollections && !('entries' in cloud) && !('weightLog' in cloud)) {
        S.usingSubcollections = true;
      }
      if (!cloudReady && !S.usingSubcollections) {
        // Legacy first-run seed
        if (!parentSnap.exists()) pushToCloud();
      }
    } else if (!cloudReady) {
      pushToCloud(); // first ever run — seed from local
    }

    // Also fetch weightLog subcollection
    const wlSnap = await fs.getDocsFromServer(collection(db, 'la-salud', 'sharedData', 'weightLog'));
    S.weightLog = wlSnap.docs.map(d => d.data());
    // Legacy single-doc mode: weightLog lived on the parent doc, not this
    // subcollection (which is always empty pre-migration) — this fallback
    // was missing entirely before (entries had the equivalent one above),
    // so in legacy mode every poll silently wiped S.weightLog back to
    // empty right after a weight was logged, even though the write itself
    // (via pushToCloud's parent-doc payload) had succeeded.
    if (cloud && cloud.weightLog && !S.usingSubcollections) {
      S.weightLog = cloud.weightLog;
    }

    // Record what the server actually has RIGHT NOW, before any repair
    // logic below runs. This is the circuit breaker's source of truth in
    // pushToCloud() (see _lastConfirmedEntryCount/_lastConfirmedWeightCount)
    // — it must be updated here, from data we just pulled from the server,
    // never from a guess.
    _lastConfirmedEntryCount  = (S.entries || []).length;
    _lastConfirmedWeightCount = (S.weightLog || []).length;

    // A pending delete is only truly "done" once the server itself confirms
    // the item is gone — not just because a delete call was made. Checking
    // against the freshly-fetched server state (rather than a timer) means
    // this can't retire a pending delete too early, and can't leave one
    // stuck forever either.
    if (_pendingDeleteEntryKeys.size) {
      const stillPresent = new Set((S.entries || []).map(e => entryKey(e)));
      Array.from(_pendingDeleteEntryKeys).forEach(k => { if (!stillPresent.has(k)) _pendingDeleteEntryKeys.delete(k); });
    }
    if (_pendingDeleteWeightIds.size) {
      const stillPresentW = new Set((S.weightLog || []).map(w => w.id));
      Array.from(_pendingDeleteWeightIds).forEach(id => { if (!stillPresentW.has(id)) _pendingDeleteWeightIds.delete(id); });
    }

    // Compare against what THIS device last saw, even across a full
    // app close/reopen — catches loss that happened while nobody had the
    // app open to see the kill switch trip live. Only runs once per session.
    if (!_sessionCheckDone) {
      _sessionCheckDone = true;
      _checkAgainstLastSession(_lastConfirmedEntryCount, _lastConfirmedWeightCount);
    }
    _recordSessionCounts();

    // ── DATA REPAIR — runs on every load, fixes two related corruptions ──
    //
    // 1) PERSON CASING: some entries (originally from a CSV import that
    //    didn't normalise the person column) ended up stored as
    //    "Nacho"/"NACHO" instead of the lowercase 'nacho' every comparison
    //    in the app expects (entriesFor, groupEntriesByPersonDate, the
    //    POTATES scorer). A casing mismatch makes those entries invisible
    //    everywhere — this was driving Nacho's score to a flat 0.
    //
    // 2) NUMERIC FIELDS AS STRINGS: AI-parsed meal/workout entries could end
    //    up with a numeric field (omega3_g, magnesium_mg, duration_min, etc)
    //    stored as a raw non-numeric string (e.g. "trace") instead of a
    //    number, because normaliseLine() falls back to the raw string when
    //    it can't confidently parse a number out of the AI's reply, and the
    //    `||0` guards at entry-creation time don't catch truthy strings.
    //    Any arithmetic on those fields downstream (micronutrient averages,
    //    the score, CSV export's .toFixed()) then breaks — showing as NaN
    //    in the UI or throwing outright in the CSV export. log.js now
    //    coerces these at creation time, but this repairs anything already
    //    sitting in Firestore from before that fix.
    const NUMERIC_MEAL_FIELDS = ['calories','protein_g','carbs_g','netcarbs_g','fat_g','fibre_g',
      'magnesium_mg','vitd_mcg','iron_mg','calcium_mg','zinc_mg','b12_mcg','omega3_g','potassium_mg',
      'vitc_mg','folate_mcg','day_kcal_target'];
    const NUMERIC_WORKOUT_FIELDS = ['duration_min','calories_burned','steps_logged'];
    const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    let _repaired = false;
    S.entries.forEach(e => {
      if (typeof e.person === 'string') {
        const fixed = e.person.trim().toLowerCase();
        if (fixed !== e.person) { e.person = fixed; _repaired = true; }
      }
      const fields = e.record_type === 'workout' ? NUMERIC_WORKOUT_FIELDS : NUMERIC_MEAL_FIELDS;
      fields.forEach(f => {
        if (e[f] === undefined) return; // absent is fine, don't invent fields
        if (typeof e[f] !== 'number' || isNaN(e[f])) { e[f] = toNum(e[f]); _repaired = true; }
      });
    });
    S.weightLog.forEach(e => {
      if (typeof e.person === 'string') {
        const fixed = e.person.trim().toLowerCase();
        if (fixed !== e.person) { e.person = fixed; _repaired = true; }
      }
    });
    if (_repaired) {
      // Push the corrected data back to the cloud so this is a one-time
      // repair rather than something every device has to redo on load.
      pushToCloud();
      if (S.usingSubcollections) pushEntriesToSubcollections();
    }

    suppressPush = false;

    // Persist mission/settings/etc but NOT entries/weightLog.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_stateForStorage())); } catch(e) {}

    const wasFirstSync = !cloudReady;
    cloudReady = true;
    setSyncStatus('synced');

    // Only re-render if data actually changed — avoids the visible "flicker"
    // (and donut CSS re-animation) on every poll tick when nothing is different.
    // Hash covers everything that drives the UI: entries, weightLog, mission,
    // kitchen, settings, and dailyTargets. If none of these changed, the poll
    // was a no-op and we skip the render entirely.
    //
    // IMPORTANT: Firestore returns docs in non-deterministic order each fetch,
    // so we sort by id before joining — otherwise identical data produces a
    // different hash every single poll and always triggers a re-render.
    const sortedEntries   = [...S.entries].sort((a,b) => String(a.id) < String(b.id) ? -1 : 1);
    const sortedWeightLog = [...(S.weightLog||[])].sort((a,b) => String(a.id) < String(b.id) ? -1 : 1);
    const newHashParts = {
      e:   sortedEntries.length,
      w:   sortedWeightLog.length,
      em:  sortedEntries.map(x=>x.id).join(','),
      wm:  sortedWeightLog.map(x=>x.id).join(','),
      // Include entry values so an edit (same id, different calories/name) is caught
      ev:  sortedEntries.map(x=>(x.calories||0)+'|'+(x.workout_type||x.meal||'')).join(','),
      wv:  sortedWeightLog.map(x=>x.kg).join(','),
      mis: _stableStr(S.mission),
      kit: _stableStr(S.kitchen),
      set: _stableStr(S.settings),
      tgt: _stableStr(S.dailyTargets),
      wom: _stableStr(S.workoutModule),
    };
    const newHash = _stableStr(newHashParts);
    if (wasFirstSync || newHash !== _lastSyncHash) {
      if (!wasFirstSync && _lastSyncHash) {
        console.log('[sync] data changed — re-rendering');
      }
      _lastSyncHash = newHash;
      renderVitals(); renderLogTab(); syncFullDayCheckbox(); renderKitchen();
      loadMissionFields(); renderWeightHistories(); renderProgress();
      if (document.getElementById('sec-history') && document.getElementById('sec-history').classList.contains('active')) renderHistory();
      if (document.getElementById('sec-workout') && document.getElementById('sec-workout').classList.contains('active')) renderWorkoutHome();
    }

  } catch(err) {
    suppressPush = false;
    // Log the full error so we can see what's actually failing in the console
    console.error('[sync] poll failed:', err && err.code, err && err.message, err);
    setSyncStatus('offline');
  } finally {
    _pollInFlight = false;
  }
}

// Start the poll loop. Safe to call multiple times — tears down existing loop first.
function _startPollLoop() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  _fetchFromServer(); // immediate fetch on attach
  _pollTimer = setInterval(_fetchFromServer, 60000);
}

function doSync() {
  if (_fbWaitTimer) { clearInterval(_fbWaitTimer); _fbWaitTimer = null; }
  setSyncStatus('connecting');

  if (window.__firebaseSync) {
    _startPollLoop();
  } else {
    // Firebase module hasn't finished loading yet — wait up to 15s (slow
    // network) before giving up. The module script calls __onFirebaseReady()
    // when it's done, which starts the poll immediately without waiting here.
    const giveUp = Date.now() + 15000;
    _fbWaitTimer = setInterval(() => {
      if (window.__firebaseSync) {
        clearInterval(_fbWaitTimer); _fbWaitTimer = null;
        _startPollLoop();
      } else if (Date.now() > giveUp) {
        clearInterval(_fbWaitTimer); _fbWaitTimer = null;
        console.warn('[sync] Firebase module never loaded — going offline');
        setSyncStatus('offline');
      }
    }, 300);
  }
}

// Called by the Firebase module script as soon as __firebaseSync is ready —
// skips the polling wait and starts syncing immediately.
window.__onFirebaseReady = function() {
  if (_fbWaitTimer) { clearInterval(_fbWaitTimer); _fbWaitTimer = null; }
  _startPollLoop();
};

// Called if the Firebase module import itself throws (no network, ad-blocker).
window.__onFirebaseFailed = function() {
  if (_fbWaitTimer) { clearInterval(_fbWaitTimer); _fbWaitTimer = null; }
  setSyncStatus('offline');
};

// Public entry points
function retryCloudSync() { doSync(); }
function startCloudSync()  { doSync(); }

// Re-poll immediately when coming back to foreground (catches changes made
// on the other phone while this one was asleep / backgrounded)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window.__firebaseSync) {
    _fetchFromServer();
  }
});
window.addEventListener('online', () => {
  if (window.__firebaseSync) {
    _fetchFromServer();
    pushToCloud(); // flush whatever changed in S while we were offline
  }
});

// Stub — no longer needed but kept so any lingering call sites don't throw
function attachSubcollectionListeners() {}

// ── INIT ───────────────────────────────────────────────────────────────────
function init() {
  load();
  // One-time migration: old dual-goal schema (goal3kg = 3-month delta that
  // drove the calorie calc, goal1yWeight = motivational-only 1-year figure)
  // → single goal schema (goalTargetWeight + goalTimeframe). goal3kg wins
  // whenever it exists, since it's what was actually driving the live kcal
  // number pre-migration — this keeps the calculated target identical
  // immediately after migrating (goal1yWeight is only used as a fallback for
  // the rare case a mission somehow has a 1-year figure but no 3-month one).
  // Old fields are left in place, just no longer read by any live calc.
  ['gabi', 'nacho'].forEach(p => {
    const m = S.mission[p];
    if (!m) return;
    if (m.goalTargetWeight == null && (m.goal3kg != null || m.goal1yWeight != null)) {
      if (m.goal3kg != null) {
        m.goalTargetWeight = m.weight + (parseFloat(m.goal3kg) || 0);
        m.goalTimeframe = '3m';
      } else {
        m.goalTargetWeight = m.goal1yWeight;
        m.goalTimeframe = '1y';
      }
      m.goalSetDate = m.goalSetDate || todayStr();
      m.goalTargetDate = resolveGoalTargetDate(m);
    }
    // Fresh installs / already-migrated missions: make sure goalSetDate and
    // goalTargetDate are always stamped so resolveGoalTargetDate() has a
    // stable anchor instead of silently recomputing from "today" every load.
    if (!m.goalSetDate) m.goalSetDate = todayStr();
    if (!m.goalTargetDate) m.goalTargetDate = resolveGoalTargetDate(m);
    // Phase 5.1: new fields, backfill for missions saved before this existed.
    if (!m.gymExperience) m.gymExperience = 'intermediate';
    if (!m.goalType) m.goalType = 'lose_fat';
    if (m.userRateOverrideKgWeek === undefined) m.userRateOverrideKgWeek = null;
    if (m.adaptiveConfidence === undefined) m.adaptiveConfidence = null;
    if (m.lastAdaptiveRecalcDate === undefined) m.lastAdaptiveRecalcDate = null;
    if (m.lastAdaptiveNudge === undefined) m.lastAdaptiveNudge = null;
  });
  // Phase 2: run the adaptive check once per load. Cheap no-op when not due
  // (cadence-gated inside the function itself) or when there isn't enough
  // weigh-in data yet.
  ['gabi', 'nacho'].forEach(p => maybeRunAdaptiveRecalc(p));
  // One-time data migration: normalise any legacy workout_type values so
  // every HIIT entry counts correctly toward the Potates score.
  if (S.entries && S.entries.length) {
    let migrated = false;
    S.entries.forEach(e => {
      if (e.record_type === 'workout' && e.workout_type === 'VO2Max') {
        e.workout_type = 'HIIT';
        migrated = true;
      }
    });
    if (migrated) save();
  }
  if (!S.settings) S.settings = { waterGoal:{gabi:1750,nacho:1750}, movementTargets:{gabi:{zone2_min_week:150,hiit_min_week:30,strength_min_week:90,mobility_sessions_week:2,mobility_min_session:15,steps_day:10000},nacho:{zone2_min_week:150,hiit_min_week:30,strength_min_week:90,mobility_sessions_week:2,mobility_min_session:15,steps_day:10000}}, hypoKit:{gabi:'2 cookies (~12.5g sugar)',nacho:''}, hypoMacros:{gabi:{calories:50,carbs_g:13}} };
  if (!S.settings.movementTargets) S.settings.movementTargets = { gabi:{zone2_min_week:150,hiit_min_week:30,strength_min_week:90,mobility_sessions_week:2,mobility_min_session:15,steps_day:10000}, nacho:{zone2_min_week:150,hiit_min_week:30,strength_min_week:90,mobility_sessions_week:2,mobility_min_session:15,steps_day:10000} };
  if (!S.settings.hypoMacros) S.settings.hypoMacros = { gabi: { calories:50, carbs_g:13 } };
  // One-time migration: repair historical day_protein_target/day_carbs_target/
  // day_fat_target stamps that were derived from the old, kcal-disconnected
  // macro split (see migrateMacroTargetStamps() above for the full story).
  // Gated so it only ever runs once per install, and re-runs safely if it
  // somehow didn't touch anything the first time (touched === 0 doesn't set
  // the flag, so a later load with data present will retry).
  if (!S.settings.macroTargetsRepaired) {
    const touched = migrateMacroTargetStamps();
    if (touched > 0) {
      S.settings.macroTargetsRepaired = true;
      save();
    }
  }
  // Resync the LIVE mission macro split too — calculateMacrosFrom() only
  // ever runs inside applyCalculatedTarget()/calculateMyIntake(), i.e. only
  // when someone actually presses "Calculate my intake" or edits Targets.
  // Nothing previously refreshed S.mission[person].protein/carbs/fat on load,
  // so fixing the formula alone didn't help until someone manually re-ran it
  // — the mission object kept serving pre-fix numbers that don't sum to
  // mission.kcal, which is exactly what was still showing on Progress.
  // Cheap and safe to just always keep this in sync on every load.
  ['gabi', 'nacho'].forEach(p => {
    const m = S.mission[p];
    if (!m || !(m.kcal > 0)) return;
    const macros = calculateMacrosFrom(m, m.kcal);
    if (m.protein !== macros.protein || m.carbs !== macros.carbs || m.fat !== macros.fat) {
      m.protein = macros.protein;
      m.carbs = macros.carbs;
      m.fat = macros.fat;
      save();
    }
  });
  if (!S.dailyTargets) S.dailyTargets = {};
  if (!S.treatTokens) S.treatTokens = { gabi:0, nacho:0 };
  if (!S.kitchen) S.kitchen = {};
  if (!S.kitchen.listed) S.kitchen.listed = {};
  if (!S.kitchen.saved) S.kitchen.saved = {};
  if (!S.kitchen.custom) S.kitchen.custom = [];
  if (!S.kitchen.section) S.kitchen.section = 'plan';
  if (!S.kitchen.planTab) S.kitchen.planTab = 'all';
  if (!S.kitchen.filters) S.kitchen.filters = {};
  if (S.kitchen.sort === undefined) S.kitchen.sort = null;
  if (S.kitchen.cookAutoMode === undefined) S.kitchen.cookAutoMode = false;
  if (!S.kitchen.cookAlarm) S.kitchen.cookAlarm = 'bell';
  if (!S.workoutModule) S.workoutModule = { gabi: {}, nacho: {} };
  ['gabi', 'nacho'].forEach(p => {
    if (!S.workoutModule[p]) S.workoutModule[p] = {};
    const wm = S.workoutModule[p];
    if (wm.activePlanId === undefined) wm.activePlanId = null;
    if (!wm.currentSlotIndex) wm.currentSlotIndex = 0;
    if (!wm.subTab) wm.subTab = 'new';
    if (!wm.wizard) wm.wizard = { source: null, style: null, focus: null };
    if (wm.showAdHoc === undefined) wm.showAdHoc = false;
    if (!wm.sessionLog) wm.sessionLog = [];
    if (wm.liveSession === undefined) wm.liveSession = null;
    if (wm.viewFullProgram === undefined) wm.viewFullProgram = false;
    if (!wm.browse) wm.browse = { search: '', styleFilter: [], muscleFilter: [], equipmentFilter: [], openFilter: null, showYtAdd: false };
    if (wm.browse.showYtAdd === undefined) wm.browse.showYtAdd = false;
    if (!wm.customWorkouts) wm.customWorkouts = [];
    if (!wm.exerciseBrowse) wm.exerciseBrowse = { search: '', movementFilter: [], muscleFilter: [], equipmentFilter: [], openFilter: null };
  });
  if (!S.youtubeWorkouts) S.youtubeWorkouts = [];
  // hdr-date is created fresh inside renderVitals()'s #vitals-body innerHTML
  // (vitals.js), not part of static index.html — it doesn't exist yet the
  // first time init() runs. vitals.js already sets its textContent itself
  // right after inserting it, so nothing needs to happen here. (Previously
  // this line called getElementById('hdr-date').textContent directly and
  // threw on a fresh launch since the element didn't exist yet, which
  // halted the rest of init() — including setPerson() — before the
  // person/theme class ever got applied on first paint.)
  populateGoalSelects();
  loadMissionFields();
  setPerson(S.currentPerson || 'gabi');
  // Sync sky canvas to initial person (no animation, instant)
  if (window._skyDrawStatic) window._skyDrawStatic(S.currentPerson || 'gabi');
  // Allow renderVitals to paint from local cache immediately — before Firebase
  // responds. The first _fetchFromServer call will re-render with server data
  // if anything has changed (hash check), otherwise the cached view stays put.
  _cacheRendered = true;
  setPeriod('day'); // Vitals always opens on Day regardless of what was last selected
  renderLogTab();
  syncFullDayCheckbox();
  renderKitchen();
  doSync();
  // Last-resort auto-retry: if still not synced after 15s, fire again.
  setTimeout(() => { if (!cloudReady) doSync(); }, 15000);
}

// Builds the scroll-wheel-style <select> options once on load. Single-goal
// schema (Phase 0): one target-weight select (0.5kg steps, same range as the
// old 1-year weight picker) + one timeframe select. The old dual-select
// (3-month delta + 1-year motivational weight) is gone — see settings.js
// renderTargetsBody() for the fields these populate. The full Settings
// layout rework (merging Profile in, reordering) is Phase 1; this only
// updates the option lists to match the new fields.
function populateGoalSelects() {
  const timeframeOpts = [
    { v:'3m', label:'3 Months' },
    { v:'6m', label:'6 Months' },
    { v:'1y', label:'1 Year' },
    { v:'custom', label:'Custom date' }
  ].map(o => `<option value="${o.v}">${o.label}</option>`).join('');

  const weightOpts = [];
  for (let kg = 40; kg <= 130; kg += 0.5) {
    weightOpts.push(`<option value="${kg}">${kg}kg</option>`);
  }
  const weightHtml = weightOpts.join('');

  ['g-goal-timeframe', 'n-goal-timeframe'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = timeframeOpts;
  });
  ['g-goal-weight', 'n-goal-weight'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = weightHtml;
  });
}

// ─────────────────────────── NAV / SHELL (from ui.js) ──────────────────────
// ── TABS ───────────────────────────────────────────────────────────────────
function moveNavIndicator(el) {
  const ind = document.getElementById('bnav-indicator');
  if (!ind || !el) return;
  if (el.id === 'hdr-settings-btn') { ind.classList.add('hidden'); return; }
  ind.classList.remove('hidden');
  const nav = document.getElementById('bnav');
  const navRect = nav.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  ind.style.width = r.width + 'px';
  ind.style.transform = 'translateX(' + (r.left - navRect.left) + 'px)';
}
function openSettingsTab(el) {
  el.classList.add('spun');
  showSec('settings', el);
}
// Left-to-right order of the main nav for slide-direction purposes.
// Settings (now a header icon, not a row tab) isn't in the row, so it's
// treated as living off the right edge — opening it always slides in from
// the right, and going from Settings to any tab always slides in from the
// left. Physical row order is: Vitals, Progress, Log (center), Kitchen,
// Workout — this array must always match the DOM order of .bnav-tab in
// index.html, since swipe-gesture neighbour lookups and the sliding
// indicator both depend on the two staying in sync.
const SEC_ORDER = ['vitals','history','log','kitchen','workout'];
let lastSecName = 'vitals';
function secIndex(name) {
  const i = SEC_ORDER.indexOf(name);
  return i === -1 ? SEC_ORDER.length : i; // settings sorts after history
}
function showSec(name, el) {
  const fromIdx = secIndex(lastSecName);
  const toIdx = secIndex(name);
  const dir = toIdx === fromIdx ? null : (toIdx > fromIdx ? 'right' : 'left');
  const stage = document.getElementById('sec-stage');
  const outgoing = document.querySelector('.sec.active');
  const target = document.getElementById('sec-' + name);

  // ── Log tab animation ─────────────────────────────────────────────────
  // The "+" circle in the bottom nav expands to swallow the screen when
  // entering the Log tab; the panel slides up from the bottom. Reverse
  // (panel slides down/fades out) when leaving. Keeping this here rather
  // than in log.js avoids the wrapper approach and runs in the right order
  // relative to the generic slide swap below.
  const enteringLog = name === 'log' && lastSecName !== 'log';
  const leavingLog  = name !== 'log' && lastSecName === 'log';

  if (enteringLog) {
    const circle = document.querySelector('.bnav-log-icon circle');
    if (circle) {
      circle.classList.remove('bnav-log-expanding');
      void circle.getBoundingClientRect(); // force reflow so animation restarts on rapid re-tap
      circle.classList.add('bnav-log-expanding');
      setTimeout(() => circle.classList.remove('bnav-log-expanding'), 1000);
    }
  }

  if (leavingLog) {
    const secLog = document.getElementById('sec-log');
    if (secLog) {
      secLog.classList.remove('sec-log-entering');
      secLog.classList.add('sec-log-exiting');
      setTimeout(() => secLog.classList.remove('sec-log-exiting'), 350);
    }
  }
  // ─────────────────────────────────────────────────────────────────────

  document.querySelectorAll('.bnav-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  moveNavIndicator(el);

  // Bottom-nav tabs (Vitals/Kitchen/Workout/Log/Progress) are a different
  // navigation layer than the Settings sub-screen stack (Profile/Targets/
  // History/etc). Landing on a bottom-nav tab always means we've left that
  // stack, so currentSubSec must be cleared here — otherwise it can go
  // stale (e.g. set by a prior Settings→History visit) and later get
  // replayed by setPerson()'s "re-render whatever sub-screen is open" logic,
  // which yanks the user into Settings even though they're sitting on the
  // Progress tab.
  currentSubSec = null;

  const finishSwap = () => {
    document.querySelectorAll('.sec').forEach(s => s.classList.remove(
      'active','sec-out','sec-in','sec-out-left','sec-out-right','sec-in-left','sec-in-right'
    ));
    target.classList.add('active');
    if (stage) { stage.classList.remove('sec-transitioning'); stage.style.height = ''; }
  };

  if (!dir || !outgoing || outgoing === target) {
    // Same tab re-tapped, or nothing to animate from (e.g. first load) —
    // just swap instantly, no slide.
    document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
  } else {
    // Lock the stage's height to whichever panel is taller so neither
    // absolutely-positioned panel causes it to collapse mid-transition.
    target.classList.add('active');
    const outH = outgoing.offsetHeight, inH = target.offsetHeight;
    if (stage) stage.style.height = Math.max(outH, inH) + 'px';
    target.classList.remove('active');

    if (stage) stage.classList.add('sec-transitioning');
    outgoing.classList.add('sec-out', dir === 'right' ? 'sec-out-left' : 'sec-out-right');
    target.classList.add('active','sec-in', dir === 'right' ? 'sec-in-right' : 'sec-in-left');
    target.addEventListener('animationend', finishSwap, { once: true });
  }

  lastSecName = name;
  // Apply log panel slide-in after the generic swap has set target.active
  if (enteringLog) {
    const secLog = document.getElementById('sec-log');
    if (secLog) {
      secLog.classList.remove('sec-log-exiting', 'sec-log-entering');
      void secLog.getBoundingClientRect();
      secLog.classList.add('sec-log-entering');
      setTimeout(() => secLog.classList.remove('sec-log-entering'), 350);
    }
  }
  document.body.classList.toggle('settings-active', name === 'settings');
  // Update header title: fade out, swap text, fade in
  const _titleLabels = { vitals:'Vitals', log:'Log', kitchen:'Kitchen', workout:'Workout', history:'Progress', settings:'Settings' };
  const _newLabel = _titleLabels[name] || name;
  const titleEl = document.getElementById('hdr-section-title');
  if (titleEl && titleEl.textContent !== _newLabel) {
    titleEl.classList.remove('title-entering');
    titleEl.classList.add('title-hidden');
    setTimeout(() => {
      titleEl.textContent = _newLabel;
      titleEl.classList.remove('title-hidden');
      void titleEl.offsetWidth; // force reflow so animation restarts
      titleEl.classList.add('title-entering');
      titleEl.addEventListener('animationend', () => titleEl.classList.remove('title-entering'), { once: true });
    }, 350);
  }
  if (name !== 'settings') {
    const gear = document.getElementById('hdr-settings-btn');
    if (gear) gear.classList.remove('spun');
  }
  const hdr = document.getElementById('main-hdr');
  if (hdr) {
    if (name === 'vitals') {
      hdr.classList.remove('hdr-collapsed');
    } else {
      hdr.classList.add('hdr-collapsed');
    }
  }
  // Vitals, Progress (history), and Log get a taller #main-header to fit
  // their period/mode toggle row; Kitchen/Workout/Settings keep the short
  // header. header-tall sizing lives in style.css. Also show only the
  // toggle that belongs to the active tab inside #hdr-tab-row.
  const mainHeader = document.getElementById('main-header');
  const isTallTab = name === 'vitals' || name === 'history' || name === 'log' || name === 'kitchen';
  if (mainHeader) {
    mainHeader.classList.toggle('header-tall', isTallTab);
  }
  if (isTallTab) {
    ['vitals','history','log','kitchen'].forEach(t => {
      const row = document.getElementById('hdr-toggle-' + t);
      if (row) row.style.display = t === name ? 'flex' : 'none';
    });
  }
  if (name === 'kitchen') renderKitchen();
  if (name === 'history') { resetProgressCategoryToFood(); renderProgress(); }
  if (name === 'workout') renderWorkoutHome();
  if (name === 'settings') renderSettingsBody();
  // Re-sync every visible sliding-toggle highlight once this section's
  // content is in the DOM and laid out — covers toggles that were just
  // rebuilt via innerHTML (kitchen tier row, etc.) as well as ones that
  // were merely hidden/shown. rAF ensures layout has settled so
  // offsetLeft/offsetWidth reads are accurate.
  requestAnimationFrame(syncAllPfToggleSliders);
}

/* ── SLIDING TOGGLE HIGHLIGHT ──────────────────────────────────────────
   Generic, works on any ".seg.pf-toggle" container regardless of how many
   .seg-opt.pf-toggle-option children it has or which one is .active —
   used by Day/Week/Month (Vitals), Progress's Weight/Food/Activity,
   Kitchen's 10/20/30/35+ tier row, and the Meal Log Auto/Manual toggle.
   Deliberately NOT used for the G/N person-toggle (.psh-pill), which
   keeps its own separate, longer (0.32s) slide — see style.css. */
function syncPfToggleSlider(container) {
  if (!container) return;
  const active = container.querySelector('.pf-toggle-option.active');
  let slider = container.querySelector('.pf-toggle-slider');
  if (!active) {
    if (slider) slider.style.opacity = '0';
    return;
  }
  if (!slider) {
    slider = document.createElement('div');
    slider.className = 'pf-toggle-slider';
    container.insertBefore(slider, container.firstChild);
  }
  slider.style.opacity = '1';
  slider.style.width = active.offsetWidth + 'px';
  slider.style.height = active.offsetHeight + 'px';
  slider.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
}
function syncAllPfToggleSliders() {
  document.querySelectorAll('.seg.pf-toggle').forEach(syncPfToggleSlider);
}
// Delegated, capture-phase so it fires regardless of what each toggle's
// own onclick handler does (setKitchenSection, setAIMode, setProgressPeriod,
// etc.) — none of those functions need to know the slider exists. The
// rAF wait is because those onclick handlers add/remove the .active class
// synchronously right after this fires; we need that to have happened
// first.
document.addEventListener('click', (e) => {
  const opt = e.target.closest('.pf-toggle-option');
  if (!opt) return;
  const container = opt.closest('.seg.pf-toggle');
  requestAnimationFrame(() => syncPfToggleSlider(container));
}, true);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', syncAllPfToggleSliders);
} else {
  syncAllPfToggleSliders();
}

// ── SETTINGS SUB-SCREENS ─────────────────────────────────────────────────
// Lightweight sibling to showSec(), for screens reached only through the
// Settings menu (Profile, Targets, History-via-menu, API Key & Sync,
// Notifications) and for navigating back to the Settings menu itself.
// Deliberately does NOT touch bnav-tab active state or the sliding
// indicator — the gear icon stays the "active" bottom-nav tab the whole
// time the person is anywhere inside Settings, sub-screen or not, which
// is exactly what should happen since they never left Settings.
// Also deliberately does NOT update lastSecName/SEC_ORDER bookkeeping —
// that bookkeeping is only for the swipeable top-level tabs.
const SUBSEC_TITLES = { settings:'Settings', targets:'Profile & Targets', history:'History', apikey:'API Key & Sync', notifications:'Notifications', quicklog:'Quick Log Edits', reports:'Reports' };
// Maps a sub-screen name to its actual DOM id, for the rare cases where they
// differ — currently only 'history', whose div is sec-settings-history so it
// doesn't collide with the bottom-nav Progress tab's sec-history.
const SUBSEC_DOM_IDS = { history: 'sec-settings-history' };
// Tracks whichever sub-screen is currently open (null if none), so that
// switching person via togglePerson()/setPerson() can re-render whatever
// sub-screen the person is looking at right now.
let currentSubSec = null;

// Sub-screen navigation stack — used to know whether a transition is a
// forward push (new item onto stack → slide in from right) or a back pop
// (returning to parent → slide out to right). 'settings' is always the root.
const _subsecStack = ['settings'];

function showSubSec(name, opts) {
  // opts.instant = true skips animation (used by person-switch re-renders).
  const instant = opts && opts.instant;
  const domId = SUBSEC_DOM_IDS[name] || ('sec-' + name);
  const target = document.getElementById(domId);
  if (!target) return;

  // All settings sub-screens (including the root settings screen) must keep
  // settings-active on the body — without this, navigating back from a
  // sub-screen (e.g. Notifications → Settings) loses the class and renders
  // a blank black screen because the bnav reappears and the sec-stage
  // collapses.
  document.body.classList.add('settings-active');

  // Settings sub-screens always use the short header with their own in-panel
  // back arrow — they never use #main-header's tall variant or its tab
  // toggle row. Without this, whichever tall header/toggle was showing on
  // the tab you came from (e.g. Progress's Week/Month/Year row) stays
  // visible on top of the sub-screen and blocks navigation back out.
  const mainHeader = document.getElementById('main-header');
  if (mainHeader) mainHeader.classList.remove('header-tall');
  ['vitals','history','log','kitchen'].forEach(t => {
    const row = document.getElementById('hdr-toggle-' + t);
    if (row) row.style.display = 'none';
  });

  const outgoing = document.querySelector('.sec.active');

  // ── Content data-load first (so the panel is populated before it slides in)
  if (name === 'targets') {
    // renderTargetsBody() is defined in settings.js. It renders the active
    // person's fields dynamically into #targets-body.
    if (typeof renderTargetsBody === 'function') renderTargetsBody();
  }
  if (name === 'history') renderHistory();
  if (name === 'settings') { currentSubSec = null; renderSettingsBody(); }
  if (name === 'apikey') renderApiKeyBody();
  if (name === 'quicklog') renderQuickLogBody();
  if (name === 'reports') renderReportsBody();

  // ── Active state: highlight the menu row matching the open sub-screen
  document.querySelectorAll('[data-subsec]').forEach(row => {
    const isActive = row.dataset.subsec === name;
    row.classList.toggle('subsec-active', isActive);
  });

  // Determine push vs pop by checking whether we're going deeper or back.
  // Going to 'settings' is always a pop (back to root).
  const isBack = (name === 'settings') || (
    _subsecStack.length >= 2 && _subsecStack[_subsecStack.length - 2] === name
  );

  // Update the header title
  const titleEl = document.getElementById('hdr-section-title');
  const newLabel = SUBSEC_TITLES[name] || name;
  if (titleEl && titleEl.textContent !== newLabel) {
    titleEl.classList.remove('title-entering');
    titleEl.classList.add('title-hidden');
    setTimeout(() => {
      titleEl.textContent = newLabel;
      titleEl.classList.remove('title-hidden');
      void titleEl.offsetWidth;
      titleEl.classList.add('title-entering');
      titleEl.addEventListener('animationend', () => titleEl.classList.remove('title-entering'), { once: true });
    }, 190); // fires mid-slide so text is fresh when panel arrives
  }

  currentSubSec = (name === 'settings') ? null : name;

  // ── Update nav stack
  if (isBack) {
    // Pop until we reach `name`; handles multi-level back (unlikely but safe).
    while (_subsecStack.length > 1 && _subsecStack[_subsecStack.length - 1] !== name) {
      _subsecStack.pop();
    }
  } else {
    _subsecStack.push(name);
  }

  // ── Instant swap (no animation) — first load or person-switch re-render
  if (instant || !outgoing || outgoing === target) {
    document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
    return;
  }

  // ── Animated push / pop
  const stage = document.getElementById('sec-stage');

  // FIX: rapid back-taps can leave 'subsec-transitioning' stuck on the stage
  // and animation classes stranded on elements, causing all subsequent nav to
  // break. Always wipe the slate clean before starting a new transition —
  // regardless of whether a previous one finished — so each push/pop starts
  // from a known-good state. The outgoing element is what was previously
  // animating in (it already has .active); the target is fresh.
  const ANIM_CLASSES = ['subsec-in','subsec-out','subsec-push-in','subsec-push-out','subsec-pop-in','subsec-pop-out'];
  if (stage) { stage.classList.remove('subsec-transitioning'); stage.style.height = ''; }
  document.querySelectorAll('.sec').forEach(s => s.classList.remove(...ANIM_CLASSES));

  const outH = outgoing.offsetHeight, inH = target.offsetHeight;
  if (stage) stage.style.height = Math.max(outH, inH) + 'px';

  const pushInClass  = isBack ? 'subsec-pop-in'   : 'subsec-push-in';
  const pushOutClass = isBack ? 'subsec-pop-out'   : 'subsec-push-out';

  // Prep: put target into the flow (positioned on top) so its height is
  // measurable but hide it off screen.
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  target.classList.add('active', 'subsec-in');
  outgoing.classList.add('subsec-out');
  if (stage) stage.classList.add('subsec-transitioning');

  // Trigger animation classes next frame so the browser sees the "before" state
  requestAnimationFrame(() => {
    outgoing.classList.add(pushOutClass);
    target.classList.add(pushInClass);

    const cleanup = () => {
      document.querySelectorAll('.sec').forEach(s => s.classList.remove(...ANIM_CLASSES));
      if (stage) { stage.classList.remove('subsec-transitioning'); stage.style.height = ''; }
    };
    target.addEventListener('animationend', cleanup, { once: true });
  });
}

// ── SWIPE-TO-NAVIGATE ─────────────────────────────────────────────────────
(function initSwipeNav() {
  const stage = document.getElementById('sec-stage');
  if (!stage) return;
  const THRESHOLD_PX = 70;
  const THRESHOLD_VEL = 0.5;
  // active   = a touch is down and we haven't bailed yet
  // decided  = we've confirmed this is a horizontal gesture and started visuals
  // bailed   = confirmed vertical scroll — ignore moves but keep active=true so onEnd is a no-op
  let active = false, decided = false, bailed = false;
  let startX = 0, startY = 0, lastX = 0, lastT = 0, vel = 0;
  let curName, curIdx, prevName, nextName, curEl, prevEl, nextEl, stageW;
  // Tracks whether a settle animation is in flight so we don't read stale tab state
  let settling = false;
  // True when the touch started inside an element (e.g. a Kitchen shelf)
  // that owns its own horizontal scroll — those must never be hijacked by
  // the tab-switch swipe, in either direction.
  let startedInHscroll = false;

  function getNeighbours() {
    curName = lastSecName;
    curIdx = secIndex(curName);
    prevName = curIdx > 0 ? SEC_ORDER[curIdx - 1] : null;
    nextName = curIdx < SEC_ORDER.length - 1 ? SEC_ORDER[curIdx + 1] : null;
    curEl = document.getElementById('sec-' + curName);
  }

  function onStart(e) {
    if (settling || lastSecName === 'settings') return;
    const t = e.touches ? e.touches[0] : e;
    startX = lastX = t.clientX; startY = t.clientY; lastT = performance.now(); vel = 0;
    active = true; decided = false; bailed = false;
    startedInHscroll = !!(e.target && e.target.closest && e.target.closest('.hscroll-own'));
    _lastDragTitle = lastSecName; // reset so first threshold-cross fires
  }

  let _savedScrollY = 0;

  function beginDragVisuals() {
    getNeighbours();
    stageW = stage.getBoundingClientRect().width;
    prevEl = prevName ? document.getElementById('sec-' + prevName) : null;
    nextEl = nextName ? document.getElementById('sec-' + nextName) : null;
    _savedScrollY = window.scrollY;
    stage.classList.add('sec-transitioning','sec-dragging');
    curEl.classList.add('active','sec-drag-cur');
    const heights = [curEl.offsetHeight];
    if (prevEl) { prevEl.classList.add('active','sec-drag-prev'); heights.push(prevEl.offsetHeight); }
    if (nextEl) { nextEl.classList.add('active','sec-drag-next'); heights.push(nextEl.offsetHeight); }
    stage.style.height = Math.max(...heights) + 'px';
    setDragX(0);
    window.scrollTo(0, _savedScrollY);
  }

  // _indSettling: when true, _updateIndicatorForDrag must NOT reset transition
  // (the settle() call has already set it and owns the animation).
  let _indSettling = false;

  function setDragX(dx) {
    if (!prevEl) dx = Math.min(dx, 0);
    if (!nextEl) dx = Math.max(dx, 0);
    curEl.style.transform = `translateX(${dx}px)`;
    if (prevEl) prevEl.style.transform = `translateX(${dx - stageW}px)`;
    if (nextEl) nextEl.style.transform = `translateX(${dx + stageW}px)`;
    _updateIndicatorForDrag(dx);
  }

  let _lastDragTitle = null; // tracks which title is currently showing during drag

  function _updateIndicatorForDrag(dx) {
    const ind = document.getElementById('bnav-indicator');
    if (!ind || !stageW) return;
    const nav = document.getElementById('bnav');
    if (!nav) return;
    const tabs = [...nav.querySelectorAll('.bnav-tab')];
    const curTabIdx = tabs.findIndex(t => t.classList.contains('active'));
    if (curTabIdx < 0) return;
    const navRect = nav.getBoundingClientRect();
    const frac = dx / stageW;

    const fromTab = tabs[curTabIdx];
    let toTab = null;
    if (frac > 0 && curTabIdx > 0) toTab = tabs[curTabIdx - 1];
    else if (frac < 0 && curTabIdx < tabs.length - 1) toTab = tabs[curTabIdx + 1];

    // Only kill the transition when we're in live-drag mode (not during settle).
    if (!_indSettling) ind.style.transition = 'none';

    if (!toTab) {
      const r = fromTab.getBoundingClientRect();
      ind.style.width = r.width + 'px';
      ind.style.transform = 'translateX(' + (r.left - navRect.left) + 'px)';
      return;
    }

    const p = Math.min(1, Math.abs(frac));
    const rFrom = fromTab.getBoundingClientRect();
    const rTo   = toTab.getBoundingClientRect();
    ind.style.width     = (rFrom.width + (rTo.width - rFrom.width) * p) + 'px';
    ind.style.transform = 'translateX(' + ((rFrom.left - navRect.left) + ((rTo.left - navRect.left) - (rFrom.left - navRect.left)) * p) + 'px)';

    // Update header title live at 50% drag threshold
    const _titleLabels = { vitals:'Vitals', log:'Log', kitchen:'Kitchen', workout:'Workout', history:'Progress' };
    const titleEl = document.getElementById('hdr-section-title');
    if (titleEl && toTab) {
      const targetName = (toTab.getAttribute('onclick')||'').match(/'(\w+)'/)?.[1];
      const showName = p > 0.5 ? targetName : curName;
      if (showName && showName !== _lastDragTitle) {
        _lastDragTitle = showName;
        titleEl.classList.add('title-hidden');
        setTimeout(() => {
          titleEl.textContent = _titleLabels[showName] || showName;
          titleEl.classList.remove('title-hidden');
        }, 150);
      }
    }
  }

  function onMove(e) {
    if (!active || bailed) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; // too small to classify
      if (startedInHscroll) { bailed = true; return; } // let the shelf's own horizontal scroll handle it
      if (Math.abs(dy) > Math.abs(dx) * 1.5) { bailed = true; return; } // clearly vertical
      decided = true;
      beginDragVisuals();
    }
    const now = performance.now();
    if (now > lastT) vel = (t.clientX - lastX) / (now - lastT);
    lastX = t.clientX; lastT = now;
    if (e.cancelable) e.preventDefault();
    setDragX(dx);
  }

  function settle(target, committedDx) {
    const dur = 0.26;
    const ease = 'cubic-bezier(.4,0,.2,1)';
    const tr = `transform ${dur}s ${ease}`;
    curEl.style.transition = tr;
    if (prevEl) prevEl.style.transition = tr;
    if (nextEl) nextEl.style.transition = tr;

    // Let the indicator animate in perfect sync with the panels.
    const ind = document.getElementById('bnav-indicator');
    if (ind) {
      _indSettling = true;
      ind.style.transition = `transform ${dur}s ${ease}, width ${dur}s ${ease}`;
    }

    settling = true;
    requestAnimationFrame(() => setDragX(target));

    setTimeout(() => {
      curEl.style.transition = '';
      if (prevEl) prevEl.style.transition = '';
      if (nextEl) nextEl.style.transition = '';
      _indSettling = false;
      if (ind) ind.style.transition = '';
      settling = false;
      cleanupDragVisuals(committedDx);
    }, dur * 1000 + 20);
  }

  function cleanupDragVisuals(committedDx) {
    stage.classList.remove('sec-transitioning','sec-dragging');
    stage.style.height = '';
    [curEl, prevEl, nextEl].forEach(el => {
      if (el) { el.style.transform = ''; el.classList.remove('sec-drag-cur','sec-drag-prev','sec-drag-next'); }
    });
    if (committedDx > 0 && prevEl) finalizeNav(prevName);
    else if (committedDx < 0 && nextEl) finalizeNav(nextName);
    else { document.querySelectorAll('.sec').forEach(s => s.classList.remove('active')); curEl.classList.add('active'); }
  }

  function finalizeNav(name) {
    document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + name).classList.add('active');
    lastSecName = name;
    // Same fix as showSec(): landing on a bottom-nav tab via swipe also
    // means we've left the Settings sub-screen stack, so clear it here too.
    currentSubSec = null;
    const tab = document.querySelector(`.bnav-tab[onclick*="'${name}'"]`);
    document.querySelectorAll('.bnav-tab').forEach(t => t.classList.remove('active'));
    if (tab) { tab.classList.add('active'); moveNavIndicator(tab); }
    const hdr = document.getElementById('main-hdr');
    if (hdr) { if (name === 'vitals') hdr.classList.remove('hdr-collapsed'); else hdr.classList.add('hdr-collapsed'); }
    // Title only needs updating if drag didn't already cross 50% and set it
    const _titleLabels = { vitals:'Vitals', log:'Log', kitchen:'Kitchen', workout:'Workout', history:'Progress' };
    const titleEl2 = document.getElementById('hdr-section-title');
    if (titleEl2 && _lastDragTitle !== name) {
      _lastDragTitle = name;
      titleEl2.classList.add('title-hidden');
      setTimeout(() => {
        titleEl2.textContent = _titleLabels[name] || name;
        titleEl2.classList.remove('title-hidden');
      }, 150);
    }
    if (name === 'kitchen') renderKitchen();
    if (name === 'history') { resetProgressCategoryToFood(); renderProgress(); }
    if (name === 'workout') renderWorkoutHome();
  }

  function onEnd() {
    if (!active) return;
    active = false;
    if (!decided || bailed) return;
    const dx = lastX - startX;
    const committing = Math.abs(dx) > THRESHOLD_PX || Math.abs(vel) > THRESHOLD_VEL;
    if (committing && dx > 0 && prevEl) settle(stageW, 1);
    else if (committing && dx < 0 && nextEl) settle(-stageW, -1);
    else settle(0, 0);
  }

  stage.addEventListener('touchstart', onStart, { passive: true });
  stage.addEventListener('touchmove', onMove, { passive: false });
  stage.addEventListener('touchend', onEnd);
  stage.addEventListener('touchcancel', onEnd);
  stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') onStart(e); });
  window.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') onMove(e); });
  window.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') onEnd(e); });
})();

window.addEventListener('resize', () => {
  const active = document.querySelector('.bnav-tab.active');
  if (active) moveNavIndicator(active);
});
window.addEventListener('load', () => {
  const active = document.querySelector('.bnav-tab.active');
  if (active) moveNavIndicator(active);
});
const PRESSABLE_SEL = '.btn, .ptog, .seg-opt, .mmt-opt, .wk-type-btn, .meal-delete, .weight-hist-del, .trends-close, .hist-day-hdr, .user-id-toggle, .meal-card-add, .meal-card-save, .kitchen-chip, .kitchen-filter-btn';
document.addEventListener('pointerdown', e => {
  const el = e.target && e.target.closest && e.target.closest(PRESSABLE_SEL);
  if (el) el.classList.add('press-fx');
});
['pointerup','pointercancel','pointerleave'].forEach(evt => {
  document.addEventListener(evt, e => {
    const el = e.target && e.target.closest && e.target.closest(PRESSABLE_SEL);
    if (el) el.classList.remove('press-fx');
  });
});

// ── PERSON TOGGLE ──────────────────────────────────────────────────────────
function setPerson(p) {
  S.currentPerson = p;
  // Legacy ptog support (any remaining instances)
  document.querySelectorAll('.ptog[data-person]').forEach(el => {
    const active = el.dataset.person === p;
    el.className = 'ptog' + (active ? (p === 'gabi' ? ' active-g' : ' active-n') : '');
  });
  // New user-id-toggle widgets — update all instances
  const primary   = p === 'gabi' ? 'Gabi' : 'Nacho';
  const secondary = p === 'gabi' ? 'Nacho' : 'Gabi';
  document.querySelectorAll('.user-id-toggle').forEach(el => {
    el.className = el.className.replace(/person-(gabi|nacho)/g, '') + ' person-' + p;
    const pr = el.querySelector('.user-id-primary, .uid-primary-m');
    const sc = el.querySelector('.user-id-secondary, .uid-secondary-m');
    if (pr) pr.textContent = primary;
    if (sc) sc.textContent = secondary;
    // Quick decisive "snap" on every switch, on every instance of the toggle.
    el.classList.remove('uid-switch-fx');
    // Force reflow so the animation restarts even if it's still mid-run.
    void el.offsetWidth;
    el.classList.add('uid-switch-fx');
    el.addEventListener('animationend', () => el.classList.remove('uid-switch-fx'), { once:true });
  });
  // Body tint
  document.body.className = document.body.className.replace(/person-(gabi|nacho)/g, '') + ' person-' + p;
  // Sub-header name pair — swap which name is "active" styled
  const nameGabi = document.getElementById('psh-name-gabi');
  const nameNacho = document.getElementById('psh-name-nacho');
  if (nameGabi && nameNacho) {
    nameGabi.className = 'psh-name ' + (p === 'gabi' ? 'psh-active-g' : 'psh-inactive');
    nameNacho.className = 'psh-name ' + (p === 'nacho' ? 'psh-active-n' : 'psh-inactive');
  }
  // History re-renders filtered
  saveLocalOnly();
  renderVitals();
  renderLogTab();
  syncFullDayCheckbox();
  syncHypoQuickBtn();
  if (currentLogMode === 'water') renderWater();
  if (currentLogMode === 'workout') renderTodayWorkouts();
  // Fix: the Workout tab (New Workout / Program / Tracking sub-panels) reads
  // person-scoped state via wmState() but was never told to re-render on a
  // profile switch, so it kept showing the previous person's enrolled
  // program/tracking until the user manually navigated into it.
  if (document.getElementById('sec-workout') && document.getElementById('sec-workout').classList.contains('active')) renderWorkoutHome();
  renderHistory();
  renderProgress();
  // Fix 2: if a Settings sub-screen (Profile, Targets, History, etc.) is
  // currently open, re-render it so its person-specific content (weight,
  // targets, filtered history) updates too — showSubSec() already re-runs
  // the right render function for whichever sub-screen this is.
  if (currentSubSec) showSubSec(currentSubSec, { instant: true });
}

function togglePerson() {
  setPerson(S.currentPerson === 'gabi' ? 'nacho' : 'gabi');
}

// Close settings and return to whatever main tab was active before.
// lastSecName is the previous tab (set by showSec) — if it's 'settings'
// (first-ever open) fall back to 'vitals'.
function closeSettingsBack() {
  const returnTo = (lastSecName && lastSecName !== 'settings') ? lastSecName : 'vitals';
  // Find the matching bnav tab element to pass to showSec
  const bnavTabs = document.querySelectorAll('.bnav-tab');
  const secToIdx = { vitals:0, history:1, log:2, kitchen:3, workout:4 };
  const tabEl = bnavTabs[secToIdx[returnTo] ?? 0] || bnavTabs[0];
  showSec(returnTo, tabEl);
}

// renderMission() was deleted in Phase 1 — it used to toggle .visible on
// both people's static Profile mission-blocks. The old standalone Profile
// screen (#sec-profile) that housed those blocks has now been removed too —
// it was a leftover duplicate that silently ate every getElementById() call
// for g-/n- weight/height/age/activity because it sat earlier in the DOM
// than #sec-targets. That job is now done entirely by renderTargetsBody()
// in settings.js, which dynamically renders only the active person's
// combined Profile+Targets block (now titled "Profile") from S.mission on
// every open — see 1.3 in the trail doc.

// saveTargets() is defined in settings.js, which owns the Targets sub-screen.
// It saves mission fields + water + the new per-type workout targets for the
// active person, then calls save() + renderVitals().

function setPeriod(p) {
  S.period = p;
  ['day','week','month'].forEach(k => document.getElementById('per-'+k).classList.toggle('active', k===p));
  saveLocalOnly();
  renderVitals();
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function sum(arr, key) { return arr.reduce((a,b) => a + (parseFloat(b[key])||0), 0); }

// ── COUNT-UP NUMBER ANIMATION ────────────────────────────────────────────
// Animates a number from its currently-displayed value up (or down) to a
// target, eased the same way the bars next to it fill — so a score or
// kcal total visibly "races" into place in sync with its progress bar,
// instead of just popping to the final value.
// el: the DOM node whose textContent is the plain number (no extra markup).
// target: final integer value.
// opts.duration: ms, should match the paired bar's transition duration.
// opts.formatter: optional fn(roundedValue) -> string for custom display.
function animateCountTo(el, target, opts) {
  if (!el) return;
  const duration = (opts && opts.duration) || 500;
  const formatter = (opts && opts.formatter) || (v => String(v));
  const from = parseFloat(el.dataset.countVal !== undefined ? el.dataset.countVal : el.textContent.replace(/[^\d.-]/g,'')) || 0;
  target = Number(target) || 0;
  if (from === target) {
    el.textContent = formatter(target);
    el.dataset.countVal = target;
    return;
  }
  cancelAnimationFrame(el._countRAF);
  const start = performance.now();
  // ease-out cubic — matches the decelerating feel of the CSS "ease" bars
  const ease = t => 1 - Math.pow(1 - t, 3);
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const val = from + (target - from) * ease(p);
    el.textContent = formatter(Math.round(val));
    if (p < 1) {
      el._countRAF = requestAnimationFrame(tick);
    } else {
      el.textContent = formatter(target);
      el.dataset.countVal = target;
    }
  }
  el._countRAF = requestAnimationFrame(tick);
}

function dateRangeFor(period) {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const out = [];
  for (let i=0; i<days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(toLocalDateStr(d));
  }
  return out;
}

function entriesFor(person, dates, type) {
  const set = new Set(dates);
  return S.entries.filter(e => e.person === person && set.has(e.date) && e.record_type === type);
}

// Groups all entries by "person|date" so per-day lookups don't require
// re-scanning the full S.entries array. Build once per render, then use
// .get(person+'|'+date) (returns [] if none) instead of S.entries.filter(...).
function groupEntriesByPersonDate(entries) {
  const map = new Map();
  for (const e of entries) {
    const k = e.person + '|' + e.date;
    let bucket = map.get(k);
    if (!bucket) { bucket = []; map.set(k, bucket); }
    bucket.push(e);
  }
  return map;
}

// ── PROGRESS TAB — SEE HISTORY SHORTCUT ──────────────────────────────────────
// Opens the Settings History sub-screen from the Progress tab "See History"
// button. Sets a return flag so the back arrow in that sub-screen knows to
// come back here (Progress) instead of Settings menu.
function openHistoryFromProgress() {
  window._historyReturnTo = 'history';
  showSubSec('history');
}

// ── PROGRESS TAB — CALENDAR DATE JUMP ────────────────────────────────────────
function openDateJump() {
  const d = prompt('Jump to date (YYYY-MM-DD):');
  if (!d) return;
  const el = document.getElementById('hday-' + d.replace(/-/g,''));
  if (el) { el.scrollIntoView({ behavior:'smooth' }); el.classList.add('open'); }
  else showToast('No entries for that date');
}

// ── SETTINGS HISTORY — SMART BACK ────────────────────────────────────────────
// Called by the back arrow in #sec-settings-history. If we arrived from the
// Progress tab (via openHistoryFromProgress), return there. Otherwise go back
// to the Settings menu.
function goBackFromSettingsHistory() {
  if (window._historyReturnTo === 'history') {
    window._historyReturnTo = null;
    const bnavTabs = document.querySelectorAll('.bnav-tab');
    const secToIdx = { vitals:0, history:1, log:2, kitchen:3, workout:4 };
    const tabEl = bnavTabs[secToIdx['history'] ?? 1] || bnavTabs[1];
    showSec('history', tabEl);
  } else {
    showSubSec('settings');
  }
}

// ── HEADER SCROLL STATE ──────────────────────────────────────────────────
// #main-header is transparent at rest (see style.css). Once the page
// scrolls even slightly, content would pass unreadably underneath it, so
// this adds a .scrolled class back that restores a solid background
// (see the #main-header.scrolled rules in style.css). Page scrolls at
// the window/document level (header is position:fixed, sections use
// padding-top to clear it), so a plain window scroll listener is enough.
(function initHeaderScrollState() {
  function onScroll() {
    const header = document.getElementById('main-header');
    if (header) header.classList.toggle('scrolled', window.scrollY > 4);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();


// ─────────────────────── STORAGE / CSV / SYNC (from data.js) ───────────────
// ── CSV (combined meals + workouts, quote-safe) ───────────────────────────
function csvField(v) {
  v = (v===undefined || v===null) ? '' : String(v);
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g,'""') + '"';
  return v;
}

// CSV covers meals, workouts, water, AND weight (via a 'WEIGHT' record
// type + trailing Weight_kg column) so "Restore from CSV" fully rebuilds
// the weight log too — meals/workouts/water just leave that column blank,
// keeping the file a single clean, parseable CSV.
const CSV_HEADER = ['Record_type','Date','Person','Name','Time','Category','Calories','Protein_g','Carbs_g','NetCarbs_g','Fat_g','Fibre_g','Magnesium_mg','VitD_mcg','Iron_mg','Calcium_mg','Zinc_mg','B12_mcg','Omega3_g','Potassium_mg','VitC_mg','Folate_mcg','Duration_min','Intensity','Calories_burned','Steps_logged','Notes','Full_day_logged','Hypo_correction','Day_total_kcal','Day_kcal_target','Day_deficit','Weight_kg','Water_ml'];

function entryToRow(e, dayTotalsMap) {
  if (e.record_type === 'workout') {
    return [
      'WORKOUT', e.date, e.person, e.workout_type, e.logged_at, '',
      '','','','','','','','','','','','','','','',''
      ,
      e.duration_min||0, e.intensity||'', Math.round(e.calories_burned||0), e.steps_logged||'', e.notes||'',
      '','','','','',
      '', ''
    ];
  }
  if (e.record_type === 'water') {
    const mlVal = e.ml || 0;
    return [
      'WATER', e.date, e.person, 'Water', e.logged_at||'', '',
      '','','','','','','','','','','','','','','',''
      ,
      '', '', '', '', '',
      '','','','','',
      '', mlVal
    ];
  }
  const target = S.mission[e.person]?.kcal || 0;
  // Hypo corrections are excluded from the day's kcal-vs-target columns —
  // they're a treatment for a low, not part of the day's intended intake.
  // dayTotalsMap (person|date -> kcal) is precomputed once per export by
  // buildDayTotalsMap() — this used to re-filter the entire S.entries array
  // here for every single meal row (O(n²) on export size), which got very
  // slow once the log had a year+ of entries. Falls back to the old
  // per-row filter only if called without a map (shouldn't happen from the
  // two export paths below, but keeps this function safe standalone).
  const dayTotal = dayTotalsMap
    ? (dayTotalsMap.get(e.person + '|' + e.date) || 0)
    : sum(S.entries.filter(x => x.date===e.date && x.person===e.person && x.record_type==='meal' && !x.hypo_correction), 'calories');
  // num(): defensively coerces any value to a real number. Entries logged
  // before the log.js fix (which guarded against AI returning non-numeric
  // strings like "trace" for a micronutrient) may still have raw strings
  // sitting in Firestore — Math.round() on those silently produces NaN, and
  // .toFixed() on a string throws outright. This keeps export/scoring safe
  // regardless of when/how the entry was originally saved.
  const n = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
  return [
    'MEAL', e.date, e.person, e.meal, e.logged_at, e.meal_type,
    Math.round(n(e.calories)), Math.round(n(e.protein_g)), Math.round(n(e.carbs_g)), Math.round(n(e.netcarbs_g)),
    Math.round(n(e.fat_g)), Math.round(n(e.fibre_g)), Math.round(n(e.magnesium_mg)), Math.round(n(e.vitd_mcg)),
    Math.round(n(e.iron_mg)), Math.round(n(e.calcium_mg)), Math.round(n(e.zinc_mg)), Math.round(n(e.b12_mcg)),
    n(e.omega3_g).toFixed(1), Math.round(n(e.potassium_mg)), Math.round(n(e.vitc_mg)), Math.round(n(e.folate_mcg)),
    '','','','',
    '',
    e.full_day ? 'Y' : 'N', e.hypo_correction ? 'Y' : 'N', Math.round(dayTotal), target, Math.round(dayTotal-target),
    '', ''
  ];
}

function weightToRow(w) {
  return [
    'WEIGHT', w.date, w.person, '', '', '',
    '','','','','','','','','','','','','','','',''
    ,
    '','','','','',
    '','','','','',
    w.kg, ''
  ];
}

// One O(n) pass building a person|date -> day's meal-kcal-total map, so
// entryToRow() can look totals up instead of re-scanning S.entries for
// every meal row it exports (see the comment in entryToRow for why).
function buildDayTotalsMap(entries) {
  const map = new Map();
  for (const e of entries) {
    if (e.record_type !== 'meal' || e.hypo_correction) continue;
    const k = e.person + '|' + e.date;
    map.set(k, (map.get(k) || 0) + (parseFloat(e.calories) || 0));
  }
  return map;
}

function buildFullCSV() {
  const dayTotalsMap = buildDayTotalsMap(S.entries);
  const rows = [
    ...S.entries.map(e => entryToRow(e, dayTotalsMap)),
    ...(S.weightLog||[]).map(w => weightToRow(w))
  ].map(r => r.map(csvField).join(','));
  return CSV_HEADER.join(',') + '\n' + rows.join('\n');
}

function buildPersonCSV(person) {
  // Day totals still need to come from the full entries list (not just this
  // person's slice, though in practice they'd match) so the map's key format
  // stays identical to buildFullCSV()'s.
  const dayTotalsMap = buildDayTotalsMap(S.entries);
  const rows = [
    ...S.entries.filter(e => e.person === person).map(e => entryToRow(e, dayTotalsMap)),
    ...(S.weightLog||[]).filter(w => w.person === person).map(w => weightToRow(w))
  ].map(r => r.map(csvField).join(','));
  return CSV_HEADER.join(',') + '\n' + rows.join('\n');
}

function exportFullCSV() {
  if (!S.entries.length) { showToast('Nothing to export yet'); return; }
  const blob = new Blob([buildFullCSV()],{type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'la-salud-' + todayStr() + '.csv';
  a.click();
  showToast('Downloaded');
}

function copyFullCSV() {
  if (!S.entries.length) { showToast('Nothing to copy yet'); return; }
  navigator.clipboard.writeText(buildFullCSV());
  showToast('Copied');
}

// ── MIGRATE DATA ───────────────────────────────────────────────────────────
// The shared Firestore document has a hard 1MiB ceiling (see the storage
// estimate above the Log tab) — "Storage migration" in Settings is the
// one-tap fix for that. This bundle is a separate escape hatch: a complete,
// lossless data dump plus every design rule a rewrite needs to preserve,
// for handing to a future/more capable AI model if the app itself ever
// needs to be rebuilt from scratch.
function buildMigrationBundle() {
  const bytes = estimatedDocBytes();
  const kb = Math.round(bytes/1024);
  const pctOfLimit = Math.round((bytes/FIRESTORE_DOC_LIMIT_BYTES)*100);
  return `You are being handed maintenance of "La Salud" — a self-contained, single-file mobile web app (index.html, no build step, no framework) that a couple (Gabi & Nacho) in Valencia, Spain use to track food, workouts, and weight, syncing between two phones via Firebase Firestore. Calorie targets are calculated from BMR/TDEE.

WHY YOU'RE SEEING THIS:
This bundle is a complete, lossless snapshot of the data (every field, not the rounded/lossy CSV) plus the design rules below, for restoring this app's data and behavior elsewhere if needed. At the time this bundle was generated, the locally-estimated Firestore document size was approximately ${kb}KB (${pctOfLimit}% of the 1MiB doc limit).

YOUR JOB:
Get all the data below back into a working app, with zero data loss and zero silent reinterpretation of any field, while preserving the design rules below exactly.

ALSO ATTACH: this app's current index.html source code. This bundle contains DATA and RULES, not the code. The person should either paste in the live GitHub Pages repo source, or use the file downloaded via the app's "Download app source (.html)" button (generated alongside this bundle) as a fallback — note that fallback is a snapshot of the rendered page, not the original repo file, so the repo source is preferable if available.

DESIGN RULES THIS APP DEPENDS ON — PRESERVE THESE EXACTLY, REGARDLESS OF HOW YOU RESTRUCTURE STORAGE OR CODE:
- Hypo corrections (hypo_correction = true) are real meals for macro/micronutrient purposes, but must stay EXCLUDED from every calorie-vs-target calculation. They are a treatment for a low blood-sugar episode (Gabi is Type 1 diabetic), not part of intended intake. Don't double-count or "fix" this by removing them from totals entirely — they should still show up in nutrition data, just not count toward the calorie target.
- "Full day" status is per person, per date, and a day only counts toward deficit/streak math once explicitly marked complete by that person. Never imply a deficit from a partial/incomplete day, even if the logged total looks low — low usually means under-logged, not under-eaten.
- ONE goal drives the daily calorie target: a target weight (goalTargetWeight) plus a timeframe (goalTimeframe: 3 months / 6 months / 1 year / a custom date). The implied weekly rate of change (target weight vs current weight, spread across the days until the resolved target date) is what feeds the calorie calc — there is no separate "motivational only" figure anymore.
- Calorie target chain: BMR (Mifflin-St Jeor) → TDEE (BMR × activity multiplier, OR BMR + average logged workout burn if ≥5 workouts were logged in the trailing 7 days — whichever applies) → daily deficit/surplus from (goalTargetWeight − current weight) spread over the days remaining until the resolved goal date, safety-clamped to a sane weekly rate (max ~1% bodyweight/wk or 1kg/wk for loss, 0.5kg/wk for gain) → daily target, clamped to a 1200 kcal floor. This automatic switch between activity-multiplier mode and logged-workout mode is INTENTIONALLY invisible to the user — no toggle, no on-screen label of which mode is active.
- Weight is locked to the weight log (the most recent dated entry per person) — it is never a freely-typed field. Logging a new weight is what's supposed to update the calorie targets, via an explicit "Calculate my intake" / "Save" action, not silently on every load.
- Entries are deduped/merged by (record type, date, person, name/type, logged time) when restoring or syncing — if you change this signature scheme, make sure two phones logging independently still merge into a complete set rather than overwriting each other; this app's owners are aware that two genuinely simultaneous submissions from both phones at once is the one edge case not fully hardened against, and have accepted that tradeoff.

────────────────────── FULL DATA DUMP (JSON, complete fidelity — every field, not the rounded/lossy CSV) ──────────────────────

${JSON.stringify({ mission: S.mission, weightLog: S.weightLog||[], entries: S.entries }, null, 2)}
`;
}

function exportMigrationBundle() {
  if (!S.entries.length && !(S.weightLog||[]).length) { showToast('Nothing to migrate yet'); return; }
  const blob = new Blob([buildMigrationBundle()],{type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'la-salud-migration-' + todayStr() + '.txt';
  a.click();
  showToast('Migration bundle downloaded');
}

function copyMigrationBundle() {
  if (!S.entries.length && !(S.weightLog||[]).length) { showToast('Nothing to migrate yet'); return; }
  navigator.clipboard.writeText(buildMigrationBundle());
  showToast('Migration bundle copied');
}

// Snapshot of the live rendered page as a fallback source file, for handing
// to an AI alongside the migration bundle above if the actual GitHub Pages
// repo source isn't handy. Not byte-identical to the original authored
// file (it reflects current DOM/input state), but functionally complete.
function downloadAppSource() {
  const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  const blob = new Blob([html],{type:'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'la-salud-source-' + todayStr() + '.html';
  a.click();
  showToast('Source downloaded');
}

// ── AI-ASSIST BUNDLE ──────────────────────────────────────────────────────
// Always copyable — even with zero entries. The context block IS the value:
// who we are, what our targets are, the rules. Data is appended if it exists
// but the bundle is useful from day one without any logged meals at all.
// Framed as a conversation opener, not a data-review instruction set, so the
// AI naturally asks what help is needed rather than just summarising a CSV.
function buildAIAssistBundle(closingInstruction) {
  const g = S.mission.gabi, n = S.mission.nacho;
  // Single-goal schema (Phase 0): describes target weight + resolved date
  // instead of the old signed 3-month delta.
  const fmtGoal = m => {
    const diff = (m.goalTargetWeight != null ? m.goalTargetWeight : m.weight) - m.weight;
    const verb = diff === 0 ? 'maintain weight' : (diff > 0 ? `gain ${diff.toFixed(1)}kg` : `lose ${Math.abs(diff).toFixed(1)}kg`);
    return `${verb} by ${resolveGoalTargetDate(m)}`;
  };
  const hasEntries   = (S.entries||[]).length > 0;
  const hasWeightLog = (S.weightLog||[]).length > 0;

  // Weight history summary — last 3 entries per person, most recent first
  function weightSummary(person) {
    const logs = (S.weightLog||[]).filter(w=>w.person===person)
      .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
    if (!logs.length) return 'not logged yet';
    return logs.map(w=>`${w.kg}kg on ${w.date}`).join(', ');
  }

  // Quick data snapshot — complete-days-only calorie average for each person
  // (lifetime, not scoped to a week — a different metric than Vitals/
  // Progress's weekly figure, so this doesn't call getFoodCalorieAdherence,
  // but it shares the same principle: each day's own stamped target, never
  // today's live value applied retroactively across the whole history).
  function kcalSummary(person) {
    const completeDays = [...new Set(
      (S.entries||[]).filter(e=>e.person===person&&e.record_type==='meal'&&e.full_day).map(e=>e.date)
    )];
    if (!completeDays.length) return 'no complete days logged yet';
    const liveTarget = S.mission[person].kcal || 0;
    let kcalAcc = 0, targetAcc = 0;
    completeDays.forEach(d => {
      const dm = (S.entries||[]).filter(e=>e.person===person&&e.date===d&&e.record_type==='meal');
      kcalAcc += dm.filter(e=>!e.hypo_correction).reduce((a,b)=>a+(b.calories||0),0);
      const snap = dm.find(e=>e.day_kcal_target > 0);
      targetAcc += (snap && snap.day_kcal_target) || liveTarget;
    });
    const avg = Math.round(kcalAcc / completeDays.length);
    const target = Math.round(targetAcc / completeDays.length);
    const delta = avg - target;
    return `avg ${avg} kcal/day over ${completeDays.length} complete day${completeDays.length!==1?'s':''} (target ${target}, ${delta>=0?'+':''}${delta} vs target)`;
  }

  const person = S.currentPerson;
  const personName = person === 'gabi' ? 'Gabi' : 'Nacho';
  const isSolo = typeof aiAssistMode !== 'undefined' && aiAssistMode === 'solo';
  const hasPersonEntries = isSolo
    ? (S.entries||[]).filter(e => e.person === person).length > 0
    : hasEntries;
  const dataSection = hasPersonEntries
    ? `\n\nFULL DATA (CSV — every logged meal, workout, and weight entry):\n${isSolo ? buildPersonCSV(person) : buildFullCSV()}`
    : `\n\n(No meals or workouts have been logged yet — this is the start of the journey, or the app has just been set up.)`;

  const couplePrompt = `Hi. You are a nutritionist professional as well as personal trainer helping couples achieve their physical goals. I'm going to give you full context about me and my partner so you can help us with our health and nutrition. We're a couple based in Valencia, Spain. We track what we eat and how we move using an app called La Salud — I'm pasting everything it knows about us below so you're fully up to speed. Then I'll tell you what I need help with.

WHO WE ARE:
- Gabi: female, Type 1 diabetic, ${g.age||'?'} years old, ${g.height||'?'}cm, current weight: ${weightSummary('gabi')}
- Nacho: male, ${n.age||'?'} years old, ${n.height||'?'}cm, current weight: ${weightSummary('nacho')}

OUR GOALS (this drives our daily calorie targets):
- Gabi: ${fmtGoal(g)}
- Nacho: ${fmtGoal(n)}

OUR DAILY CALORIE & MACRO TARGETS:
- Gabi: ${g.kcal||'?'} kcal | Protein ${g.protein||'?'}g | Carbs ${g.carbs||'?'}g | Fat ${g.fat||'?'}g | Magnesium 375mg | VitD 15mcg | Iron 18mg | Calcium 1000mg | Zinc 10mg | B12 2.4mcg | Omega3 1.6g | Potassium 3500mg | VitC 80mg | Folate 400mcg
- Nacho: ${n.kcal||'?'} kcal | Protein ${n.protein||'?'}g | Carbs ${n.carbs||'?'}g | Fat ${n.fat||'?'}g | Magnesium 375mg | VitD 15mcg | Iron 8mg | Calcium 1000mg | Zinc 10mg | B12 2.4mcg | Omega3 1.6g | Potassium 3500mg | VitC 80mg | Folate 400mcg

HOW WE'RE TRACKING (recent summary from logged data):
- Gabi: ${kcalSummary('gabi')}
- Nacho: ${kcalSummary('nacho')}

THINGS TO KNOW ABOUT US:
- Gabi has Type 1 diabetes. She tracks net carbs. Any hypo corrections (fast sugar + slow carb taken for a low blood-sugar episode) are logged in the data as Hypo_correction=Y — these are medical, not food choices, and are excluded from her calorie targets. Do not treat them as overeating.
- We shop mostly at Mercadona, specifically in Malvarrosa. When suggesting specific foods or a meal plan, keep that in mind.
- We have coffee with milk in the morning. Nacho adds honey to his coffee.
- If the data below is incomplete for a given day, that means we didn't log everything — not that we didn't eat. Never assume a low-calorie day means a deficit; it means partial logging. Only draw conclusions from days where Full_day_logged=Y. If a day is ticked as fully logged assume it is.
- Nacho's priority is protecting muscle while losing fat gradually. Gabi's goal is to lose weight. (She feels ashamed of her body, and you can notice her belly gorwing overtime, not shrinking. Don't mention her appearance in your answer though. She should never go below 1200 kcal net.
- We're open to conversations about anything: what to eat this week, how to improve our system, weekly meal plans, what to buy, how to optimise macros — whatever is most useful, what you can see about our full nutrition, workout patterns.

${closingInstruction || `Once you've read this, check in with us: briefly say what you can see in the data (or acknowledge it's early days if there isn't much), then ask what we'd like help with today.`}${dataSection}`;

  if (!isSolo) return couplePrompt;

  const mp = S.mission[person] || {};
  const isGabi = person === 'gabi';
  const diabetesNote = isGabi
    ? 'I have Type 1 diabetes. I track net carbs carefully. Any hypo corrections logged (Hypo_correction=Y) are medical treatments for low blood-sugar episodes — not food choices — and are excluded from my calorie target.'
    : '';
  const coffeeNote = isGabi ? 'I have coffee with milk in the morning.' : 'I have coffee with milk and honey in the morning.';
  const goalNote = isGabi ? 'My goal is to lose weight. I should never go below 1200 kcal net.' : 'My priority is protecting muscle while losing fat gradually.';
  const soloClosing = closingInstruction
    ? closingInstruction.replace(/\bwe\b/gi, 'I').replace(/\bour\b/gi, 'my').replace(/\bus\b/gi, 'me')
    : `Once you've read this, briefly say what you can see in the data (or acknowledge it's early days if there isn't much), then ask what I'd like help with today.`;

  return `Hi. You are a nutritionist and personal trainer. I'm going to give you full context about myself so you can help me with my health and nutrition. I'm based in Valencia, Spain. I track what I eat and how I move using an app called La Salud — I'm pasting everything it knows about me below. Then I'll tell you what I need help with.

WHO I AM:
- ${personName}: ${isGabi ? 'female, Type 1 diabetic' : 'male'}, ${mp.age||'?'} years old, ${mp.height||'?'}cm, current weight: ${weightSummary(person)}

MY GOAL:
- ${fmtGoal(mp)}

MY DAILY CALORIE & MACRO TARGETS:
- ${mp.kcal||'?'} kcal | Protein ${mp.protein||'?'}g | Carbs ${mp.carbs||'?'}g | Fat ${mp.fat||'?'}g | Magnesium 375mg | VitD 15mcg | Iron ${isGabi ? '18' : '8'}mg | Calcium 1000mg | Zinc 10mg | B12 2.4mcg | Omega3 1.6g | Potassium 3500mg | VitC 80mg | Folate 400mcg

HOW I'M TRACKING:
- ${kcalSummary(person)}

THINGS TO KNOW ABOUT ME:
${diabetesNote ? `- ${diabetesNote}` + `
` : ''}- I shop mostly at Mercadona, specifically in Malvarrosa.
- ${coffeeNote}
- If data is incomplete for a given day, that means I didn't log everything — not that I didn't eat. Only draw conclusions from days where Full_day_logged=Y.
- ${goalNote}

${soloClosing}${dataSection}`;
}

function copyAIAssistBundle() {
  navigator.clipboard.writeText(buildAIAssistBundle());
  showToast('Copied — paste into Claude or ChatGPT');
}

// ── NATIVE AI ASSIST (one-shot comprehensive advice) ───────────────────────
const AI_ASSIST_ONESHOT_INSTRUCTION = `Give us one comprehensive check-in now — don't ask a question first. Cover: what you notice in the data (macros + micronutrients), what to eat more of and less of, workout deficiencies, and what to prioritise next. Be direct and specific (e.g. "eat more fish, less X"), a few short paragraphs, no follow-up question at the end. Formatting: use # or ## for section titles and plain paragraphs or - bullets for content. Never use markdown tables or pipe characters (|), and never use lines made of dashes like "---" or "---|---".`;

let lastAIAssistExchange = null; // { prompt, reply } — for "continue elsewhere"

async function runAIAssist() {
  const btn = document.getElementById('ai-assist-btn');
  const out = document.getElementById('ai-assist-result');
  if (!hasAnyAIKey()) {
    out.style.display = '';
    out.innerHTML = `<div class="trend-card"><div style="font-size:13px;color:var(--sand)">No AI API key yet — add a Groq, Cerebras, or Gemini key in <span style="color:var(--ochre);cursor:pointer;text-decoration:underline" onclick="openSettings()">Settings</span>, or use "copy the full prompt" below instead.</div></div>`;
    return;
  }
  setBtnThinking(btn, true, 'Thinking…');
  try {
    const focusText = (document.getElementById('ai-assist-focus').value || '').trim();
    const instruction = focusText
      ? `The user has a specific focus for this session: "${focusText}". Address that directly and specifically, using the data above. Still give context where it helps, but lead with what they asked.`
      : AI_ASSIST_ONESHOT_INSTRUCTION;
    const prompt = buildAIAssistBundle(instruction);
    const reply = await askGemini(prompt);
    lastAIAssistExchange = { prompt, reply };
    out.style.display = '';
    out.innerHTML = `<div class="trend-card"><div class="trend-card-title">AI check-in</div><div style="font-size:13px;color:var(--sand);line-height:1.6">${renderMarkdown(reply)}</div></div>
    <button class="btn btn-secondary" style="margin-top:4px" onclick="copyAIAssistContinue()">Copy to continue this conversation elsewhere</button>`;
  } catch(e) {
    out.style.display = '';
    out.innerHTML = `<div class="trend-card"><div style="font-size:13px;color:var(--terra)">${e.message || 'Could not reach Gemini.'}</div></div>`;
  } finally {
    setBtnThinking(btn, false, 'Get AI advice');
  }
}
function copyAIAssistContinue() {
  if (!lastAIAssistExchange) return;
  const { prompt, reply } = lastAIAssistExchange;
  const bundle = `${prompt}\n\n---\n\nThe AI replied:\n\n${reply}\n\n---\n\nPlease continue this conversation from here.`;
  navigator.clipboard.writeText(bundle);
  showToast('Copied — paste into Claude or ChatGPT to continue');
}

// ── CSV RESTORE / MERGE (dedupes against what's already stored) ──────────
function parseCSVLine(line) {
  const out = []; let cur=''; let inQ=false;
  for (let i=0;i<line.length;i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i+1] === '"') { cur+='"'; i++; } else inQ=false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur=''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function entrySignature(type, date, person, name, time) {
  return [type,date,person,name,time].join('|');
}

function restoreFromCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.trim().split('\n');
    if (lines.length < 2) { showToast('Empty file'); return; }
    const existing = new Set(S.entries.map(en => entrySignature(
      en.record_type==='workout'?'WORKOUT':'MEAL', en.date, en.person,
      en.record_type==='workout'?en.workout_type:en.meal, en.logged_at
    )));
    // Signature -> live entry object, for WORKOUT rows only. Lets a re-import
    // *repair* an already-restored entry in place (e.g. fill in steps_logged
    // that a previous restore missed) instead of being skipped as a dupe or
    // pushed again as a second copy.
    const workoutBySig = new Map();
    S.entries.forEach(en => {
      if (en.record_type === 'workout') {
        workoutBySig.set(entrySignature('WORKOUT', en.date, en.person, en.workout_type, en.logged_at), en);
      }
    });
    // Weight log also restores from CSV, deduped by (person, date) — same
    // key the app already uses for "one weight entry per person per day".
    // Conservative: skips a row if that person/date is already present
    // locally rather than risk overwriting something newer.
    const existingWeightDates = new Set((S.weightLog||[]).map(w => w.person+'|'+w.date));
    let added = 0, weightAdded = 0, fixed = 0;
    for (let i=1;i<lines.length;i++) {
      if (!lines[i].trim()) continue;
      const c = parseCSVLine(lines[i]);
      let [rtype,date,person,name,time,category,calories,protein_g,carbs_g,netcarbs_g,fat_g,fibre_g,magnesium_mg,vitd_mcg,iron_mg,calcium_mg,zinc_mg,b12_mcg,omega3_g,potassium_mg,vitc_mg,folate_mcg,duration_min,intensity,calories_burned,steps_logged,notes,full_day_logged,hypo_correction,day_total_kcal,day_kcal_target,day_deficit,weight_kg,water_ml] = c;
      // Normalise person casing — CSV exports/edits can carry "Nacho",
      // "NACHO", trailing spaces, etc. Every comparison elsewhere in the
      // app (entriesFor, groupEntriesByPersonDate, the scorer) expects
      // exact-match lowercase 'gabi'/'nacho', so a casing mismatch here
      // silently drops the entry from every pillar — that's what was
      // producing a 0 score even with real data imported.
      person = (person || '').toString().trim().toLowerCase();
      if (person !== 'gabi' && person !== 'nacho') continue;
      if (rtype === 'WEIGHT') {
        const wKey = person + '|' + date;
        if (existingWeightDates.has(wKey)) continue;
        const kg = parseFloat(weight_kg);
        if (!kg) continue;
        existingWeightDates.add(wKey);
        S.weightLog.push({ id: Date.now()+Math.random(), person, date, kg });
        weightAdded++;
        continue;
      }
      const sig = entrySignature(rtype, date, person, name, time);
      if (rtype === 'WORKOUT') {
        // Prefer the CSV's own Steps_logged column; if it's blank/0 (this is
        // what earlier restores left behind for every Walking row, since the
        // step count actually lives in the Notes text, e.g. "10000 steps"),
        // fall back to parsing it out of Notes via estimateWalkingSteps —
        // the same helper log.js uses for AI-parsed Walking entries.
        let steps = parseFloat(steps_logged) || 0;
        let cleanNotes = notes;
        let isBareStepsNote = false;
        if (!steps && name === 'Walking') {
          const bareNum = (notes || '').trim().match(/^[\d,]+$/); // e.g. notes:"15159" with no "steps" suffix
          if (bareNum) {
            steps = parseInt(bareNum[0].replace(/,/g,'')) || 0;
            cleanNotes = ''; // that number was the step count, not a real note — don't duplicate it into notes
            isBareStepsNote = true;
          } else {
            steps = estimateWalkingSteps(notes, parseFloat(duration_min) || 0);
          }
        }
        const already = workoutBySig.get(sig);
        if (already) {
          // Row already exists locally — repair it in place rather than
          // skip it (old behaviour) or push a duplicate.
          if (!already.steps_logged && steps) { already.steps_logged = steps; fixed++; }
          if (!already.notes && cleanNotes) already.notes = cleanNotes;
          // A note that's just the bare step-count number is the exact
          // broken state this fix targets — clear it even if it was already
          // sitting there from a prior bad restore, so it doesn't show up
          // twice (once as steps, once as a stray "note").
          if (isBareStepsNote && already.notes && /^[\d,]+$/.test(already.notes.trim())) already.notes = '';
          continue;
        }
        if (existing.has(sig)) continue; // belt-and-braces; shouldn't hit given workoutBySig above
        existing.add(sig);
        S.entries.push({ id:Date.now()+Math.random(), record_type:'workout', person, date, workout_type:name, logged_at:time, duration_min:parseFloat(duration_min)||0, intensity, calories_burned:parseFloat(calories_burned)||0, steps_logged:steps, notes:cleanNotes });
        added++;
        continue;
      }
      if (existing.has(sig)) continue;
      existing.add(sig);
      if (rtype === 'WATER') {
        S.entries.push({ id:Date.now()+Math.random(), record_type:'water', person, date, ml:parseFloat(water_ml)||parseFloat(duration_min)||0, logged_at:time });
      } else if (rtype === 'MEAL') {
        S.entries.push({ id:Date.now()+Math.random(), record_type:'meal', person, date, meal:name, meal_type:category, logged_at:time,
          calories:parseFloat(calories)||0, protein_g:parseFloat(protein_g)||0, carbs_g:parseFloat(carbs_g)||0, netcarbs_g:parseFloat(netcarbs_g)||0,
          fat_g:parseFloat(fat_g)||0, fibre_g:parseFloat(fibre_g)||0, magnesium_mg:parseFloat(magnesium_mg)||0, vitd_mcg:parseFloat(vitd_mcg)||0,
          iron_mg:parseFloat(iron_mg)||0, calcium_mg:parseFloat(calcium_mg)||0, zinc_mg:parseFloat(zinc_mg)||0, b12_mcg:parseFloat(b12_mcg)||0,
          omega3_g:parseFloat(omega3_g)||0, potassium_mg:parseFloat(potassium_mg)||0, vitc_mg:parseFloat(vitc_mg)||0, folate_mcg:parseFloat(folate_mcg)||0,
          full_day: full_day_logged === 'Y', hypo_correction: hypo_correction === 'Y',
          day_kcal_target: parseFloat(day_kcal_target) || 0 });
      }
      added++;
    }
    save();
    renderVitals();
    renderLogTab();
    syncFullDayCheckbox();
    renderWeightHistories();
    loadMissionFields();
    renderProgress(); // weight/food/activity trend chart — previously missing, so an imported weight log wouldn't show on the chart until you navigated away from Progress and back
    const parts = [];
    if (added) parts.push(`${added} entr${added!==1?'ies':'y'}`);
    if (weightAdded) parts.push(`${weightAdded} weight entr${weightAdded!==1?'ies':'y'}`);
    if (fixed) parts.push(`${fixed} step count${fixed!==1?'s':''} fixed`);
    showToast(parts.length ? `Restored ${parts.join(' + ')}` : 'Already up to date');
  };
  reader.readAsText(file);
  event.target.value = '';
}

function clearHistory() {
  if (!_requireOnlineForDelete()) return;
  if (confirm('Clear all history? This cannot be undone.')) {
    // Capture IDs before clearing, so we can delete them from Firebase.
    const entryIds   = S.entries.map(e => String(e.id));
    const weightIds  = (S.weightLog||[]).map(w => String(w.id));

    S.entries   = [];
    S.weightLog = [];

    if (S.usingSubcollections && window.__firebaseSync) {
      // Use deleteDoc synchronously from the already-loaded Firebase module.
      const { db, collection, doc, deleteDoc } = window.__firebaseSync;
      entryIds.forEach(id =>
        deleteDoc(doc(collection(db,'la-salud','sharedData','entries'), id))
          .catch(err => console.error('[sync] clearHistory entry delete failed', id, err))
      );
      weightIds.forEach(id =>
        deleteDoc(doc(collection(db,'la-salud','sharedData','weightLog'), id))
          .catch(err => console.error('[sync] clearHistory weight delete failed', id, err))
      );
      // Persist local state (no entries/weightLog) and push parent-doc fields only.
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_stateForStorage())); } catch(e) {}
      pushToCloud();
    } else {
      // This is a genuine, user-confirmed (see the confirm() above) wipe to
      // zero — the one case where collapsing entries/weightLog to nothing is
      // correct. Flag it so pushToCloud()'s circuit breaker lets it through;
      // the flag is one-shot and consumed the instant pushToCloud() reads it,
      // so it can never accidentally cover a later, unrelated push.
      _intentionalWipe = true;
      save();
    }

    renderVitals();
    renderLogTab();
    renderWeightHistories();
    showToast('History cleared');
  }
}

// ── MISSION ────────────────────────────────────────────────────────────────
// Activity multipliers anchored to daily step counts:
//   light        = ~5,000 steps/day  (desk job, minimal walking)
//   moderate     = ~10,000 steps/day (daily walking — our normal baseline)
//   active       = ~15,000 steps/day (regular exercise + lots of walking)
//   very_intense = ~20,000+ steps or hard daily training
const ACTIVITY_MULTIPLIERS = {
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_intense: 1.9
};
const KCAL_PER_KG_FAT = 7700;
const GOAL_PERIOD_DAYS = 90; // legacy constant, unused after the single-goal
                              // schema landed (Phase 0) — kept only in case
                              // any old export/import code still refers to it.
// MANUAL_OVERRIDE_DAYS removed — the activity toggle no longer gets a
// timed full-veto over the workout-data blend (see markActivityOverride /
// calculateDailyTargetFrom).

// ── SINGLE GOAL SCHEMA (Phase 0) ────────────────────────────────────────────
// Days between two ISO date strings (YYYY-MM-DD), b - a, using local-midnight
// parsing so DST shifts don't introduce off-by-one errors.
function daysBetween(aStr, bStr) {
  const a = new Date(aStr + 'T00:00:00');
  const b = new Date(bStr + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// Resolves a mission's goal timeframe + goalSetDate into a concrete target
// date. '3m'/'6m'/'1y' always count from goalSetDate (when the goal was last
// saved), not from "now" — so the countdown doesn't silently drift every time
// the app is opened. 'custom' just returns the user-picked date as-is.
function resolveGoalTargetDate(m) {
  if (m.goalTimeframe === 'custom') return m.goalTargetDate;
  const days = { '3m':90, '6m':180, '1y':365 }[m.goalTimeframe] || 90;
  const start = m.goalSetDate ? new Date(m.goalSetDate + 'T00:00:00') : new Date();
  const d = new Date(start); d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

// ── ADAPTIVE ENGINE (Phase 2, updated — "verified days over full lookback") ─
// Replaces old 2.6/2.7. Trend confidence is driven by how many days in the
// full 90-day lookback (ending today) are marked fully-logged (full_day on
// meal entries) — not raw calendar span, not raw point-count alone, and (as
// of this revision) NOT bounded to the narrower first↔last-weigh-in bracket
// the original Phase 2 version used. A day counts the moment it's marked
// full_day, based on its own date — whether you tick it live or weeks later
// retroactively via History, and whether or not it happens to fall between
// two weigh-ins. The weigh-in bracket is still used for the trend
// regression itself (computeTrendConfidence, below), just no longer for
// what counts as verified.
//
// FLAGGED FOR REVIEW: the confidence→cadence tiers and the correction
// formula below are a first-pass implementation of what the trail doc left
// as "still to design." Nothing here was explicitly signed off number-by-
// number the way the clamp %s in Phase 3.3 were — treat the cadence
// thresholds (0.8/0.5/0.2) and the error→kcal conversion as reasonable
// defaults that should be watched against real data, not settled facts.

const ADAPTIVE_LOOKBACK_DAYS = 90; // matches the 90-day regression window already agreed for Phase 2.6's superseded EMA discussion — sparse monthly weigh-ins still fit inside this.

// Simple least-squares linear regression over {x: day-index, y: kg} points.
// Returns slope in kg/day. Given only 2 points this is just the two-point
// average rate — degrades gracefully with sparse data (2.6's original point:
// the regression itself absorbs the smoothing role, no separate EMA needed).
function linearRegressionSlope(points) {
  const n = points.length;
  const sumX = points.reduce((a,p)=>a+p.x,0);
  const sumY = points.reduce((a,p)=>a+p.y,0);
  const sumXY = points.reduce((a,p)=>a+p.x*p.y,0);
  const sumXX = points.reduce((a,p)=>a+p.x*p.x,0);
  const denom = n*sumXX - sumX*sumX;
  if (denom === 0) return 0; // all points on the same day — no slope to compute
  return (n*sumXY - sumX*sumY) / denom;
}

// Returns { confidence (0–1), verifiedDays, totalSpanDays, weighInCount,
// weightTrendKgPerWeek (signed: negative = losing), windowStart, windowEnd }.
// weightTrendKgPerWeek is null when there's fewer than 2 weigh-ins in the
// lookback (point-count floor — can't regress a trend off 1 point, logged or
// not, no matter how confident the logging is).
//
// verifiedDays/totalSpanDays are now computed over the full ADAPTIVE_LOOKBACK_DAYS
// window ending TODAY — not bounded to [windowStart, windowEnd] (the first↔last
// weigh-in bracket) like the original Phase 2 version. A day counts based on
// its own date the moment it's marked full_day, regardless of when you happen
// to tick it (today, next week, whenever) and regardless of whether it falls
// inside or outside your weigh-in bracket. windowStart/windowEnd are still
// returned and still used to scope the trend REGRESSION below (the slope
// calculation genuinely needs two weigh-ins to bracket), but they no longer
// gate what counts as "verified."
function computeTrendConfidence(person) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ADAPTIVE_LOOKBACK_DAYS);
  const cutoffStr = toLocalDateStr(cutoff);
  const points = (S.weightLog||[])
    .filter(w => w.person === person && w.date >= cutoffStr)
    .sort((a,b) => a.date.localeCompare(b.date));

  if (points.length < 2) {
    return { confidence: 0, verifiedDays: 0, totalSpanDays: 0, weighInCount: points.length,
             weightTrendKgPerWeek: null, windowStart: null, windowEnd: null };
  }

  const windowStart = points[0].date;
  const windowEnd = points[points.length-1].date;

  // Verified days: dates in the full lookback (cutoff..today) with a
  // fully-logged meal entry for this person (full_day flag — same flag
  // Progress/Potates Score already use for logging-quality).
  const spanEnd = todayStr();
  const totalSpanDays = Math.max(1, daysBetween(cutoffStr, spanEnd) + 1);
  const verifiedDates = new Set(
    (S.entries||[]).filter(e => e.person === person && e.record_type === 'meal' && e.full_day
                              && e.date >= cutoffStr && e.date <= spanEnd)
      .map(e => e.date)
  );
  const verifiedDays = verifiedDates.size;
  const confidence = Math.max(0, Math.min(1, verifiedDays / totalSpanDays));

  // Regression: x = day-index from windowStart, y = kg. Still bracketed by
  // the weigh-ins themselves — the slope can only be drawn between actual
  // data points.
  const regPoints = points.map(p => ({ x: daysBetween(windowStart, p.date), y: p.kg }));
  const slopePerDay = linearRegressionSlope(regPoints);
  const weightTrendKgPerWeek = slopePerDay * 7;

  return { confidence, verifiedDays, totalSpanDays, weighInCount: points.length,
           weightTrendKgPerWeek, windowStart, windowEnd };
}

// Confidence → recalculation cadence (days between adjustments). Higher
// confidence means the target reacts to observed trend more often — NOT
// bigger single-step jumps. Correction magnitude (below) stays capped at
// ±100 kcal/day regardless of confidence, per the confirmed Option A
// decision — only the cadence changes.
function getRecalcCadenceDays(confidence) {
  if (confidence >= 0.8) return 1;
  if (confidence >= 0.5) return 3;
  if (confidence >= 0.2) return 7;
  return 21;
}

// Runs at most once per cadence window per person. Compares the ACTUAL
// observed weight trend (from regression) against the goal's INTENDED rate
// (from calculateDailyTargetFrom's clamp-aware appliedRateKgWeek) and nudges
// m.kcal toward closing that gap, capped at ±100 kcal/day per call — never a
// bigger single jump, no matter how large the gap or how high the
// confidence (Option A, reconfirmed — keep the daily cap even as the primary
// driver of the target; it just means convergence takes a few days instead
// of jumping straight to the trend-implied number).
// Recomposition goals now flow through the same appliedRateKgWeek/isLoss
// path as every other goal type (calculateDailyTargetFrom no longer
// special-cases them) — a recomposition user holding weight steady simply
// has an appliedRateKgWeek near 0, which the general path already handles.
//
// opts.force (default false): bypasses the cadence gate below. The
// automatic once-per-load call (see the bottom of load()) leaves this off,
// so background recalcs stay throttled to the confidence-based cadence.
// calculateMyIntake() passes force:true, since an explicit button press is
// an explicit request to reflect whatever data exists right now — cadence
// throttling exists to avoid the number silently drifting between visits,
// not to make the user wait when they've asked for a fresh calculation.
// The ±100kcal/day nudge cap is untouched either way.
function maybeRunAdaptiveRecalc(person, opts) {
  const force = !!(opts && opts.force);
  const m = S.mission[person];
  if (!m) return;

  const conf = computeTrendConfidence(person);
  m.adaptiveConfidence = conf.confidence; // surfaced in the UI regardless of whether a recalc actually fires this call
  if (conf.weightTrendKgPerWeek == null) return; // fewer than 2 weigh-ins — floor, nothing to compare against

  const cadenceDays = getRecalcCadenceDays(conf.confidence);
  const daysSinceLast = m.lastAdaptiveRecalcDate ? daysBetween(m.lastAdaptiveRecalcDate, todayStr()) : Infinity;
  if (!force && daysSinceLast < cadenceDays) return; // not due yet

  const calc = calculateDailyTargetFrom(m, person);
  if (calc.appliedRateKgWeek == null) return; // shouldn't happen now, guarding anyway
  const intendedRateKgWeek = calc.isLoss ? -calc.appliedRateKgWeek : calc.appliedRateKgWeek;

  const actualRateKgWeek = conf.weightTrendKgPerWeek;
  // error > 0 means actual is running "ahead" in the loss direction (losing
  // faster than intended, or gaining slower than intended) → add calories.
  // error < 0 means actual is behind intended → cut calories further.
  const error = intendedRateKgWeek - actualRateKgWeek;
  const rawNudge = error * KCAL_PER_KG_FAT / 7;
  const nudge = Math.round(Math.max(-100, Math.min(100, rawNudge)));

  m.kcal = Math.max(1200, (m.kcal || calc.target) + nudge);
  m.lastAdaptiveRecalcDate = todayStr();
  m.lastAdaptiveNudge = nudge; // surfaced in UI so it's clear the number moved and why
}


// Replaces the old Phase 3.1 hard-wall clamp. Two tiers per direction:
// a RECOMMENDED default rate (what's auto-applied with no user input) and a
// MAX rate a user can push to by explicitly overriding the kg/wk figure on
// the results screen (settings.js), gated by a disclaimer modal. Both tiers
// are now flat bodyweight percentages — the old min(1%,1kg) absolute-kg
// ceiling on loss is gone. Gain has a beginner exception (gymExperience);
// loss numbers are identical across all experience levels. Recomposition
// goals now call this too, same as every other goal type — a recomposition
// user with target weight == current weight just gets weightDiff 0, which
// resolves to a 0 kg/wk rate and a 0 deficit (maintenance) automatically.
function getClampBounds(isLoss, gymExperience) {
  if (isLoss) return { recommendedPct: 1.0, maxPct: 1.5 };
  const isBeginner = gymExperience === 'beginner';
  return isBeginner ? { recommendedPct: 0.5, maxPct: 0.75 }
                     : { recommendedPct: 0.25, maxPct: 0.5 };
}

// overrideRateKgWeek: optional — the user-set kg/wk value from the results
// screen's editable box (Phase 5.4). When present, it takes precedence over
// the goal-implied rate, but is still hard-capped at maxRateKgWeek for their
// direction/experience combo (the disclaimer modal is what's responsible for
// only letting a value through when the user has confirmed it — this
// function just enforces the ceiling regardless).
function safetyClampDeficit(weightDiff, daysRemaining, currentWeight, gymExperience, overrideRateKgWeek) {
  const isLoss = weightDiff < 0;
  const { recommendedPct, maxPct } = getClampBounds(isLoss, gymExperience);
  const recommendedRateKgWeek = currentWeight * recommendedPct / 100;
  const maxRateKgWeek = currentWeight * maxPct / 100;
  const requestedRateKgWeek = Math.abs(weightDiff) * 7 / daysRemaining;

  const hasOverride = overrideRateKgWeek != null && !isNaN(overrideRateKgWeek) && overrideRateKgWeek > 0;
  let safeRateKgWeek, clamped;
  if (hasOverride) {
    // User explicitly set a rate (already past the disclaimer, per 5.4's
    // UI flow) — honor it, but never past the hard max for this combo.
    safeRateKgWeek = Math.min(overrideRateKgWeek, maxRateKgWeek);
    clamped = overrideRateKgWeek > maxRateKgWeek;
  } else {
    // No override — auto-apply, capped at the recommended default.
    safeRateKgWeek = Math.min(requestedRateKgWeek, recommendedRateKgWeek);
    clamped = requestedRateKgWeek > recommendedRateKgWeek;
  }

  const dailyDeficit = (isLoss ? -1 : 1) * safeRateKgWeek * KCAL_PER_KG_FAT / 7;
  const safeDaysNeeded = clamped ? Math.ceil(Math.abs(weightDiff) * 7 / safeRateKgWeek) : daysRemaining;
  return { deficit: dailyDeficit, clamped, safeRateKgWeek, safeDaysNeeded,
           recommendedRateKgWeek, maxRateKgWeek, usedOverride: hasOverride };
}

// BMR via Mifflin-St Jeor — the most validated general-population formula,
// accurate within its known margin for most adults.
function calcBMR(m) {
  const base = 10 * (m.weight||0) + 6.25 * (m.height||0) - 5 * (m.age||0);
  return m.sex === 'female' ? base - 161 : base + 5;
}

// ── GOAL-DEPENDENT MACROS ────────────────────────────────────────────────
// Protein and fat targets are set per bodyweight/goal first (evidence-based
// ranges below), then carbs fill whatever's left of the calorie target.
// This is the standard order of operations in sports-nutrition coaching
// (protein → fat → carbs-as-remainder), not an even 3-way split.
//
// Protein (g/kg bodyweight/day):
//  - lose_fat:      2.2 g/kg — high end of ISSN's 1.6-2.2g/kg-BW range,
//                   to maximize lean-mass retention while in a deficit.
//  - recomposition: 2.4 g/kg — the most protein-demanding goal, since it
//                   asks the body to build muscle and lose fat at once.
//  - gain_muscle:   1.8 g/kg — plenty for MPS in a surplus; no need to
//                   push toward the top of the range when calories aren't
//                   restricted.
//
// Fat: % of total calories, with a hormonal-health floor of 0.6g/kg so
// it never gets crowded out at low calorie targets.
//  - lose_fat / recomposition: 25% of kcal (leaves more room for carbs,
//    which support training performance during a deficit).
//  - gain_muscle: 30% of kcal (surplus means carbs don't need to be
//    maximized for performance the same way).
//
// Carbs: remainder — (target_kcal - protein_kcal - fat_kcal) / 4,
// floored at 0 so a very low calorie target never produces a negative
// carb figure.
const PROTEIN_G_PER_KG_BY_GOAL = { lose_fat: 2.2, recomposition: 2.4, gain_muscle: 1.8 };
const FAT_PCT_OF_KCAL_BY_GOAL  = { lose_fat: 0.25, recomposition: 0.25, gain_muscle: 0.30 };
const MIN_FAT_G_PER_KG = 0.6;

function calculateMacrosFrom(m, targetKcal) {
  const goalType = m.goalType || 'lose_fat';
  const weight = m.weight || 0;

  const proteinPerKg = PROTEIN_G_PER_KG_BY_GOAL[goalType] ?? PROTEIN_G_PER_KG_BY_GOAL.lose_fat;
  const protein = Math.round(weight * proteinPerKg);
  const proteinKcal = protein * 4;

  const fatPct = FAT_PCT_OF_KCAL_BY_GOAL[goalType] ?? FAT_PCT_OF_KCAL_BY_GOAL.lose_fat;
  const minFat = Math.round(weight * MIN_FAT_G_PER_KG);
  const fat = Math.max(minFat, Math.round((targetKcal * fatPct) / 9));
  const fatKcal = fat * 9;

  const carbs = Math.max(0, Math.round((targetKcal - proteinKcal - fatKcal) / 4));

  return { protein, carbs, fat };
}

// ── ONE-TIME MIGRATION: repair historical macro target stamps ────────────
// Before the goal-dependent macro engine above existed, S.mission[p].protein/
// carbs/fat were static values disconnected from S.mission[p].kcal. Every
// day's first meal entry gets stamped once with whatever those numbers were
// at the time (commitEntries, in log.js) — so historical day_protein_target/
// day_carbs_target/day_fat_target values don't actually sum back to that
// same day's day_kcal_target (which was always correct). This is what
// surfaced on the Progress trend cards as kcal + protein both "Impeccable"
// while carbs and fat both read "High"/"Very high" for the same days.
//
// Re-derives protein/carbs/fat for every already-stamped day from:
//  - that day's own day_kcal_target (unchanged — only the macro split
//    underneath it was ever wrong)
//  - the weight closest to that day, from S.weightLog (falls back to
//    current weight if no log predates the entry)
//  - the CURRENT goalType — there's no historical goal-type log, so this
//    is the best available signal; an acceptable approximation since goal
//    type changes rarely
//
// Only touches entries that already carry a day_kcal_target stamp (the one
// entry per person/day commitEntries stamps) — everything else is
// untouched. Gated behind S.settings.macroTargetsRepaired so it runs
// exactly once and never re-touches entries stamped correctly afterward
// under a later goal-type change.
function weightNearDate(person, dateStr) {
  const logs = (S.weightLog||[]).filter(w => w.person === person).sort((a,b)=>a.date.localeCompare(b.date));
  if (!logs.length) return (S.mission[person] && S.mission[person].weight) || null;
  let best = null;
  for (const w of logs) {
    if (w.date <= dateStr) best = w; else break;
  }
  return best ? best.kg : logs[0].kg; // only future logs exist — nearest available
}

function migrateMacroTargetStamps() {
  let touched = 0;
  (S.entries||[]).forEach(e => {
    if (e.record_type !== 'meal') return;
    if (!(e.day_kcal_target > 0)) return; // only the one stamped entry per person/day
    const goalType = (S.mission[e.person] && S.mission[e.person].goalType) || 'lose_fat';
    const weight = weightNearDate(e.person, e.date);
    const macros = calculateMacrosFrom({ goalType, weight }, e.day_kcal_target);
    e.day_protein_target = macros.protein;
    e.day_carbs_target = macros.carbs;
    e.day_fat_target = macros.fat;
    touched++;
  });
  return touched;
}

// ── ROBUST WORKOUT ANALYSIS ────────────────────────────────────────────────
// Pitfalls addressed by this function:
//
// PITFALL 1 — Volume-dilution (identified by user):
//   Logging many short/easy sessions while manually selecting "High Activity"
//   drags the average calorie burn DOWN because 10× short walks don't
//   equal one real training session. Fix: we look at the DISTRIBUTION, not
//   just the sum. We compute a "significant session threshold" and only use
//   sessions that clear it for the burn estimate.
//
// PITFALL 2 — Rest-week crash:
//   An illness week or holiday with zero workouts would zero out the burn
//   estimate and suddenly crash the target. Fix: we use a 28-day window
//   and only replace the multiplier-based TDEE if enough sessions exist.
//
// PITFALL 3 — Logged data vs. manual toggle mismatch:
//   The manual activity level toggle says "High Activity" but logged data
//   says 1 walk per week. The blend below handles this: the toggle can only
//   ever contribute (1-w) of the final number, where w grows with
//   significantCount (loggedDataWeight) — it never gets to override logged
//   data outright just because it was recently touched.
//
// PITFALL 4 — Step-only days undercounting:
//   If all workouts are Walking/steps, the calorie burn per session is tiny
//   compared to a Cardio session — but the activity multiplier picked
//   manually might be "Active". Fix: we derive a step-based TDEE correction
//   separately and weight it into the picture.
//
// PITFALL 5 — Single outlier inflating the mean:
//   One 3-hour hike in 28 days shouldn't permanently inflate the number.
//   Fix: we cap individual session burns at 95th percentile of same-type
//   sessions to suppress outliers.
//
// PITFALL 6 — Sparse data giving false precision:
//   Fewer than 5 sessions = we don't trust the logged data at all and fall
//   back entirely to the manual multiplier. 5–14 = partial blend. 15+ =
//   logged data leads, multiplier acts as a sanity anchor.
//
// Returns: { avgDailyBurn, entryCount, significantCount, blendNote }
const WORKOUT_WINDOW_DAYS = 28;
const SIGNIFICANT_BURN_THRESHOLD = 60; // kcal — gates data-trust, not the burn average itself

function weeklyWorkoutStats(person) {
  const since = new Date();
  since.setDate(since.getDate() - (WORKOUT_WINDOW_DAYS - 1));
  const dates = [];
  for (let i=0;i<WORKOUT_WINDOW_DAYS;i++){ const d=new Date(since); d.setDate(d.getDate()+i); dates.push(toLocalDateStr(d)); }
  const workouts = entriesFor(person, dates, 'workout');

  if (!workouts.length) return { entryCount:0, significantCount:0, avgDailyBurn:0, blendNote:'no data' };

  const totalBurned = sum(workouts, 'calories_burned');
  const significantCount = workouts.filter(w => (w.calories_burned || 0) >= SIGNIFICANT_BURN_THRESHOLD).length;

  // Divide by 28 (not by session count) so rest days are naturally accounted for.
  const avgDailyBurn = totalBurned / WORKOUT_WINDOW_DAYS;

  return {
    entryCount: workouts.length,
    significantCount,
    avgDailyBurn,
    blendNote: `${workouts.length} sessions (${significantCount} significant) · ${Math.round(avgDailyBurn)} kcal/day avg`
  };
}

// How much to trust logged data vs. the manual activity multiplier.
// Gated on SIGNIFICANT sessions so many tiny walks don't fake out the trust level.
function loggedDataWeight(significantCount) {
  if (significantCount < 4)  return 0;    // not enough real data → use multiplier
  if (significantCount < 10) return 0.6;  // some data → blend, multiplier still leads
  if (significantCount < 20) return 0.75; // solid data → logged leads
  return 0.88;                             // strong data → logged dominates
}

// Called when the person edits the Activity level dropdown by hand.
// Previously set a 7-day full-veto timer (manualOverrideUntil /
// isManualOverrideActive) that gave the toggle 100% trust regardless of
// workout data. That's gone — the toggle now only wins outright via the
// w===0 cold-start branch in calculateDailyTargetFrom, which fades on its
// own as significantCount grows. This just re-renders the live preview so
// the dropdown change is reflected immediately; liveMissionSnapshot()
// already reads the dropdown's current value directly, so there's nothing
// else to persist here before Save.
function markActivityOverride(person) {
  renderActivityControls(person);
}

// The full calculation: BMR → TDEE → goal deficit → daily kcal target.
// Robust formula with all pitfalls addressed (see weeklyWorkoutStats above).
// Takes the person object directly (m) so callers can pass saved or live state.
function calculateDailyTargetFrom(m, person) {
  const bmr = calcBMR(m);

  const mult = ACTIVITY_MULTIPLIERS[m.activityLevel] || ACTIVITY_MULTIPLIERS.moderate;
  const multiplierTDEE = bmr * mult;
  let tdee, activitySource, blendNote;

  // The manual Activity Level toggle used to get a full 7-day veto over the
  // workout-data blend any time it was touched (isManualOverrideActive,
  // removed). That's gone: the toggle is now purely a cold-start fallback
  // and an anchor for the (1-w) portion of the blend below — it never
  // forces 100% trust just because it was recently edited. loggedDataWeight
  // (driven by significantCount, workout sessions in the last 28 days) is
  // the only thing that decides how much the toggle still matters, and it
  // fades toward 0 influence on its own as real workout data accumulates
  // (0 → 0.6 → 0.75 → 0.88 logged-weight as significantCount grows) — by
  // design the toggle should be near-obsolete for an account with months
  // of consistent logging behind it.
  const stats = weeklyWorkoutStats(person);
  const w = loggedDataWeight(stats.significantCount);

  if (w === 0) {
    // Not enough meaningful logged data yet — this is the ONLY situation
    // where the toggle still drives the number on its own (the cold-start
    // case). But also do a sanity check: if manual level says "active" but
    // there's very little workout data at all, hold at moderate as a
    // conservative floor rather than blindly trusting the toggle.
    const selectedMult = ACTIVITY_MULTIPLIERS[m.activityLevel] || ACTIVITY_MULTIPLIERS.moderate;
    const moderateMult = ACTIVITY_MULTIPLIERS.moderate;
    // If zero sessions logged and toggle says active/very_intense, cap at moderate
    // to avoid overestimating TDEE with no data to back it up. A day with
    // literally zero workout entries contributes exactly 0 to avgDailyBurn
    // below too (see weeklyWorkoutStats) — there's no assumed activity burn
    // anywhere in this file that isn't backed by an actual logged entry.
    const safeMult = (stats.entryCount === 0 && selectedMult > moderateMult)
      ? moderateMult : selectedMult;
    tdee = bmr * safeMult;
    activitySource = stats.entryCount === 0 ? 'multiplier (no logged data)' : 'multiplier (insufficient data)';
    blendNote = stats.entryCount === 0
      ? 'No workouts logged — using activity toggle (capped at Moderate until data exists)'
      : `Only ${stats.significantCount} significant sessions — need 4+ for data-blending`;
  } else {
    // Blend: logged burn drives the picture, multiplier is a shrinking
    // anchor. avgDailyBurn is a straight sum-of-logged-workouts / 28 — any
    // day with no workout entry contributes 0 to that sum, so rest days are
    // never assumed to carry any burn beyond BMR; they just dilute the
    // average down, exactly as they should.
    const loggedTDEE = bmr + stats.avgDailyBurn;

    // PITFALL 3 check: if logged data implies much less activity than the
    // manual toggle (>20% gap), don't let the toggle silently inflate.
    // The blend itself handles this gracefully — logged data weight w means
    // the multiplier can only contribute (1-w) of the final number.
    tdee = w * loggedTDEE + (1 - w) * multiplierTDEE;
    activitySource = 'blended';
    blendNote = stats.blendNote + ` · blend ${Math.round(w*100)}% logged / ${Math.round((1-w)*100)}% multiplier`;
  }

  // ALL GOAL TYPES (including recomposition) go through the same weight-goal
  // -driven deficit/surplus math below — goalType only changes the macro
  // split (calculateMacrosFrom), never the kcal target itself. That target is
  // fully determined by TDEE + wherever goalTargetWeight/timeframe point.
  //
  // Recomposition previously short-circuited this to flat TDEE maintenance
  // (Phase 5.2). It no longer does: if a recomposition user sets a target
  // weight equal to their current weight (the typical "hold steady" case),
  // weightDiff is 0 and this naturally produces the same 0-deficit/TDEE
  // result as before. If they set a genuine target weight, recomposition now
  // respects it exactly like lose_fat/gain_muscle do — no goal type is
  // special-cased out of the weight goal anymore.
  const weightDiff = (m.goalTargetWeight != null ? m.goalTargetWeight : m.weight) - m.weight;
  const targetDate = resolveGoalTargetDate(m);
  const daysRemaining = Math.max(1, daysBetween(todayStr(), targetDate));
  const goalClamp = safetyClampDeficit(weightDiff, daysRemaining, m.weight, m.gymExperience, m.userRateOverrideKgWeek);
  const dailyDeficit = goalClamp.deficit;
  const SAFE_FLOOR_KCAL = 1200;
  const rawTarget = tdee + dailyDeficit;
  const target = Math.max(SAFE_FLOOR_KCAL, Math.round(rawTarget));
  const clamped = rawTarget < SAFE_FLOOR_KCAL;

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), dailyDeficit: Math.round(dailyDeficit), target, activitySource, blendNote, clamped,
           goalTargetDate: targetDate, daysRemaining, goalRateClamped: goalClamp.clamped, goalSafeDaysNeeded: goalClamp.safeDaysNeeded,
           recommendedRateKgWeek: goalClamp.recommendedRateKgWeek, maxRateKgWeek: goalClamp.maxRateKgWeek,
           appliedRateKgWeek: goalClamp.safeRateKgWeek, usedOverride: goalClamp.usedOverride, isLoss: weightDiff < 0 };
}

// Convenience wrapper for code that wants the calc based on last-SAVED state.
function calculateDailyTarget(person) {
  return calculateDailyTargetFrom(S.mission[person], person);
}

// ── AI-POWERED CALORIE TARGET (Gemini) ────────────────────────────────────
// Sends a rich data snapshot to Gemini and asks it to estimate the right
// daily calorie intake. This is intentionally separate from the formula so
// the two can be blended or compared.
//
// Data sent to Gemini:
//  - BMR, height, weight, age, sex
//  - The manually-chosen activity level (as text, not a multiplier)
//  - Last 28 days of workout logs: type, duration, calories_burned, date
//  - Last 7 days of fully-logged meal data: actual calorie totals per day
//  - Weight trend over last 30 days (are they losing/gaining vs. goal?)
//  - 3-month goal (kg delta)
//
// Gemini is instructed to return ONLY a single integer (the kcal target).
// We parse it, validate it's in a sane range (1000–4000), and return it.
async function askGeminiForCalorieTarget(person) {
  if (!getGeminiKeys().length && !getGroqKeys().length && !getCerebrasKeys().length) throw new Error('no_key');

  const m = S.mission[person];
  const bmr = Math.round(calcBMR(m));

  // Workout data (last 28 days)
  const since28 = new Date(); since28.setDate(since28.getDate() - 27);
  const dates28 = [];
  for (let i=0;i<28;i++){ const d=new Date(since28); d.setDate(d.getDate()+i); dates28.push(toLocalDateStr(d)); }
  const recentWorkouts = entriesFor(person, dates28, 'workout');

  // Group workouts by type for a clean summary
  const workoutSummary = {};
  recentWorkouts.forEach(w => {
    const t = w.workout_type || 'Other';
    if (!workoutSummary[t]) workoutSummary[t] = { count:0, totalMin:0, totalSteps:0, totalBurn:0 };
    workoutSummary[t].count++;
    workoutSummary[t].totalMin += w.duration_min || 0;
    workoutSummary[t].totalSteps += w.steps_logged || 0;
    workoutSummary[t].totalBurn += w.calories_burned || 0;
  });
  // Walking is reported in steps here too — it's tracked in steps everywhere
  // else in the app, never minutes, so this AI-facing summary shouldn't be
  // the one place that still talks about it in minutes.
  const workoutLines = Object.entries(workoutSummary).map(([type, v]) =>
    type === 'Walking'
      ? `  - Walking: ${v.count} sessions, ${v.totalSteps.toLocaleString()} steps total, ~${Math.round(v.totalBurn)} kcal total burned`
      : `  - ${type}: ${v.count} sessions, ${v.totalMin} min total, ~${Math.round(v.totalBurn)} kcal total burned`
  ).join('\n') || '  (none logged in last 28 days)';

  // Fully-logged meal days (last 14 days)
  const since14 = new Date(); since14.setDate(since14.getDate() - 13);
  const dates14 = [];
  for (let i=0;i<14;i++){ const d=new Date(since14); d.setDate(d.getDate()+i); dates14.push(toLocalDateStr(d)); }
  const recentMeals = entriesFor(person, dates14, 'meal').filter(e => !e.hypo_correction);
  const fullDayDates = [...new Set(recentMeals.filter(e=>e.full_day).map(e=>e.date))];
  const mealLines = fullDayDates.length
    ? fullDayDates.map(d => {
        const dayTotal = Math.round(sum(recentMeals.filter(e=>e.date===d), 'calories'));
        return `  - ${d}: ${dayTotal} kcal eaten`;
      }).join('\n')
    : '  (no fully-logged days in last 14 days)';

  // Weight trend
  const wLogs = (S.weightLog||[]).filter(w=>w.person===person).sort((a,b)=>a.date.localeCompare(b.date));
  const weightTrend = wLogs.length >= 2
    ? `Started at ${wLogs[0].kg}kg on ${wLogs[0].date}, now ${wLogs[wLogs.length-1].kg}kg on ${wLogs[wLogs.length-1].date} (${((wLogs[wLogs.length-1].kg - wLogs[0].kg) >= 0 ? '+' : '')}${(wLogs[wLogs.length-1].kg - wLogs[0].kg).toFixed(1)}kg total)`
    : `Current weight: ${m.weight}kg (no trend data yet)`;

  const activityLabels = {
    light: 'Light (~5k steps/day, desk job)',
    moderate: 'Moderate (~10k steps/day, some walking)',
    active: 'Active (~15k steps/day, regular exercise)',
    very_intense: 'Very intense (~20k+ steps or hard daily training)'
  };

  const prompt = `You are a nutrition scientist calculating a person's daily calorie intake target. Analyse the data below carefully and return ONLY a single integer — the recommended daily calorie target in kcal. No explanation, no text, no units — just the number.

PERSON PROFILE:
- Sex: ${m.sex || 'unknown'}
- Age: ${m.age} years
- Height: ${m.height} cm
- Current weight: ${m.weight} kg
- Calculated BMR (Mifflin-St Jeor): ${bmr} kcal/day
- Goal: target weight ${m.goalTargetWeight}kg by ${resolveGoalTargetDate(m)} (${(m.goalTargetWeight - m.weight) < 0 ? 'weight loss' : (m.goalTargetWeight - m.weight) > 0 ? 'weight gain' : 'maintain'})
- Self-reported activity level: ${activityLabels[m.activityLevel] || m.activityLevel}

WORKOUT LOG (last 28 days):
${workoutLines}

ACTUAL FOOD INTAKE (fully-logged days, last 14 days):
${mealLines}

WEIGHT TREND:
${weightTrend}

INSTRUCTIONS:
- The activity level toggle is self-reported and may not match the logged workout data. Weight the logged data more heavily if it conflicts.
- If many small/short workouts are logged, don't mistake volume for intensity. A 10-minute walk is not equivalent to a 45-minute cardio session.
- If the person is losing weight faster than the goal, the current target may be too low — adjust upward slightly.
- If the person is losing weight slower than the goal (or gaining), the current target may be too high — adjust downward.
- If no weight trend data is available, rely on BMR × activity factor from the workout log.
- The goal (${m.goalTargetWeight}kg by ${resolveGoalTargetDate(m)}) implies a daily calorie deficit/surplus of ~${Math.round(safetyClampDeficit(m.goalTargetWeight - m.weight, Math.max(1, daysBetween(todayStr(), resolveGoalTargetDate(m))), m.weight, m.gymExperience, m.userRateOverrideKgWeek).deficit)} kcal/day.
- Never recommend below 1200 kcal/day for females or 1500 kcal/day for males.
- Never recommend above 4000 kcal/day.
- Return ONLY the integer. Example: 1680`;

  const raw = (await askAI(prompt)).trim();
  // Strip any <thinking>…</thinking> block Gemini-2.5 may prepend, then find
  // the last standalone 3-or-4-digit integer in the remaining text.
  const stripped = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  const matches = stripped.match(/\b(\d{3,4})\b/g);
  const num = matches ? parseInt(matches[matches.length - 1]) : NaN;
  const floor = m.sex === 'female' ? 1200 : 1500;
  if (isNaN(num) || num < floor || num > 4000) throw new Error('invalid_ai_response: ' + raw);
  return num;
}

// ── AI CALORIE MODE TOGGLE ─────────────────────────────────────────────────
// Controls whether the calorie target shown (and saved) is:
//   'ai_blend'  → 20% AI suggestion + 80% formula (default when Gemini key exists)
//   'formula'   → 100% formula, AI not involved
// Stored per-person in S.mission[person].aiCalorieMode
function getAiCalorieMode(person) {
  return S.mission[person].aiCalorieMode || 'ai_blend';
}
function setAiCalorieMode(person, mode) {
  S.mission[person].aiCalorieMode = mode;
  // Instantly reflect the mode switch in the kcal input box
  const prefix = person === 'gabi' ? 'g' : 'n';
  const calc = calculateDailyTargetFrom(liveMissionSnapshot(person), person);
  const finalTarget = computeFinalTarget(person, calc.target);
  const kcalEl = document.getElementById(prefix+'-kcal');
  if (kcalEl) kcalEl.value = finalTarget;

  S.mission[person].kcal = finalTarget;
  const macros = calculateMacrosFrom(S.mission[person], finalTarget);
  S.mission[person].protein = macros.protein;
  S.mission[person].carbs = macros.carbs;
  S.mission[person].fat = macros.fat;
  updateMacroFields(person);

  saveLocalOnly();
  renderActivityControls(person);
}

// Compute the FINAL blended target given formula result and (optionally) an AI target.
// If no AI target is stored, falls back to formula only regardless of mode.
function computeFinalTarget(person, formulaTarget) {
  const mode = getAiCalorieMode(person);
  const aiTarget = S.mission[person].aiCalorieTarget;
  if (mode === 'ai_blend' && aiTarget && aiTarget > 0) {
    // 20% AI, 80% formula
    return Math.round(0.2 * aiTarget + 0.8 * formulaTarget);
  }
  return formulaTarget; // formula-only mode or no AI target yet
}

// Reads weight/height/age/goal(target weight + timeframe)/activityLevel
// straight from the Mission tab's input fields (falling back to saved state
// for any field that's empty/invalid), WITHOUT writing anything into
// S.mission. This is what powers the live breakdown preview as you type, so
// the preview reflects what you're currently typing rather than only
// updating after Save.
function liveMissionSnapshot(person) {
  const prefix = person === 'gabi' ? 'g' : 'n';
  const stored = S.mission[person];
  const heightEl = document.getElementById(prefix+'-height');
  const ageEl = document.getElementById(prefix+'-age');
  const goalWeightEl = document.getElementById(prefix+'-goal-weight');
  const goalTimeframeEl = document.getElementById(prefix+'-goal-timeframe');
  const goalDateEl = document.getElementById(prefix+'-goal-date');
  const actEl = document.getElementById(prefix+'-activity');
  const goalTypeEl = document.getElementById(prefix+'-goal-type');
  const gymExpEl = document.getElementById(prefix+'-gym-experience');

  // Weight is locked to the latest weight-log entry, not a typed field.
  const weight = getLatestWeight(person);
  const height = heightEl ? parseFloat(heightEl.value) : NaN;
  const age = ageEl ? parseFloat(ageEl.value) : NaN;
  const goalTargetWeight = goalWeightEl && goalWeightEl.value !== '' ? parseWeightInput(goalWeightEl.value) : NaN;
  const goalTimeframe = (goalTimeframeEl && goalTimeframeEl.value) ? goalTimeframeEl.value : NaN;

  return {
    ...stored,
    weight: weight == null ? stored.weight : weight,
    height: isNaN(height) ? stored.height : height,
    age: isNaN(age) ? stored.age : age,
    goalTargetWeight: isNaN(goalTargetWeight) ? stored.goalTargetWeight : goalTargetWeight,
    goalTimeframe: goalTimeframe || stored.goalTimeframe,
    goalTargetDate: (goalDateEl && goalDateEl.value) ? goalDateEl.value : stored.goalTargetDate,
    activityLevel: (actEl && actEl.value) ? actEl.value : stored.activityLevel,
    // These two aren't written elsewhere before Save, so the live preview
    // (kcal breakdown + macros below) would otherwise ignore an unsaved
    // change to either dropdown even though both fire renderActivityControls
    // on change.
    goalType: (goalTypeEl && goalTypeEl.value) ? goalTypeEl.value : stored.goalType,
    gymExperience: (gymExpEl && gymExpEl.value) ? gymExpEl.value : stored.gymExperience
  };
}


function applyCalculatedTarget(person) {
  const calc = calculateDailyTarget(person);
  const finalTarget = computeFinalTarget(person, calc.target);
  S.mission[person].kcal = finalTarget;
  const macros = calculateMacrosFrom(S.mission[person], finalTarget);
  S.mission[person].protein = macros.protein;
  S.mission[person].carbs = macros.carbs;
  S.mission[person].fat = macros.fat;
  return { ...calc, finalTarget, macros };
}

// Pushes S.mission[person]'s current protein/carbs/fat into the Targets
// form fields, if they're the ones currently rendered in the DOM. Macros
// are always derived (goalType + weight + kcal target), same as kcal, so
// this mirrors how the kcal field gets written after every recalculation.
function updateMacroFields(person) {
  const prefix = person === 'gabi' ? 'g' : 'n';
  const m = S.mission[person];
  const proteinEl = document.getElementById(prefix+'-protein');
  const carbsEl = document.getElementById(prefix+'-carbs');
  const fatEl = document.getElementById(prefix+'-fat');
  if (proteinEl) proteinEl.value = m.protein;
  if (carbsEl) carbsEl.value = m.carbs;
  if (fatEl) fatEl.value = m.fat;
}

function loadMissionFields() {
  const g = S.mission.gabi, n = S.mission.nacho;
  ['height','age','kcal','protein','carbs','fat'].forEach(k => {
    const ge = document.getElementById('g-'+k);
    const ne = document.getElementById('n-'+k);
    if (ge) ge.value = g[k] || '';
    if (ne) ne.value = n[k] || '';
  });
  // Weight fields are locked to the latest weight-log entry, not S.mission.
  ['gabi','nacho'].forEach(person => {
    const prefix = person === 'gabi' ? 'g' : 'n';
    const weightEl = document.getElementById(prefix+'-weight');
    const latest = getLatestWeight(person);
    if (weightEl) weightEl.value = latest != null ? latest : '';
    if (latest != null) S.mission[person].weight = latest;
  });
  ['g','n'].forEach(prefix => {
    const m = prefix === 'g' ? g : n;
    const goalWeightEl = document.getElementById(prefix+'-goal-weight');
    const goalTimeframeEl = document.getElementById(prefix+'-goal-timeframe');
    const goalDateEl = document.getElementById(prefix+'-goal-date');
    const actEl = document.getElementById(prefix+'-activity');
    if (goalWeightEl) goalWeightEl.value = m.goalTargetWeight;
    if (goalTimeframeEl) goalTimeframeEl.value = m.goalTimeframe;
    if (goalDateEl) goalDateEl.value = m.goalTargetDate || '';
    if (actEl) actEl.value = m.activityLevel;
  });
  renderActivityControls('gabi');
  renderActivityControls('nacho');
}

// Explicit "Calculate my intake" button handler. Recomputes BMR → TDEE →
// target for ONE person. If AI assist is ON and a Gemini key exists, also
// fetches a fresh AI target (no "Thinking…" label — button stays enabled).
// If AI assist is OFF, just applies the formula immediately with no AI call.
// Either way, also forces a fresh adaptive-engine pass (confidence +
// trend-correction nudge) against whatever weigh-ins/full-day marks exist
// at the moment the button is pressed — not whatever was last computed at
// page load. In both cases the kcal box is updated immediately with the
// correct value.
async function calculateMyIntake(person) {
  const prefix = person === 'gabi' ? 'g' : 'n';

  // Pull whatever's currently in the form fields first.
  const latestWeight = getLatestWeight(person);
  if (latestWeight != null) S.mission[person].weight = latestWeight;
  ['height','age'].forEach(k => {
    const el = document.getElementById(prefix+'-'+k);
    const val = parseFloat(el.value);
    if (!isNaN(val)) S.mission[person][k] = val;
  });
  const goalWeightVal = parseWeightInput(document.getElementById(prefix+'-goal-weight').value);
  if (!isNaN(goalWeightVal)) S.mission[person].goalTargetWeight = goalWeightVal;
  const goalTimeframeEl = document.getElementById(prefix+'-goal-timeframe');
  if (goalTimeframeEl && goalTimeframeEl.value) S.mission[person].goalTimeframe = goalTimeframeEl.value;
  const goalDateEl = document.getElementById(prefix+'-goal-date');
  if (goalDateEl && goalDateEl.value) S.mission[person].goalTargetDate = goalDateEl.value;
  S.mission[person].goalSetDate = S.mission[person].goalSetDate || todayStr();
  S.mission[person].activityLevel = document.getElementById(prefix+'-activity').value;

  // Formula calculation (always done first so box updates immediately)
  const calc = applyCalculatedTarget(person);
  const formulaTarget = calc.target;
  const aiMode = getAiCalorieMode(person);

  if (aiMode === 'formula') {
    // AI off — just use formula, no network call. Then force a fresh
    // adaptive pass (confidence + trend-correction nudge) against whatever
    // weigh-ins/full-day marks exist right now, rather than whatever was
    // last computed at page load — an explicit button press should reflect
    // current data, not a stale snapshot. Macros are recalculated afterward
    // since the nudge may have moved m.kcal off the pre-nudge formula target.
    maybeRunAdaptiveRecalc(person, { force: true });
    const nudgedTarget = S.mission[person].kcal;
    const nudgedMacros = calculateMacrosFrom(S.mission[person], nudgedTarget);
    S.mission[person].protein = nudgedMacros.protein;
    S.mission[person].carbs = nudgedMacros.carbs;
    S.mission[person].fat = nudgedMacros.fat;
    const kcalEl = document.getElementById(prefix+'-kcal');
    if (kcalEl) kcalEl.value = nudgedTarget;
    updateMacroFields(person);
    renderActivityControls(person);
    saveMission();
    return;
  }

  // AI assist is ON — fetch AI target, show "Thinking…" while waiting
  const hasAI = hasAnyAIKey();
  if (hasAI) {
    const btn = document.querySelector(`button[onclick="calculateMyIntake('${person}')"]`);
    if (btn) setBtnThinking(btn, true, 'Thinking…');
    try {
      const aiTarget = await askGeminiForCalorieTarget(person);
      S.mission[person].aiCalorieTarget = aiTarget;
      showToast(`AI suggests ${aiTarget} kcal for ${person.charAt(0).toUpperCase()+person.slice(1)}`);
    } catch(e) {
      showToast('AI target unavailable — using formula');
      if (!S.mission[person].aiCalorieTarget) S.mission[person].aiCalorieTarget = null;
    } finally {
      if (btn) setBtnThinking(btn, false, 'Calculate my intake');
    }
  }

  // Compute final blended target and write to the kcal field
  const finalTarget = computeFinalTarget(person, formulaTarget);
  S.mission[person].kcal = finalTarget;

  // Force a fresh adaptive pass (confidence + trend-correction nudge) against
  // whatever weigh-ins/full-day marks exist right now, rather than whatever
  // was last computed at page load — an explicit button press should reflect
  // current data, not a stale snapshot. May move m.kcal further off
  // finalTarget, so macros are derived AFTER this from whatever m.kcal ends
  // up being, not from the pre-nudge finalTarget.
  maybeRunAdaptiveRecalc(person, { force: true });
  const nudgedTarget = S.mission[person].kcal;

  const kcalEl = document.getElementById(prefix+'-kcal');
  if (kcalEl) kcalEl.value = nudgedTarget;

  // Macros are derived from the FINAL (formula + AI-blend + adaptive-nudge)
  // kcal target, not the pre-nudge formula target applyCalculatedTarget()
  // used above.
  const macros = calculateMacrosFrom(S.mission[person], nudgedTarget);
  S.mission[person].protein = macros.protein;
  S.mission[person].carbs = macros.carbs;
  S.mission[person].fat = macros.fat;
  updateMacroFields(person);

  renderActivityControls(person);
  saveMission(); // persist all mission fields, not just local
}

// Persists the active person's Profile+Targets fields from the DOM into
// S.mission, then recalculates BOTH people's calorie targets (state only —
// only the active person's fields are actually in the DOM at any given
// time now that Profile+Targets is a single dynamic per-person block, so
// there's nothing to write into the other person's UI; their S.mission.kcal
// just stays fresh in case Vitals reads it before they open Targets again).
//
// FIX (Phase 1): this used to unconditionally read document.getElementById
// for BOTH 'g-*' and 'n-*' ids with no null guard, on the assumption both
// people's fields were always present in the DOM together. That assumption
// was already false for kcal/protein/carbs/fat (targets-body has only ever
// rendered one person at a time) and would throw a TypeError reading
// .value off null for whichever person wasn't currently open — silently
// aborting the rest of save. Rewritten to only touch the active person's
// DOM, matching what's actually rendered.
function saveMission() {
  const person = S.currentPerson;
  const prefix = person === 'gabi' ? 'g' : 'n';
  const m = S.mission[person];
  if (!m) return;

  ['height','age','kcal','protein','carbs','fat'].forEach(k => {
    const el = document.getElementById(prefix+'-'+k);
    if (el) m[k] = parseFloat(el.value) || m[k];
  });

  // Weight is locked to the latest weight-log entry, never read from a form field.
  const latest = getLatestWeight(person);
  if (latest != null) m.weight = latest;

  const goalWeightEl = document.getElementById(prefix+'-goal-weight');
  if (goalWeightEl && goalWeightEl.value !== '') {
    const goalWeightVal = parseWeightInput(goalWeightEl.value);
    if (!isNaN(goalWeightVal)) m.goalTargetWeight = goalWeightVal;
  }
  const goalTimeframeEl = document.getElementById(prefix+'-goal-timeframe');
  if (goalTimeframeEl && goalTimeframeEl.value) m.goalTimeframe = goalTimeframeEl.value;
  const goalDateEl = document.getElementById(prefix+'-goal-date');
  if (goalDateEl && goalDateEl.value) m.goalTargetDate = goalDateEl.value;
  m.goalSetDate = m.goalSetDate || todayStr();
  m.goalTargetDate = resolveGoalTargetDate(m);
  const actEl = document.getElementById(prefix+'-activity');
  if (actEl) m.activityLevel = actEl.value;
  const gymExpEl = document.getElementById(prefix+'-gym-experience');
  if (gymExpEl) m.gymExperience = gymExpEl.value;
  const goalTypeEl = document.getElementById(prefix+'-goal-type');
  if (goalTypeEl) m.goalType = goalTypeEl.value;

  // Auto-recalculate the calorie target whenever Mission is saved so the
  // Vitals daily display is always current — no need to press "Calculate"
  // separately. If the user manually typed a kcal value in the field, we
  // still respect it by reading it from the form above; but we then
  // re-run the full BMR→TDEE→target chain and overwrite it so the number
  // stays honest when weight, goal, or activity changes. Both people's
  // targets are recalculated in state; only the active person's kcal
  // field (the only one actually in the DOM) gets written back.
  ['gabi','nacho'].forEach(p => {
    const calc = applyCalculatedTarget(p);
    if (p === person) {
      const kcalEl = document.getElementById(prefix+'-kcal');
      if (kcalEl) kcalEl.value = calc.finalTarget || calc.target;
      updateMacroFields(p);
      renderActivityControls(p);
    }
  });
  save();
  renderVitals();
  loadMissionFields();
  const savedEl = document.getElementById('mission-saved');
  if (savedEl) savedEl.style.display = 'block';
  setTimeout(() => { const el = document.getElementById('mission-saved'); if (el) el.style.display = 'none'; }, 2000);
}

// Shows the BMR/TDEE/deficit breakdown + AI mode toggle + AI target info.
// ── RATE OVERRIDE (Phase 3.3 + 5.4) ─────────────────────────────────────────
// Handles the editable kg/wk box on the results screen (settings.js). If the
// user's typed value exceeds the recommended default for their direction/
// goal-type/experience combo, fire a disclaimer confirm() — accept grants it
// (hard-capped at the max for that combo by safetyClampDeficit itself), decline
// reverts the input to the last valid value. Now shown for every goal type,
// including recomposition — see settings.js/renderActivityControls.
function applyRateOverride(person, typedValue) {
  const m = S.mission[person];
  if (!m) return;
  const val = parseFloat(typedValue);
  const prefix = person === 'gabi' ? 'g' : 'n';
  const rateEl = document.getElementById(prefix + '-rate-kgwk');

  if (isNaN(val) || val <= 0) {
    // Empty/invalid — treat as "clear override, go back to auto".
    m.userRateOverrideKgWeek = null;
    renderActivityControls(person);
    return;
  }

  // Compute current recommended/max without any override, to check the typed
  // value against the real bounds for this person's direction/experience.
  const calcNoOverride = calculateDailyTargetFrom({ ...m, userRateOverrideKgWeek: null }, person);
  const recommended = calcNoOverride.recommendedRateKgWeek;
  const max = calcNoOverride.maxRateKgWeek;

  if (recommended == null) return; // defensive guard — every goal type now returns a value here

  if (val > recommended) {
    const direction = calcNoOverride.isLoss ? 'lose' : 'gain';
    const ok = confirm(
      `Recommended rate is ${recommended.toFixed(2)}kg/week. You're asking to ${direction} at ${val.toFixed(2)}kg/week.\n\n` +
      `Faster rates carry more health risk (muscle loss, fatigue, hormonal impact, and more) — this is above what's generally recommended. ` +
      `The absolute maximum allowed here is ${max.toFixed(2)}kg/week.\n\n` +
      `Are you sure you want to target ${val.toFixed(2)}kg/week?`
    );
    if (!ok) {
      // Reverted — restore the input to whatever was actually in effect.
      if (rateEl) rateEl.value = (m.userRateOverrideKgWeek || recommended).toFixed(2);
      return;
    }
  }

  m.userRateOverrideKgWeek = Math.min(val, max);
  renderActivityControls(person);
}

function resetRateOverride(person) {
  const m = S.mission[person];
  if (!m) return;
  m.userRateOverrideKgWeek = null;
  renderActivityControls(person);
}

function renderActivityControls(person) {
  const prefix = person === 'gabi' ? 'g' : 'n';
  const calc = calculateDailyTargetFrom(liveMissionSnapshot(person), person);
  const calcEl = document.getElementById(prefix+'-calc-breakdown');
  if (!calcEl) return;

  const aiTarget = S.mission[person].aiCalorieTarget;
  const hasAI = hasAnyAIKey();
  const finalTarget = computeFinalTarget(person, calc.target);

  // AI target line
  let aiLine = '';
  if (aiTarget && aiTarget > 0) {
    aiLine = `<div style="margin-top:4px;color:var(--sage)">🤖 AI suggestion: <strong>${aiTarget} kcal</strong></div>`;
  } else if (hasAI) {
    aiLine = `<div style="margin-top:4px;color:var(--mist);font-style:italic">AI suggestion: click "Calculate my intake" to fetch</div>`;
  }

  // Mode toggle — iOS-style pill, always shown
  const aiMode = getAiCalorieMode(person);
  const blendActive = aiMode === 'ai_blend';
  const toggleEnabled = hasAI || (aiTarget && aiTarget > 0);
  const nextMode = blendActive ? 'formula' : 'ai_blend';
  const toggleLine = `<div style="display:flex;align-items:center;gap:10px;margin-top:12px">
    <div style="position:relative;width:51px;height:31px;border-radius:16px;background:${blendActive && toggleEnabled ? 'var(--sage)' : '#3a3a3c'};transition:background 0.2s;cursor:${toggleEnabled ? 'pointer' : 'not-allowed'};opacity:${toggleEnabled ? '1' : '0.4'};flex-shrink:0"
         ${toggleEnabled ? `onclick="setAiCalorieMode('${person}','${nextMode}')"` : ''}>
      <div style="position:absolute;top:2px;left:${blendActive && toggleEnabled ? '22px' : '2px'};width:27px;height:27px;border-radius:50%;background:#fff;transition:left 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.4)"></div>
    </div>
    <span style="font-size:13px;color:${blendActive && toggleEnabled ? 'var(--bone)' : 'var(--mist)'}">
      ${toggleEnabled ? (blendActive ? 'AI assist <strong>On</strong>' : 'AI assist <strong>Off</strong>') : 'AI assist <span style="opacity:0.5">(add an AI key to enable)</span>'}
    </span>
  </div>`;

  // Final target line
  const finalLine = (aiTarget && aiTarget > 0 && aiMode === 'ai_blend')
    ? `<div style="margin-top:6px;font-size:12px;color:var(--bone)">Final target (20% AI + 80% formula): <strong>${finalTarget} kcal</strong></div>`
    : '';

  // Phase 2: surface adaptive-engine state (confidence + last nudge) so it's
  // visible this exists and is/isn't currently acting, not just a silent
  // background number change.
  let adaptiveLine = '';
  const m2 = S.mission[person];
  if (m2 && m2.adaptiveConfidence != null) {
    const pct = Math.round(m2.adaptiveConfidence * 100);
    const nudgeText = (m2.lastAdaptiveNudge != null && m2.lastAdaptiveRecalcDate)
      ? ` · last adjusted ${m2.lastAdaptiveNudge>=0?'+':''}${m2.lastAdaptiveNudge} kcal on ${m2.lastAdaptiveRecalcDate}`
      : '';
    adaptiveLine = `<div style="margin-top:6px;font-size:10px;color:var(--mist)">Adaptive confidence: ${pct}%${nudgeText}</div>`;
  }

  // Phase 3.3 replaces the old 3.2 single-clamp warning with recommended-vs-
  // max messaging, and drives the editable kg/wk box on the results screen.
  let goalClampLine = '';
  const rateWrapEl = document.getElementById(prefix+'-rate-wrap');
  const rateInputEl = document.getElementById(prefix+'-rate-kgwk');
  const rateNoteEl = document.getElementById(prefix+'-rate-note');

  if (calc.recommendedRateKgWeek != null) {
    // Every goal type reaches this branch now, including recomposition —
    // show and populate the rate box.
    if (rateWrapEl) rateWrapEl.style.display = 'block';
    if (rateInputEl && document.activeElement !== rateInputEl) {
      rateInputEl.value = calc.appliedRateKgWeek.toFixed(2);
    }
    if (rateNoteEl) {
      const direction = calc.isLoss ? 'loss' : 'gain';
      rateNoteEl.innerHTML = `Recommended: ${calc.recommendedRateKgWeek.toFixed(2)}kg/wk ${direction} · max override: ${calc.maxRateKgWeek.toFixed(2)}kg/wk` +
        (calc.usedOverride ? ` · <span style="color:var(--status-orange)">using your override</span>` : '');
    }
    if (calc.goalRateClamped && !calc.usedOverride) {
      // Auto-applied case: the goal date implied a faster rate than the
      // recommended default, so we're holding at recommended — same spirit
      // as the old 3.2 message, just against the new recommended figure
      // instead of a single hard ceiling.
      const earliest = new Date();
      earliest.setDate(earliest.getDate() + calc.goalSafeDaysNeeded);
      goalClampLine = `<div style="margin-top:6px;font-size:11px;color:var(--status-orange)">⚠ Your timeline is faster than the recommended rate — holding at ${calc.recommendedRateKgWeek.toFixed(2)}kg/wk (earliest date at this rate: ${toLocalDateStr(earliest)}). Edit the rate above if you want to go faster, up to ${calc.maxRateKgWeek.toFixed(2)}kg/wk.</div>`;
    }
  } else if (rateWrapEl) {
    // Defensive fallback — every goal type now returns a recommendedRateKgWeek,
    // so this branch shouldn't be reachable in practice anymore.
    rateWrapEl.style.display = 'none';
  }

  // Live macro preview — recomputed from whichever kcal target is currently
  // "final" (AI-blended if that's the active mode, otherwise formula), using
  // the live (possibly-unsaved) goal type/weight snapshot above, so switching
  // the Goal type dropdown updates protein/carbs/fat here before Save too.
  const macroPreviewKcal = (aiTarget && aiTarget > 0 && aiMode === 'ai_blend') ? finalTarget : calc.target;
  const macroPreview = calculateMacrosFrom(liveMissionSnapshot(person), macroPreviewKcal);
  const macroLine = `<div style="margin-top:6px;font-size:11px;color:var(--bone)">Protein <strong>${macroPreview.protein}g</strong> · Carbs <strong>${macroPreview.carbs}g</strong> · Fat <strong>${macroPreview.fat}g</strong></div>`;

  calcEl.innerHTML =
    `BMR ${calc.bmr} kcal → TDEE ${calc.tdee} kcal → ${calc.dailyDeficit>=0?'+':''}${calc.dailyDeficit} kcal/day goal = <strong>${calc.target} kcal</strong> (formula)${calc.clamped ? ' · held at safety floor' : ''}` +
    `<div style="margin-top:3px;font-size:10px;color:var(--mist)">${calc.blendNote || calc.activitySource}</div>` +
    adaptiveLine + goalClampLine + aiLine + finalLine + macroLine + toggleLine;
}


function formatPrompt(person) {
  const honeyRule = person === 'nacho'
    ? `This log is for Nacho. He always has honey in his coffee — include it by default unless the text explicitly says no honey.`
    : `This log is for Gabi. She never has honey in her coffee — never include it, even if the text doesn't mention it either way.`;
  return `You are a nutrition and workout logging assistant. You don't need any personal or health context — just describe what's in front of you, accurately.

TASK: Create a single downloadable .txt file containing the logged line(s) below — nothing else. Do not reply in the chat with the line; put it only inside the file. NEVER ask a question, in the file or outside it — there is no one available to answer. If something is ambiguous or unstated, make your best estimate and proceed; do not add commentary, summary, advice, or questions anywhere in your response.

ACCURACY RULE: Only log what is actually visible in a photo or stated in the text. Never assume extra items were also eaten because of the time of day, the setting, or what a "usual" meal looks like — if a photo shows only a drink, log only that drink. If a photo is ambiguous (e.g. you can't tell tea from coffee, or how much milk/sugar), make your best estimate from what's visible and note the uncertainty briefly in the meal name, e.g. "Tea with milk (estimated)".

COFFEE / HONEY RULE (no question — always resolve automatically): ${honeyRule}

If the person just writes "usual breakfast" with no photo, that means: 3 eggs, 1 slice of toast, 1 tomato, a handful of spinach, a drizzle of olive oil, and coffee with milk (apply the honey rule above). Estimate nutrition from that description.

HYPO CORRECTION FIELD (no question — opt-in only): only add | Hypo: yes if the person's own text explicitly says this is a low blood-sugar correction (e.g. they write "hypo", "low", "low sugar"). If it merely looks like one (glucose tabs, rice crackers, an odd-time snack) but isn't stated, do NOT mark it — log it as a normal meal and omit the Hypo field entirely. Never guess yes.

If given a photo or description of food, treat everything submitted in this single batch as ONE sitting for this one person — combine every item from this submission into exactly ONE MEAL line, even if several distinct foods/drinks are listed (e.g. "1 Aperol spritz, 4 mejillones, 8 almejitas, 2 platos de paella" is ONE line, not four). Sum/estimate the nutrition across all items into that single line's numbers. The only time you output more than one MEAL line from one submission is if the text clearly describes separate sittings at different times (e.g. it explicitly mentions breakfast at one time and lunch at another) — otherwise, always merge into one line. Never combine two different people's food into one submission.
Name the entry after the 1-3 most recognisable items in the list (skip throwaway garnishes/condiments), joined with "&", e.g. "Paella & Aperol", "Mejillones & Almejitas". Never use a bare number, a quantity alone, or an empty/placeholder name as the Meal field.
MEAL | Meal: [name] | Calories: [n] | Protein: [n]g | Carbs: [n]g | NetCarbs: [n]g | Fat: [n]g | Fibre: [n]g | Magnesium: [n]mg | VitD: [n]mcg | Iron: [n]mg | Calcium: [n]mg | Zinc: [n]mg | B12: [n]mcg | Omega3: [n]g | Potassium: [n]mg | VitC: [n]mg | Folate: [n]mcg | Time: [HH:MM]
(add | Hypo: yes before Time only per the opt-in rule above)

If given a description of a workout, the file should contain one line in EXACTLY this format:
WORKOUT | Type: [Strength/Cardio - steady/Cardio - HIIT/Flexibility/Balance/Mobility] | Duration: [n minutes] | Intensity: [Low/Medium/High] | Calories burned: [n] | Time: [HH:MM] | Notes: [one short line]

Output: just the .txt file content, ready to download. No chat reply alongside it. No questions, ever.`;
}

function copyText(text, label) {
  navigator.clipboard.writeText(text);
  showToast(label || 'Copied');
}
function copyFormatPrompt() { copyText(formatPrompt(S.currentPerson), 'Prompt copied'); }

// ── AUTOMATIC SORTING (direct Gemini API) ───────────────────────────────────
let aiLogMode = 'auto';
function setAIMode(mode) {
  aiLogMode = mode;
  document.getElementById('ai-panel-manual').style.display = mode==='manual' ? '' : 'none';
  document.getElementById('ai-panel-auto').style.display   = mode==='auto'   ? '' : 'none';
  // Sync the pill toggle that now lives outside both panels
  const elAuto   = document.getElementById('ai-mode-auto');
  const elManual = document.getElementById('ai-mode-manual');
  if (elAuto && elManual) {
    elAuto.classList.toggle('active', mode === 'auto');
    elManual.classList.toggle('active', mode === 'manual');
  }
  if (mode==='auto') checkGeminiKeyHint();
}
function checkGeminiKeyHint() {
  const has = hasAnyAIKey();
  document.getElementById('auto-key-missing').style.display = has ? 'none' : '';
}
// ── LIGHTWEIGHT MARKDOWN RENDERER (for AI replies) ─────────────────────────
// Converts the bold/headers/bullets an LLM naturally produces into safe HTML.
// Escapes raw text first, then layers on formatting — never trusts input.
function renderMarkdown(raw) {
  const esc = (raw || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const lines = esc.split('\n');
  let html = '';
  let listType = null; // 'ul' | 'ol' | null
  let para = [];

  const inlineFmt = t => t
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--bone)">$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*([^*]|$)/g, '$1<em>$2</em>$3');
  // Headers/subtitles never render nested bold/italic markers — just strip
  // the asterisks as plain text instead of styling them, so a model that
  // bolds its own heading text doesn't produce a bold span inside a title.
  const stripMd = t => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

  const flushPara = () => { if (para.length) { html += `<p style="margin:0 0 10px">${para.join('<br>')}</p>`; para = []; } };
  const closeList = () => { if (listType) { html += listType === 'ul' ? '</ul>' : '</ol>'; listType = null; } };

  lines.forEach(line => {
    const t = line.trim();
    const header = t.match(/^(#{1,4})\s+(.*)$/);
    const boldHeader = t.match(/^\*\*(.+?):?\*\*\s*$/);
    const bullet = t.match(/^[-*•]\s+(.*)$/);
    const numbered = t.match(/^\d+[\.\)]\s+(.*)$/);

    if (!t) { flushPara(); closeList(); return; }

    if (header) {
      flushPara(); closeList();
      html += `<div class="box-title" style="margin:${html?'14px':'0'} 0 6px">${stripMd(header[2])}</div>`;
    } else if (boldHeader) {
      flushPara(); closeList();
      html += `<div class="subheader" style="margin:${html?'12px':'0'} 0 4px">${stripMd(boldHeader[1])}</div>`;
    } else if (bullet) {
      flushPara();
      if (listType !== 'ul') { closeList(); html += '<ul style="margin:0 0 10px;padding-left:18px">'; listType = 'ul'; }
      html += `<li style="margin-bottom:4px">${inlineFmt(bullet[1])}</li>`;
    } else if (numbered) {
      flushPara();
      if (listType !== 'ol') { closeList(); html += '<ol style="margin:0 0 10px;padding-left:18px">'; listType = 'ol'; }
      html += `<li style="margin-bottom:4px">${inlineFmt(numbered[1])}</li>`;
    } else {
      closeList();
      para.push(inlineFmt(line));
    }
  });
  flushPara(); closeList();
  return html;
}

// Shared helper: send plain text to Gemini, get plain text back. Throws on
// missing key or failure so callers can show their own toast/UI.
// Kept as the name every existing caller (log.js workout parsing, the
// Vitals AI Assist button) already uses. Under the hood this now runs the
// full multi-provider fallback chain — every saved Cerebras key, then
// Groq, then Gemini — instead of a single Gemini key.
async function askGemini(promptText) {
  return askAI(promptText);
}
let autoPhotos = []; // [{id, data, mime}]
let autoPhotoSeq = 0; // unique id per thumbnail, since FileReader.onload fires
                       // out of order across multiple files — can't rely on
                       // array index to know which thumbnail a delete tap hit.
// Final notes #2 — APPENDS to the existing selection rather than replacing
// it, so tapping "Choose photo(s)" again (one at a time, or picking several
// more at once) adds to what's already there instead of wiping it out.
// autoPhotos/autoPhotoSeq are intentionally NOT reset here — only on a
// successful submit (see submitLogAuto) or by removeAutoPhoto() one at a
// time, so a half-built batch survives across multiple picker trips.
function handleAutoPhotos(event) {
  const files = [...event.target.files];
  const prev = document.getElementById('auto-photo-preview');
  files.forEach(file => {
    const id = ++autoPhotoSeq;
    const reader = new FileReader();
    reader.onload = e => {
      autoPhotos.push({ id, data: e.target.result.split(',')[1], mime: file.type });
      const wrap = document.createElement('div');
      wrap.className = 'photo-thumb';
      wrap.dataset.photoId = id;
      const img = document.createElement('img');
      img.src = e.target.result;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'photo-thumb-del';
      del.setAttribute('aria-label', 'Remove photo');
      del.textContent = '✕';
      del.onclick = () => removeAutoPhoto(id);
      wrap.appendChild(img);
      wrap.appendChild(del);
      prev.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
  // Clear the input's own value (not the preview/autoPhotos) so picking the
  // exact same file again in a later trip still fires a change event —
  // otherwise the browser sees "same file list" and onchange never re-fires.
  event.target.value = '';
}
// Final notes #1 — removes a single picked photo (before submit) without
// having to re-pick the whole batch. Pulls it from BOTH the in-memory
// autoPhotos array (what actually gets sent to Gemini) and the DOM
// thumbnail, matched by id rather than array position.
function removeAutoPhoto(id) {
  autoPhotos = autoPhotos.filter(p => p.id !== id);
  const el = document.querySelector('.photo-thumb[data-photo-id="' + id + '"]');
  if (el) el.remove();
}
async function submitLogAuto() {
  const hasPhoto = autoPhotos.length > 0;
  const desc = document.getElementById('auto-desc-input').value.trim();

  const wasFullBefore = entriesFor(S.currentPerson, [todayStr()], 'meal').some(e => e.full_day);
  const fullDay = applyFullDayStatus();
  const fullDayChanged = fullDay !== wasFullBefore;

  if (!hasPhoto && !desc) {
    if (fullDayChanged) {
      save(); renderVitals(); renderLogTab(); syncFullDayCheckbox(); syncHypoQuickBtn();
      showToast(fullDay ? 'Day marked complete' : 'Full-day mark removed');
    } else {
      showToast('Nothing to submit — add a photo/description or tick the full-day box');
    }
    return;
  }

  const hasAnyKey = getGeminiKeys().length || getGroqKeys().length || getCerebrasKeys().length;
  if (!hasAnyKey) { checkGeminiKeyHint(); showToast('Add an AI API key in Settings first'); return; }
  // Photo parsing only works through Gemini's vision input — Groq/Cerebras
  // are text-only in this app, so there's no fallback provider for photos.
  if (hasPhoto && !getGeminiKeys().length) {
    showToast('Photo logging needs a Gemini key (Groq/Cerebras are text-only). Add one in Settings, or describe the meal in words instead.');
    return;
  }

  const btn = document.getElementById('submit-log-btn');
  setBtnThinking(btn, true, 'Thinking…');
  showDigestOverlay('meal');
  try {
    const promptText = formatPrompt(S.currentPerson) + (desc ? ('\n\nDescription from the person: ' + desc) : '');
    let text;
    if (hasPhoto) {
      const imageParts = autoPhotos.map(p => ({ inline_data: { mime_type: p.mime, data: p.data } }));
      const attempts = [];
      text = null;
      for (const key of getGeminiKeys()) {
        try { text = await callGeminiText(key, promptText, imageParts); break; }
        catch (e) { attempts.push(e.message); }
      }
      if (text === null) throw new Error('All Gemini keys failed — ' + attempts.join(' | '));
    } else {
      // No photo — free to fall back across Cerebras → Groq → Gemini.
      text = await askAI(promptText);
    }
    const parsed = parseAIOutput(text);
    if (!parsed.length && !parsed.rejected?.length) { showToast('AI reply unreadable — try again or use Manual mode'); return; }
    commitEntries(parsed);
    save();
    renderVitals();
    renderLogTab();
    syncFullDayCheckbox();
    syncHypoQuickBtn();
    document.getElementById('auto-photo-input').value = '';
    document.getElementById('auto-photo-preview').innerHTML = '';
    document.getElementById('auto-desc-input').value = '';
    autoPhotos = [];
    const skipped = parsed.rejected && parsed.rejected.length
      ? (' · ⚠ skipped ' + parsed.rejected.length + ' unreadable line' + (parsed.rejected.length>1?'s':'') + ' — check it logged everything')
      : '';
    // If 👫 was active, clone entries for the other person
    if (mealLogForBoth) {
      const orig = S.currentPerson;
      const other = orig === 'gabi' ? 'nacho' : 'gabi';
      const cloned = parsed.map(e => ({ ...e, id: Date.now() + Math.random(), person: other }));
      cloned.forEach(e => { if (!S.entries.find(x => entryKey(x) === entryKey(e))) S.entries.push(e); });
      mealLogForBoth = false;
      const bothBtn = document.getElementById('log-both-btn');
      if (bothBtn) { bothBtn.style.background = 'var(--bark)'; bothBtn.style.color = 'var(--ochre)'; bothBtn.classList.remove('both-active'); }
      save(); renderVitals(); renderLogTab();
      showToast('Added ' + parsed.length + ' item' + (parsed.length>1?'s':'') + ' for both' + skipped);
    } else {
      showToast('Added ' + parsed.length + ' item' + (parsed.length>1?'s':'') + skipped + (fullDayChanged ? (fullDay ? ' · day marked complete' : ' · full-day mark removed') : ''));
    }
  } catch(e) {
    showToast(e.message || 'Could not reach Gemini');
  } finally {
    await hideDigestOverlay();
    setBtnThinking(btn, false, mealLogForBoth ? 'Submit Log (both)' : 'Submit Log');
  }
}

// ── DIGEST OVERLAY ─────────────────────────────────────────────────────────
// Full-screen blur+darken cover shown while a meal or workout log entry is
// being submitted (any entry type EXCEPT quick logs — coffee/vitamins stay
// instant). Two flavors:
//   'meal'    → EATINGGGIF.gif, "Ñam Ñam" / "Digesting your delicious data"
//   'workout' → RUNNING.gif,    "¡Vamos Vamos!" / "Clocking your sweat data"
//               (STRENGTH.gif instead, specifically for Strength workouts —
//               see WORKOUT_TYPE_GIFS below)
// Always stays up a MINIMUM of 3s from the moment it's shown, even if the
// underlying work (an AI call, or nothing at all for manual entries)
// finishes sooner — call showDigestOverlay(kind) right when the submit
// kicks off, do the work, then `await hideDigestOverlay()` before touching
// the UI again. For manual entries with no async work at all, just call
// showDigestOverlay(kind) then `await hideDigestOverlay()` back-to-back —
// it'll simply wait out the full 3s.
const DIGEST_OVERLAY_MS = 3000;
const DIGEST_COPY = {
  meal: {
    gif: 'https://raw.githubusercontent.com/nachostax/la-salud2/main/EATINGGGIF.gif',
    title: 'Ñam Ñam',
    subtitle: 'Digesting your delicious data'
  },
  workout: {
    gif: 'https://raw.githubusercontent.com/nachostax/la-salud2/main/RUNNING.gif',
    title: '¡Vamos Vamos!',
    subtitle: 'Clocking your sweat data'
  }
};
// Per-workout-type gif overrides, layered on top of DIGEST_COPY.workout —
// only the gif itself swaps, title/subtitle stay the same "¡Vamos Vamos!"
// copy regardless of workout type. Pass the workout type as showDigestOverlay's
// second argument when it's known up front (native Strength/Cardio/etc.
// logging); the AI "Other" workout logger doesn't know the type until after
// the AI call returns, so it always falls back to the default RUNNING.gif.
const WORKOUT_TYPE_GIFS = {
  Strength: 'https://raw.githubusercontent.com/nachostax/la-salud2/main/STRENGTH.gif'
};
let digestOverlayStart = null;
// Bumped on every showDigestOverlay() call. The <img> only reveals itself
// once ITS OWN load finishes AND it's still the most recent request — this
// is what stops a slow-loading gif from bleeding into the wrong overlay
// (e.g. tapping a meal log right after a workout log briefly showing
// RUNNING.gif because the browser hadn't finished swapping the frame yet).
let digestOverlaySeq = 0;
// One-time warm fetch per URL so the *first* time a person hits either log
// button, the gif is already sitting in the browser cache instead of racing
// a multi-hundred-KB download against the 3s minimum. Fired once at boot
// (see call at the bottom of this block) — by the time anyone's actually
// filled in a meal/workout form and hit submit, both should be long done.
const _digestPreloaded = {};
function preloadDigestGifs() {
  const urls = [...Object.values(DIGEST_COPY).map(c => c.gif), ...Object.values(WORKOUT_TYPE_GIFS)];
  urls.forEach(url => {
    if (_digestPreloaded[url]) return;
    _digestPreloaded[url] = true;
    const img = new Image();
    img.src = url;
  });
}
preloadDigestGifs();

function showDigestOverlay(kind, workoutType) {
  const copy = DIGEST_COPY[kind];
  const overlay = document.getElementById('digest-overlay');
  const imgEl = document.getElementById('digest-overlay-gif');
  if (!copy || !overlay || !imgEl) return;
  const gifUrl = (kind === 'workout' && workoutType && WORKOUT_TYPE_GIFS[workoutType]) || copy.gif;

  const seq = ++digestOverlaySeq;
  // Hide the old frame immediately rather than leaving the previous kind's
  // last-rendered gif on screen while the new one loads — that stale frame
  // showing through is exactly what caused RUNNING.gif to flash on a meal
  // log right after a workout log (or vice versa).
  //
  // Just setting opacity:0 wasn't enough on its own: the <img> still had
  // its CSS `transition:opacity .2s ease-out` active, so the OLD gif's last
  // frame visibly faded out over ~200ms before the new src ever swapped
  // in — that fade-out of the stale frame *was* the brief flash. Kill the
  // transition first, drop opacity instantly (no animation), force a
  // reflow so the browser actually applies "no transition" before we touch
  // opacity again, then restore the transition so the new gif still fades
  // *in* nicely once it's loaded.
  imgEl.style.transition = 'none';
  imgEl.style.opacity = '0';
  void imgEl.offsetWidth; // force reflow — commits the transition:none above
  imgEl.classList.remove('digest-overlay-gif-meal', 'digest-overlay-gif-workout');
  imgEl.classList.add('digest-overlay-gif-' + kind);
  const reveal = () => {
    if (seq !== digestOverlaySeq) return;
    imgEl.style.transition = '';
    imgEl.style.opacity = '1';
  };
  imgEl.onload = reveal;
  imgEl.onerror = reveal;
  imgEl.src = gifUrl;
  // If it's already cached (the common case, thanks to preloadDigestGifs
  // above), the browser may not re-fire 'load' for an unchanged/complete
  // image — check .complete and reveal immediately in that case.
  if (imgEl.complete) reveal();

  document.getElementById('digest-overlay-title').textContent = copy.title;
  document.getElementById('digest-overlay-subtitle').textContent = copy.subtitle;
  // Clear any inline display:none left over from a previous hide (see
  // hideDigestOverlay) before fading back in.
  overlay.style.display = '';
  overlay.classList.add('show');
  digestOverlayStart = Date.now();
  overlay._readyPromise = imgEl.complete
    ? Promise.resolve()
    : new Promise(resolve => {
        imgEl.addEventListener('load', resolve, { once: true });
        imgEl.addEventListener('error', resolve, { once: true });
      });
}

// Waits out whatever's left of the minimum 3s (0 if it's already elapsed)
// AND makes sure the current gif has actually finished loading at least
// once — otherwise a cold cache (first-ever use, or a slow connection)
// could close the cover before anything ever rendered behind it — then
// hides the overlay. Always await this — that's what guarantees the 3s
// floor regardless of how fast/slow the real work behind it was.
async function hideDigestOverlay() {
  const overlay = document.getElementById('digest-overlay');
  const elapsed = Date.now() - (digestOverlayStart || Date.now());
  const remaining = Math.max(0, DIGEST_OVERLAY_MS - elapsed);
  await Promise.all([
    new Promise(resolve => setTimeout(resolve, remaining)),
    overlay && overlay._readyPromise ? overlay._readyPromise : Promise.resolve()
  ]);
  if (overlay) {
    overlay.classList.remove('show');
    // Belt-and-braces against a WebKit quirk where a fixed, backdrop-filter
    // element can keep intercepting taps for a moment after pointer-events
    // is switched to 'none', purely because it's still part of a blurred
    // compositing layer — this is what could make the app appear to stop
    // responding to any taps (not just workout ones) right after the cover
    // closes. Once the fade-out transition (.25s) finishes, fully remove it
    // from layout with display:none so there's nothing left to hit-test,
    // regardless of any browser-specific pointer-events timing quirk.
    setTimeout(() => {
      if (!overlay.classList.contains('show')) overlay.style.display = 'none';
    }, 260);
  }
  digestOverlayStart = null;
}

// ── AI THINKING BUTTON STATE ─────────────────────────────────────────────
// Call setBtnThinking(btn, true, 'Thinking…') when kicking off an AI call,
// and setBtnThinking(btn, false, 'Original label') in the finally block.
// Stores the button's original innerHTML so it's restored exactly, even
// if the idle label includes an emoji.
function setBtnThinking(btn, isThinking, idleLabel) {
  if (!btn) return;
  if (isThinking) {
    if (btn.dataset.thinkOrig === undefined) btn.dataset.thinkOrig = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('btn-thinking');
    btn.innerHTML = `<span class="think-label">${idleLabel}</span><span class="btn-thinking-dots"><span></span><span></span><span></span></span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove('btn-thinking');
    btn.innerHTML = idleLabel !== undefined ? idleLabel : (btn.dataset.thinkOrig || btn.innerHTML);
    delete btn.dataset.thinkOrig;
  }
}

// ── TOAST ──────────────────────────────────────────────────────────────────
function showToast(msg, duration) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration || 2200);
}

// ── CONFETTI — Gabi full-day celebration ────────────────────────────────────
let confettiActive = false;
let confettiShownDate = null;
function launchConfetti() {
  const today = todayStr();
  if (confettiActive || confettiShownDate === today) return;
  confettiShownDate = today;
  confettiActive = true;
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;max-width:480px;left:50%;transform:translateX(-50%)';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const COLORS = ['#6BA3C8','#C8863A','#7A9E7E','#E8D5B0','#C4614A','#9A9080'];
  const pieces = Array.from({length: 80}, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * canvas.height * 0.5,
    w: 6 + Math.random() * 8,
    h: 3 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 1.5,
    vy: 1.5 + Math.random() * 2.5,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.12,
    opacity: 0.85 + Math.random() * 0.15,
  }));

  let frame = 0;
  const TOTAL = 220;
  function draw() {
    if (frame > TOTAL) {
      canvas.remove();
      confettiActive = false;
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fadeAlpha = frame > TOTAL - 60 ? (TOTAL - frame) / 60 : 1;
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.vy += 0.04; // gravity
      ctx.save();
      ctx.globalAlpha = p.opacity * fadeAlpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

// Accepts plain numbers plus common real-world variants: trailing/leading
// "kg"/"Kg"/"KG" with or without a space, and comma as decimal separator
// (common on ES keyboards). Returns NaN for anything else, same as
// parseFloat would for garbage input — callers keep their existing
// `!kg || kg < min` validation unchanged.
function parseWeightInput(raw) {
  if (raw == null) return NaN;
  const cleaned = String(raw).trim().replace(/kg/gi, '').trim().replace(',', '.');
  return parseFloat(cleaned);
}
// Wired to onblur on weight-entry text inputs so "70kg"/"70 KG"/"70,5"
// visibly cleans up to a plain "70"/"70.5" the moment the person taps away,
// rather than silently parsing it correctly in the background while the
// field still shows the raw unit text.
function normalizeWeightField(inputEl) {
  if (!inputEl || inputEl.value.trim() === '') return;
  const kg = parseWeightInput(inputEl.value);
  if (!isNaN(kg)) inputEl.value = kg;
}

// ── WEIGHT LOGGING ────────────────────────────────────────────────────────
// Weight is now sourced ONLY from the weight log: the Mission form's weight
// field is read-only and just displays this. Logging a new weight is what
// updates the calorie target inputs — this is the deliberate "log your
// weight to update your targets" gate.
function getLatestWeight(person) {
  // Tie-break same-date entries by id (higher id = logged more recently) —
  // a defensive backstop in case a stale same-day doc ever slips back in,
  // so it can't outrank the entry actually logged last.
  const logs = (S.weightLog||[]).filter(w=>w.person===person).sort((a,b)=>b.date.localeCompare(a.date) || b.id-a.id);
  return logs.length ? logs[0].kg : (S.mission[person] && S.mission[person].weight) || null;
}

function logWeight(person) {
  const inp = document.getElementById((person==='gabi'?'g':'n')+'-weight-log');
  const kg = parseWeightInput(inp.value);
  if (!kg || kg < 20 || kg > 300) { showToast('Enter a valid weight'); return; }
  // Remove any existing entry for today + person. This only drops it from
  // the in-memory array — the old doc is still sitting in Firestore under
  // its own id (subcollection writes are additive, keyed by id; nothing
  // ever deletes a doc just because it fell out of S.weightLog). Left
  // alone, the next poll replaces S.weightLog wholesale with whatever
  // Firestore has, which brings that stale same-day doc right back —
  // same date as the new one, so the tie-broken sort can land it on top.
  // That's the "an earlier weight jumps back above the one I just logged"
  // bug. Fix: track the ids we're dropping and actually delete them too,
  // the same way deleteWeight() does.
  const staleIds = (S.weightLog||[])
    .filter(w => w.person===person && w.date===todayStr())
    .map(w => w.id);
  S.weightLog = (S.weightLog||[]).filter(w => !(w.person===person && w.date===todayStr()));
  S.weightLog.push({ id: Date.now(), person, date: todayStr(), kg });
  S.mission[person].weight = kg;
  inp.value = '';
  staleIds.forEach(id => _pendingDeleteWeightIds.add(id));
  if (S.usingSubcollections && window.__firebaseSync) {
    const { db, collection, doc, deleteDoc } = window.__firebaseSync;
    staleIds.forEach(id => {
      deleteDoc(doc(collection(db, 'la-salud', 'sharedData', 'weightLog'), String(id)))
        .catch(err => console.error('[sync] logWeight: failed to delete superseded same-day entry', id, err));
    });
  }
  save();
  renderWeightHistories();
  const weightEl = document.getElementById((person==='gabi'?'g':'n')+'-weight');
  if (weightEl) weightEl.value = kg;
  renderActivityControls(person);
  renderProgress(); // weight trend chart — was never refreshed here, so a logged weight wouldn't show on the Progress chart until you navigated away and back
  showToast('Weight logged');
}

function deleteWeight(id) {
  if (!_requireOnlineForDelete()) return;

  // Remove from local state first so the UI updates immediately.
  S.weightLog = (S.weightLog||[]).filter(w => w.id !== id);
  _pendingDeleteWeightIds.add(id);

  if (S.usingSubcollections && window.__firebaseSync) {
    // Use deleteDoc synchronously from the already-loaded Firebase module.
    const { db, collection, doc, deleteDoc } = window.__firebaseSync;
    deleteDoc(doc(collection(db, 'la-salud', 'sharedData', 'weightLog'), String(id)))
      .catch(err => console.error('[sync] deleteWeight failed', id, err));

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_stateForStorage())); } catch(e) {}
    pushToCloud();
  } else {
    save();
  }

  renderWeightHistories();
  renderProgress();
}

function renderWeightHistories() {
  ['gabi','nacho'].forEach(person => {
    const prefix = person==='gabi'?'g':'n';
    const el = document.getElementById(prefix+'-weight-history');
    if (!el) return;
    const logs = (S.weightLog||[]).filter(w=>w.person===person)
      .sort((a,b)=>b.date.localeCompare(a.date) || b.id-a.id).slice(0,8);
    if (!logs.length) { el.innerHTML='<div style="font-size:12px;color:var(--mist);padding:6px 0">No weight entries yet.</div>'; return; }
    // Mini trend
    const first = logs[logs.length-1].kg, last = logs[0].kg;
    const delta = (last - first).toFixed(1);
    const deltaColor = delta < 0 ? 'var(--sage)' : delta > 0 ? 'var(--terra)' : 'var(--mist)';
    const trendHtml = logs.length > 1
      ? `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${deltaColor};margin-bottom:8px">${delta>0?'+':''}${delta} kg since first entry</div>`
      : '';
    el.innerHTML = trendHtml + logs.map(w=>`
      <div class="weight-hist-item">
        <span class="weight-hist-date">${w.date}</span>
        <span class="weight-hist-val">${w.kg} kg</span>
        <button class="weight-hist-del" onclick="deleteWeight(${w.id})">×</button>
      </div>`).join('');
  });
}


// ───────────────────── ANIMATION (from anim.js) — LOG FAB OVERLAY ──────────
// ════════════════════════════════════════════════════════════════════════
// ANIM.JS — all JS-driven animation logic lives here, in one place.
// Pairs with anim.css, which holds the keyframes these functions key off.
// Loaded after ui.js (so setPerson/togglePerson/showSec already exist) and
// after the bottom nav markup is in the DOM.
//
// Sections:
//   1. Sky canvas — background gradient + stars, person-switch crossfade
//   2. Person switch orchestration — patches togglePerson() to drive the
//      #sec-stage slide (anim.css) in sync with the sky crossfade
//   3. Log FAB overlay — expanding circle spawned on tapping "+"
// ════════════════════════════════════════════════════════════════════════

// ── 1. SKY CANVAS ──────────────────────────────────────────────────────────
(function initSky() {
  const canvas = document.getElementById('sky-canvas');
  if (!canvas) return;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const ctx  = canvas.getContext('2d');

  // Gabi: deep night blue, faint cool moonlight glow top-right
  // Nacho: deep dark brown, faint warm amber glow top-right
  const THEMES = {
    gabi: {
      // 24 stops: deep night navy, very subtle lightening toward bottom
      bg: [
        '#07090f','#07091100','#08091200','#080a1300',
        '#080a1400','#090b1500','#090b1600','#090c1700',
        '#090c1800','#0a0d1900','#0a0d1a00','#0a0e1b00',
        '#0a0e1c00','#0b0f1d00','#0b0f1d00','#0b101e00',
        '#0c101f00','#0c112000','#0c112100','#0d122200',
        '#0d122200','#0d132300','#0e132400','#0e1424',
      ].map(c => c.replace(/00$/, '')),  // strip accidental zeros
      glow:      [80, 125, 175],
      glowAlpha: 0.32,
    },
    nacho: {
      // 24 stops: very deep warm dark brown, barely perceptible warmth
      bg: [
        '#0c0906','#0d0a07','#0e0a07','#0f0b08',
        '#0f0b08','#100c09','#110c09','#110d0a',
        '#120d0a','#120e0b','#130e0b','#130f0c',
        '#140f0c','#14100d','#15100d','#15110e',
        '#16110e','#16120f','#17120f','#171310',
        '#181310','#181411','#191411','#1a1512',
      ],
      glow:      [200, 138, 60],
      glowAlpha: 0.30,
    },
  };

  let currentPerson = 'gabi';

  // ── STARS — generated once, stable positions, Gabi only ──────────────────
  let STARS = [];
  function buildStars() {
    const W = canvas.width  / DPR;
    const H = canvas.height / DPR;
    STARS = [];
    const N = 82;
    let seed = 0x4f1bb3d2;
    function rnd() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
    for (let i = 0; i < N; i++) {
      const x = rnd() * W;
      const yNorm = Math.pow(rnd(), 2.2);
      const y = yNorm * H * 0.78;
      const r = 0.4 + rnd() * 0.85;
      const baseAlpha = (0.18 + rnd() * 0.42) * (1 - yNorm * 0.6);
      const phase = rnd() * Math.PI * 2;
      const speed = (0.35 + rnd() * 0.7) * (Math.PI * 2) / (3 + rnd() * 6);
      STARS.push({ x, y, r, baseAlpha, phase, speed });
    }
    STARS.push({
      x: W * 0.52, y: H * 0.28, r: 0.8, baseAlpha: 0.72,
      phase: 1.2, speed: (Math.PI * 2) / 11, northStar: true,
    });
  }

  function resize() {
    canvas.width  = window.innerWidth  * DPR;
    canvas.height = window.innerHeight * DPR;
    buildStars();
  }
  window.addEventListener('resize', () => { resize(); drawStatic(currentPerson); });
  resize();

  function drawDawn(alpha) {
    const W = canvas.width  / DPR;
    const H = canvas.height / DPR;
    ctx.save();
    ctx.globalAlpha = alpha * 0.38;
    const dawn = ctx.createLinearGradient(0, H * 0.72, 0, H);
    dawn.addColorStop(0,   'rgba(0,0,0,0)');
    dawn.addColorStop(0.55,'rgba(58,32,52,0.18)');
    dawn.addColorStop(0.80,'rgba(88,46,68,0.28)');
    dawn.addColorStop(1.0, 'rgba(110,58,72,0.22)');
    ctx.fillStyle = dawn;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.restore();
  }

  function drawStars(alpha, t) {
    if (alpha <= 0) return;
    ctx.save();
    for (const s of STARS) {
      const flicker = 0.65 + 0.22 * Math.sin(s.phase + t * s.speed)
                           + 0.13 * Math.sin(s.phase * 1.7 + t * s.speed * 1.6);
      const a = s.baseAlpha * flicker * alpha;
      if (a <= 0.01) continue;

      if (s.northStar) {
        const spikeLen = 8 + 2 * Math.sin(s.phase + t * s.speed);
        const spikeA = a * 0.19;
        [[1,0],[0,1]].forEach(([dx, dy]) => {
          const sg = ctx.createLinearGradient(
            s.x - dx*spikeLen, s.y - dy*spikeLen,
            s.x + dx*spikeLen, s.y + dy*spikeLen
          );
          sg.addColorStop(0,    'rgba(170,200,255,0)');
          sg.addColorStop(0.38, `rgba(185,215,255,${(spikeA*0.5).toFixed(3)})`);
          sg.addColorStop(0.5,  `rgba(200,225,255,${spikeA.toFixed(3)})`);
          sg.addColorStop(0.62, `rgba(185,215,255,${(spikeA*0.5).toFixed(3)})`);
          sg.addColorStop(1,    'rgba(170,200,255,0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = sg;
          const hw = dx ? spikeLen : 0.8;
          const hh = dy ? spikeLen : 0.8;
          ctx.fillRect(s.x - hw, s.y - hh, hw*2, hh*2);
        });

        const haloR = 7 + 1.5 * Math.sin(s.phase + t * s.speed);
        const halo = ctx.createRadialGradient(s.x, s.y, s.r * 1.2, s.x, s.y, haloR);
        halo.addColorStop(0,   `rgba(190,215,255,${(a * 0.15).toFixed(3)})`);
        halo.addColorStop(1,   'rgba(160,195,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(s.x, s.y, haloR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  let starAlpha = 1;
  let starTick  = null;

  function startStarLoop() {
    if (starTick) return;
    let loopStart = null;
    function loop(ts) {
      if (!loopStart) loopStart = ts;
      const t = (ts - loopStart) / 1000;
      if (starAlpha <= 0) { starTick = null; return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(DPR, DPR);
      drawBg(currentPerson, 1);
      drawGlow(currentPerson, 1, 0);
      if (starAlpha > 0) {
        drawDawn(starAlpha);
        drawStars(starAlpha, t);
      }
      ctx.restore();
      starTick = requestAnimationFrame(loop);
    }
    starTick = requestAnimationFrame(loop);
  }

  function stopStarLoop() {
    if (starTick) { cancelAnimationFrame(starTick); starTick = null; }
  }

  function drawBg(person, alpha) {
    const th = THEMES[person];
    const W  = canvas.width / DPR;
    const H  = canvas.height / DPR;
    ctx.save();
    ctx.globalAlpha = alpha;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    const stops = [
      [0.00, th.bg[0]],  [0.04, th.bg[1]],  [0.08, th.bg[2]],
      [0.12, th.bg[3]],  [0.17, th.bg[4]],  [0.22, th.bg[5]],
      [0.27, th.bg[6]],  [0.32, th.bg[7]],  [0.37, th.bg[8]],
      [0.42, th.bg[9]],  [0.47, th.bg[10]], [0.52, th.bg[11]],
      [0.57, th.bg[12]], [0.62, th.bg[13]], [0.67, th.bg[14]],
      [0.72, th.bg[15]], [0.77, th.bg[16]], [0.82, th.bg[17]],
      [0.87, th.bg[18]], [0.91, th.bg[19]], [0.94, th.bg[20]],
      [0.97, th.bg[21]], [0.99, th.bg[22]], [1.00, th.bg[23]],
    ];
    stops.forEach(([s, c]) => bg.addColorStop(s, c));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawGlow(person, alpha, yOffset) {
    const th = THEMES[person];
    const W  = canvas.width / DPR;
    const H  = canvas.height / DPR;
    const oy = yOffset || 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    const [r, g, b] = th.glow;
    const cx     = W  * 1.35;
    const cy     = oy + H * 0.28;
    const radius = H  * 1.3;
    const glow   = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    [[0.00,1.00],[0.06,0.95],[0.12,0.86],[0.20,0.72],[0.28,0.56],
     [0.38,0.38],[0.48,0.22],[0.58,0.12],[0.68,0.06],[0.78,0.02],
     [0.90,0.005],[1.00,0]
    ].forEach(([s, a]) => {
      glow.addColorStop(s, `rgba(${r},${g},${b},${(th.glowAlpha * a).toFixed(4)})`);
    });
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawStatic(person) {
    stopStarLoop();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(DPR, DPR);
    drawBg(person, 1);
    drawGlow(person, 1, 0);
    if (person === 'gabi') {
      starAlpha = 1;
      drawDawn(1);
      drawStars(1, 0);
      startStarLoop();
    } else {
      starAlpha = 0;
    }
    ctx.restore();
  }

  window._skyDrawStatic = function(person) {
    currentPerson = person;
    drawStatic(person);
  };

  // Animate:
  //   Background — pure crossfade, both anchored at y=0, no slide.
  //   Glow ball  — outgoing slides UP off screen, incoming rises from below.
  //   Stars/dawn — fade in when arriving at Gabi, fade out when leaving.
  window.animateSkySwitch = function(outPerson, inPerson) {
    stopStarLoop();
    currentPerson = inPerson;
    const DURATION = 1050;
    let start = null;
    let loopT = 0;
    let lastTs = null;
    function frame(ts) {
      if (!start) { start = ts; lastTs = ts; }
      const dt = (ts - lastTs) / 1000;
      loopT += dt;
      lastTs = ts;
      const p    = Math.min((ts - start) / DURATION, 1);
      const ease = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(DPR, DPR);

      const H = canvas.height / DPR;

      drawBg(outPerson, 1 - ease);
      drawBg(inPerson,  ease);

      const outGlowY = -ease * H;
      const inGlowY  = H * (1 - ease);
      drawGlow(outPerson, 1 - ease, outGlowY);
      drawGlow(inPerson,  ease,     inGlowY);

      if (outPerson === 'gabi') {
        starAlpha = 1 - ease;
        drawDawn(starAlpha);
        drawStars(starAlpha, loopT);
      } else if (inPerson === 'gabi') {
        starAlpha = ease;
        drawDawn(starAlpha);
        drawStars(starAlpha, loopT);
      }

      ctx.restore();

      if (p < 1) requestAnimationFrame(frame);
      else drawStatic(inPerson);
    }
    requestAnimationFrame(frame);
  };

  window.addEventListener('load', () => {
    currentPerson = (window.S && S.currentPerson) || 'gabi';
    starAlpha = currentPerson === 'gabi' ? 1 : 0;
    drawStatic(currentPerson);
  });
})();

// ── 2. PERSON SWITCH ORCHESTRATION ───────────────────────────────────────
// Patches togglePerson() (originally defined in ui.js as a thin wrapper
// around setPerson()) so that toggling also drives the sky crossfade above
// and the #sec-stage slide-out/slide-in (keyframes in anim.css). The
// underlying setPerson() data-swap logic in ui.js is untouched — we only
// wrap the toggle entry point, not the state-setting function itself.
(function patchTogglePerson() {
  const _original = window.setPerson;
  if (!_original) return;

  let switching = false;

  window.togglePerson = function() {
    if (switching) return;
    switching = true;

    const outPerson = S.currentPerson || 'gabi';
    const inPerson  = outPerson === 'gabi' ? 'nacho' : 'gabi';
    const stage     = document.getElementById('sec-stage');

    // Sky crossfades
    if (window.animateSkySwitch) window.animateSkySwitch(outPerson, inPerson);

    function removeClasses() {
      if (stage) stage.classList.remove('person-slide-out', 'person-slide-in');
    }
    function unlock() {
      removeClasses();
      switching = false;
    }
    const safetyTimer = setTimeout(unlock, 1200);

    if (stage) {
      removeClasses();
      void stage.offsetWidth;
      stage.classList.add('person-slide-out');
    }

    setTimeout(() => {
      _original(inPerson);
      if (stage) {
        stage.classList.remove('person-slide-out');
        void stage.offsetWidth;
        stage.classList.add('person-slide-in');
        stage.addEventListener('animationend', () => {
          clearTimeout(safetyTimer);
          unlock();
        }, { once: true });
      } else {
        clearTimeout(safetyTimer);
        unlock();
      }
    }, 480);
  };
})();

// ── 3. LOG FAB OVERLAY ───────────────────────────────────────────────────
// Tapping the "+" (Log tab) spawns a plain circle overlay (NOT the SVG
// icon itself) that expands while fading out on its own timeline (anim.css)
// — so it visibly "fills" partway before dissolving.
//
// Why a capture-phase listener instead of editing showSec()/onclick: the
// bottom-nav "+" button's existing onclick="showSec('log',this)" (set in
// index.html) is left completely untouched. We attach our own listener on
// the SAME element in the CAPTURE phase, which always runs first
// regardless of listener order, so this fires before showSec() does
// anything. We never call showSec() ourselves and never
// preventDefault/stopPropagation it — we just run alongside it. If this
// section is deleted, showSec() keeps working exactly as before (normal
// slide), nothing breaks.
(function initLogFabAnim() {
  function spawnLogFabOverlay(originEl) {
    if (!originEl) return;
    const rect = originEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Size the circle so its scale(1) state reaches roughly 65% of the
    // way to the farthest viewport edge — not the full diagonal. Combined
    // with the fade finishing before the expand (see anim.css), this
    // means the circle visibly dissolves before it would reach the edge
    // of the screen, instead of growing edge-to-edge while still opaque.
    const dx = Math.max(cx, window.innerWidth - cx);
    const dy = Math.max(cy, window.innerHeight - cy);
    const radius = Math.sqrt(dx * dx + dy * dy) * 0.65;
    const diameter = radius * 2;

    let overlay = document.getElementById('log-fab-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'log-fab-overlay';
    overlay.style.left = cx + 'px';
    overlay.style.top = cy + 'px';
    overlay.style.width = diameter + 'px';
    overlay.style.height = diameter + 'px';
    document.body.appendChild(overlay);

    void overlay.offsetWidth;
    overlay.classList.add('log-fab-run');

    overlay.addEventListener('animationend', () => {
      overlay.remove();
    }, { once: false });
    setTimeout(() => { if (overlay && overlay.parentNode) overlay.remove(); }, 1200);
  }

  function init() {
    const logTab = document.querySelector('.bnav-tab[onclick*="showSec(\'log\'"]');
    if (!logTab) return;
    logTab.addEventListener('click', () => {
      const secLog = document.getElementById('sec-log');
      if (secLog && secLog.classList.contains('active')) return;
      spawnLogFabOverlay(logTab.querySelector('.bnav-log-icon') || logTab);
    }, { capture: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
