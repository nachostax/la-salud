// ════════════════════════════════════════════════════════════════════════
// WORKOUT.JS — the Workout interface (New Workout, Active Player, Tracking).
// Merged during file consolidation (July 2026) from: workout.js (New Workout
// tab / program enrollment), workout-player.js (full-screen active session
// player), workout-tracking.js (Tracking tab charts). Exercise/program DATA
// lives separately in workout-library.js (the Workout Library) — this file
// only renders/interacts with it.
// ════════════════════════════════════════════════════════════════════════

// ───────────────────── NEW WORKOUT tab (from workout.js) ───────────────────
// ── WORKOUT MODULE ────────────────────────────────────────────────────────
// Drives #sec-workout. Data comes from workout-library.js (EXERCISE_LIBRARY,
// WORKOUTS, PROGRAMS) — this file never hardcodes exercise
// names, phase labels, or week counts, it only reads them from there.
//
// Scope: only the "New Workout" sub-tab is functional (enroll in a program,
// quick-launch/advance the next session, or run the ad-hoc build wizard).
// Tracking / Workout Plan / Calisthenics are stub panels — see Layer 3 in
// the planning doc.
//
// State lives at S.workoutModule[person] — see state.js for shape/defaults.

const WORKOUT_PROGRAMS = PROGRAMS; // now reads every program the library defines

function wmState() {
  return S.workoutModule[S.currentPerson || 'gabi'];
}

function getWorkoutById(id) {
  const built = WORKOUTS.find(w => w.id === id);
  if (built) return built;
  return (wmState().customWorkouts || []).find(w => w.id === id);
}
function getAllWorkouts() {
  return WORKOUTS.concat(wmState().customWorkouts || []);
}
function getExerciseById(id)  { return EXERCISE_LIBRARY.find(e => e.id === id); }
function getProgramById(id)   { return WORKOUT_PROGRAMS.find(p => p.id === id); }

function woCap(s) {
  if (s === 'hiit') return 'HIIT';
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

const STYLE_OPTIONS = ['Strength', 'Mobility', 'HIIT', 'Cardio'];
const MUSCLE_OPTIONS = ['Push', 'Pull', 'Legs', 'Core', 'Full Body', 'Hybrid'];
const EQUIPMENT_OPTIONS = ['Gym', 'No Equipment', 'Outdoor Park'];
// Category tiles shown on the home grid when no search is active — one per
// STYLE_OPTIONS value except "Cardio" pairs with a running photo since that's
// the dominant cardio activity in this library (zone2/interval runs, Cooper test).
const WORKOUT_CATEGORY_TILES = [
  { style: 'Strength', label: 'Strength', img: 'https://raw.githubusercontent.com/nachostax/la-salud2/main/STRENGHT-TRAINING.jpg' },
  { style: 'Mobility', label: 'Mobility', img: 'https://raw.githubusercontent.com/nachostax/la-salud2/main/STRETCHING-PIC.jpg' },
  { style: 'HIIT', label: 'HIIT', img: 'https://raw.githubusercontent.com/nachostax/la-salud2/main/HIIT-PIC.jpg' },
  { style: 'Cardio', label: 'Cardio', img: 'https://raw.githubusercontent.com/nachostax/la-salud2/main/RUNNINGWORKOUT.jpg' },
];
const MUSCLE_GROUP_ORDER = ['Push', 'Pull', 'Legs', 'Core', 'Full Body', 'Hybrid'];

// ── EXERCISE LIBRARY BROWSE — filter option sets ────────────────────────
// Movement pattern reuses the exercise's own `category` field (push/pull/
// legs/core/mobility) — same vocabulary as the workout-level Muscle
// filter above, so the two lists feel consistent.
// Equipment reuses the exercise's own `equipment` field directly.
// Muscle Group is NOT a raw field on the exercise — `muscles` is a granular
// list (28 distinct values: 'chest_upper', 'lats', 'rear_delts', etc.)
// that's too fine-grained for a quick filter, so it's collapsed into 8
// broad groups via MUSCLE_GROUP_MAP below.
const EXERCISE_MOVEMENT_OPTIONS = ['Push', 'Pull', 'Legs', 'Core', 'Mobility'];
const EXERCISE_EQUIPMENT_OPTIONS = ['No Equipment', 'Free Weights', 'Free Bar', 'Kettlebell', 'Bench', 'Machine', 'Pull-Up Bar', 'Other'];
const EXERCISE_MUSCLE_OPTIONS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Full Body'];

const MUSCLE_GROUP_MAP = {
  chest: 'Chest', chest_lower: 'Chest', chest_upper: 'Chest',
  back: 'Back', back_lats: 'Back', back_lower: 'Back', back_mid: 'Back', lats: 'Back', upper_back: 'Back', lower_back: 'Back', traps: 'Back',
  shoulders: 'Shoulders', rear_delts: 'Shoulders', neck: 'Shoulders',
  biceps: 'Arms', triceps: 'Arms', forearms: 'Arms',
  quads: 'Legs', hamstrings: 'Legs', calves: 'Legs', adductors: 'Legs', hip_flexors: 'Legs', legs: 'Legs',
  glutes: 'Glutes',
  abs: 'Core', abs_lower: 'Core', obliques: 'Core', core: 'Core',
  full_body: 'Full Body'
};

function equipmentLabel(e) {
  return {
    no_equipment: 'No Equipment',
    free_weights: 'Free Weights',
    free_bar: 'Free Bar',
    kettlebell: 'Kettlebell',
    bench: 'Bench',
    machine: 'Machine',
    pull_up_bar: 'Pull-Up Bar',
    other: 'Other',
  }[e] || woCap(e);
}

// An exercise can need more than one piece of equipment at once (e.g. a
// barbell AND a bench) — ex.equipment is an array of tags, so this joins
// their labels for display, e.g. "Free Bar, Bench".
function equipmentLabels(tags) {
  return (tags || []).map(equipmentLabel).join(', ');
}

function getExerciseMuscleGroups(ex) {
  const groups = new Set();
  (ex.muscles || []).forEach(m => { const g = MUSCLE_GROUP_MAP[m]; if (g) groups.add(g); });
  return [...groups];
}

// ── WORKOUT TAGS (style / muscleGroup / equipment) ──────────────────────
// The workout model has no such fields — these are derived from the
// workout's actual exercises rather than hand-annotated, so they can't
// drift out of sync as workouts change:
//
// - style: a workout built almost entirely from single-set/zero-rest
//   entries (3+) reads as a continuous circuit regardless of what any one
//   exercise is individually tagged — that circuit *shape* is what "HIIT"
//   means here, and it correctly catches every explicitly-named HIIT/
//   complex/conditioning session in the data. Otherwise, whichever
//   exercise style has the most entries wins (ties favor 'strength').
// - muscleGroup: from the distinct exercise categories touched — all 4
//   (push/pull/legs/core) = Full Body, 2-3 = Hybrid, 1 = that category.
// - equipment: any exercise needing free weights/a bar/kettlebell/bench/
//   machine makes the whole session "Gym"; otherwise an explicit
//   "_outdoor" id marks the known outdoor-park variants, else it defaults
//   to "No Equipment". Pull-up-bar-only exercises deliberately don't
//   trigger "Gym" on their own, since a pull-up bar is also commonly
//   found at outdoor parks — only the ids explicitly modeled as outdoor
//   variants get that tag.
function getWorkoutStyle(w) {
  const counts = {};
  let circuitCount = 0;
  let barbellCount = 0;
  let scored = 0;
  w.entries.forEach(e => {
    const ex = getExerciseById(e.exerciseId);
    if (!ex) return;
    scored++;
    counts[ex.style] = (counts[ex.style] || 0) + 1;
    if (e.type === 'set' && e.sets === 1 && e.restSeconds === 0) circuitCount++;
    if ((ex.equipment || []).some(t => GYM_EQUIPMENT_TAGS.includes(t))) barbellCount++;
  });
  // A continuous, no-rest structure only reads as "HIIT" in character when
  // it isn't mostly barbell/loaded work — a 4-round barbell complex has
  // zero rest between lifts too, but moving a loaded bar is still a
  // strength activity, not a conditioning one.
  const barbellDominant = scored > 0 && barbellCount > scored / 2;
  if (circuitCount >= 3 && !barbellDominant) return 'HIIT';
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return woCap(top ? top[0] : 'strength');
}
function getWorkoutMuscleGroup(w) {
  const cats = new Set();
  w.entries.forEach(e => { const ex = getExerciseById(e.exerciseId); if (ex) cats.add(ex.category); });
  if (cats.size >= 4) return 'Full Body';
  if (cats.size >= 2) return 'Hybrid';
  const c = [...cats][0];
  return c ? woCap(c) : 'Full Body';
}
const GYM_EQUIPMENT_TAGS = ['free_weights', 'free_bar', 'kettlebell', 'bench', 'machine'];
function getWorkoutEquipment(w) {
  const equips = new Set();
  w.entries.forEach(e => {
    const ex = getExerciseById(e.exerciseId);
    if (ex) (ex.equipment || []).forEach(t => equips.add(t));
  });
  if (GYM_EQUIPMENT_TAGS.some(t => equips.has(t))) return 'Gym';
  if (/outdoor/i.test(w.id)) return 'Outdoor Park';
  return 'No Equipment';
}
function getWorkoutTags(w) {
  return { style: getWorkoutStyle(w), muscleGroup: getWorkoutMuscleGroup(w), equipment: getWorkoutEquipment(w) };
}

// Flattens a program's weeks into an ordered list of session "slots", one
// per training day. A slot can carry more than one workoutId when a day
// has interchangeable variants (e.g. week 9/10's outdoor/home finisher) —
// detected from a shared "_d<N>" day-number token in the ids. Entries with
// no such token (e.g. Barra Libre's 'bl1_sesionA') are never merged with
// each other even if the exact same id repeats within a week (it can
// legitimately repeat — same session template on Monday AND Wednesday —
// and each occurrence must stay its own day).
function buildProgramSlots(program) {
  const slots = [];
  program.weeks.forEach(group => {
    const byDay = {};
    const dayOrder = [];
    group.workoutIds.forEach((id, idx) => {
      const m = id.match(/_d(\d+)(?:_|$)/);
      const day = m ? m[1] : ('_idx' + idx);
      if (!byDay[day]) { byDay[day] = []; dayOrder.push(day); }
      byDay[day].push(id);
    });
    group.weekNumbers.forEach(weekNumber => {
      dayOrder.forEach(day => slots.push({ weekNumber, workoutIds: byDay[day] }));
    });
  });
  return slots;
}

// Positions the sliding underline under the active .wo-tab-opt.
// Mirrors positionPeriodIndicator() in progress.js — same pattern, own
// namespace since this is a different tab-switcher, not a period picker.
function positionWorkoutTabIndicator() {
  const bar = document.getElementById('wo-tab-bar');
  const ind = document.getElementById('wo-tab-indicator');
  const active = bar && bar.querySelector('.wo-tab-opt.active');
  if (!bar || !ind || !active) return;
  const barRect = bar.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  ind.style.width = activeRect.width + 'px';
  ind.style.transform = 'translateX(' + (activeRect.left - barRect.left) + 'px)';
}

// ── MAIN RENDER ──────────────────────────────────────────────────────────
function renderWorkoutHome() {
  const wm = wmState();
  document.querySelectorAll('.wo-tab-opt').forEach(o => {
    o.classList.toggle('active', o.dataset.tab === wm.subTab);
  });

  const body = document.getElementById('wo-panel-body');
  if (!body) { requestAnimationFrame(positionWorkoutTabIndicator); return; }

  if (wm.subTab === 'new') {
    _woSearchFocused = false;
    body.innerHTML = renderNewWorkoutPanel();
    requestAnimationFrame(positionWorkoutTabIndicator);
    return;
  }

  if (wm.subTab === 'tracking') {
    body.innerHTML = renderWorkoutTrackingPanel();
    requestAnimationFrame(positionWorkoutTabIndicator);
    return;
  }

  if (wm.subTab === 'plan') {
    body.innerHTML = renderProgramPanel();
    requestAnimationFrame(positionWorkoutTabIndicator);
    return;
  }

  const meta = {
    calisthenics: { icon: '🤸', title: 'Calisthenics', copy: 'Skill-quest tracks for handstand push-up, front lever, planche, and friends — one slot at a time, once this is built.' }
  }[wm.subTab];

  body.innerHTML = `
    <div class="tab-lock-box" style="margin:32px auto 0">
      <div class="tab-lock-icon">${meta.icon}</div>
      <div class="tab-lock-title">${meta.title}</div>
      <div class="tab-lock-body">${meta.copy}</div>
      <div class="tab-lock-hint">Coming soon</div>
    </div>`;
  requestAnimationFrame(positionWorkoutTabIndicator);
}

function setWorkoutSubTab(tab) {
  wmState().subTab = tab;
  save();
  renderWorkoutHome();
}

// ── WORKOUT TAB ───────────────────────────────────────────────────────────
// "I want to train right now." Structure: hero (only if enrolled in a
// program) → search (always visible) → filters (Style/Muscle/Equipment,
// multi-select) → the full workout library, alphabetical, filtered live.
// Tapping any row launches that workout directly — this replaces the old
// Source/Style/Focus wizard entirely, since search+filter+list gets to
// any workout in fewer taps than a multi-step picker did.
// Single unified list — no more Workouts/Exercises/YouTube segmented
// control. YouTube workouts live in the same list as everyone else and
// are distinguished only by a small badge (see renderWorkoutListRows).
// "Create Workout" replaces the old Exercises-tab-select flow entirely —
// see the CREATE WORKOUT PAGE section below.
function renderNewWorkoutPanel() {
  const wm = wmState();
  return `
    <div class="wo-create-row">
      <button class="btn btn-quicklog wo-add-workout-btn" onclick="openCreateWorkoutPage()">+ Add Workout</button>
      <button class="btn btn-secondary wo-add-workout-btn" onclick="openOnTheFlyPlayer()">Start Workout</button>
    </div>
    <div id="wo-hero-wrap">${renderWorkoutHero(wm)}</div>
    <input class="wo-search-input" id="wo-search-input" type="text" placeholder="🔍 Search workouts..."
      value="${escapeHtml(wm.browse.search)}" oninput="onWorkoutSearchInput(this.value)"
      onfocus="onWorkoutSearchFocus()" onkeydown="if(event.key==='Enter'){this.blur();}">
    <div id="wo-browse-body">${renderWorkoutBrowseBody(wm)}</div>
  `;
}

// Three states: no search + no category → picture grid; no search + a
// category picked → that category's workouts grouped by muscle group;
// search has text → the old flat filtered list, with Style/Muscle/Equipment
// filters now visible (they only apply once you're actually searching).
function renderWorkoutBrowseBody(wm) {
  const searchActive = _woSearchFocused || wm.browse.search.trim().length > 0;
  if (!searchActive && !wm.browse.categorySelected) return renderWorkoutCategoryGrid();
  if (!searchActive && wm.browse.categorySelected) return renderWorkoutCategoryList(wm);
  return `
    <div id="wo-filter-row-wrap">${renderFilterRow(wm)}</div>
    <div id="wo-list-body">${renderWorkoutListRows(wm)}</div>
  `;
}

function renderWorkoutCategoryGrid() {
  return `
    <div class="wo-category-grid">
      ${WORKOUT_CATEGORY_TILES.map(c => `
        <div class="wo-category-tile" onclick="selectWorkoutCategory('${c.style}')">
          <img src="${c.img}" alt="${c.label}" loading="lazy">
          <div class="wo-category-tile-fade"></div>
          <div class="wo-category-tile-label">${c.label}</div>
        </div>`).join('')}
    </div>`;
}

function selectWorkoutCategory(style) {
  const wm = wmState();
  wm.browse.categorySelected = style;
  save();
  const body = document.getElementById('wo-browse-body');
  if (body) body.innerHTML = renderWorkoutBrowseBody(wm);
}

function clearWorkoutCategory() {
  const wm = wmState();
  wm.browse.categorySelected = null;
  save();
  const body = document.getElementById('wo-browse-body');
  if (body) body.innerHTML = renderWorkoutBrowseBody(wm);
}

function renderWorkoutCategoryList(wm) {
  const style = wm.browse.categorySelected;
  const isCustom = new Set((wm.customWorkouts || []).map(w => w.id));
  const items = getAllWorkouts()
    .filter(w => w.standalone !== false)
    .map(w => ({ w, tags: getWorkoutTags(w) }))
    .filter(({ tags }) => tags.style === style);

  const groups = {};
  items.forEach(item => {
    const g = item.tags.muscleGroup;
    (groups[g] || (groups[g] = [])).push(item);
  });

  const sections = MUSCLE_GROUP_ORDER
    .filter(g => groups[g] && groups[g].length)
    .map(g => `
      <div class="wo-category-section">
        <div class="wo-category-section-title">${g}</div>
        ${groups[g].sort((a, b) => a.w.name.localeCompare(b.w.name))
          .map(({ w, tags }) => renderWorkoutListRow(w, tags, isCustom)).join('')}
      </div>`).join('');

  return `
    <div class="wo-category-back" onclick="clearWorkoutCategory()">‹ All Categories</div>
    ${sections || `<div class="wo-quick-meta" style="text-align:center;margin-top:20px">No ${escapeHtml(style.toLowerCase())} workouts yet.</div>`}
  `;
}

// ── YouTube add form (inline toggle, replaces the old standalone tab) ──
function toggleYoutubeAddForm() {
  const wm = wmState();
  wm.browse.showYtAdd = !wm.browse.showYtAdd;
  save();
  const el = document.getElementById('wo-yt-add-wrap');
  if (el) el.innerHTML = wm.browse.showYtAdd ? renderYoutubeAddForm() : '';
  const btn = document.querySelector('.wo-yt-add-toggle');
  if (btn) btn.classList.toggle('active', wm.browse.showYtAdd);
}

function renderYoutubeAddForm() {
  return `
    <div class="wo-yt-add-form" style="margin-bottom:12px">
      <input class="wo-search-input" id="wo-yt-title" type="text" placeholder="Title (e.g. 20min Mobility Flow)" style="margin-bottom:8px">
      <input class="wo-search-input" id="wo-yt-url" type="text" placeholder="Paste YouTube URL..." style="margin-bottom:0">
      <button class="btn btn-quicklog" style="margin-top:8px" onclick="addYoutubeVideo()">Add to Library</button>
    </div>`;
}

function renderWorkoutHero(wm) {
  if (wm.liveSession) {
    return `
      <div class="wo-quick-card" style="text-align:center">
        <div class="wo-quick-label">Workout in progress</div>
        <div class="wo-quick-meta">${wm.liveSession.workoutName}</div>
        <button class="btn btn-quicklog" onclick="resumeWorkoutPlayer()">Resume →</button>
        <div class="wo-quick-hint" style="cursor:pointer;text-decoration:underline" onclick="abandonWorkoutSession()">Discard this session</div>
      </div>`;
  }

  if (!wm.activePlanId) return '';
  const program = getProgramById(wm.activePlanId);
  if (!program) return '';

  const slots = buildProgramSlots(program);
  const idx = Math.min(wm.currentSlotIndex || 0, slots.length);
  if (idx >= slots.length) return ''; // Program tab shows the "complete" state

  const slot = slots[idx];
  const isVariant = slot.workoutIds.length > 1;
  const primary = getWorkoutById(slot.workoutIds[0]);
  const tags = primary ? getWorkoutTags(primary) : null;
  const dayName = (primary ? primary.name.split('—')[0] : slot.workoutIds[0]).trim();

  const actionHtml = isVariant
    ? `<div class="wo-variant-row">
         ${slot.workoutIds.map(wid => {
           const w = getWorkoutById(wid);
           const label = /outdoor/i.test(wid) ? 'Outdoor' : /home/i.test(wid) ? 'Home' : (w ? w.name : wid);
           return `<button class="btn btn-quicklog" onclick="openWorkoutPlayer('${wid}', true)">${label}</button>`;
         }).join('')}
       </div>`
    : `<button class="btn btn-quicklog" onclick="openWorkoutPlayer('${slot.workoutIds[0]}', true)">Start Next Workout →</button>`;

  return `
    <div class="wo-hero-card">
      <div class="wo-hero-eyebrow">Next Program Workout</div>
      <div class="wo-hero-program">${program.name}</div>
      <div class="wo-hero-day" onclick="openWorkoutPreview('${slot.workoutIds[0]}', ${!isVariant})" style="cursor:pointer;text-decoration:underline">${dayName}</div>
      ${actionHtml}
      ${tags ? `<div class="wo-tag-row">
        <span class="wo-tag">${tags.style}</span><span class="wo-tag-sep">|</span>
        <span class="wo-tag">${tags.muscleGroup}</span><span class="wo-tag-sep">|</span>
        <span class="wo-tag">${tags.equipment}</span>
      </div>` : ''}
    </div>`;
}

// ── Search ──
// Only rewrites #wo-list-body, never the input itself, so typing doesn't
// lose focus/cursor position on every keystroke.
// Tapping into the bar reveals the list/filters immediately, same as typing
// does — no need to type a character first.
function onWorkoutSearchFocus() {
  if (_woSearchFocused) return;
  _woSearchFocused = true;
  const wm = wmState();
  if (wm.browse.search.trim() || wm.browse.categorySelected) return; // already showing list/category mode
  const body = document.getElementById('wo-browse-body');
  if (body) body.innerHTML = renderWorkoutBrowseBody(wm);
}

function onWorkoutSearchInput(val) {
  const wm = wmState();
  const wasActive = wm.browse.search.trim().length > 0;
  wm.browse.search = val;
  save();
  const nowActive = wm.browse.search.trim().length > 0;
  if (wasActive !== nowActive) {
    // Crossing the empty <-> non-empty boundary swaps grid <-> filtered
    // list, so the whole body needs replacing (not just the row list).
    const body = document.getElementById('wo-browse-body');
    if (body) body.innerHTML = renderWorkoutBrowseBody(wm);
  } else if (nowActive) {
    const list = document.getElementById('wo-list-body');
    if (list) list.innerHTML = renderWorkoutListRows(wm);
  }
}

// ── Filters (regular buttons, not pills — each opens a multi-select checklist) ──
function renderFilterRow(wm) {
  const groups = [
    { key: 'style', label: 'Style', options: STYLE_OPTIONS },
    { key: 'muscle', label: 'Muscle', options: MUSCLE_OPTIONS },
    { key: 'equipment', label: 'Equipment', options: EQUIPMENT_OPTIONS }
  ];
  return `
    <div class="wo-filter-row">
      ${groups.map(g => {
        const sel = wm.browse[g.key + 'Filter'];
        const open = wm.browse.openFilter === g.key;
        return `
          <div class="wo-filter-col">
            <button class="wo-filter-btn ${sel.length ? 'active' : ''}" onclick="toggleFilterDropdown('${g.key}')">
              ${g.label}${sel.length ? ' (' + sel.length + ')' : ''} ${open ? '▲' : '▼'}
            </button>
            ${open ? renderFilterChecklist(g.key, g.options) : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function renderFilterChecklist(filterKey, options) {
  const wm = wmState();
  const selected = wm.browse[filterKey + 'Filter'];
  return `
    <div class="wo-filter-checklist">
      ${options.map(o => `
        <label class="wo-filter-check-row">
          <input type="checkbox" ${selected.includes(o) ? 'checked' : ''} onchange="toggleFilterValue('${filterKey}','${o}')">
          <span>${o}</span>
        </label>`).join('')}
    </div>`;
}

function toggleFilterDropdown(key) {
  const wm = wmState();
  wm.browse.openFilter = wm.browse.openFilter === key ? null : key;
  save();
  refreshFilterRow();
}

function toggleFilterValue(filterKey, value) {
  const wm = wmState();
  const arr = wm.browse[filterKey + 'Filter'];
  const i = arr.indexOf(value);
  if (i === -1) arr.push(value); else arr.splice(i, 1);
  wm.browse.openFilter = null; // collapse the checklist right after a pick
  save();
  refreshFilterRow();
  refreshWorkoutList();
}

function refreshFilterRow() {
  const el = document.getElementById('wo-filter-row-wrap');
  if (el) el.innerHTML = renderFilterRow(wmState());
}
function refreshWorkoutList() {
  const wm = wmState();
  const list = document.getElementById('wo-list-body');
  if (list) { list.innerHTML = renderWorkoutListRows(wm); return; }
  // Not in flat-list mode (grid or category-grouped view) — re-render
  // whichever of those is currently showing instead.
  const body = document.getElementById('wo-browse-body');
  if (body) body.innerHTML = renderWorkoutBrowseBody(wm);
}

// ── Workout library list ──
function workoutMatchesFilters(w, wm, tags) {
  const q = wm.browse.search.trim().toLowerCase();
  if (q && !w.name.toLowerCase().includes(q)) return false;
  if (wm.browse.styleFilter.length && !wm.browse.styleFilter.includes(tags.style)) return false;
  if (wm.browse.muscleFilter.length && !wm.browse.muscleFilter.includes(tags.muscleGroup)) return false;
  if (wm.browse.equipmentFilter.length && !wm.browse.equipmentFilter.includes(tags.equipment)) return false;
  return true;
}

// Merges built-in/custom workouts with the YouTube library into one
// alphabetical list. A YouTube entry has no style/muscle/equipment tags of
// its own, so it drops out of the list whenever any of those filters are
// active — search still applies to it (matched against its title).
function renderWorkoutListRows(wm) {
  const isCustom = new Set((wm.customWorkouts || []).map(w => w.id));
  const workoutItems = getAllWorkouts()
    .filter(w => w.standalone !== false)
    .map(w => ({ type: 'workout', w, tags: getWorkoutTags(w) }))
    .filter(({ w, tags }) => workoutMatchesFilters(w, wm, tags));

  const anyTagFilterActive = wm.browse.styleFilter.length || wm.browse.muscleFilter.length || wm.browse.equipmentFilter.length;
  const q = wm.browse.search.trim().toLowerCase();
  const ytItems = anyTagFilterActive ? [] : (S.youtubeWorkouts || [])
    .filter(v => !q || v.title.toLowerCase().includes(q))
    .map(v => ({ type: 'youtube', v }));

  const items = workoutItems.concat(ytItems).sort((a, b) => {
    const an = a.type === 'workout' ? a.w.name : a.v.title;
    const bn = b.type === 'workout' ? b.w.name : b.v.title;
    return an.localeCompare(bn);
  });

  if (items.length === 0) {
    return `<div class="wo-quick-meta" style="text-align:center;margin-top:20px">No workouts match.</div>`;
  }
  return items.map(item => {
    if (item.type === 'youtube') {
      const v = item.v;
      return `
      <div class="wo-list-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px" onclick="openYoutubeVideo('${v.url.replace(/'/g, "\\'")}')">
        <div style="min-width:0">
          <div class="wo-list-name">${escapeHtml(v.title)}</div>
          <div class="wo-list-meta">YouTube</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${renderYoutubeBadge()}
          <span class="wo-yt-del" onclick="event.stopPropagation();deleteYoutubeVideo('${v.id}')">🗑</span>
        </div>
      </div>`;
    }
    return renderWorkoutListRow(item.w, item.tags, isCustom);
  }).join('');
}

function renderWorkoutListRow(w, tags, isCustom) {
  return `
    <div class="wo-list-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px" onclick="openWorkoutPreview('${w.id}', false)">
      <div style="min-width:0">
        <div class="wo-list-name">${w.name}${isCustom.has(w.id) ? ' <span class="wo-tag" style="margin-left:4px">Custom</span>' : ''}</div>
        <div class="wo-list-meta">${tags.style} • ${tags.muscleGroup} • ${tags.equipment}</div>
      </div>
      ${isCustom.has(w.id) ? `<span class="wo-yt-del" onclick="event.stopPropagation();deleteCustomWorkout('${w.id}')">🗑</span>` : ''}
    </div>`;
}

// Small YouTube "play" badge shown on the right of a YouTube workout row —
// a plain hand-drawn triangle-in-a-rounded-square, not the YouTube logo.
function renderYoutubeBadge() {
  return `<span class="wo-yt-badge" title="YouTube"><svg viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></span>`;
}

function deleteCustomWorkout(id) {
  if (!confirm('Delete this custom routine?')) return;
  const wm = wmState();
  wm.customWorkouts = (wm.customWorkouts || []).filter(w => w.id !== id);
  save();
  refreshWorkoutList();
}

// ── CREATE WORKOUT PAGE ──────────────────────────────────────────────────
// "I want to build my own workout from the exercise library." Full-screen
// page (not a popup) with the same overlay conventions as
// wo-player-panel/wo-preview-panel (#wo-create-panel): name/description
// header → a compact, pinned, drag-reorderable "selected exercises" queue
// → the full exercise catalog with a large two-row card + a +/- toggle →
// a sticky bottom bar with the live count and Save/Cancel. Replaces the
// old two-step Exercises-tab-select → Build Routine flow entirely.
//
// Builder state is kept module-level (_workoutBuilder), not in S — same
// tradeoff as the old _routineBuilder: losing an in-progress page on
// reload is acceptable rather than adding another synced-state shape.
// Filter state (search/movement/muscle/equipment) still lives at
// wm.exerciseBrowse since that's just UX memory, not workout content.
// Whether the home search bar currently has focus — deliberately not part
// of saved state (wm.browse), just a transient UI flag reset each time the
// panel is (re)opened. Tapping into the bar reveals filters/list the same
// as typing does, even before any text is entered.
let _woSearchFocused = false;

let _workoutBuilder = null; // { name, description, selectedIds: [exerciseId|ytId,...], youtubeMeta, step, globalRestSets, globalRestExercises, exConfig, repsStepIndex }
let _workoutBuilderInitial = null; // JSON snapshot for the unsaved-changes check
let _wbDrag = null; // in-flight queue drag state, see startQueueDrag()

function openCreateWorkoutPage() {
  _workoutBuilder = {
    name: '', description: '', selectedIds: [], youtubeMeta: {},
    step: 'catalog', globalRestSets: 60, globalRestExercises: 90,
    exConfig: {}, repsStepIndex: 0
  };
  _workoutBuilderInitial = JSON.stringify(_workoutBuilder);
  const panel = document.getElementById('wo-create-panel');
  if (!panel) return;
  document.getElementById('wo-create-inner').innerHTML = renderCreateWorkoutPage();
  panel.style.display = 'flex';
  requestAnimationFrame(() => panel.classList.add('open'));
}

function builderIsDirty() {
  return !!_workoutBuilder && JSON.stringify(_workoutBuilder) !== _workoutBuilderInitial;
}

function renderCreateWorkoutPage() {
  const wb = _workoutBuilder;
  if (wb.step === 'review') return renderReviewStep();
  return renderCatalogStep();
}

function refreshBuilderStep() {
  const inner = document.getElementById('wo-create-inner');
  if (inner) inner.innerHTML = renderCreateWorkoutPage();
}

function renderCatalogStep() {
  const wb = _workoutBuilder;
  return `
    <div class="wo-pl-header">
      <div class="wo-pl-close" onclick="attemptCloseCreateWorkout()">‹</div>
      <div class="wo-pl-title">New Workout</div>
      <div style="width:18px;flex-shrink:0"></div>
    </div>
    <div class="wo-create-header">
      <input class="wo-create-name-input" id="wo-create-name" type="text" placeholder="Workout Name"
        value="${escapeHtml(wb.name)}" oninput="setBuilderName(this.value)">
      <textarea class="wo-create-desc-input" id="wo-create-desc" rows="1" placeholder="Description (optional)"
        oninput="setBuilderDescription(this.value)">${escapeHtml(wb.description)}</textarea>
    </div>
    <div class="wo-create-scroll" id="wo-create-scroll">
      <div class="wo-queue-wrap" id="wo-queue-wrap">${renderSelectedQueue()}</div>
      <div class="wo-create-search-row">
        <input class="wo-search-input wo-search-input-half" id="wo-create-ex-search" type="text" placeholder="🔍 Search exercises..."
          value="${escapeHtml(wmState().exerciseBrowse.search)}" oninput="onBuilderExerciseSearchInput(this.value)">
        <div class="wo-yt-inline-add">
          <img class="wo-yt-inline-thumb" id="wo-create-yt-thumb" src="" alt="" style="display:none">
          <input class="wo-yt-inline-input" id="wo-create-yt-url" type="text" placeholder="Insert URL (optional)"
            oninput="onYoutubeUrlInput(this.value)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();addYoutubeUrlToBuilder();}">
          <button class="wo-yt-inline-btn" onclick="addYoutubeUrlToBuilder()" title="Add video to workout">＋</button>
        </div>
      </div>
      <div id="wo-create-filter-row">${renderExerciseFilterRow(wmState())}</div>
      <div id="wo-create-ex-list">${renderExerciseBrowserRows()}</div>
    </div>
    <div class="wo-create-actionbar">
      <div class="wo-create-actionbar-count">${wb.selectedIds.length} item${wb.selectedIds.length === 1 ? '' : 's'} selected</div>
      <div class="wo-create-actionbar-row">
        <button class="btn btn-secondary" onclick="attemptCloseCreateWorkout()">Cancel</button>
        <button class="btn btn-quicklog" onclick="goToGlobalRestStep()" ${wb.selectedIds.length ? '' : 'disabled'}>Next</button>
      </div>
    </div>`;
}

// ── Insert-URL-as-exercise — a typed YouTube URL becomes a queue item just
// like a picked exercise: draggable, removable, and carried into the saved
// workout as its own entry (type:'youtube'). No reps/sets step applies to
// it — the player just opens the video full-screen when it comes up. ──
// extractYoutubeId is defined once, further down (see "YOUTUBE WORKOUTS"),
// and reused here for the mid-workout video insert.
function onYoutubeUrlInput(val) {
  const thumb = document.getElementById('wo-create-yt-thumb');
  if (!thumb) return;
  const videoId = extractYoutubeId(val);
  if (videoId) {
    thumb.src = `https://img.youtube.com/vi/${videoId}/default.jpg`;
    thumb.style.display = 'block';
  } else {
    thumb.style.display = 'none';
    thumb.src = '';
  }
}

function addYoutubeUrlToBuilder() {
  const input = document.getElementById('wo-create-yt-url');
  if (!input || !_workoutBuilder) return;
  const url = input.value.trim();
  if (!url) return;
  const videoId = extractYoutubeId(url);
  if (!videoId) { showToast("That doesn't look like a YouTube URL"); return; }
  const id = 'yt_' + Date.now();
  _workoutBuilder.youtubeMeta[id] = { url, videoId, title: 'YouTube Video' };
  _workoutBuilder.selectedIds.push(id);
  input.value = '';
  onYoutubeUrlInput('');
  refreshQueue();
}

function setBuilderName(val) { if (_workoutBuilder) _workoutBuilder.name = val; }
function setBuilderDescription(val) { if (_workoutBuilder) _workoutBuilder.description = val; }

// ── Selected exercise queue — compact, pinned above the catalog, and
// drag-reorderable. Caps its own height (scrolls internally) once large
// (30+) so the rest of the page keeps scrolling normally underneath it. ──
function renderSelectedQueue() {
  const wb = _workoutBuilder;
  if (!wb || !wb.selectedIds.length) return '';
  const manyItems = wb.selectedIds.length >= 30;
  return `
    <div class="wo-queue-hdr">Selected (${wb.selectedIds.length})</div>
    <div class="wo-queue-list ${manyItems ? 'wo-queue-scroll' : ''}" id="wo-queue-list">
      ${wb.selectedIds.map((id, i) => renderQueueRow(id, i)).join('')}
    </div>`;
}

function renderQueueRow(exId, i) {
  const wb = _workoutBuilder;
  const yt = wb && wb.youtubeMeta && wb.youtubeMeta[exId];
  if (yt) {
    return `
    <div class="wo-queue-row" data-idx="${i}" data-exid="${exId}">
      <span class="wo-queue-handle" onpointerdown="startQueueDrag(event, ${i})">☰</span>
      <div class="wo-queue-main">
        <div class="wo-queue-name">▶ ${escapeHtml(yt.title || 'YouTube Video')}</div>
        <div class="wo-queue-meta">YouTube video</div>
      </div>
      <span class="wo-queue-remove" onclick="removeFromBuilder('${exId}')">✕</span>
    </div>`;
  }
  const ex = getExerciseById(exId);
  if (!ex) return '';
  const groups = getExerciseMuscleGroups(ex).join('/');
  return `
    <div class="wo-queue-row" data-idx="${i}" data-exid="${exId}">
      <span class="wo-queue-handle" onpointerdown="startQueueDrag(event, ${i})">☰</span>
      <div class="wo-queue-main">
        <div class="wo-queue-name">${ex.name}</div>
        <div class="wo-queue-meta">${groups || woCap(ex.category)} • ${woCap(ex.style)}</div>
      </div>
      <span class="wo-queue-remove" onclick="removeFromBuilder('${exId}')">✕</span>
    </div>`;
}

function refreshQueue() {
  const wrap = document.getElementById('wo-queue-wrap');
  if (wrap) wrap.innerHTML = renderSelectedQueue();
  const wb = _workoutBuilder;
  if (!wb) return;
  const count = document.querySelector('.wo-create-actionbar-count');
  if (count) count.textContent = `${wb.selectedIds.length} exercise${wb.selectedIds.length === 1 ? '' : 's'} selected`;
  const saveBtn = document.querySelector('.wo-create-actionbar-row .btn-quicklog');
  if (saveBtn) saveBtn.disabled = wb.selectedIds.length === 0;
}

// ── Drag-and-drop reordering (pointer events, no library) ──
// Grabs the row via its handle, tracks vertical offset, and swaps the
// dragged row's position once the pointer crosses a neighboring row's
// midpoint. The actual array mutation happens once on release; the
// re-render on refreshQueue() clears all inline drag styling for free.
function startQueueDrag(evt, index) {
  evt.preventDefault();
  const list = document.getElementById('wo-queue-list');
  if (!list) return;
  const rows = Array.from(list.querySelectorAll('.wo-queue-row'));
  const row = rows[index];
  if (!row) return;
  const rowHeight = row.offsetHeight + 6; // + margin-bottom
  _wbDrag = { fromIndex: index, currentIndex: index, rowHeight, startY: evt.clientY, row, rows };
  row.classList.add('dragging');
  row.style.position = 'relative';
  row.style.zIndex = 10;
  document.addEventListener('pointermove', onQueueDragMove);
  document.addEventListener('pointerup', endQueueDrag);
}

function onQueueDragMove(evt) {
  if (!_wbDrag) return;
  const d = _wbDrag;
  const dy = evt.clientY - d.startY;
  d.row.style.transform = `translateY(${dy}px)`;

  const shift = Math.round(dy / d.rowHeight);
  const newIndex = Math.max(0, Math.min(d.rows.length - 1, d.fromIndex + shift));
  if (newIndex !== d.currentIndex) {
    d.rows.forEach((r, i) => {
      if (r === d.row) return;
      let off = 0;
      if (i > d.fromIndex && i <= newIndex) off = -d.rowHeight;
      else if (i < d.fromIndex && i >= newIndex) off = d.rowHeight;
      r.style.transition = 'transform .15s ease';
      r.style.transform = off ? `translateY(${off}px)` : '';
    });
    d.currentIndex = newIndex;
  }
}

function endQueueDrag() {
  if (!_wbDrag) return;
  document.removeEventListener('pointermove', onQueueDragMove);
  document.removeEventListener('pointerup', endQueueDrag);
  const { fromIndex, currentIndex } = _wbDrag;
  _wbDrag = null;
  if (fromIndex !== currentIndex && _workoutBuilder) {
    const arr = _workoutBuilder.selectedIds;
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(currentIndex, 0, moved);
  }
  refreshQueue();
}

// ── Exercise catalog — large two-row cards, image on the right, +/- toggle.
// Filtering the catalog never removes an exercise from the queue above it;
// it only hides/shows rows down here. ──
function renderExerciseFilterRow(wm) {
  const groups = [
    { key: 'movement', label: 'Movement', options: EXERCISE_MOVEMENT_OPTIONS },
    { key: 'muscle', label: 'Muscle', options: EXERCISE_MUSCLE_OPTIONS },
    { key: 'equipment', label: 'Equipment', options: EXERCISE_EQUIPMENT_OPTIONS }
  ];
  return `
    <div class="wo-filter-row">
      ${groups.map(g => {
        const sel = wm.exerciseBrowse[g.key + 'Filter'];
        const open = wm.exerciseBrowse.openFilter === g.key;
        return `
          <div class="wo-filter-col">
            <button class="wo-filter-btn ${sel.length ? 'active' : ''}" onclick="toggleExerciseFilterDropdown('${g.key}')">
              ${g.label}${sel.length ? ' (' + sel.length + ')' : ''} ${open ? '▲' : '▼'}
            </button>
            ${open ? renderExerciseFilterChecklist(g.key, g.options) : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function renderExerciseFilterChecklist(filterKey, options) {
  const wm = wmState();
  const selected = wm.exerciseBrowse[filterKey + 'Filter'];
  return `
    <div class="wo-filter-checklist">
      ${options.map(o => `
        <label class="wo-filter-check-row">
          <input type="checkbox" ${selected.includes(o) ? 'checked' : ''} onchange="toggleExerciseFilterValue('${filterKey}','${o}')">
          <span>${o}</span>
        </label>`).join('')}
    </div>`;
}

function toggleExerciseFilterDropdown(key) {
  const wm = wmState();
  wm.exerciseBrowse.openFilter = wm.exerciseBrowse.openFilter === key ? null : key;
  save();
  refreshBuilderFilterRow();
}

function toggleExerciseFilterValue(filterKey, value) {
  const wm = wmState();
  const arr = wm.exerciseBrowse[filterKey + 'Filter'];
  const i = arr.indexOf(value);
  if (i === -1) arr.push(value); else arr.splice(i, 1);
  wm.exerciseBrowse.openFilter = null; // collapse the checklist right after a pick
  save();
  refreshBuilderFilterRow();
  refreshBuilderExerciseList();
}

function refreshBuilderFilterRow() {
  const el = document.getElementById('wo-create-filter-row');
  if (el) el.innerHTML = renderExerciseFilterRow(wmState());
}
function refreshBuilderExerciseList() {
  const el = document.getElementById('wo-create-ex-list');
  if (el) el.innerHTML = renderExerciseBrowserRows();
}

function onBuilderExerciseSearchInput(val) {
  const wm = wmState();
  wm.exerciseBrowse.search = val;
  save();
  refreshBuilderExerciseList();
}

function exerciseMatchesFilters(ex, wm) {
  const q = wm.exerciseBrowse.search.trim().toLowerCase();
  if (q && !ex.name.toLowerCase().includes(q)) return false;
  const eb = wm.exerciseBrowse;
  if (eb.movementFilter.length && !eb.movementFilter.includes(woCap(ex.category))) return false;
  if (eb.equipmentFilter.length && !(ex.equipment || []).some(t => eb.equipmentFilter.includes(equipmentLabel(t)))) return false;
  if (eb.muscleFilter.length) {
    const groups = getExerciseMuscleGroups(ex);
    if (!eb.muscleFilter.some(f => groups.includes(f))) return false;
  }
  return true;
}

function renderExerciseBrowserRows() {
  const wm = wmState();
  const selected = new Set((_workoutBuilder && _workoutBuilder.selectedIds) || []);
  const rows = EXERCISE_LIBRARY
    .filter(ex => exerciseMatchesFilters(ex, wm))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0) {
    return `<div class="wo-quick-meta" style="text-align:center;margin-top:20px">No exercises match.</div>`;
  }
  return rows.map(ex => {
    const isSel = selected.has(ex.id);
    const groups = getExerciseMuscleGroups(ex).join(', ');
    const img = ex.images && ex.images[0];
    return `
    <div class="wo-ex-card" data-exid="${ex.id}">
      ${img ? `<img class="wo-ex-card-thumb" src="${img}" alt="">` : `<div class="wo-ex-card-thumb-empty">—</div>`}
      <div class="wo-ex-card-main">
        <div class="wo-ex-card-name">${ex.name}</div>
        <div class="wo-ex-card-meta">${woCap(ex.category)} • ${groups || '—'} • ${equipmentLabels(ex.equipment)}</div>
      </div>
      <button class="wo-ex-toggle-btn ${isSel ? 'added' : ''}" onclick="toggleBuilderExercise('${ex.id}')">${isSel ? '−' : '+'}</button>
    </div>`;
  }).join('');
}

function toggleBuilderExercise(exId) {
  if (!_workoutBuilder) return;
  const i = _workoutBuilder.selectedIds.indexOf(exId);
  if (i === -1) _workoutBuilder.selectedIds.push(exId); else _workoutBuilder.selectedIds.splice(i, 1);
  refreshQueue();
  refreshBuilderExerciseList();
}

function removeFromBuilder(exId) {
  if (!_workoutBuilder) return;
  _workoutBuilder.selectedIds = _workoutBuilder.selectedIds.filter(id => id !== exId);
  if (_workoutBuilder.youtubeMeta) delete _workoutBuilder.youtubeMeta[exId];
  refreshQueue();
  refreshBuilderExerciseList();
}

// ── Leaving without saving — Save / Discard / Cancel ──
function attemptCloseCreateWorkout() {
  if (builderIsDirty()) showLeaveConfirmDialog();
  else closeCreateWorkoutPanel();
}

function showLeaveConfirmDialog() {
  if (document.getElementById('wo-leave-confirm')) return;
  const wrap = document.createElement('div');
  wrap.className = 'wo-confirm-backdrop';
  wrap.id = 'wo-leave-confirm';
  wrap.innerHTML = `
    <div class="wo-confirm-card">
      <div class="wo-confirm-title">You have unsaved changes</div>
      <div class="wo-confirm-actions">
        <button class="btn btn-quicklog" onclick="confirmSaveAndLeave()">Review & Save</button>
        <button class="btn btn-danger" onclick="confirmDiscardAndLeave()">Discard Changes</button>
      </div>
      <div class="wo-confirm-cancel" onclick="hideLeaveConfirmDialog()">Cancel</div>
    </div>`;
  document.body.appendChild(wrap);
}

function hideLeaveConfirmDialog() {
  const el = document.getElementById('wo-leave-confirm');
  if (el) el.remove();
}

function confirmDiscardAndLeave() {
  hideLeaveConfirmDialog();
  closeCreateWorkoutPanel();
}

function confirmSaveAndLeave() {
  hideLeaveConfirmDialog();
  goToGlobalRestStep();
}

function closeCreateWorkoutPanel() {
  const panel = document.getElementById('wo-create-panel');
  if (!panel) return;
  panel.classList.remove('open');
  setTimeout(() => { panel.style.display = 'none'; }, 250);
  _workoutBuilder = null;
  _workoutBuilderInitial = null;
}

// ── SAVE FLOW ─────────────────────────────────────────────────────────────
// "Next" on the catalog screen goes straight to one full review screen —
// no more click-through wizard. Global rest fields at the top update every
// exercise's rest values live as you type; each exercise's sets/reps/rest
// stays individually editable below (and any manual edit there sticks
// until the global fields are touched again). Save is right there once
// everything looks right.
// _workoutBuilder.exConfig holds { [exerciseId]: { sets, reps, restSeconds,
// restAfterExercise } } for every real exercise id in selectedIds.

function builderExerciseIds() {
  const wb = _workoutBuilder;
  return wb.selectedIds.filter(id => !(wb.youtubeMeta && wb.youtubeMeta[id]));
}

function goToGlobalRestStep() {
  const wb = _workoutBuilder;
  if (!wb || !wb.selectedIds.length) return;
  const nameInput = document.getElementById('wo-create-name');
  if (!wb.name.trim()) {
    showToast('Give your workout a name first');
    if (nameInput) {
      nameInput.classList.add('wo-input-error');
      nameInput.focus();
      setTimeout(() => nameInput.classList.remove('wo-input-error'), 1600);
    }
    return;
  }
  builderExerciseIds().forEach(id => {
    if (!wb.exConfig[id]) {
      wb.exConfig[id] = { sets: 3, reps: '8-12', restSeconds: wb.globalRestSets, restAfterExercise: wb.globalRestExercises };
    }
  });
  wb.step = 'review';
  refreshBuilderStep();
}

function backToBuilderCatalog() {
  if (!_workoutBuilder) return;
  _workoutBuilder.step = 'catalog';
  refreshBuilderStep();
}

function wb_setRepsCfg(exId, field, val) {
  const wb = _workoutBuilder;
  if (!wb) return;
  if (!wb.exConfig[exId]) wb.exConfig[exId] = { sets: 3, reps: '8-12', restSeconds: wb.globalRestSets, restAfterExercise: wb.globalRestExercises };
  wb.exConfig[exId][field] = (field === 'sets' || field === 'restSeconds' || field === 'restAfterExercise')
    ? Math.max(0, parseInt(val, 10) || 0)
    : val;
}

// Typing in either global field live-overwrites that rest value on every
// exercise below — the fast path for "same rest everywhere." Editing a
// row's own rest field after that still works and sticks until the global
// field is changed again.
function wb_setGlobalRestLive(field, val) {
  const wb = _workoutBuilder;
  if (!wb) return;
  const num = Math.max(0, parseInt(val, 10) || 0);
  wb[field] = num;
  const cfgField = field === 'globalRestSets' ? 'restSeconds' : 'restAfterExercise';
  builderExerciseIds().forEach(id => {
    if (!wb.exConfig[id]) wb.exConfig[id] = { sets: 3, reps: '8-12', restSeconds: wb.globalRestSets, restAfterExercise: wb.globalRestExercises };
    wb.exConfig[id][cfgField] = num;
  });
  refreshReviewRows();
}

function renderReviewStep() {
  const wb = _workoutBuilder;
  return `
    <div class="wo-pl-header">
      <div class="wo-pl-close" onclick="backToBuilderCatalog()">‹</div>
      <div class="wo-pl-title">${escapeHtml(wb.name)}</div>
      <div style="width:18px;flex-shrink:0"></div>
    </div>
    <div class="wo-create-scroll">
      <div class="wo-review-global-rest">
        <div class="wo-wizard-field">
          <label class="wo-wizard-label">Rest between sets (seconds) — all exercises</label>
          <input class="wo-wizard-input" type="number" min="0" step="5" id="wo-rest-sets"
            value="${wb.globalRestSets}" oninput="wb_setGlobalRestLive('globalRestSets', this.value)">
        </div>
        <div class="wo-wizard-field">
          <label class="wo-wizard-label">Rest between exercises (seconds) — all exercises</label>
          <input class="wo-wizard-input" type="number" min="0" step="5" id="wo-rest-exercises"
            value="${wb.globalRestExercises}" oninput="wb_setGlobalRestLive('globalRestExercises', this.value)">
        </div>
      </div>
      <div id="wo-review-rows">${renderReviewRows()}</div>
    </div>
    <div class="wo-create-actionbar">
      <div class="wo-create-actionbar-row">
        <button class="btn btn-secondary" onclick="backToBuilderCatalog()">Back</button>
        <button class="btn btn-quicklog" onclick="finalizeSaveWorkout()">Save Workout</button>
      </div>
    </div>`;
}

function renderReviewRows() {
  const wb = _workoutBuilder;
  return wb.selectedIds.map(id => {
    const yt = wb.youtubeMeta && wb.youtubeMeta[id];
    if (yt) {
      return `
        <div class="wo-review-row">
          <div class="wo-review-name">▶ ${escapeHtml(yt.title || 'YouTube Video')}</div>
          <div class="wo-review-meta">Video — no reps/rest to set</div>
        </div>`;
    }
    const ex = getExerciseById(id);
    const cfg = wb.exConfig[id] || { sets: 3, reps: '8-12', restSeconds: wb.globalRestSets, restAfterExercise: wb.globalRestExercises };
    return `
        <div class="wo-review-row">
          <div class="wo-review-name">${ex ? ex.name : id}</div>
          <div class="wo-review-grid">
            <label>Sets<input type="number" min="1" value="${cfg.sets}" oninput="wb_setRepsCfg('${id}','sets',this.value)"></label>
            <label>Reps<input type="text" value="${escapeHtml(String(cfg.reps))}" oninput="wb_setRepsCfg('${id}','reps',this.value)"></label>
            <label>Rest/set (s)<input type="number" min="0" step="5" value="${cfg.restSeconds}" oninput="wb_setRepsCfg('${id}','restSeconds',this.value)"></label>
            <label>Rest after (s)<input type="number" min="0" step="5" value="${cfg.restAfterExercise}" oninput="wb_setRepsCfg('${id}','restAfterExercise',this.value)"></label>
          </div>
        </div>`;
  }).join('');
}

function refreshReviewRows() {
  const el = document.getElementById('wo-review-rows');
  if (el) el.innerHTML = renderReviewRows();
}

function finalizeSaveWorkout() {
  const wb = _workoutBuilder;
  if (!wb || !wb.selectedIds.length) return;
  const name = wb.name.trim();
  if (!name) { showToast('Give your workout a name first'); return; }

  const workout = {
    id: 'custom_' + Date.now(),
    name,
    entries: wb.selectedIds.map(id => {
      const yt = wb.youtubeMeta && wb.youtubeMeta[id];
      if (yt) return { type: 'youtube', url: yt.url, videoId: yt.videoId, title: yt.title || 'YouTube Video' };
      const cfg = wb.exConfig[id] || { sets: 3, reps: '8-12' };
      return {
        type: 'set',
        exerciseId: id,
        sets: cfg.sets,
        reps: cfg.reps,
        restSeconds: cfg.restSeconds !== undefined ? cfg.restSeconds : wb.globalRestSets,
        restAfterExercise: cfg.restAfterExercise !== undefined ? cfg.restAfterExercise : wb.globalRestExercises
      };
    })
  };
  if (wb.description.trim()) workout.description = wb.description.trim();
  if (wb.stretchId) workout.stretchId = wb.stretchId;

  if (!workout.stretchId) { showStretchPromptDialog(workout); return; }
  finishSavingBuilderWorkout(workout);
}

function finishSavingBuilderWorkout(workout) {
  const wm = wmState();
  if (!wm.customWorkouts) wm.customWorkouts = [];
  wm.customWorkouts.push(workout);
  save();

  hideLeaveConfirmDialog();
  closeCreateWorkoutPanel();
  showToast('Workout saved ✓');
  refreshWorkoutList();
}

// Stage 7 — simple practical auto-attach: full body by default (lower
// body/core is usually involved even during upper-only training), unless
// every selected exercise is clearly lower-body/core-only.
function autoPickStretchId(workout) {
  const cats = workout.entries.map(e => (getExerciseById(e.exerciseId) || {}).category);
  const hasUpper = cats.some(c => c === 'push' || c === 'pull');
  const hasLower = cats.some(c => c === 'legs' || c === 'core');
  if (hasLower && !hasUpper) return 'stretch_lower_core';
  if (hasUpper && !hasLower) return 'stretch_upper';
  return 'stretch_fullbody';
}

function showStretchPromptDialog(workout) {
  const wrap = document.createElement('div');
  wrap.className = 'wo-confirm-overlay';
  wrap.id = 'wo-stretch-prompt';
  wrap.innerHTML = `
    <div class="wo-confirm-box">
      <div class="wo-confirm-title">I noticed you didn't add a stretch to your workout.</div>
      <div class="wo-confirm-body">Do you want me to add one?</div>
      <div class="wo-confirm-actions" style="flex-direction:column;gap:8px">
        <button class="btn btn-quicklog" onclick="stretchPromptChoice('auto')">Add automatically</button>
        <button class="btn btn-secondary" onclick="stretchPromptChoice('manual')">Add manually</button>
        <button class="btn btn-danger" onclick="stretchPromptChoice('none')">No thank you</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap._pendingWorkout = workout;
}
function stretchPromptChoice(choice) {
  const wrap = document.getElementById('wo-stretch-prompt');
  const workout = wrap ? wrap._pendingWorkout : null;
  if (wrap) wrap.remove();
  if (!workout) return;
  if (choice === 'auto') {
    workout.stretchId = autoPickStretchId(workout);
    finishSavingBuilderWorkout(workout);
  } else if (choice === 'manual') {
    // Leave the builder open on the stretch picker instead of saving —
    // the builder's own stretch-select UI (wb.stretchId) is what
    // finishSavingBuilderWorkout() reads next time Save is pressed.
    showToast('Pick a stretch block below, then save again.');
  } else {
    finishSavingBuilderWorkout(workout);
  }
}

function buildWeekLadder(slots, currentIdx) {
  const safeIdx = Math.min(currentIdx, slots.length - 1);
  const currentWeek = slots[safeIdx].weekNumber;
  const weeks = [...new Set(slots.map(s => s.weekNumber))].sort((a, b) => a - b);
  return weeks.map(w => {
    const wSlotIdxs = slots.map((s, i) => (s.weekNumber === w ? i : -1)).filter(i => i !== -1);
    const doneCount = wSlotIdxs.filter(i => i < currentIdx).length;
    let state = 'upcoming';
    if (doneCount === wSlotIdxs.length && wSlotIdxs.length > 0) state = 'done';
    else if (w === currentWeek && currentIdx < slots.length) state = 'current';
    return `<div class="wo-ladder-seg wo-ladder-${state}" title="Week ${w}"></div>`;
  }).join('');
}

function restartProgram() {
  wmState().currentSlotIndex = 0;
  save();
  showToast('Program restarted');
  renderWorkoutHome();
}

function unenrollProgram() {
  const wm = wmState();
  const program = getProgramById(wm.activePlanId);
  if (program && !confirm('Stop "' + program.name + '"? Your progress will be reset.')) return;
  wm.activePlanId = null;
  wm.currentSlotIndex = 0;
  wm.liveSession = null;
  wm.viewFullProgram = false;
  save();
  showToast('Program stopped');
  renderWorkoutHome();
}

function enrollProgram(id) {
  const wm = wmState();
  if (wm.activePlanId && wm.activePlanId !== id) {
    const current = getProgramById(wm.activePlanId);
    if (!confirm('Switch plans? Your progress in "' + (current ? current.name : 'your current program') + '" will be reset.')) return;
  }
  wm.activePlanId = id;
  wm.currentSlotIndex = 0;
  wm.viewFullProgram = false;
  save();
  showToast('Enrolled ✓');
  renderWorkoutHome();
}

// ── PROGRAM TAB ───────────────────────────────────────────────────────────
// "I want to enroll in and manage long-term training programs." No search,
// no workout picking here — just the current program's progress + a list
// of available programs to enroll in.
function renderProgramPanel() {
  const wm = wmState();
  let html = '';

  if (wm.activePlanId) {
    const program = getProgramById(wm.activePlanId);
    if (program) html += renderCurrentProgramCard(wm, program);
  }

  html += `<div class="wo-track-hist-hdr" style="margin-top:20px">Available Programs</div>`;
  html += WORKOUT_PROGRAMS.map(p => renderProgramListCard(p, wm)).join('');
  return html;
}

function renderCurrentProgramCard(wm, program) {
  const slots = buildProgramSlots(program);
  const idx = Math.min(wm.currentSlotIndex || 0, slots.length);
  const totalWeeks = program.weeks.reduce((n, g) => n + g.weekNumbers.length, 0);
  const pct = Math.round((idx / slots.length) * 100);

  if (idx >= slots.length) {
    return `
      <div class="wo-track-hist-hdr">Current Program</div>
      <div class="wo-program-current-card" style="text-align:center">
        <div style="font-size:32px;margin-bottom:6px">🎉</div>
        <div class="wo-plan-name">${program.name} complete!</div>
        <div class="wo-quick-meta">All ${slots.length} sessions done.</div>
        <button class="btn btn-save" onclick="restartProgram()">Start over</button>
      </div>`;
  }

  const currentWeek = slots[idx].weekNumber;
  return `
    <div class="wo-track-hist-hdr">Current Program</div>
    <div class="wo-program-current-card">
      <div class="wo-plan-name">${program.name}</div>
      ${renderProgressRing(pct)}
      <div class="wo-program-stats">${idx} / ${slots.length} workouts completed</div>
      <div class="wo-program-stats">Week ${currentWeek} / ${totalWeeks}</div>
      <div class="wo-program-actions">
        <button class="btn btn-secondary" onclick="toggleFullProgramView()">${wm.viewFullProgram ? 'Hide Program' : 'View Program'}</button>
        <button class="btn btn-danger" onclick="unenrollProgram()">Stop Program</button>
      </div>
    </div>
    ${wm.viewFullProgram ? renderFullProgramSchedule(program, slots, idx) : ''}
  `;
}

// Hand-rolled SVG ring (stroke-dasharray/offset), smoothly animated via
// CSS transition on stroke-dashoffset — consistent with how the rest of
// the app hand-rolls its charts/donuts rather than using a chart library.
function renderProgressRing(pct) {
  const r = 46, c = Math.round(2 * Math.PI * r);
  const offset = Math.round(c * (1 - pct / 100));
  return `
    <svg class="wo-ring-svg" viewBox="0 0 110 110">
      <circle class="wo-ring-track" cx="55" cy="55" r="${r}"></circle>
      <circle class="wo-ring-fill" cx="55" cy="55" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
      <text x="55" y="62" class="wo-ring-text" text-anchor="middle">${pct}%</text>
    </svg>`;
}

function toggleFullProgramView() {
  const wm = wmState();
  wm.viewFullProgram = !wm.viewFullProgram;
  save();
  renderWorkoutHome();
}

function renderFullProgramSchedule(program, slots, idx) {
  return `
    <div class="wo-ladder">${buildWeekLadder(slots, idx)}</div>
    <div class="wo-full-sched">
      ${slots.map((s, i) => {
        const w = getWorkoutById(s.workoutIds[0]);
        const status = i < idx ? 'done' : i === idx ? 'current' : 'upcoming';
        const mark = status === 'done' ? '✓' : status === 'current' ? '→' : '';
        return `
          <div class="wo-sched-row wo-sched-${status}" onclick="openWorkoutPreview('${s.workoutIds[0]}', false)">
            <span class="wo-sched-week">W${s.weekNumber}</span>
            <span class="wo-sched-name">${w ? w.name : s.workoutIds[0]}</span>
            <span class="wo-sched-status">${mark}</span>
          </div>`;
      }).join('')}
    </div>`;
}

function renderProgramListCard(p, wm) {
  const totalWeeks = p.weeks.reduce((n, g) => n + g.weekNumbers.length, 0);
  const isCurrent = wm.activePlanId === p.id;
  return `
    <div class="wo-program-card">
      <div class="wo-program-name">${p.name}</div>
      <div class="wo-program-meta">${totalWeeks} Weeks</div>
      ${isCurrent
        ? `<div class="status-tag tag-complete">Currently enrolled</div>`
        : `<button class="btn btn-save" onclick="enrollProgram('${p.id}')">Enroll</button>`}
    </div>`;
}

// ── YOUTUBE WORKOUTS ──────────────────────────────────────────────────────
// A saved-links library, not an embedded player — the app has no video
// player of its own, so a row just opens the link in a new tab. Shared
// across both people (S.youtubeWorkouts, not per-person), same as the
// kitchen library, since "workouts we found and want to follow along to"
// is more household-level than person-level.
function extractYoutubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{6,})/);
  return m ? m[1] : null;
}

// Add form is now the small inline toggle on the New Workout home (see
// renderYoutubeAddForm/toggleYoutubeAddForm near the top of this file);
// the library itself renders inline in the unified list (renderWorkoutListRows).
function addYoutubeVideo() {
  const titleEl = document.getElementById('wo-yt-title');
  const urlEl = document.getElementById('wo-yt-url');
  const title = titleEl.value.trim();
  const url = urlEl.value.trim();
  const videoId = extractYoutubeId(url);
  if (!title) { showToast('Give it a title first'); return; }
  if (!videoId) { showToast('That doesn\'t look like a valid YouTube URL'); return; }

  if (!S.youtubeWorkouts) S.youtubeWorkouts = [];
  S.youtubeWorkouts.push({ id: 'yt_' + Date.now(), title, url, videoId });
  const wm = wmState();
  wm.browse.showYtAdd = false;
  save();
  const wrap = document.getElementById('wo-yt-add-wrap');
  if (wrap) wrap.innerHTML = '';
  refreshWorkoutList();
  showToast('Added to library ✓');
}

function deleteYoutubeVideo(id) {
  if (!confirm('Remove this video from your library?')) return;
  S.youtubeWorkouts = (S.youtubeWorkouts || []).filter(v => v.id !== id);
  save();
  refreshWorkoutList();
}

function openYoutubeVideo(url) {
  window.open(url, '_blank');
}

// ── WORKOUT PREVIEW ───────────────────────────────────────────────────────
// Read-only look at a workout's contents before committing to it — used by
// the browse list, the Program tab's full schedule, and the hero's day
// name. Ends in an explicit Start button; nothing here launches the
// player on its own. advancesProgram is threaded through so starting from
// here behaves exactly like starting any other way (only the hero's own
// "next workout" flow advances the program's slot pointer).
function openWorkoutPreview(workoutId, advancesProgram) {
  const workout = getWorkoutById(workoutId);
  const panel = document.getElementById('wo-preview-panel');
  if (!workout || !panel) return;
  const tags = getWorkoutTags(workout);

  document.getElementById('wo-preview-inner').innerHTML = `
    <div class="wo-pl-header">
      <div class="wo-pl-close" onclick="closePreviewPanel()">✕</div>
      <div class="wo-pl-title">${workout.name}</div>
      <div style="width:18px;flex-shrink:0"></div>
    </div>
    <div class="wo-preview-body">
      <div class="wo-tag-row" style="margin:14px 0">
        <span class="wo-tag">${tags.style}</span><span class="wo-tag-sep">|</span>
        <span class="wo-tag">${tags.muscleGroup}</span><span class="wo-tag-sep">|</span>
        <span class="wo-tag">${tags.equipment}</span>
      </div>
      ${renderWorkoutEntriesPreview(workout)}
    </div>
    <div class="wo-pl-footer" style="justify-content:center">
      <button class="btn btn-quicklog" onclick="startFromPreview('${workoutId}', ${!!advancesProgram})">Start Workout →</button>
    </div>`;

  panel.style.display = 'flex';
  requestAnimationFrame(() => panel.classList.add('open'));
}

function closePreviewPanel() {
  const panel = document.getElementById('wo-preview-panel');
  if (!panel) return;
  panel.classList.remove('open');
  setTimeout(() => { panel.style.display = 'none'; }, 250);
}

function startFromPreview(workoutId, advancesProgram) {
  closePreviewPanel();
  openWorkoutPlayer(workoutId, advancesProgram);
}

// classifyRepsTarget lives in workout-player.js — safe to call here since
// this only ever runs from a click, well after every script has loaded.
function renderWorkoutEntriesPreview(workout) {
  let html = '';
  let lastExId = null;
  workout.entries.forEach(entry => {
    if (entry.type === 'youtube') {
      html += `<div class="wo-pl-exercise-hdr">▶ ${escapeHtml(entry.title || 'YouTube Video')}</div>`;
      html += `<div class="wo-preview-row"><span>Video</span><span class="wo-preview-meta">opens full screen</span></div>`;
      lastExId = null;
      return;
    }
    const ex = getExerciseById(entry.exerciseId);
    const name = ex ? ex.name : entry.exerciseId;
    if (entry.exerciseId !== lastExId) {
      html += `<div class="wo-pl-exercise-hdr">${name}${entry.sideNote ? ' · ' + entry.sideNote : ''}</div>`;
      lastExId = entry.exerciseId;
    }
    if (entry.type === 'pyramid') {
      html += `<div class="wo-preview-row"><span>Pyramid</span><span class="wo-preview-meta">${entry.capMinutes} min cap</span></div>`;
    } else {
      const classified = classifyRepsTarget(entry.reps);
      const sets = entry.sets || 1;
      html += `<div class="wo-preview-row"><span>${sets} set${sets === 1 ? '' : 's'}</span><span class="wo-preview-meta">${classified.label}</span></div>`;
    }
  });
  return html;
}

// ───────────────── ACTIVE WORKOUT PLAYER (from workout-player.js) ──────────
// ── ACTIVE WORKOUT PLAYER ──────────────────────────────────────────────
// Full-screen overlay (#wo-player-panel, built fresh into #wo-player-inner
// each time it opens — see showPlayerPanel()). A workout is now built in
// three phases — warmup → main → stretch — via buildPlayerRows(), and
// rendered with section headers whenever the phase changes.
//
// wm.liveSession persists the in-progress session to state (saved on every
// check-in), so backgrounding/reloading the app doesn't lose progress —
// renderActivePlanPanel() shows a "Resume workout" card if one exists.

let _playerClockInterval = null;
let _warmupHoldTimer = null;
let _skipStretchHoldTimer = null;
let _bigTimerOpts = null;
let _bigTimerRemaining = null;
let _bigTimerPaused = false;
let _bigTimerTotal = null;

// Donut ring geometry — r=44 on a 100x100 viewBox, so circumference is
// fixed regardless of how large the ring is drawn on screen.
const BIGTIMER_DONUT_CIRC = 2 * Math.PI * 44;

// ── SOUND — simple WebAudio bell, no external audio file dependency ──
function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.9);
  } catch (e) { /* audio unavailable — silently skip */ }
}

// The reps field in the data isn't always a rep count — it's whatever
// unit that set is actually measured in. Observed formats: plain numbers
// and ranges ("8-12") are rep counts; a number ending in "s" ("60s") is a
// hold in seconds; a number ending in "min" ("20min") is a continuous
// timed effort (jog/bike/rope) logged in minutes, not reps; "mrp" is
// AMRAP (max reps possible); "F" is "to failure" (still a rep count, just
// with no fixed target). Classified from the data itself, not assumed
// per exercise, since the same exercise can appear with different set
// styles across the program.
function classifyRepsTarget(raw) {
  const s = String(raw).trim();
  if (/^\d+s$/i.test(s)) return { kind: 'hold', label: s, seconds: parseInt(s) };
  if (/^\d+min$/i.test(s)) return { kind: 'duration', label: s };
  if (/^mrp$/i.test(s)) return { kind: 'amrap', label: 'AMRAP' };
  if (/^f$/i.test(s)) return { kind: 'failure', label: 'to failure' };
  return { kind: 'reps', label: s + ' reps' };
}

// Builds the full row list for a session: a generic Warmup step, the
// workout's own main entries, then — if the workout links a stretchId —
// that stretch block's entries. Every row carries a `phase` so the
// renderer can show WARMUP / MAIN WORKOUT / STRETCH section headers.
function buildPlayerRows(workout) {
  const rows = [];
  rows.push({ phase: 'warmup', kind: 'warmup', completed: false });

  workout.entries.forEach(entry => {
    if (entry.type === 'youtube') {
      rows.push({
        phase: 'main', kind: 'youtube', url: entry.url, videoId: entry.videoId,
        title: entry.title || 'YouTube Video', sideNote: entry.sideNote || null,
        completed: false
      });
    } else if (entry.type === 'pyramid') {
      rows.push({
        phase: 'main', exerciseId: entry.exerciseId, kind: 'pyramid',
        capMinutes: entry.capMinutes, restAfter: entry.restBetweenPyramids || 0,
        sideNote: entry.sideNote || null,
        completed: false, actualMinutes: null,
        pyramidStep: 1, pyramidPhase: 'up', pyramidTop: null, pyramidLog: []
      });
    } else {
      const classified = classifyRepsTarget(entry.reps);
      const totalSets = entry.sets || 1;
      for (let i = 1; i <= totalSets; i++) {
        rows.push({
          phase: 'main', exerciseId: entry.exerciseId, kind: 'set',
          setNumber: i, totalSets,
          targetLabel: classified.label, repKind: classified.kind,
          restAfter: entry.restSeconds || 0,
          restAfterExercise: entry.restAfterExercise != null ? entry.restAfterExercise : 90,
          sideNote: entry.sideNote || null,
          completed: false, reps: null, weight: null, holdSeconds: null, durationMinutes: null
        });
      }
    }
  });

  if (workout.stretchId) {
    const stretchWo = getWorkoutById(workout.stretchId);
    if (stretchWo) {
      stretchWo.entries.forEach(entry => {
        const classified = classifyRepsTarget(entry.reps);
        const totalSets = entry.sets || 1;
        for (let i = 1; i <= totalSets; i++) {
          rows.push({
            phase: 'stretch', exerciseId: entry.exerciseId, kind: 'stretch',
            setNumber: i, totalSets,
            holdSecondsTarget: classified.seconds || 30,
            sideNote: entry.sideNote || null,
            completed: false
          });
        }
      });
    }
  }
  return rows;
}

function openWorkoutPlayer(workoutId, advancesProgram) {
  const workout = getWorkoutById(workoutId);
  if (!workout) return;
  const wm = wmState();
  wm.liveSession = {
    workoutId,
    workoutName: workout.name,
    startedAt: Date.now(),
    advancesProgram: !!advancesProgram,
    rows: buildPlayerRows(workout),
    stretchMode: 'auto' // 'auto' | 'manual' — see renderStretchPhaseControls / toggleStretchMode
  };
  save();
  showPlayerPanel();
}

function resumeWorkoutPlayer() { showPlayerPanel(); }

// ── ON-THE-FLY WORKOUT — a player session with nothing preloaded. Same
// warmup step as any other session; every exercise after that comes from
// tapping the "+" (see renderAddExerciseRow / openAddExercisePicker). ──
function openOnTheFlyPlayer() {
  const wm = wmState();
  wm.liveSession = {
    workoutId: null,
    workoutName: 'On-the-Fly Workout',
    startedAt: Date.now(),
    advancesProgram: false,
    onTheFly: true,
    rows: [{ phase: 'warmup', kind: 'warmup', completed: false }],
    stretchMode: 'auto'
  };
  save();
  showPlayerPanel();
}

function abandonWorkoutSession() {
  if (!confirm('Discard this workout? Nothing will be saved.')) return;
  wmState().liveSession = null;
  save();
  hidePlayerPanel();
  renderWorkoutHome();
}

function showPlayerPanel() {
  const panel = document.getElementById('wo-player-panel');
  const wm = wmState();
  if (!panel || !wm.liveSession) return;

  document.getElementById('wo-player-inner').innerHTML = `
    <div class="wo-pl-header">
      <div class="wo-pl-header-top">
        <div class="wo-pl-close" onclick="closePlayerPanel()">✕</div>
        <div class="wo-pl-title">${wm.liveSession.workoutName}</div>
        <div class="wo-pl-stretch-mode-row" id="wo-pl-stretch-mode-row" style="display:none">
          <div class="wo-pl-stretch-mode-toggle" onclick="toggleStretchMode()">
            <span class="wo-pl-stretch-mode-opt" id="wo-pl-mode-opt-auto">Auto</span>
            <span class="wo-pl-stretch-mode-opt" id="wo-pl-mode-opt-manual">Manual</span>
          </div>
        </div>
      </div>
      <div class="wo-pl-total-clock" id="wo-player-clock" onclick="toggleSessionClockPause()" title="Tap to pause/resume">
        <span class="wo-pl-total-clock-label">Total workout time</span>
        <span class="wo-pl-total-clock-val" id="wo-player-clock-val">0:00</span>
      </div>
    </div>
    <div class="wo-pl-hero" id="wo-pl-hero" style="display:none">
      <img class="wo-pl-hero-img" id="wo-pl-hero-img-1" src="" alt="">
      <img class="wo-pl-hero-img" id="wo-pl-hero-img-2" src="" alt="">
      <div class="wo-pl-hero-name" id="wo-pl-hero-name"></div>
    </div>
    <div class="wo-bigtimer" id="wo-bigtimer">
      <div class="wo-bigtimer-collapse" id="wo-bigtimer-collapse">
        <div class="wo-bigtimer-content">
          <div class="wo-bigtimer-top">
            <div class="wo-bigtimer-label" id="wo-bigtimer-label">Rest</div>
            <div class="wo-bigtimer-clockspacer"></div>
            <div class="wo-bigtimer-skipwrap" id="wo-bigtimer-skipwrap"></div>
          </div>
          <div class="wo-bigtimer-sub" id="wo-bigtimer-sub"></div>
          <div class="wo-bigtimer-actions" id="wo-bigtimer-actions"></div>
        </div>
      </div>
      <div class="wo-bigtimer-donut-wrap" id="wo-bigtimer-donut-wrap">
        <svg class="wo-bigtimer-collar" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M8.6,15.3 A54,54 0 0,1 91.4,15.3 C101,26.8 105,45 100,45 L100,100 L0,100 L0,45 C-5,45 -1,26.8 8.6,15.3 Z"></path>
        </svg>
        <div class="wo-bigtimer-donut" id="wo-bigtimer-donut">
          <svg class="wo-bigtimer-donut-svg" viewBox="0 0 100 100">
            <circle class="wo-bigtimer-donut-track" cx="50" cy="50" r="44"></circle>
            <circle class="wo-bigtimer-donut-fill" id="wo-bigtimer-donut-fill" cx="50" cy="50" r="44"></circle>
          </svg>
          <div class="wo-bigtimer-num" id="wo-bigtimer-num">0:00</div>
          <button class="wo-bigtimer-pausebtn" id="wo-bigtimer-pausebtn" onclick="toggleBigTimerPause()" style="display:none" aria-label="Pause timer">❚❚</button>
        </div>
      </div>
    </div>
    <div class="wo-pl-rows" id="wo-player-rows"></div>
    <div class="wo-pl-footer">
      <span class="wo-pl-abandon" onclick="abandonWorkoutSession()">Discard session</span>
      <button class="btn btn-quicklog" onclick="finishWorkoutSession()">Finish Workout</button>
    </div>`;

  panel.style.display = 'flex';
  requestAnimationFrame(() => panel.classList.add('open'));
  renderPlayerBody();
  startPlayerClock();
}

// ── ADD EXERCISE PICKER (mid-session) ───────────────────────────────────
// Opened from the "+" row. Own filter state (kept separate from the
// Create Workout page's wm.exerciseBrowse so opening this mid-session
// never disturbs whatever filters were left set on the builder page).
let _addExPicker = null;

function openAddExercisePicker() {
  if (!wmState().liveSession) return;
  _addExPicker = { search: '', movementFilter: [], muscleFilter: [], equipmentFilter: [], openFilter: null };
  const wrap = document.createElement('div');
  wrap.className = 'wo-add-ex-overlay';
  wrap.id = 'wo-add-ex-overlay';
  wrap.innerHTML = `<div class="wo-add-ex-sheet">${renderAddExercisePicker()}</div>`;
  document.body.appendChild(wrap);
}

function closeAddExercisePicker() {
  const el = document.getElementById('wo-add-ex-overlay');
  if (el) el.remove();
  _addExPicker = null;
}

function renderAddExercisePicker() {
  const p = _addExPicker;
  const groups = [
    { key: 'movement', label: 'Movement', options: EXERCISE_MOVEMENT_OPTIONS },
    { key: 'muscle', label: 'Muscle', options: EXERCISE_MUSCLE_OPTIONS },
    { key: 'equipment', label: 'Equipment', options: EXERCISE_EQUIPMENT_OPTIONS }
  ];
  return `
    <div class="wo-pl-header">
      <div class="wo-pl-close" onclick="closeAddExercisePicker()">✕</div>
      <div class="wo-pl-title">Add Exercise</div>
      <div style="width:18px;flex-shrink:0"></div>
    </div>
    <div class="wo-create-scroll">
      <input class="wo-search-input" id="wo-add-ex-search" type="text" placeholder="🔍 Search exercises..."
        value="${escapeHtml(p.search)}" oninput="onAddExSearchInput(this.value)">
      <div class="wo-filter-row" id="wo-add-ex-filter-row">${renderAddExFilterRow()}</div>
      <div id="wo-add-ex-list">${renderAddExList()}</div>
      <div class="wo-add-ex-typed">
        <div class="wo-wizard-label">Can't find it? Type a name</div>
        <div style="display:flex;gap:8px">
          <input class="wo-wizard-input" id="wo-add-ex-typed-name" type="text" placeholder="Exercise name">
          <button class="btn btn-quicklog" style="width:auto;padding:11px 16px;margin-top:0" onclick="pickTypedAdHocExercise()">Add</button>
        </div>
      </div>
    </div>`;
}

function renderAddExFilterRow() {
  const p = _addExPicker;
  const groups = [
    { key: 'movement', label: 'Movement', options: EXERCISE_MOVEMENT_OPTIONS },
    { key: 'muscle', label: 'Muscle', options: EXERCISE_MUSCLE_OPTIONS },
    { key: 'equipment', label: 'Equipment', options: EXERCISE_EQUIPMENT_OPTIONS }
  ];
  return groups.map(g => {
    const sel = p[g.key + 'Filter'];
    const open = p.openFilter === g.key;
    return `<div class="wo-filter-col">
      <button class="wo-filter-btn ${sel.length ? 'active' : ''}" onclick="toggleAddExFilterDropdown('${g.key}')">${g.label}${sel.length ? ' (' + sel.length + ')' : ''} ${open ? '▲' : '▼'}</button>
      ${open ? `<div class="wo-filter-checklist">${g.options.map(o => `<label class="wo-filter-check-row"><input type="checkbox" ${sel.includes(o) ? 'checked' : ''} onchange="toggleAddExFilterValue('${g.key}','${o}')"><span>${o}</span></label>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
}

function onAddExSearchInput(v) {
  _addExPicker.search = v;
  refreshAddExList();
}

function toggleAddExFilterDropdown(key) {
  _addExPicker.openFilter = _addExPicker.openFilter === key ? null : key;
  refreshAddExFilterRowOnly();
}

function toggleAddExFilterValue(key, value) {
  const arr = _addExPicker[key + 'Filter'];
  const i = arr.indexOf(value);
  if (i === -1) arr.push(value); else arr.splice(i, 1);
  _addExPicker.openFilter = null; // collapse after a pick, same as everywhere else
  refreshAddExFilterRowOnly();
  refreshAddExList();
}

function refreshAddExFilterRowOnly() {
  const el = document.getElementById('wo-add-ex-filter-row');
  if (el) el.innerHTML = renderAddExFilterRow();
}

function addExMatchesFilters(ex, p) {
  const q = p.search.trim().toLowerCase();
  if (q && !ex.name.toLowerCase().includes(q)) return false;
  if (p.movementFilter.length && !p.movementFilter.includes(woCap(ex.category))) return false;
  if (p.equipmentFilter.length && !(ex.equipment || []).some(t => p.equipmentFilter.includes(equipmentLabel(t)))) return false;
  if (p.muscleFilter.length) {
    const groups = getExerciseMuscleGroups(ex);
    if (!p.muscleFilter.some(f => groups.includes(f))) return false;
  }
  return true;
}

function renderAddExList() {
  const p = _addExPicker;
  const rows = EXERCISE_LIBRARY.filter(ex => addExMatchesFilters(ex, p)).sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) return `<div class="wo-quick-meta" style="text-align:center;margin-top:20px">No exercises match.</div>`;
  return rows.map(ex => {
    const img = ex.images && ex.images[0];
    const groups = getExerciseMuscleGroups(ex).join(', ');
    return `
    <div class="wo-ex-card" onclick="pickAdHocExercise('${ex.id}')">
      ${img ? `<img class="wo-ex-card-thumb" src="${img}" alt="">` : `<div class="wo-ex-card-thumb-empty">—</div>`}
      <div class="wo-ex-card-main">
        <div class="wo-ex-card-name">${ex.name}</div>
        <div class="wo-ex-card-meta">${woCap(ex.category)} • ${groups || '—'} • ${equipmentLabels(ex.equipment)}</div>
      </div>
    </div>`;
  }).join('');
}

function refreshAddExList() {
  const el = document.getElementById('wo-add-ex-list');
  if (el) el.innerHTML = renderAddExList();
}

function pickAdHocExercise(exId) {
  _addExPicker.pendingExId = exId;
  _addExPicker.pendingName = null;
  showAddExConfigStep();
}

function pickTypedAdHocExercise() {
  const input = document.getElementById('wo-add-ex-typed-name');
  const name = input && input.value.trim();
  if (!name) { showToast('Type an exercise name first'); return; }
  _addExPicker.pendingExId = null;
  _addExPicker.pendingName = name;
  showAddExConfigStep();
}

function showAddExConfigStep() {
  const sheet = document.querySelector('.wo-add-ex-sheet');
  if (!sheet) return;
  const p = _addExPicker;
  const name = p.pendingExId ? ((getExerciseById(p.pendingExId) || {}).name || '') : p.pendingName;
  sheet.innerHTML = `
    <div class="wo-pl-header">
      <div class="wo-pl-close" onclick="closeAddExercisePicker()">✕</div>
      <div class="wo-pl-title">${escapeHtml(name)}</div>
      <div style="width:18px;flex-shrink:0"></div>
    </div>
    <div class="wo-create-scroll">
      <div class="wo-wizard-field">
        <label class="wo-wizard-label">Sets</label>
        <input class="wo-wizard-input" type="number" min="1" id="wo-add-ex-sets" value="3">
      </div>
      <div class="wo-wizard-field">
        <label class="wo-wizard-label">Rest between sets (seconds)</label>
        <input class="wo-wizard-input" type="number" min="0" step="5" id="wo-add-ex-rest" value="60">
      </div>
    </div>
    <div class="wo-create-actionbar">
      <div class="wo-create-actionbar-row">
        <button class="btn btn-secondary" onclick="closeAddExercisePicker()">Cancel</button>
        <button class="btn btn-quicklog" onclick="confirmAddExercise()">Add to Workout</button>
      </div>
    </div>`;
}

// Target reps are deliberately left blank (repKind:'reps', targetLabel:'')
// per spec — this is an on-the-spot addition, not a planned/prescribed set.
function confirmAddExercise() {
  const p = _addExPicker;
  const setsInput = document.getElementById('wo-add-ex-sets');
  const restInput = document.getElementById('wo-add-ex-rest');
  const sets = Math.max(1, parseInt(setsInput && setsInput.value, 10) || 1);
  const rest = Math.max(0, parseInt(restInput && restInput.value, 10) || 0);
  const wm = wmState();
  const live = wm.liveSession;
  if (!live) { closeAddExercisePicker(); return; }

  const newRows = [];
  for (let i = 1; i <= sets; i++) {
    newRows.push({
      phase: 'main', exerciseId: p.pendingExId || null, adhocName: p.pendingExId ? null : p.pendingName,
      kind: 'set', setNumber: i, totalSets: sets,
      targetLabel: '', repKind: 'reps', restAfter: rest, restAfterExercise: 90,
      sideNote: null, completed: false, reps: null, weight: null, holdSeconds: null, durationMinutes: null
    });
  }
  // Insert right after wherever the session currently stands, so it
  // becomes the immediate next exercise — matches "adds the sets as the
  // immediate exercise next" for the on-the-fly case, and slots sensibly
  // into a preloaded workout too.
  const firstIncomplete = live.rows.findIndex(r => !r.completed);
  const insertAt = firstIncomplete === -1 ? live.rows.length : firstIncomplete;
  live.rows.splice(insertAt, 0, ...newRows);
  live.activeRowIndex = insertAt;
  save();
  closeAddExercisePicker();
  renderPlayerBody();
  if (typeof showToast === 'function') showToast('Added to your workout');
}

function closePlayerPanel() {
  hidePlayerPanel();
  renderWorkoutHome();
}


function hidePlayerPanel() {
  const panel = document.getElementById('wo-player-panel');
  if (!panel) return;
  panel.classList.remove('open');
  stopPlayerClock();
  clearBigTimer();
  setTimeout(() => { panel.style.display = 'none'; }, 250);
}

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

// A single master interval drives both clocks, so they change in the same
// instant instead of each running its own independently-phased setInterval
// (which would drift apart by up to ~1s from each other). When a new
// countdown starts mid-second, it just displays its starting value and
// waits for the next master tick to make its first decrement — that's
// what keeps it in phase with the total-time clock, at the cost of the
// first "second" on screen sometimes running slightly short. That
// trade-off doesn't matter here, and always ticking together does.
function startPlayerClock() {
  stopPlayerClock();
  updatePlayerClock();
  _playerClockInterval = setInterval(masterTick, 1000);
}
function stopPlayerClock() {
  if (_playerClockInterval) clearInterval(_playerClockInterval);
  _playerClockInterval = null;
}
function masterTick() {
  updatePlayerClock();
  tickBigTimerIfRunning();
}
function updatePlayerClock() {
  const wm = wmState();
  const valEl = document.getElementById('wo-player-clock-val');
  const wrapEl = document.getElementById('wo-player-clock');
  const live = wm.liveSession;
  if (!valEl || !live) return;
  const now = live.pausedAt || Date.now();
  const elapsed = (now - live.startedAt - (live.totalPausedMs || 0)) / 1000;
  valEl.textContent = (live.pausedAt ? '⏸ ' : '') + fmtClock(elapsed);
  if (wrapEl) wrapEl.classList.toggle('paused', !!live.pausedAt);
}

// Pausing the session clock excludes the paused interval from the total
// logged duration — for real interruptions (phone call, someone needs
// you), not something you're expected to use every set.
function toggleSessionClockPause() {
  const wm = wmState();
  const live = wm.liveSession;
  if (!live) return;
  if (live.pausedAt) {
    live.totalPausedMs = (live.totalPausedMs || 0) + (Date.now() - live.pausedAt);
    live.pausedAt = null;
  } else {
    live.pausedAt = Date.now();
  }
  save();
  updatePlayerClock();
}

// ── TOP TIMER BAR — shared by rest, stretch positioning/hold, pyramid ──
// Lives as a slim fixed bar between the header and the row list (not a
// full-screen overlay), so the rest of the workout stays visible and
// tappable — you can scroll, skip, or check off other rows while it runs.
// Its countdown is decremented from masterTick() (see startPlayerClock),
// not its own interval, so it always ticks in lockstep with the total
// workout clock.
function clearBigTimer() {
  _bigTimerOpts = null;
  _bigTimerRemaining = null;
  _bigTimerPaused = false;
  _bigTimerTotal = null;
  const el = document.getElementById('wo-bigtimer');
  if (el) { el.classList.remove('wo-bigtimer-active', 'paused'); }
}

// Fills the donut ring clockwise from empty (just started) to a full
// circle (time's up) — `remaining`/`total` in seconds. With no `total`
// (static, non-counting steps like pyramid rep prompts) the ring is left
// empty, since there's no progress to show.
function updateBigTimerDonut(remaining, total) {
  const fill = document.getElementById('wo-bigtimer-donut-fill');
  if (!fill) return;
  const progress = total ? Math.min(1, Math.max(0, (total - remaining) / total)) : 0;
  fill.style.strokeDashoffset = BIGTIMER_DONUT_CIRC * (1 - progress);
}

// opts: { label, sub, seconds, onDone, actionsHtml, skipLabel, onSkip }
// If `seconds` is omitted, shows a static (non-counting) timer — used for
// "hold until you tap" style steps (e.g. pyramid rep prompts); the pause
// button is hidden in that case since there's nothing to pause.
// `skipLabel`/`onSkip`, when given, render a single prominent skip button
// right under the timer, naming exactly what it skips (e.g. "Skip resting
// time") — there's deliberately no generic "skip exercise" button here,
// since that action already lives on every exercise's own header.
function showBigTimer(opts) {
  clearBigTimer();
  const el = document.getElementById('wo-bigtimer');
  if (!el) return;
  _bigTimerOpts = opts;
  document.getElementById('wo-bigtimer-label').textContent = opts.label || '';
  document.getElementById('wo-bigtimer-sub').textContent = opts.sub || '';
  document.getElementById('wo-bigtimer-actions').innerHTML = opts.actionsHtml || '';
  document.getElementById('wo-bigtimer-skipwrap').innerHTML = opts.skipLabel
    ? `<button class="wo-bigtimer-skip-main" onclick="triggerBigTimerSkip()">${opts.skipLabel}</button>`
    : '';
  const numEl = document.getElementById('wo-bigtimer-num');
  const fillEl = document.getElementById('wo-bigtimer-donut-fill');
  if (fillEl) fillEl.style.strokeDasharray = BIGTIMER_DONUT_CIRC;
  el.classList.add('wo-bigtimer-active');
  el.classList.remove('paused');

  if (opts.seconds == null) {
    numEl.textContent = '';
    _bigTimerRemaining = null;
    _bigTimerTotal = null;
    updateBigTimerDonut(0, 0);
    updateBigTimerPauseButton();
    return;
  }
  _bigTimerRemaining = opts.seconds;
  _bigTimerTotal = opts.seconds;
  numEl.textContent = fmtClock(_bigTimerRemaining);
  updateBigTimerDonut(_bigTimerRemaining, _bigTimerTotal);
  updateBigTimerPauseButton();
}

// Called once per second from masterTick() — the shared heartbeat that
// also drives the total workout clock — whenever a countdown is active
// and not paused.
function tickBigTimerIfRunning() {
  if (_bigTimerRemaining == null || _bigTimerPaused) return;
  _bigTimerRemaining--;
  const numEl = document.getElementById('wo-bigtimer-num');
  if (_bigTimerRemaining <= 0) {
    updateBigTimerDonut(0, _bigTimerTotal);
    _bigTimerRemaining = null;
    if (numEl) numEl.textContent = '0:00';
    playBell();
    const onDone = _bigTimerOpts && _bigTimerOpts.onDone;
    if (onDone) onDone();
    return;
  }
  if (numEl) numEl.textContent = fmtClock(_bigTimerRemaining);
  updateBigTimerDonut(_bigTimerRemaining, _bigTimerTotal);
}

function toggleBigTimerPause() {
  if (_bigTimerRemaining == null) return; // nothing counting down to pause
  const el = document.getElementById('wo-bigtimer');
  _bigTimerPaused = !_bigTimerPaused;
  if (el) el.classList.toggle('paused', _bigTimerPaused);
  updateBigTimerPauseButton();
}

// Icon-only, no label — sits directly beside the countdown number rather
// than in a separate row, so pausing/resuming is a one-tap reach right
// next to the number you're watching, not a hunt further down the bar.
function updateBigTimerPauseButton() {
  const btn = document.getElementById('wo-bigtimer-pausebtn');
  if (!btn) return;
  if (_bigTimerRemaining == null) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  btn.textContent = _bigTimerPaused ? '▶' : '❚❚';
  btn.setAttribute('aria-label', _bigTimerPaused ? 'Resume timer' : 'Pause timer');
}

function triggerBigTimerSkip() {
  const onSkip = _bigTimerOpts && _bigTimerOpts.onSkip;
  clearBigTimer();
  if (onSkip) onSkip();
}

// Marks every remaining row for this exercise (within the same phase) as
// done, so the player moves on without requiring numbers for a set you
// didn't actually do.
function skipExercise(i) {
  const wm = wmState();
  const rows = wm.liveSession.rows;
  const row = rows[i];
  if (!row || !row.exerciseId) return;
  rows.forEach(r => {
    if (r.exerciseId === row.exerciseId && r.phase === row.phase) r.completed = true;
  });
  save();
  clearBigTimer();
  renderPlayerBody();
  if (typeof showToast === 'function') showToast('Exercise skipped');
}

// Most recent logged performance for this exercise/set-number, for the
// "last time" ghost hint. Falls back to that session's last set if it had
// fewer sets than the current row asks for.
function getLastSetForRow(exerciseId, setNumber) {
  const wm = wmState();
  for (let i = wm.sessionLog.length - 1; i >= 0; i--) {
    const entry = wm.sessionLog[i].entries.find(e => e.exerciseId === exerciseId);
    if (entry && entry.sets && entry.sets.length) {
      return entry.sets[setNumber - 1] || entry.sets[entry.sets.length - 1];
    }
  }
  return null;
}
function getLastPyramidMinutes(exerciseId) {
  const wm = wmState();
  for (let i = wm.sessionLog.length - 1; i >= 0; i--) {
    const entry = wm.sessionLog[i].entries.find(e => e.exerciseId === exerciseId);
    if (entry && entry.actualMinutes != null) return entry.actualMinutes;
  }
  return null;
}

const PHASE_LABELS = { warmup: 'Warmup', main: 'Main Workout', stretch: 'Stretch' };

// Big "what am I doing right now" image pinned at the top of the player —
// updates whenever the current row changes. Hidden for the warmup step and
// for exercises with no reference image.
function updateHeroExercise(currentIndex) {
  const hero = document.getElementById('wo-pl-hero');
  const img1 = document.getElementById('wo-pl-hero-img-1');
  const img2 = document.getElementById('wo-pl-hero-img-2');
  const nameEl = document.getElementById('wo-pl-hero-name');
  if (!hero || !img1 || !img2 || !nameEl) return;
  const wm = wmState();
  const row = wm.liveSession.rows[currentIndex];
  const ex = row && row.exerciseId ? getExerciseById(row.exerciseId) : null;
  const imgs = (ex && ex.images) || [];
  if (!imgs.length) { hero.style.display = 'none'; return; }
  if (img1.getAttribute('src') !== imgs[0]) img1.src = imgs[0];
  const secondSrc = imgs[1] || imgs[0];
  if (img2.getAttribute('src') !== secondSrc) img2.src = secondSrc;
  nameEl.textContent = ex.name + (row.sideNote ? ' · ' + row.sideNote : '');
  hero.style.display = 'flex';
}

function renderPlayerBody() {
  const wm = wmState();
  const live = wm.liveSession;
  if (!live) return;
  let html = '';
  let lastExId = null;
  let lastPhase = null;
  const firstIncomplete = live.rows.findIndex(r => !r.completed);
  const active = live.activeRowIndex;
  const currentIndex = (active != null && live.rows[active] && !live.rows[active].completed) ? active : firstIncomplete;
  updateHeroExercise(currentIndex);
  updateStretchModeHeader();
  live.rows.forEach((row, i) => {
    if (row.phase !== lastPhase) {
      html += `<div class="wo-pl-phase-hdr">${PHASE_LABELS[row.phase]}</div>`;
      if (row.phase === 'stretch' && live.rows.some(r => r.phase === 'stretch' && !r.completed)) {
        html += renderStretchPhaseControls(i);
      }
      lastPhase = row.phase;
      lastExId = null; // force a fresh exercise header under the new section
    }
    if (row.kind === 'warmup') {
      html += renderWarmupRow(row, i, i === currentIndex);
      return;
    }
    if (row.kind === 'youtube') {
      html += renderYoutubeRow(row, i, i === currentIndex);
      lastExId = null;
      return;
    }
    const ex = getExerciseById(row.exerciseId);
    const name = ex ? ex.name : (row.adhocName || row.exerciseId);
    if (row.exerciseId !== lastExId) lastExId = row.exerciseId;
    html += row.kind === 'stretch' ? renderStretchRow(row, i, ex, name, i === currentIndex) : renderPlayerRow(row, i, ex, name, i === currentIndex);
  });
  document.getElementById('wo-player-rows').innerHTML = html + renderAddExerciseRow(live);
  scrollActiveRowIntoView();
}

// ── ADD EXERCISE MID-SESSION — the "+" always available at the bottom of
// the row list. Prominent on an on-the-fly session (it's the main way the
// workout grows); a small, low-key tile on a preloaded workout (an escape
// hatch, not the point of the screen). ──
function renderAddExerciseRow(live) {
  const prominent = !!live.onTheFly;
  return `
    <div class="wo-pl-add-ex-row ${prominent ? 'wo-pl-add-ex-prominent' : 'wo-pl-add-ex-subtle'}" onclick="openAddExercisePicker()">
      <span class="wo-pl-add-ex-plus">+</span>
      <span class="wo-pl-add-ex-label">${prominent ? 'Add Exercise' : 'Add another exercise'}</span>
    </div>`;
}

// Brings the current (next-up) row into view and gives it a brief
// expand animation, so advancing to the next exercise is visible even
// when it's further down the list than what's currently on screen.
function scrollActiveRowIntoView() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.wo-pl-row-current');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ── STRETCH PHASE CONTROLS — explicit Start button + guaranteed-complete skip ──
// The skip option always marks the stretches done (never leaves them
// outstanding) — it's for "I'll do my own routine", not "I'm not stretching".
function renderStretchPhaseControls(firstStretchIndex) {
  return `
    <div class="wo-pl-stretch-controls">
      <button class="wo-pl-start-stretch-btn" onclick="startStretchFlow(${firstStretchIndex})">▶ Start Stretch</button>
      <div class="wo-pl-skip-stretch-hold"
        onmousedown="startSkipStretchHold()" onmouseup="cancelSkipStretchHold()" onmouseleave="cancelSkipStretchHold()"
        ontouchstart="startSkipStretchHold()" ontouchend="cancelSkipStretchHold()">
        <div class="wo-pl-hold-fill" id="wo-pl-skip-stretch-fill"></div>
        <span>I'll stretch myself — hold 3s to skip</span>
      </div>
    </div>`;
}
// Auto = each finished stretch immediately triggers the next position/hold
// cycle on its own. Manual = flow stops after every completed stretch and
// waits for a tap on that row's own ▶.
function toggleStretchMode() {
  const wm = wmState();
  wm.liveSession.stretchMode = (wm.liveSession.stretchMode || 'auto') === 'auto' ? 'manual' : 'auto';
  save();
  updateStretchModeHeader();
}
// Header toggle is only shown while we're inside the stretch phase (it's
// in the fixed header, not the scrollable list, so it stays visible while
// scrolling/skipping through stretch rows).
function updateStretchModeHeader() {
  const wm = wmState();
  const row = document.getElementById('wo-pl-stretch-mode-row');
  const optAuto = document.getElementById('wo-pl-mode-opt-auto');
  const optManual = document.getElementById('wo-pl-mode-opt-manual');
  if (!row || !optAuto || !optManual) return;
  const rows = wm.liveSession.rows;
  const inStretchPhase = rows.some(r => r.phase === 'stretch' && !r.completed);
  row.style.display = inStretchPhase ? 'flex' : 'none';
  const mode = wm.liveSession.stretchMode || 'auto';
  optAuto.classList.toggle('active', mode === 'auto');
  optManual.classList.toggle('active', mode === 'manual');
}
function startSkipStretchHold() {
  const fill = document.getElementById('wo-pl-skip-stretch-fill');
  if (fill) { fill.style.transition = 'width 3s linear'; requestAnimationFrame(() => fill.style.width = '100%'); }
  _skipStretchHoldTimer = setTimeout(skipAllStretches, 3000);
}
function cancelSkipStretchHold() {
  if (_skipStretchHoldTimer) { clearTimeout(_skipStretchHoldTimer); _skipStretchHoldTimer = null; }
  const fill = document.getElementById('wo-pl-skip-stretch-fill');
  if (fill) { fill.style.transition = 'none'; fill.style.width = '0%'; }
}
function skipAllStretches() {
  const wm = wmState();
  const live = wm.liveSession;
  if (!live) return;
  live.rows.forEach(r => { if (r.phase === 'stretch') r.completed = true; });
  save();
  clearBigTimer();
  renderPlayerBody();
  if (typeof showToast === 'function') showToast('Stretch marked complete — nice work.');
}

// ── WARMUP ROW — no reps/timer, just a reminder + 3s hold-to-complete ──
function renderWarmupRow(row, i, isCurrent) {
  return `
    <div class="wo-pl-row wo-pl-warmup ${row.completed ? 'done' : ''} ${isCurrent ? 'wo-pl-row-current' : ''}">
      <div class="wo-pl-row-main">
        <div class="wo-pl-set-label">Warm up however suits you — lighter reps, mobility, a short walk.</div>
      </div>
      <div class="wo-pl-hold-btn ${row.completed ? 'checked' : ''}"
        onmousedown="startWarmupHold(${i})" onmouseup="cancelWarmupHold()" onmouseleave="cancelWarmupHold()"
        ontouchstart="startWarmupHold(${i})" ontouchend="cancelWarmupHold()">
        <div class="wo-pl-hold-fill" id="wo-pl-hold-fill-${i}"></div>
        <span>${row.completed ? '✓' : 'Hold 3s'}</span>
      </div>
    </div>`;
}
function startWarmupHold(i) {
  const wm = wmState();
  if (wm.liveSession.rows[i].completed) return;
  const fill = document.getElementById('wo-pl-hold-fill-' + i);
  if (fill) { fill.style.transition = 'width 3s linear'; requestAnimationFrame(() => fill.style.width = '100%'); }
  _warmupHoldTimer = setTimeout(() => {
    wm.liveSession.rows[i].completed = true;
    save();
    renderPlayerBody();
  }, 3000);
}
function cancelWarmupHold() {
  if (_warmupHoldTimer) { clearTimeout(_warmupHoldTimer); _warmupHoldTimer = null; }
  document.querySelectorAll('.wo-pl-hold-fill').forEach(f => { f.style.transition = 'none'; f.style.width = '0%'; });
}

// ── YOUTUBE ROW — a video "exercise" added via Insert URL in the builder.
// Tap ▶ to open the video full-screen (real <iframe> overlay, not a new
// tab, so it feels like part of the player). Done marks the row complete
// and advances exactly like finishing a set — no rest timer follows it,
// since a video isn't something you need to recover from. ──
function renderYoutubeRow(row, i, isCurrent) {
  const thumb = row.videoId ? `https://img.youtube.com/vi/${row.videoId}/hqdefault.jpg` : '';
  return `
    <div class="wo-pl-row ${row.completed ? 'done' : ''} ${isCurrent ? 'wo-pl-row-current' : ''}">
      ${thumb ? `<div class="wo-pl-row-thumbs"><img class="wo-pl-row-thumb" src="${thumb}" alt=""></div>` : ''}
      <div class="wo-pl-row-main">
        <div class="wo-pl-row-top">
          <div class="wo-pl-exercise-hdr">▶ ${escapeHtml(row.title)}${row.sideNote ? ` <span class="wo-pl-set-label">· ${row.sideNote}</span>` : ''}</div>
        </div>
        <div class="wo-pl-set-label" style="margin-top:4px;cursor:pointer;text-decoration:underline" onclick="openYoutubeFullscreen(${i})">Watch full screen</div>
      </div>
      <div class="wo-pl-check ${row.completed ? 'checked' : ''}" onclick="playerToggleRow(${i})">✓</div>
    </div>`;
}

function openYoutubeFullscreen(i) {
  const wm = wmState();
  const row = wm.liveSession && wm.liveSession.rows[i];
  if (!row || !row.videoId) return;
  wm.liveSession.activeRowIndex = i;
  save();
  const wrap = document.createElement('div');
  wrap.className = 'wo-yt-fullscreen';
  wrap.id = 'wo-yt-fullscreen';
  wrap.innerHTML = `
    <div class="wo-yt-fullscreen-video">
      <iframe src="https://www.youtube.com/embed/${row.videoId}?autoplay=1&playsinline=1" frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
    </div>
    <div class="wo-yt-fullscreen-bar">
      <span class="wo-yt-fullscreen-close" onclick="closeYoutubeFullscreen()">‹ Back</span>
      <button class="btn btn-quicklog" onclick="doneYoutubeFullscreen(${i})">Done</button>
    </div>`;
  document.body.appendChild(wrap);
}

function closeYoutubeFullscreen() {
  const el = document.getElementById('wo-yt-fullscreen');
  if (el) el.remove();
}

function doneYoutubeFullscreen(i) {
  closeYoutubeFullscreen();
  const wm = wmState();
  const row = wm.liveSession && wm.liveSession.rows[i];
  if (row && !row.completed) playerToggleRow(i);
}

function renderPlayerRow(row, i, ex, name, isCurrent) {
  const currentCls = isCurrent ? 'wo-pl-row-current' : '';
  const thumbsHtml = (ex && ex.images && ex.images.length)
    ? `<div class="wo-pl-row-thumbs">${ex.images.slice(0, 2).map(src => `<img class="wo-pl-row-thumb" src="${src}" alt="">`).join('')}</div>`
    : '';
  const titleHtml = (setSuffix) => `
    <div class="wo-pl-row-top">
      <div class="wo-pl-exercise-hdr">${name}${setSuffix ? ` <span class="wo-pl-set-label">· ${setSuffix}</span>` : ''}</div>
      <span class="wo-pl-skip-ex-link" onclick="skipExercise(${i})">Skip</span>
    </div>`;
  if (row.kind === 'pyramid') {
    const lastMin = getLastPyramidMinutes(row.exerciseId);
    return `
      <div class="wo-pl-row ${row.completed ? 'done' : ''} ${currentCls}">
        ${thumbsHtml}
        <div class="wo-pl-row-main">
          ${titleHtml(`Guided Pyramid · ${row.capMinutes} min cap`)}
          ${lastMin != null ? `<div class="wo-pl-last">last: ${lastMin} min</div>` : ''}
        </div>
        <div class="wo-pl-check ${row.completed ? 'checked' : 'play'}" onclick="${row.completed ? '' : `startPyramidFlow(${i})`}">
          ${row.completed ? '✓' : '▶'}
        </div>
      </div>`;
  }

  const last = getLastSetForRow(row.exerciseId, row.setNumber);
  const lastWeight = last && last.weight;
  const showWeight = ex && (ex.supportsWeight || ex.supportsAssist) && (row.repKind === 'reps' || row.repKind === 'amrap' || row.repKind === 'failure');

  let repsTarget, repsHtml;
  if (row.repKind === 'hold') {
    repsTarget = row.targetLabel;
    repsHtml = `<input type="number" inputmode="numeric" class="wo-pl-input" placeholder="sec" value="${row.holdSeconds ?? ''}" oninput="playerUpdateField(${i},'holdSeconds',this.value)">`;
  } else if (row.repKind === 'duration') {
    repsTarget = row.targetLabel;
    repsHtml = `<input type="number" inputmode="decimal" class="wo-pl-input" placeholder="min" value="${row.durationMinutes ?? ''}" oninput="playerUpdateField(${i},'durationMinutes',this.value)">`;
  } else {
    repsTarget = row.targetLabel;
    repsHtml = `<input type="number" inputmode="numeric" class="wo-pl-input" placeholder="reps" value="${row.reps ?? ''}" oninput="playerUpdateField(${i},'reps',this.value)">`;
  }
  let kgHtml = '';
  if (showWeight) {
    kgHtml = `
      <div class="wo-pl-input-group">
        <div class="wo-pl-input-target">${lastWeight ? lastWeight + 'kg' : '&nbsp;'}</div>
        <input type="number" inputmode="decimal" class="wo-pl-input" placeholder="${ex.supportsAssist ? 'assist kg' : 'kg'}" value="${row.weight ?? ''}" oninput="playerUpdateField(${i},'weight',this.value)">
      </div>`;
  }

  return `
    <div class="wo-pl-row ${row.completed ? 'done' : ''} ${currentCls}">
      ${thumbsHtml}
      <div class="wo-pl-row-main">
        ${titleHtml(`Set ${row.setNumber}/${row.totalSets}`)}
        <div class="wo-pl-targets-label">Targets:</div>
        <div class="wo-pl-inputs">
          <div class="wo-pl-input-group">
            <div class="wo-pl-input-target">${repsTarget || '&nbsp;'}</div>
            ${repsHtml}
          </div>
          ${kgHtml}
        </div>
      </div>
      <div class="wo-pl-check ${row.completed ? 'checked' : ''}" onclick="playerToggleRow(${i})">✓</div>
    </div>`;
}

// ── STRETCH ROW — guided, timer-driven, not a manual number entry ──
// Two independent buttons: ▶ (re)starts this row's guided position/hold
// flow; ✓ marks it done outright — same tap-to-toggle checkmark as a
// regular set row — for manually overriding the guided flow.
function renderStretchRow(row, i, ex, name, isCurrent) {
  const thumbsHtml = (ex && ex.images && ex.images.length)
    ? `<div class="wo-pl-row-thumbs">${ex.images.slice(0, 2).map(src => `<img class="wo-pl-row-thumb" src="${src}" alt="">`).join('')}</div>`
    : '';
  return `
    <div class="wo-pl-row ${row.completed ? 'done' : ''} ${isCurrent ? 'wo-pl-row-current' : ''}">
      ${thumbsHtml}
      <div class="wo-pl-row-main">
        <div class="wo-pl-row-top">
          <div class="wo-pl-exercise-hdr">${name} <span class="wo-pl-set-label">· Hold ${row.holdSecondsTarget}s${row.totalSets > 1 ? ` · ${row.setNumber}/${row.totalSets}` : ''}</span></div>
        </div>
      </div>
      <div class="wo-pl-stretch-actions">
        <div class="wo-pl-check play" onclick="startStretchFlow(${i})">▶</div>
        <div class="wo-pl-check ${row.completed ? 'checked' : ''}" onclick="toggleStretchComplete(${i})">✓</div>
      </div>
    </div>`;
}

function playerUpdateField(i, field, val) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  row[field] = val === '' ? null : Number(val);
  save();
}

function playerToggleRow(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  row.completed = !row.completed;
  wm.liveSession.activeRowIndex = i;
  save();
  renderPlayerBody();
  if (row.kind === 'youtube') { clearBigTimer(); return; }
  if (row.completed) startRestIfNeeded(i);
  else clearBigTimer();
}

// Rest between sets of the same exercise uses that entry's own
// restAfter; crossing into a different exercise (still in the main
// phase) uses restAfterExercise. No rest is triggered crossing a phase
// boundary — stretches use their own positioning-timer flow instead.
function startRestIfNeeded(i) {
  const wm = wmState();
  const rows = wm.liveSession.rows;
  const row = rows[i];
  const next = rows[i + 1];
  if (!next || next.phase !== row.phase) { clearBigTimer(); return; }
  const sameExercise = next.exerciseId === row.exerciseId;
  const restSec = sameExercise ? (row.restAfter || 0) : (row.restAfterExercise || 0);
  if (restSec <= 0) { clearBigTimer(); return; }
  showBigTimer({
    label: 'Rest',
    seconds: restSec,
    onDone: () => showToast('Rest over — next set!'),
    skipLabel: 'Skip Rest'
  });
}

// ── STRETCH FLOW (Stage 6) ──
// Tap ▶ on a stretch row → 15s "get in position" → hold timer starts
// automatically → once the hold finishes, the row completes itself (bell +
// the row's own done/promote animations) with no confirm tap needed.
// What happens next depends on liveSession.stretchMode:
//   'auto'   — immediately starts the next stretch row's position/hold flow,
//              so the whole block runs hands-free unless interrupted.
//   'manual' — stops and waits for that next row's own ▶ to be tapped.
// Either way, ▶ and ✓ on any row work at any time as a manual override:
// ▶ (re)starts that row's flow, ✓ marks it done outright.
function startStretchFlow(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  wm.liveSession.activeRowIndex = i;
  save();
  const ex = getExerciseById(row.exerciseId);
  const name = ex ? ex.name : 'position';
  showBigTimer({
    label: `Get in ${name} position`,
    seconds: 15,
    onDone: () => runStretchHold(i),
    skipLabel: 'Skip to stretch',
    onSkip: () => runStretchHold(i)
  });
}
function runStretchHold(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  const ex = getExerciseById(row.exerciseId);
  const name = ex ? ex.name : 'stretch';
  showBigTimer({
    label: `Hold ${name} for ${row.holdSecondsTarget}s`,
    seconds: row.holdSecondsTarget,
    onDone: () => finishStretch(i)
  });
}
function finishStretch(i) {
  completeStretchRow(i);
}
// Manual ✓ override — mark a stretch row done outright, whether or not its
// guided timer is currently running, and (in auto mode) continue the flow.
function toggleStretchComplete(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  if (row.completed) {
    row.completed = false;
    save();
    clearBigTimer();
    renderPlayerBody();
    return;
  }
  completeStretchRow(i);
}
function completeStretchRow(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  if (row.completed) return;
  row.completed = true;
  save();
  clearBigTimer();
  renderPlayerBody();
  if ((wm.liveSession.stretchMode || 'auto') === 'auto') {
    const next = nextStretchIndex(i);
    if (next !== -1) startStretchFlow(next);
  }
}
// First not-yet-completed stretch row after `afterIndex`, stopping as soon
// as the stretch section ends (a non-stretch row or the array end).
function nextStretchIndex(afterIndex) {
  const wm = wmState();
  const rows = wm.liveSession.rows;
  for (let j = afterIndex + 1; j < rows.length; j++) {
    if (rows[j].phase !== 'stretch') return -1;
    if (!rows[j].completed) return j;
  }
  return -1;
}

// ── PYRAMID FLOW (Stage 9) — fully guided ascend/MAX/descend ──
function startPyramidFlow(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  row.pyramidStep = 1; row.pyramidPhase = 'up'; row.pyramidTop = null; row.pyramidLog = [];
  wm.liveSession.activeRowIndex = i;
  save();
  showPyramidStep(i);
}
function showPyramidStep(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  const n = row.pyramidStep;
  showBigTimer({
    label: row.pyramidPhase === 'up' ? `Do ${n} rep${n === 1 ? '' : 's'}` : `Do ${n} rep${n === 1 ? '' : 's'} (descending)`,
    sub: row.pyramidPhase === 'up' ? 'Tap ✓ when done, or MAX if this is your top' : 'Tap ✓ when done',
    actionsHtml: row.pyramidPhase === 'up'
      ? `<button class="wo-bigtimer-tick" onclick="pyramidTick(${i})">✓</button><button class="wo-bigtimer-max" onclick="pyramidMax(${i})">MAX</button>`
      : `<button class="wo-bigtimer-tick" onclick="pyramidTick(${i})">✓</button>`
  });
}
function pyramidRest(i, seconds, next) {
  showBigTimer({ label: 'Rest', seconds, onDone: next, skipLabel: 'Skip Rest', onSkip: next });
}
function pyramidTick(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  row.pyramidLog.push(row.pyramidStep);
  save();
  if (row.pyramidPhase === 'up') {
    const restSec = row.pyramidStep;
    const nextStep = row.pyramidStep + 1;
    pyramidRest(i, restSec, () => {
      row.pyramidStep = nextStep;
      save();
      showPyramidStep(i);
    });
  } else {
    if (row.pyramidStep <= 1) { finishPyramid(i); return; }
    const restSec = row.pyramidStep - 1;
    pyramidRest(i, restSec, () => {
      row.pyramidStep -= 1;
      save();
      showPyramidStep(i);
    });
  }
}
function pyramidMax(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  row.pyramidTop = row.pyramidStep;
  row.pyramidLog.push(row.pyramidStep);
  row.pyramidPhase = 'down';
  save();
  pyramidRest(i, row.pyramidStep, () => {
    row.pyramidStep = Math.max(1, row.pyramidStep - 1);
    save();
    if (row.pyramidTop === 1) { finishPyramid(i); return; }
    showPyramidStep(i);
  });
}
function finishPyramid(i) {
  const wm = wmState();
  const row = wm.liveSession.rows[i];
  row.completed = true;
  row.actualMinutes = Math.round((row.pyramidLog.length ? row.pyramidLog.reduce((a, b) => a + b, 0) : 0) / 10) || null;
  save();
  clearBigTimer();
  renderPlayerBody();
  const next = wm.liveSession.rows[i + 1];
  if (next && next.phase === 'main') startRestIfNeeded(i);
}

// Rough estimate only (duration × ~6 kcal/min for resistance training) —
// there's no AI calorie-estimation step wired up (that'd need a live API
// call this static site doesn't have set up), so this is labeled as an
// estimate rather than pretending to be more precise than it is.
function finishWorkoutSession() {
  const wm = wmState();
  const live = wm.liveSession;
  if (!live) return;

  const completedRows = live.rows.filter(r => r.completed && r.kind !== 'warmup');
  if (completedRows.length === 0 && !confirm('No sets marked done — finish anyway?')) return;

  const byExercise = {};
  live.rows.forEach(r => {
    if (!r.completed || r.kind === 'warmup' || r.kind === 'youtube') return;
    const key = r.exerciseId || ('adhoc:' + (r.adhocName || ''));
    if (!byExercise[key]) byExercise[key] = { exerciseId: r.exerciseId, adhocName: r.adhocName || null, kind: r.kind, sets: [] };
    if (r.kind === 'pyramid') byExercise[key].actualMinutes = r.actualMinutes;
    else if (r.kind === 'stretch') byExercise[key].sets.push({ holdSeconds: r.holdSecondsTarget });
    else byExercise[key].sets.push({ reps: r.reps, weight: r.weight, holdSeconds: r.holdSeconds, durationMinutes: r.durationMinutes });
  });

  const pausedMs = (live.totalPausedMs || 0) + (live.pausedAt ? (Date.now() - live.pausedAt) : 0);
  const durationSec = (Date.now() - live.startedAt - pausedMs) / 1000;
  const totalSets = completedRows.filter(r => r.kind === 'set').length;
  const totalReps = completedRows.reduce((n, r) => n + (r.kind === 'set' && (r.repKind === 'reps' || r.repKind === 'amrap' || r.repKind === 'failure') ? (r.reps || 0) : 0), 0);
  const calories = Math.round(durationSec / 60 * 6);
  const exerciseCount = Object.keys(byExercise).length;

  wm.sessionLog.push({
    date: todayStr(),
    workoutId: live.workoutId,
    workoutName: live.workoutName,
    durationSec: Math.round(durationSec),
    entries: Object.values(byExercise)
  });

  wm.liveSession = null;
  if (live.advancesProgram) wm.currentSlotIndex = (wm.currentSlotIndex || 0) + 1;
  save();

  showWorkoutCompleteScreen({ durationSec, totalSets, totalReps, calories, exercises: exerciseCount });
}

function showWorkoutCompleteScreen(stats) {
  stopPlayerClock();
  clearBigTimer();
  document.getElementById('wo-player-inner').innerHTML = `
    <div class="wo-pl-complete">
      <div class="wo-pl-complete-emoji">🎉</div>
      <div class="wo-pl-complete-title">Session logged</div>
      <div class="wo-pl-complete-stats">
        ${stats.exercises} exercise${stats.exercises === 1 ? '' : 's'} · ${stats.totalSets} set${stats.totalSets === 1 ? '' : 's'}${stats.totalReps ? ' · ' + stats.totalReps + ' reps' : ''}
      </div>
      <div class="wo-pl-complete-stats">${fmtClock(stats.durationSec)} · ~${stats.calories} kcal <span class="wo-pl-est">(estimate)</span></div>
      <button class="btn btn-save" onclick="closePlayerPanel()">Nice, close</button>
    </div>`;
}

// ───────────────────── TRACKING tab (from workout-tracking.js) ─────────────
// ── WORKOUT TRACKING TAB ─────────────────────────────────────────────────
// Reads S.workoutModule[person].sessionLog (written by workout-tracker.js
// on Finish Workout). No chart library — a small hand-rolled SVG polyline,
// consistent with how the rest of the app draws its donut/progress visuals.

let _woTrackSelectedExercise = null;

function renderWorkoutTrackingPanel() {
  const wm = wmState();
  const log = wm.sessionLog || [];

  if (log.length === 0) {
    return `
      <div class="tab-lock-box" style="margin:32px auto 0">
        <div class="tab-lock-icon">📈</div>
        <div class="tab-lock-title">No sessions yet</div>
        <div class="tab-lock-body">Finish a workout from the Workout tab and your history and progress charts will show up here.</div>
      </div>`;
  }

  // Distinct logged exercises, most-recently-logged first.
  const exerciseIds = [];
  for (let i = log.length - 1; i >= 0; i--) {
    log[i].entries.forEach(e => { if (!exerciseIds.includes(e.exerciseId)) exerciseIds.push(e.exerciseId); });
  }
  const selected = (_woTrackSelectedExercise && exerciseIds.includes(_woTrackSelectedExercise))
    ? _woTrackSelectedExercise : exerciseIds[0];
  _woTrackSelectedExercise = selected;

  return `
    <div class="wo-track-select-row">
      <select class="wo-track-select" id="wo-track-exercise-select" onchange="setTrackingExercise(this.value)">
        ${exerciseIds.map(id => {
          const ex = getExerciseById(id);
          return `<option value="${id}" ${id === selected ? 'selected' : ''}>${ex ? ex.name : id}</option>`;
        }).join('')}
      </select>
    </div>
    <div id="wo-track-chart-wrap">${renderExerciseChart(selected)}</div>
    <div class="wo-track-hist-hdr">Recent sessions</div>
    <div id="wo-track-history">${renderSessionHistory()}</div>
  `;
}

function setTrackingExercise(id) {
  _woTrackSelectedExercise = id;
  const wrap = document.getElementById('wo-track-chart-wrap');
  if (wrap) wrap.innerHTML = renderExerciseChart(id);
}

function renderSessionHistory() {
  const wm = wmState();
  return wm.sessionLog.slice().reverse().slice(0, 20).map(s => {
    const totalSets = s.entries.reduce((n, e) => n + (e.sets ? e.sets.length : (e.actualMinutes != null ? 1 : 0)), 0);
    return `
      <div class="wo-hist-row">
        <div class="wo-hist-date">${s.date}</div>
        <div class="wo-hist-main">
          <div class="wo-hist-name">${s.workoutName}</div>
          <div class="wo-hist-meta">${fmtClock(s.durationSec)} · ${totalSets} set${totalSets === 1 ? '' : 's'}</div>
        </div>
      </div>`;
  }).join('');
}

// One progress "score" per session for a given exercise:
// - weighted lift  → best set's estimated 1RM (Epley: weight × (1 + reps/30))
// - isometric hold → longest hold that session, in seconds
// - bodyweight reps → total reps that session (a volume proxy)
// Whichever applies is read from what was actually logged, not assumed
// from the exercise's library metadata, so it stays correct even if a
// person logs a bodyweight set one day and a weighted one the next.
function getExerciseScore(entry) {
  if (entry.kind === 'pyramid') return { value: entry.actualMinutes || 0, unit: 'min' };
  const sets = entry.sets || [];
  const hasWeight = sets.some(s => s.weight);
  const hasHold = sets.some(s => s.holdSeconds != null);
  const hasDuration = sets.some(s => s.durationMinutes != null);
  if (hasWeight) {
    const best = Math.max(...sets.map(s => (s.weight || 0) * (1 + (s.reps || 0) / 30)));
    return { value: Math.round(best * 10) / 10, unit: 'kg (est. 1RM)' };
  }
  if (hasHold) {
    const best = Math.max(...sets.map(s => s.holdSeconds || 0));
    return { value: best, unit: 'sec (best hold)' };
  }
  if (hasDuration) {
    const best = Math.max(...sets.map(s => s.durationMinutes || 0));
    return { value: best, unit: 'min (duration)' };
  }
  const total = sets.reduce((n, s) => n + (s.reps || 0), 0);
  return { value: total, unit: 'reps (total)' };
}

function renderExerciseChart(exerciseId) {
  const wm = wmState();
  const points = [];
  wm.sessionLog.forEach(s => {
    const entry = s.entries.find(e => e.exerciseId === exerciseId);
    if (entry) points.push({ date: s.date, ...getExerciseScore(entry) });
  });
  if (points.length === 0) return '<div class="wo-quick-meta">No logged sets for this exercise yet.</div>';

  const last = points[points.length - 1];

  if (points.length === 1) {
    return `
      <div class="wo-chart-card">
        <div class="wo-chart-latest">${last.value} <span class="wo-chart-unit">${last.unit}</span></div>
        <div class="wo-quick-meta">Log this one more time to start seeing a trend.</div>
      </div>`;
  }

  const w = 300, h = 130, padX = 12, padY = 18;
  const maxV = Math.max(...points.map(p => p.value), 1);
  const stepX = (w - padX * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: h - padY - (p.value / maxV) * (h - padY * 2),
    ...p
  }));
  const pathD = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
  const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="var(--ochre)"></circle>`).join('');

  return `
    <div class="wo-chart-card">
      <div class="wo-chart-latest">${last.value} <span class="wo-chart-unit">${last.unit}</span></div>
      <svg viewBox="0 0 ${w} ${h}" class="wo-chart-svg" preserveAspectRatio="none">
        <path d="${pathD}" fill="none" stroke="var(--ochre)" stroke-width="2"></path>
        ${dots}
      </svg>
      <div class="wo-chart-axis"><span>${points[0].date}</span><span>${last.date}</span></div>
    </div>`;
}
