// ════════════════════════════════════════════════════════════════════════
// KITCHEN.JS — the Kitchen interface (PLAN / SHOP / COOK).
// Merged during file consolidation (July 2026) from: kitchen.js (SHOP + COOK
// tabs) and kitchen-plan.js (shell + PLAN tab: search/saved/create, recipe
// preview sheet). Meal DATA lives separately in kitchen-library.js (the Meal
// Library) — this file only renders/interacts with it.
// ════════════════════════════════════════════════════════════════════════

// ─────────────────────── SHOP + COOK tabs (from kitchen.js) ────────────────
// ── KITCHEN — SHOP tab (shopping list) + COOK tab (recipe-selection
// screen and fullscreen guided Cooking Mode) ──────────────────────────────
// PLAN tab (shelves, search, saved, create, recipe preview sheet) lives in
// kitchen-plan.js. This file only owns what's built from S.kitchen.listed
// once meals have been added to the list there.
//
// Old single/bundle/tier picker, size toggle, and MEAL_LIBRARY-as-single-
// pick model are gone per kitchen-overhaul-prompt.md §10 — see
// kitchen-plan.js for the multi-add "listed" model that replaced it.

// ── SHOP TAB — shopping list built from everything in S.kitchen.listed ──
function renderKitchenShop() {
  const shopEl = document.getElementById('kitchen-shopping');
  if (!shopEl) return;

  const listedMeals = MEAL_LIBRARY.filter(m => S.kitchen.listed[m.id])
    .concat((S.kitchen.custom || []).filter(m => S.kitchen.listed[m.id]));

  // Removable dish-card row above the list — same toggleMealListed() used
  // by meal cards and the recipe preview sheet, so adding/removing a meal
  // anywhere in the app stays in sync with this row without extra wiring.
  const rowEl = document.getElementById('kitchen-listed-row');
  if (rowEl) {
    if (!listedMeals.length) {
      rowEl.style.display = 'none';
      rowEl.innerHTML = '';
    } else {
      rowEl.style.display = 'flex';
      rowEl.innerHTML = listedMeals.map(m => {
        const img = m.image || m.local_image || '';
        return `<div class="kitchen-listed-card" data-mealid="${m.id}">
          ${img ? `<img src="${img}" alt="" loading="lazy">` : `<div class="kitchen-listed-card-placeholder">🍽️</div>`}
          <div class="kitchen-listed-card-name">${m.name}</div>
          <button class="kitchen-listed-card-remove" onclick="event.stopPropagation();toggleMealListed('${m.id}')" aria-label="Remove from list">✕</button>
        </div>`;
      }).join('');
    }
  }

  const ingredientSet = new Set();
  listedMeals.forEach(m => (m.ingredients || []).forEach(i => {
    const label = typeof i === 'string' ? i : `${i.ingredient}${i.measure ? ' — ' + i.measure : ''}`;
    ingredientSet.add(label);
  }));

  let shopRows = [];
  if (!listedMeals.length) {
    shopRows.push('Add meals to your list in Plan to build a shopping list here.');
  } else {
    shopRows = [...ingredientSet].sort();
    shopRows.push('— snacks —');
    shopRows.push('Fruta de temporada', 'Yogur natural o griego (Hacendado)', 'Frutos secos (almendras, nueces)', 'Hummus y crudités (zanahoria, pepino)');
  }
  shopEl.innerHTML = shopRows.map(r => r.startsWith('—')
    ? `<div style="font-size:11px;color:var(--mist);letter-spacing:1.5px;text-transform:uppercase;margin:10px 0 4px;font-family:'Baloo 2',sans-serif">${r.replace(/—/g,'').trim()}</div>`
    : `<div style="font-size:13px;color:var(--sand);padding:5px 0;border-bottom:1px solid var(--clay)">${r}</div>`
  ).join('');
  window.__shoppingListText = shopRows.filter(r => !r.startsWith('—')).join('\n');
  window.__listedMealsForSchedule = listedMeals;
}
function copyShoppingList() {
  if (!window.__shoppingListText) { showToast('Nothing listed yet'); return; }
  copyText(window.__shoppingListText, 'Shopping list copied');
}

// ── AI Assist "both people" toggle — used by the Targets tab's Get Advice
// button. Unrelated to Cook; it just happens to live in this file. ───────
let aiAssistMode = 'solo';
function toggleAIAssistBoth() {
  aiAssistMode = aiAssistMode === 'solo' ? 'couple' : 'solo';
  const btn = document.getElementById('ai-assist-both-btn');
  const submitBtn = document.getElementById('ai-assist-btn');
  if (aiAssistMode === 'couple') {
    if (btn) { btn.style.background = 'var(--ochre)'; btn.style.color = 'var(--bark)'; }
    if (submitBtn) submitBtn.textContent = 'Get Advice (both)';
  } else {
    if (btn) { btn.style.background = 'var(--bark)'; btn.style.color = 'var(--ochre)'; }
    if (submitBtn) submitBtn.textContent = 'Get Advice';
  }
}

// ── COOK TAB ─────────────────────────────────────────────────────────────
// Recipe-selection screen (cards for whatever's on the shopping list) plus
// a fullscreen, hands-free guided Cooking Mode: current step, current
// timer, what happens next — closer to GPS navigation than a recipe page.

// ── Recipe selection screen ──────────────────────────────────────────────
function renderKitchenCook() {
  const el = document.getElementById('kitchen-panel-cook');
  if (!el) return;
  const listedMeals = MEAL_LIBRARY.filter(m => S.kitchen.listed[m.id])
    .concat((S.kitchen.custom || []).filter(m => S.kitchen.listed[m.id]));

  if (!listedMeals.length) {
    el.innerHTML = `
      <div class="ck-empty">
        <div class="ck-empty-emoji">👨‍🍳</div>
        <div class="ck-empty-title">Nothing to cook here</div>
        <div class="ck-empty-sub">Add meals from the Plan section to start cooking.</div>
        <button class="btn btn-ai" onclick="S.kitchen.planTab='all'; setKitchenSection('plan')">Go to Plan</button>
      </div>`;
    return;
  }
  el.innerHTML = `<div class="ck-recipe-list">${listedMeals.map(_ckRecipeCardHtml).join('')}</div>`;
}
function _ckRecipeCardHtml(m) {
  const img = m.image || m.local_image || '';
  const mins = Number.isFinite(m.prep_minutes) ? Math.round(m.prep_minutes) : '—';
  const portions = m.portions || 1;
  return `<div class="ck-recipe-card">
    <div class="ck-recipe-card-img-wrap">${img ? `<img src="${img}" alt="">` : `<div class="ck-recipe-card-img-placeholder">🍽️</div>`}</div>
    <div class="ck-recipe-card-body">
      <div class="ck-recipe-card-name">${m.name}</div>
      <div class="ck-recipe-card-meta">${mins} min · ${portions} portion${portions === 1 ? '' : 's'}</div>
      <button class="btn btn-ai" onclick="ckStartCooking('${m.id}')">Start Cooking</button>
    </div>
  </div>`;
}

// ── Step parsing — turns free-text recipe instructions into discrete,
// titled, timed steps. No per-step data exists in the source recipes, so
// steps are derived: split instructions into sentence-level chunks, then
// label each chunk with a short "<verb> <ingredient>" title (matched
// against a curated list of cooking verbs and the recipe's own ingredient
// names) and any cook time mentioned in that chunk. ──────────────────────
const _CK_VERBS_TIER1 = ['deep-fry','stir-fry','sauté','saute','simmer','boil','marinate','roast','bake',
  'grill','barbecue','steam','poach','blanch','whisk','knead','fold in','drain','chill','rest','freeze',
  'preheat','blend','purée','puree','mash','garnish','glaze','sear','braise','caramelise','caramelize',
  'toast','reduce','whip','fry'];
const _CK_VERBS_TIER2 = ['add','place','put','pour','cover','remove','heat','cook','combine','stir','mix',
  'season','sprinkle','arrange','transfer','cut','chop','slice','dice','mince','peel','wash','rinse',
  'beat','crack','melt','warm','set aside','serve'];
const _CK_TIME_RE = /(\d+)\s*(?:-\s*(\d+)\s*)?(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;

function _ckEscapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function _ckTitleCase(s) { return s.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase()); }

function _ckFindFirst(text, list) {
  const lower = text.toLowerCase();
  let best = null, bestIdx = Infinity;
  for (const w of list) {
    const m = lower.match(new RegExp('\\b' + _ckEscapeRe(w) + '\\b', 'i'));
    if (m && m.index < bestIdx) { bestIdx = m.index; best = w; }
  }
  return best;
}
function _ckIngredientNouns(meal) {
  const out = [];
  (meal.ingredients || []).forEach(ing => {
    const raw = (typeof ing === 'string' ? ing : ing.ingredient || '').trim();
    if (!raw) return;
    const words = raw.replace(/\(.*?\)/g, '').split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
    if (!words.length) return;
    if (words.length > 1) {
      const twoWord = words.slice(-2).join(' ').replace(/[^a-zA-Z ]/g, '');
      out.push({ noun: twoWord.toLowerCase(), display: words.slice(-2).join(' ') });
    }
    const last = words[words.length - 1].replace(/[^a-zA-Z]/g, '');
    if (last.length > 2) out.push({ noun: last.toLowerCase(), display: last });
  });
  return out.sort((a, b) => b.noun.length - a.noun.length);
}
function _ckFindNoun(text, nounMap) {
  const lower = text.toLowerCase();
  let best = null, bestIdx = Infinity;
  for (const { noun, display } of nounMap) {
    const m = lower.match(new RegExp('\\b' + _ckEscapeRe(noun) + '\\b', 'i'));
    if (m && m.index < bestIdx) { bestIdx = m.index; best = display; }
  }
  return best;
}
function _ckDeriveTitle(stepText, nounMap) {
  const verb = _ckFindFirst(stepText, _CK_VERBS_TIER1) || _ckFindFirst(stepText, _CK_VERBS_TIER2);
  const noun = _ckFindNoun(stepText, nounMap);
  if (verb && noun) return _ckTitleCase(verb) + ' ' + _ckTitleCase(noun);
  if (verb) return _ckTitleCase(verb);
  if (noun) return _ckTitleCase(noun);
  const words = stepText.replace(/[.?!]+$/, '').split(/\s+/).slice(0, 4).join(' ');
  return words ? _ckTitleCase(words) : 'Step';
}
function _ckExtractTimerSeconds(text) {
  let total = 0, found = false, m;
  _CK_TIME_RE.lastIndex = 0;
  while ((m = _CK_TIME_RE.exec(text))) {
    const low = parseFloat(m[1]), high = m[2] ? parseFloat(m[2]) : null, unit = m[3].toLowerCase();
    let val = high != null ? high : low;
    if (unit.startsWith('hour') || unit.startsWith('hr')) val *= 3600;
    else if (unit.startsWith('min')) val *= 60;
    total += val;
    found = true;
  }
  return found ? Math.min(Math.round(total), 4 * 3600) : 0;
}
function _ckSplitSteps(instructions) {
  const text = (instructions || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  paragraphs.forEach(p => {
    const sentences = p.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    let buffer = '';
    sentences.forEach(s => {
      buffer = buffer ? buffer + ' ' + s : s;
      if (buffer.length >= 18) { chunks.push(buffer); buffer = ''; }
    });
    if (buffer) {
      if (chunks.length && buffer.length < 18) chunks[chunks.length - 1] += ' ' + buffer;
      else chunks.push(buffer);
    }
  });
  return chunks.length ? chunks : [text];
}
function _ckParseSteps(meal) {
  // Prefer hand-written cook_steps when they exist — skip auto-derive
  // entirely for these recipes. `background` is intentionally dropped for
  // now (see cook_steps_fix_spec.md, option A): no player behavior exists
  // yet for a concurrently-running timer, so it's ignored rather than
  // half-wired.
  if (Array.isArray(meal.cook_steps) && meal.cook_steps.length) {
    return meal.cook_steps.map((s, i) => ({
      id: 's' + i,
      text: s.instruction,
      title: s.label,
      timerSeconds: s.timer_seconds || 0
    }));
  }
  const nounMap = _ckIngredientNouns(meal);
  const chunks = _ckSplitSteps(meal.instructions);
  if (!chunks.length) {
    return [{ id: 's0', text: 'No instructions available for this recipe — use your judgement.', title: 'Cook', timerSeconds: 0 }];
  }
  return chunks.map((text, i) => ({
    id: 's' + i,
    text,
    title: _ckDeriveTitle(text, nounMap),
    timerSeconds: _ckExtractTimerSeconds(text)
  }));
}

// ── Cooking Mode session (in-memory only — a cooking run isn't meant to
// survive a reload, so it's never written to S/Firebase) ─────────────────
// ── Cooking Mode session (in-memory only — a cooking run isn't meant to
// survive a reload, so it's never written to S/Firebase) ─────────────────
let ckSession = null;
let _ckTimerSeq = 0;
let _ckCloseTimeout = null; // handle for the pending panel-hide/wipe scheduled by ckCloseCookMode

function ckFmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
// Shared shape for every clock, whether it's the header's pending
// (not-yet-started) timer for the current step or a background timer
// ticking away from an earlier one.
function _ckNewTimer(label, totalSeconds) {
  return { id: 't' + (++_ckTimerSeq), label, totalSeconds, remaining: totalSeconds,
    running: false, endAt: null, tickHandle: null, completed: false };
}
function _ckBeginTimerTicking(t) {
  t.running = true;
  t.completed = false;
  t.endAt = Date.now() + t.remaining * 1000;
  clearInterval(t.tickHandle);
  t.tickHandle = setInterval(() => ckTickNamedTimer(t.id), 250);
}
// If the current step carries its own (non-background) timer, preload it
// in the header — ready, not running — so it can be started whenever the
// person is actually ready, independent of marking the step complete.
function _ckSetupPendingTimerForCurrentStep() {
  if (!ckSession) return;
  const step = ckSession.steps[ckSession.currentIndex];
  ckSession.pendingTimer = (step && step.timerSeconds > 0 && !step.background)
    ? _ckNewTimer(step.title, step.timerSeconds)
    : null;
}

function ckStartCooking(mealId) {
  const m = kitchenFindMeal(mealId);
  if (!m) { showToast('Recipe not found'); return; }
  if (_ckCloseTimeout) { clearTimeout(_ckCloseTimeout); _ckCloseTimeout = null; }
  _kitchenBumpPopularity(mealId);
  const steps = _ckParseSteps(m);
  ckSession = {
    meal: m, steps, currentIndex: 0,
    timers: [],            // running/paused background clocks, shown at the top
    pendingTimer: null,    // current step's own timer, preloaded but not started
    alertQueue: [],        // ids of finished timers waiting for the full-screen takeover
    activeAlertId: null,
    autoMode: !!S.kitchen.cookAutoMode,
    alarm: S.kitchen.cookAlarm || 'bell',
    videoShown: false,
    startedAt: Date.now(),
    finishedAt: null,
    finished: false
  };
  _ckSetupPendingTimerForCurrentStep();
  const panel = document.getElementById('ck-player-panel');
  if (!panel) return;
  ckRenderPlayer();
  panel.style.display = 'block';
  void panel.offsetWidth;
  panel.classList.add('open');
  if (ckSession.autoMode) ckMaybeAutoStartTimer();
}
// Auto Mode auto-starts the current step's own preloaded timer the moment
// it becomes current (instead of waiting for a manual tap on Play).
function ckMaybeAutoStartTimer() {
  if (ckSession && ckSession.autoMode && ckSession.pendingTimer &&
      !ckSession.pendingTimer.running && ckSession.pendingTimer.remaining > 0) {
    ckStartNamedTimer(ckSession.pendingTimer.id);
  }
}
function _ckClearAllTimers() {
  if (!ckSession) return;
  (ckSession.timers || []).forEach(t => clearInterval(t.tickHandle));
  if (ckSession.pendingTimer) clearInterval(ckSession.pendingTimer.tickHandle);
}
function ckCloseCookMode() {
  _ckClearAllTimers();
  const panel = document.getElementById('ck-player-panel');
  const inner = document.getElementById('ck-player-inner');
  ckSession = null;
  if (_ckCloseTimeout) { clearTimeout(_ckCloseTimeout); _ckCloseTimeout = null; }
  if (!panel) return;
  panel.classList.remove('open');
  _ckCloseTimeout = setTimeout(() => {
    panel.style.display = 'none';
    if (inner) inner.innerHTML = ''; // clear content only — keep #ck-player-inner itself intact
    _ckCloseTimeout = null;
  }, 220);
}
function ckBackToCook() { ckCloseCookMode(); renderKitchenCook(); }
function ckRemoveFromList() {
  if (!ckSession) return;
  const id = ckSession.meal.id;
  ckCloseCookMode();
  toggleMealListed(id);
  renderKitchenCook();
  showToast('Removed from shopping list');
}

// ── Rendering ──────────────────────────────────────────────────────────
function ckRenderPlayer() {
  const inner = document.getElementById('ck-player-inner');
  if (!inner || !ckSession) return;
  if (ckSession.finished) { inner.innerHTML = _ckCompletionHtml(); return; }
  const { meal, steps, currentIndex } = ckSession;
  inner.innerHTML = `
    <div class="ck-normal-content${ckSession.activeAlertId ? ' ck-blurred' : ''}">
      ${_ckHeaderHtml(meal, currentIndex, steps.length)}
      ${_ckTimersBarHtml()}
      ${_ckVideoHtml(meal)}
      <div class="ck-body" id="ck-poem-scroll">
        ${_ckPoemHtml(steps, currentIndex)}
      </div>
      ${_ckSettingsRowHtml()}
    </div>
    ${ckSession.activeAlertId ? _ckAlertHtml() : ''}
  `;
  requestAnimationFrame(() => {
    const cur = inner.querySelector('.ck-poem-line--current');
    if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
function _ckHeaderHtml(meal, idx, total) {
  let progress;
  if (total <= 10) {
    progress = `<div class="ck-progress-dots">${Array.from({ length: total }).map((_, i) =>
      `<span class="ck-dot${i < idx ? ' done' : ''}${i === idx ? ' current' : ''}"></span>`).join('')}</div>`;
  } else {
    const pct = Math.round((idx / total) * 100);
    progress = `<div class="ck-progress-bar"><div class="ck-progress-bar-fill" style="width:${pct}%"></div></div>
    <div class="ck-progress-pct">${pct}% Complete</div>`;
  }
  return `<div class="ck-header">
    <div class="ck-header-top">
      <button class="ck-close" onclick="ckCloseCookMode()">✕</button>
      <div class="ck-header-title">${meal.name}</div>
      <div style="width:22px"></div>
    </div>
    <div class="ck-step-count">Step ${idx + 1} of ${total}</div>
    ${progress}
  </div>`;
}
function _ckYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/);
  return m ? m[1] : null;
}
function _ckYoutubeEmbed(url) {
  const id = _ckYoutubeId(url);
  if (!id) return url;
  // No origin param on purpose: Error 153 ("video player configuration
  // error") is almost always an origin/referrer mismatch check failing —
  // dropping the param skips that check entirely instead of trying to
  // guess the right value across browser tab / installed-PWA / in-app
  // webview contexts, where location.origin doesn't reliably match what
  // YouTube expects.
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}
function _ckYoutubeWatchUrl(url) {
  const id = _ckYoutubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}
function _ckYoutubeThumb(url) {
  const id = _ckYoutubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}
// Swaps the meal-detail thumbnail for a real inline player on tap — same
// embed used in Cooking Mode, so it stays in-app instead of bouncing out
// to youtube.com.
function _kitchenPlayInlineVideo(mealId, url) {
  const box = document.getElementById('meal-detail-yt-' + mealId);
  if (!box || !url) return;
  box.outerHTML = `<div class="meal-detail-yt meal-detail-yt--playing">
    <iframe src="${_ckYoutubeEmbed(url)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
  </div>`;
}
function _ckVideoHtml(meal) {
  const url = meal.video || meal.strYoutube || meal.youtube || null;
  if (!url) return '';
  const shown = ckSession.videoShown;
  return `<div class="ck-video-toggle" onclick="ckToggleVideo()">▶ ${shown ? 'Hide' : 'Watch'} Recipe Video</div>
  ${shown ? `<div class="ck-video-frame"><iframe src="${_ckYoutubeEmbed(url)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` : ''}`;
}
function ckToggleVideo() { if (!ckSession) return; ckSession.videoShown = !ckSession.videoShown; ckRenderPlayer(); }

// ── THE POEM — continuous scrolling text instead of boxed steps. Done
// steps and upcoming steps sit dimmed and smaller above/below; the
// current step reads bigger and brighter, scrolled to just under the
// header. Each line's title reads inline, bold, as its lead-in. ──
function _ckPoemHtml(steps, currentIndex) {
  return `<div class="ck-poem">${steps.map((step, i) => {
    const state = i < currentIndex ? 'done' : (i === currentIndex ? 'current' : 'upcoming');
    return `<div class="ck-poem-line ck-poem-line--${state}" data-stepidx="${i}">
      <div class="ck-poem-text"><span class="ck-poem-title">${step.title}.</span> ${step.text}</div>
      ${state === 'current' ? `<button class="ck-mark-circle" onclick="ckMarkComplete()" aria-label="Mark step complete"></button>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function _ckSettingsRowHtml() {
  return `<div class="ck-settings-row">
    <div class="ck-auto-row">
      <span>Auto Mode</span>
      <label class="ck-switch">
        <input type="checkbox" ${ckSession.autoMode ? 'checked' : ''} onchange="ckSetAutoMode(this.checked)">
        <span class="ck-switch-track"></span>
      </label>
    </div>
    <div class="ck-alarm-row">
      <span>Alarm</span>
      <div class="ck-alarm-options">
        ${['bell', 'beep', 'chime', 'silent'].map(a =>
          `<button class="ck-alarm-chip${ckSession.alarm === a ? ' active' : ''}" onclick="ckSetAlarm('${a}')">${_ckAlarmLabel(a)}</button>`
        ).join('')}
      </div>
    </div>
  </div>`;
}
function _ckAlarmLabel(a) { return { bell: 'Bell', beep: 'Beep', chime: 'Chime', silent: 'Silent' }[a] || a; }
function ckSetAlarm(a) {
  if (!ckSession) return;
  ckSession.alarm = a;
  S.kitchen.cookAlarm = a;
  saveLocalOnly();
  ckRenderPlayer();
  if (a !== 'silent') ckPlayAlarm(true);
}
function ckSetAutoMode(v) {
  if (!ckSession) return;
  ckSession.autoMode = !!v;
  S.kitchen.cookAutoMode = !!v;
  saveLocalOnly();
  if (ckSession.autoMode) ckMaybeAutoStartTimer();
}

// ── THE CLOCKS — live at the top of Cooking Mode, one boxed timer per
// active clock (the current step's own preloaded timer + any background
// timers still running from earlier steps). Each one: label, digits,
// Pause/Stop/Reset, -5/-1/+1/+5 minutes. ──
function _ckFindTimer(id) {
  if (!ckSession) return null;
  if (ckSession.pendingTimer && ckSession.pendingTimer.id === id) return ckSession.pendingTimer;
  return (ckSession.timers || []).find(t => t.id === id);
}
function _ckTimersBarHtml() {
  const list = [...(ckSession.pendingTimer ? [ckSession.pendingTimer] : []), ...(ckSession.timers || [])];
  if (!list.length) return '';
  return `<div class="ck-timers-bar">${list.map(t => _ckTimerBoxHtml(t, t === ckSession.pendingTimer)).join('')}</div>`;
}
function _ckTimerBoxHtml(t, isPending) {
  const remaining = t.running ? Math.max(0, Math.round((t.endAt - Date.now()) / 1000)) : t.remaining;
  let cls = 'ck-timerbox';
  if (isPending) cls += ' pending';
  if (t.running) cls += ' running';
  if (t.running && remaining > 0 && remaining <= 10) cls += ' final10';
  return `<div class="${cls}" data-timerid="${t.id}">
    <div class="ck-timerbox-label">${t.label}</div>
    <div class="ck-timerbox-digits" id="ck-timerdigits-${t.id}">${ckFmtTime(remaining)}</div>
    <div class="ck-timerbox-row">
      <button class="ck-timerbox-btn" onclick="ckAdjustNamedTimer('${t.id}',-5)">-5</button>
      <button class="ck-timerbox-btn" onclick="ckAdjustNamedTimer('${t.id}',-1)">-1</button>
      <button class="ck-timerbox-btn ck-timerbox-main" onclick="ckToggleNamedTimer('${t.id}')" aria-label="${t.running ? 'Pause' : 'Play'}">${t.running ? '❚❚' : '▶'}</button>
      <button class="ck-timerbox-btn" onclick="ckAdjustNamedTimer('${t.id}',1)">+1</button>
      <button class="ck-timerbox-btn" onclick="ckAdjustNamedTimer('${t.id}',5)">+5</button>
    </div>
    <div class="ck-timerbox-row">
      <button class="ck-timerbox-btn ck-timerbox-stop" onclick="ckStopNamedTimer('${t.id}')" aria-label="Stop">Stop</button>
      <button class="ck-timerbox-btn ck-timerbox-reset" onclick="ckResetNamedTimer('${t.id}')" aria-label="Reset">↺</button>
    </div>
  </div>`;
}
function ckToggleNamedTimer(id) {
  const t = _ckFindTimer(id);
  if (!t) return;
  if (t.running) ckPauseNamedTimer(id); else ckStartNamedTimer(id);
}
function ckStartNamedTimer(id) {
  const t = _ckFindTimer(id);
  if (!t) return;
  if (t.remaining <= 0) t.remaining = t.totalSeconds;
  if (t.remaining <= 0) return;
  _ckBeginTimerTicking(t);
  ckRenderPlayer();
}
function ckPauseNamedTimer(id) {
  const t = _ckFindTimer(id);
  if (!t || !t.running) return;
  t.remaining = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
  t.running = false;
  clearInterval(t.tickHandle);
  ckRenderPlayer();
}
function ckTickNamedTimer(id) {
  const t = _ckFindTimer(id);
  if (!t) return;
  const remain = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
  if (remain <= 0) { _ckOnNamedTimerDone(t); return; }
  if (remain !== t.remaining) { t.remaining = remain; _ckUpdateNamedTimerDom(t); }
}
function _ckUpdateNamedTimerDom(t) {
  const el = document.getElementById('ck-timerdigits-' + t.id);
  if (!el) return;
  el.textContent = ckFmtTime(t.remaining);
  const box = el.closest('.ck-timerbox');
  if (box) box.classList.toggle('final10', t.running && t.remaining > 0 && t.remaining <= 10);
}
function ckAdjustNamedTimer(id, deltaMin) {
  const t = _ckFindTimer(id);
  if (!t) return;
  let base = t.running ? Math.max(0, Math.round((t.endAt - Date.now()) / 1000)) : t.remaining;
  base = Math.max(0, base + deltaMin * 60);
  t.remaining = base;
  t.completed = false;
  if (t.running) t.endAt = Date.now() + base * 1000;
  ckRenderPlayer();
}
// Stop — one of the three transport controls per box — cancels and
// removes that clock entirely (not just pauses it).
function ckStopNamedTimer(id) {
  const t = _ckFindTimer(id);
  if (!t) return;
  clearInterval(t.tickHandle);
  if (ckSession.pendingTimer && ckSession.pendingTimer.id === id) ckSession.pendingTimer = null;
  else ckSession.timers = (ckSession.timers || []).filter(x => x.id !== id);
  ckRenderPlayer();
}
function ckResetNamedTimer(id) {
  const t = _ckFindTimer(id);
  if (!t) return;
  clearInterval(t.tickHandle);
  t.running = false;
  t.remaining = t.totalSeconds;
  t.completed = false;
  ckRenderPlayer();
}

// ── Alarm sound — synthesized via Web Audio, no external asset files ────
let _ckAudioCtx = null;
function _ckGetAudioCtx() {
  if (!_ckAudioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) _ckAudioCtx = new AC();
  }
  return _ckAudioCtx;
}
function ckPlayAlarm(preview) {
  const alarm = ckSession ? ckSession.alarm : 'bell';
  if (alarm === 'silent') return;
  const ctx = _ckGetAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const beep = (start, freq, dur, type) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + dur + 0.02);
  };
  if (alarm === 'bell') { beep(now, 880, 0.35, 'sine'); beep(now + 0.28, 1175, 0.4, 'sine'); beep(now + 0.62, 1568, 0.5, 'sine'); }
  else if (alarm === 'beep') { beep(now, 1000, 0.15, 'square'); beep(now + 0.22, 1000, 0.15, 'square'); beep(now + 0.44, 1000, 0.15, 'square'); }
  else if (alarm === 'chime') { beep(now, 660, 0.6, 'sine'); beep(now + 0.15, 880, 0.6, 'sine'); }
  if (navigator.vibrate && !preview) navigator.vibrate([200, 100, 200]);
}

// ── FULL-SCREEN ALERT — when any clock (background or the current step's
// own) finishes, cooking mode itself pauses: the normal view darkens and
// blurs behind it, and the finished clock takes over the center, big and
// pulsing at 00:00, until dismissed with Stop or the X top-right. If more
// than one clock finishes close together, they queue and show one at a
// time. ──
function ckQueueAlert(t) {
  if (!ckSession) return;
  ckSession.alertQueue = ckSession.alertQueue || [];
  if (!ckSession.activeAlertId) {
    ckSession.activeAlertId = t.id;
    ckRenderPlayer();
  } else {
    ckSession.alertQueue.push(t.id);
  }
}
function _ckOnNamedTimerDone(t) {
  clearInterval(t.tickHandle);
  t.running = false;
  t.remaining = 0;
  t.completed = true;
  ckPlayAlarm();
  const wasPending = ckSession.pendingTimer && ckSession.pendingTimer.id === t.id;
  ckQueueAlert(t);
  // Auto Mode: if it was the current step's own timer, move on by itself
  // once its alert has had a moment on screen — same "finish and continue"
  // feel Auto Mode already had.
  if (wasPending && ckSession.autoMode) {
    setTimeout(() => { if (ckSession && ckSession.activeAlertId === t.id) ckDismissAlert(true); }, 1600);
  }
}
function _ckAlertHtml() {
  const t = _ckFindTimer(ckSession.activeAlertId);
  const label = t ? t.label : 'Timer';
  return `<div class="ck-alert-overlay">
    <button class="ck-alert-close" onclick="ckDismissAlert()" aria-label="Close">✕</button>
    <div class="ck-alert-label">${label}</div>
    <div class="ck-alert-digits">00:00</div>
    <button class="btn ck-alert-stop" onclick="ckDismissAlert()">Stop</button>
  </div>`;
}
function ckDismissAlert(autoAdvance) {
  if (!ckSession || !ckSession.activeAlertId) return;
  const id = ckSession.activeAlertId;
  const wasPending = ckSession.pendingTimer && ckSession.pendingTimer.id === id;
  if (wasPending) ckSession.pendingTimer = null;
  else ckSession.timers = (ckSession.timers || []).filter(x => x.id !== id);
  ckSession.activeAlertId = null;
  if (autoAdvance && wasPending) { ckAdvanceStep(); return; }
  ckSession.activeAlertId = (ckSession.alertQueue || []).shift() || null;
  ckRenderPlayer();
}

// ── Manual progression + recipe completion ──────────────────────────────
function ckMarkComplete() {
  if (!ckSession) return;
  const btn = document.querySelector('.ck-mark-circle');
  if (btn) btn.classList.add('filled');
  setTimeout(() => { if (ckSession) ckAdvanceStep(); }, 220);
}
function ckAdvanceStep() {
  if (!ckSession) return;
  const finishedStep = ckSession.steps[ckSession.currentIndex];
  // The step just completed: if it had its own pending timer running,
  // let it keep ticking in the background bar instead of losing it; if
  // it was never started, it was just an optional convenience clock —
  // drop it.
  if (ckSession.pendingTimer) {
    const p = ckSession.pendingTimer;
    if (p.running || p.remaining !== p.totalSeconds) ckSession.timers.push(p);
    ckSession.pendingTimer = null;
  }
  // Background steps start their own timer automatically the instant
  // they're marked complete, and it keeps running through later steps.
  if (finishedStep && finishedStep.background && finishedStep.timerSeconds > 0) {
    const t = _ckNewTimer(finishedStep.title, finishedStep.timerSeconds);
    ckSession.timers.push(t);
    _ckBeginTimerTicking(t);
  }
  if (ckSession.currentIndex >= ckSession.steps.length - 1) { ckFinishRecipe(); return; }
  ckSession.currentIndex++;
  _ckSetupPendingTimerForCurrentStep();
  ckRenderPlayer();
  if (ckSession.autoMode) ckMaybeAutoStartTimer();
}
function ckFinishRecipe() {
  _ckClearAllTimers();
  ckSession.finished = true;
  ckSession.finishedAt = Date.now();
  ckRenderPlayer();
}
function _ckCompletionHtml() {
  const { meal, startedAt, finishedAt } = ckSession;
  const elapsed = Math.max(0, Math.round(((finishedAt || Date.now()) - startedAt) / 1000));
  return `<div class="ck-complete-screen">
    <div class="ck-complete-emoji">🎉</div>
    <div class="ck-complete-title">Meal Complete</div>
    <div class="ck-complete-sub">${meal.name} is ready.</div>
    <div class="ck-complete-stats">
      <div><span class="ck-complete-stat-val">${ckFmtTime(elapsed)}</span><span class="ck-complete-stat-label">Total Cook Time</span></div>
      <div><span class="ck-complete-stat-val">${meal.portions ?? '—'}</span><span class="ck-complete-stat-label">Portions</span></div>
      <div><span class="ck-complete-stat-val">${meal.protein_g != null ? Math.round(meal.protein_g) + 'g' : '—'}</span><span class="ck-complete-stat-label">Protein</span></div>
      <div><span class="ck-complete-stat-val">${meal.kcal != null ? Math.round(meal.kcal) : '—'}</span><span class="ck-complete-stat-label">Calories</span></div>
    </div>
    <div class="ck-complete-actions">
      <button class="btn btn-ai" onclick="ckCookAgain()">Cook Again</button>
      <button class="btn" onclick="ckBackToCook()">Back to Cook</button>
      <button class="btn ck-remove-btn" onclick="ckRemoveFromList()">Remove From Shopping List</button>
    </div>
  </div>`;
}
function ckCookAgain() {
  if (!ckSession) return;
  ckSession.currentIndex = 0;
  ckSession.finished = false;
  ckSession.finishedAt = null;
  ckSession.startedAt = Date.now();
  ckSession.timers = [];
  ckSession.alertQueue = [];
  ckSession.activeAlertId = null;
  _ckSetupPendingTimerForCurrentStep();
  ckRenderPlayer();
  if (ckSession.autoMode) ckMaybeAutoStartTimer();
}

// ─────────────────── SHELL + PLAN tab (from kitchen-plan.js) ───────────────
// ── KITCHEN SHELL + PLAN TAB ─────────────────────────────────────────────
// Owns: PLAN/SHOP/COOK top toggle, Search/Saved/Create second-level toggle,
// shelves, meal card rendering, search+filters+sort, saved grid, create
// form, and the Recipe Preview Sheet (extends the existing
// #entry-detail-panel overlay). SHOP tab content (shopping list) and COOK
// tab content (recipe-selection screen + fullscreen guided Cooking Mode)
// are rendered by kitchen.js — this file only owns the top-level panel
// switching that shows/hides them.
//
// Simplification vs the PDF spec, flagged here rather than buried: the
// spec describes tapping "Search" morphing the tab row into a search bar
// with a back arrow (a separate interaction state). Built instead as: the
// Search tab always shows a search bar + Filters/Sort buttons at the top,
// with shelves underneath when the query is empty and a results grid once
// you start typing. Same functionality, simpler to keep in sync with
// state, no separate "search-active" mode to track. Say the word if you
// want the morph-with-back-arrow animation built out to match the PDF
// pixel-for-pixel.

// ── SHELL: PLAN | SHOP | COOK ────────────────────────────────────────────
function setKitchenSection(section) {
  S.kitchen.section = section;
  saveLocalOnly();
  renderKitchen();
}

function setKitchenPlanTab(tab) {
  S.kitchen.planTab = tab;
  saveLocalOnly();
  renderKitchenPlanTab();
}

function renderKitchen() {
  const root = document.getElementById('kitchen-root');
  if (!root) return; // #sec-kitchen not yet in this build of index.html

  const section = S.kitchen.section || 'plan';
  document.querySelectorAll('#hdr-toggle-kitchen .pf-toggle-option').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });
  ['plan','shop','cook'].forEach(s => {
    const panel = document.getElementById('kitchen-panel-' + s);
    if (panel) panel.style.display = s === section ? 'block' : 'none';
  });
  requestAnimationFrame(syncAllPfToggleSliders);

  if (section === 'plan') renderKitchenPlanTab();
  else if (section === 'shop') renderKitchenShop();
  else if (section === 'cook') renderKitchenCook();
}

// Tab key 'all' (was 'search') maps to the existing #kitchen-plantab-search
// panel id — panel ids kept as-is to avoid touching every downstream call.
const KITCHEN_PLANTAB_PANEL = { all: 'search', saved: 'saved', create: 'create' };
function renderKitchenPlanTab() {
  const tab = S.kitchen.planTab || 'all';
  document.querySelectorAll('#kitchen-plantab-toggle .kitchen-plantab-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.plantab === tab);
  });
  Object.keys(KITCHEN_PLANTAB_PANEL).forEach(t => {
    const panel = document.getElementById('kitchen-plantab-' + KITCHEN_PLANTAB_PANEL[t]);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  requestAnimationFrame(positionKitchenPlantabIndicator);

  if (tab === 'all') renderKitchenSearchTab();
  else if (tab === 'saved') renderKitchenSavedGrid();
  else if (tab === 'create') renderKitchenCreateTab();
}
// Mirrors positionPeriodIndicator() in progress.js for the same
// stock-market period-bar visual, just scoped to the kitchen bar.
function positionKitchenPlantabIndicator() {
  const bar = document.querySelector('.kitchen-plantab-bar');
  const ind = document.getElementById('kitchen-plantab-indicator');
  const active = bar && bar.querySelector('.kitchen-plantab-opt.active');
  if (!bar || !ind || !active) return;
  const barRect = bar.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  ind.style.width = activeRect.width + 'px';
  ind.style.transform = 'translateX(' + (activeRect.left - barRect.left) + 'px)';
}

// ── MEAL CARD — single reusable renderer, used by shelves, search
// results, and the saved grid (kitchen-overhaul-prompt.md §5: "do not
// build a second card renderer"). ────────────────────────────────────────
function _ckMealHasVideo(meal) { return !!(meal.video || meal.strYoutube || meal.youtube); }
const KITCHEN_COOK_IMG = 'https://raw.githubusercontent.com/nachostax/la-salud2/main/COOKINGIT.png';
// Shared 3-button action row (Add to List / Log / Cook) — used by both the
// meal card and the full-screen meal detail sheet so they always match.
function _kitchenMealActionsHtml(meal) {
  const listed = !!S.kitchen.listed[meal.id];
  return `<div class="meal-card-actions" data-mealid="${meal.id}">
    <button class="meal-card-act meal-card-act--list${listed ? ' active' : ''}" onclick="event.stopPropagation();toggleMealListed('${meal.id}')" aria-label="Add to list">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>${listed ? 'Added' : 'Add to List'}</span>
    </button>
    <button class="meal-card-act meal-card-act--log" onclick="event.stopPropagation();openKitchenLogModal('${meal.id}')" aria-label="Log">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      <span>Log</span>
    </button>
    <button class="meal-card-act meal-card-act--cook" onclick="event.stopPropagation();ckStartCooking('${meal.id}')" aria-label="Cook">
      <img src="${KITCHEN_COOK_IMG}" alt="Cook">
    </button>
  </div>`;
}
// Keeps every visible copy of a meal's action row (card grid + open detail
// sheet) in sync after Add-to-List is toggled, without a full re-render.
function _kitchenSyncActionButtons(mealId) {
  const listed = !!S.kitchen.listed[mealId];
  document.querySelectorAll(`.meal-card-actions[data-mealid="${mealId}"] .meal-card-act--list`).forEach(btn => {
    btn.classList.toggle('active', listed);
    const label = btn.querySelector('span');
    if (label) label.textContent = listed ? 'Added' : 'Add to List';
  });
}
function renderMealCard(meal) {
  const saved = !!S.kitchen.saved[meal.id];
  const img = meal.image || meal.local_image || '';
  const fmt = v => (v === null || v === undefined || isNaN(v)) ? '—' : Math.round(v);
  return `<div class="meal-card" onclick="openKitchenMealDetail('${meal.id}')">
    <div class="meal-card-img-wrap">
      ${img ? `<img src="${img}" alt="" loading="lazy">` : `<div class="meal-card-img-placeholder">🍽️</div>`}
      ${meal.is_new ? '<div class="meal-card-ribbon">NEW</div>' : ''}
      ${_ckMealHasVideo(meal) ? `<div class="meal-card-yt" aria-label="Video recipe available">
        <svg width="14" height="10" viewBox="0 0 24 17" fill="none"><rect width="24" height="17" rx="4" fill="#FF0000"/><path d="M10 5l6 3.5L10 12V5z" fill="#fff"/></svg>
      </div>` : ''}
      <button class="meal-card-save${saved ? ' active' : ''}" onclick="event.stopPropagation();toggleMealSaved('${meal.id}')" aria-label="Save">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      </button>
    </div>
    <div class="meal-card-body">
      <div class="meal-card-name">${meal.name}</div>
      <div class="meal-card-sub">${meal.category || ''}${meal.area ? ' · ' + meal.area : ''}</div>
      <div class="meal-card-stats">
        <span>${fmt(meal.prep_minutes)}′</span>
        <span>${fmt(meal.protein_g)}g P</span>
        <span>${fmt(meal.kcal)} kcal</span>
        <span>${fmt(meal.portions)} port.</span>
      </div>
      ${_kitchenMealActionsHtml(meal)}
    </div>
  </div>`;
}

// Tracks personal engagement per meal (cooked/logged/listed) so "Most
// Popular" in Sort By has something real to sort by — there's no global
// popularity data in the library itself.
function _kitchenBumpPopularity(mealId) {
  if (!S.kitchen.popularity) S.kitchen.popularity = {};
  S.kitchen.popularity[mealId] = (S.kitchen.popularity[mealId] || 0) + 1;
  saveLocalOnly();
}
function toggleMealListed(id) {
  if (S.kitchen.listed[id]) delete S.kitchen.listed[id];
  else S.kitchen.listed[id] = true;
  save();
  _kitchenSyncActionButtons(id);
  if (S.kitchen.section === 'shop') renderKitchenShop();
}
function toggleMealSaved(id) {
  if (S.kitchen.saved[id]) delete S.kitchen.saved[id];
  else S.kitchen.saved[id] = true;
  save();
  _kitchenRerenderCards();
}
// Re-render whatever card surfaces are currently visible, without a full
// shell rebuild (keeps scroll position in shelves/search results intact).
function _kitchenRerenderCards() {
  const tab = S.kitchen.planTab;
  if (S.kitchen.section !== 'plan') return;
  if (tab === 'all') renderKitchenSearchTab();
  else if (tab === 'saved') renderKitchenSavedGrid();
}

// ── DEFAULT SCREEN — shelves ─────────────────────────────────────────────
function _kitchenShelfHtml(shelf) {
  const meals = shelf.fn();
  return `<div class="kitchen-shelf">
    <div class="kitchen-shelf-hdr">
      <div>
        <div class="kitchen-shelf-title">${shelf.label}</div>
        <div class="kitchen-shelf-sub">${shelf.sub}</div>
      </div>
    </div>
    <div class="kitchen-shelf-scroll hscroll-own">${meals.map(renderMealCard).join('')}</div>
  </div>`;
}
function renderKitchenShelves(container) {
  container.innerHTML = KITCHEN_SHELVES.map(_kitchenShelfHtml).join('');
}

// ── SEARCH TAB — search bar + filters/sort + shelves-or-results ─────────
function renderKitchenSearchTab() {
  const panel = document.getElementById('kitchen-plantab-search');
  if (!panel) return;
  if (!panel.dataset.built) {
    panel.innerHTML = `
      <div class="kitchen-search-row">
        <button class="kitchen-search-exit" id="kitchen-search-exit" onclick="exitKitchenSearch()" style="display:none" aria-label="Exit search">✕</button>
        <input type="text" id="kitchen-search-input" class="kitchen-search-input" placeholder="Search meals or ingredients…" oninput="renderKitchenSearchResults();syncKitchenSearchExit()" onfocus="syncKitchenSearchExit()" onblur="setTimeout(syncKitchenSearchExit,150)">
      </div>
      <div class="kitchen-search-actions">
        <button class="kitchen-filter-btn" id="kitchen-filter-btn" onclick="openKitchenFiltersSheet()">Filters${_kitchenActiveFilterCount() ? ` (${_kitchenActiveFilterCount()})` : ''}</button>
        <button class="kitchen-filter-btn" id="kitchen-sort-btn" onclick="toggleKitchenSortExpand()">Sort By</button>
      </div>
      <div class="kitchen-sort-expand" id="kitchen-sort-expand"></div>
      <div id="kitchen-search-body"></div>
    `;
    panel.dataset.built = '1';
  }
  renderKitchenSearchResults();
}
// Search bar "X" — appears once the input has focus or text, lets the
// person exit the search (clears + blurs) instead of just leaving text
// sitting there. Called on focus/input rather than only on input so
// tapping into an already-empty box also reveals it.
function syncKitchenSearchExit() {
  const input = document.getElementById('kitchen-search-input');
  const exit = document.getElementById('kitchen-search-exit');
  if (!input || !exit) return;
  exit.style.display = (document.activeElement === input || input.value) ? 'flex' : 'none';
}
function exitKitchenSearch() {
  const input = document.getElementById('kitchen-search-input');
  const exit = document.getElementById('kitchen-search-exit');
  if (input) { input.value = ''; input.blur(); }
  if (exit) exit.style.display = 'none';
  renderKitchenSearchResults();
}
function renderKitchenSearchResults() {
  const body = document.getElementById('kitchen-search-body');
  if (!body) return;
  const q = (document.getElementById('kitchen-search-input') || {}).value || '';
  const query = q.trim().toLowerCase();
  const hasFilters = _kitchenActiveFilterCount() > 0;
  const hasSort = !!S.kitchen.sort;
  if (!query && !hasFilters && !hasSort) {
    renderKitchenShelves(body);
    return;
  }
  let results = query ? MEAL_LIBRARY.filter(m =>
    m.name.toLowerCase().includes(query) ||
    (m.ingredients || []).some(i => (i.ingredient || i || '').toLowerCase().includes(query))
  ) : MEAL_LIBRARY.slice();
  results = _kitchenApplyFilters(results);
  results = _kitchenApplySort(results);
  body.innerHTML = `<div class="kitchen-grid">${results.length ? results.map(renderMealCard).join('') : '<div class="kitchen-empty">No meals match — try different terms or clear a filter.</div>'}</div>`;
}

// ── FILTERS SHEET (§4) ────────────────────────────────────────────────────
function _kitchenActiveFilterCount() {
  const f = S.kitchen.filters || {};
  let n = 0;
  if (f.diet && f.diet.length) n++;
  if (f.calBand) n++;
  if (f.proteinBand) n++;
  if (f.timeBand) n++;
  if (f.equipmentExclude) n++;
  return n;
}
function _kitchenApplyFilters(meals) {
  const f = S.kitchen.filters || {};
  let out = meals;
  if (f.diet && f.diet.length) out = out.filter(m => f.diet.includes(m.diet_tag));
  if (f.calBand) { const b = KITCHEN_CAL_BANDS.find(x => x.key === f.calBand); if (b) out = out.filter(b.test); }
  if (f.proteinBand) { const b = KITCHEN_PROTEIN_BANDS.find(x => x.key === f.proteinBand); if (b) out = out.filter(b.test); }
  if (f.timeBand) { const b = KITCHEN_TIME_BANDS.find(x => x.key === f.timeBand); if (b) out = out.filter(b.test); }
  if (f.equipmentExclude) out = out.filter(m => !(m.equipment_tags || []).includes(f.equipmentExclude));
  return out;
}
function _kitchenApplySort(meals) {
  const s = S.kitchen.sort;
  if (!s) return meals;
  const out = meals.slice();
  const pop = id => (S.kitchen.popularity || {})[id] || 0;
  if (s === 'time_asc') out.sort((a, b) => (a.prep_minutes ?? 9e9) - (b.prep_minutes ?? 9e9));
  else if (s === 'time_desc') out.sort((a, b) => (b.prep_minutes ?? -1) - (a.prep_minutes ?? -1));
  else if (s === 'kcal_desc') out.sort((a, b) => (b.kcal ?? -1) - (a.kcal ?? -1));
  else if (s === 'kcal_asc') out.sort((a, b) => (a.kcal ?? 9e9) - (b.kcal ?? 9e9));
  else if (s === 'popular') out.sort((a, b) => pop(b.id) - pop(a.id));
  return out;
}

function openKitchenFiltersSheet() {
  const f = S.kitchen.filters || (S.kitchen.filters = {});
  const dietChips = KITCHEN_DIET_TAGS.map(tag => `<button class="kitchen-chip${(f.diet||[]).includes(tag)?' active':''}" data-diet="${tag}" onclick="_kitchenToggleDietFilter('${tag}')">${tag}</button>`).join('');
  const bandRow = (bands, current, setter) => bands.map(b =>
    `<button class="kitchen-chip${current===b.key?' active':''}" onclick="${setter}('${b.key}')">${b.label}</button>`
  ).join('');
  const equipRow = KITCHEN_EQUIPMENT_TAGS.map(tag =>
    `<button class="kitchen-chip${f.equipmentExclude===tag?' active':''}" onclick="_kitchenSetEquipmentExclude('${tag}')">${tag}</button>`
  ).join('');
  const html = `
    <div class="kitchen-sheet-hdr">
      <div class="kitchen-sheet-title">Filters</div>
      <div style="display:flex;align-items:center;gap:14px">
        <button class="kitchen-sheet-clear" onclick="_kitchenClearFilters()">Clear all</button>
        <button class="kitchen-sheet-close" onclick="closeKitchenSheet()" aria-label="Close">✕</button>
      </div>
    </div>
    <div class="kitchen-sheet-section"><div class="kitchen-sheet-label">Diet</div><div class="kitchen-chip-row">${dietChips}</div></div>
    <div class="kitchen-sheet-section"><div class="kitchen-sheet-label">Calories</div><div class="kitchen-chip-row">${bandRow(KITCHEN_CAL_BANDS, f.calBand, '_kitchenSetCalBand')}</div></div>
    <div class="kitchen-sheet-section"><div class="kitchen-sheet-label">Protein</div><div class="kitchen-chip-row">${bandRow(KITCHEN_PROTEIN_BANDS, f.proteinBand, '_kitchenSetProteinBand')}</div></div>
    <div class="kitchen-sheet-section"><div class="kitchen-sheet-label">Time</div><div class="kitchen-chip-row">${bandRow(KITCHEN_TIME_BANDS, f.timeBand, '_kitchenSetTimeBand')}</div></div>
    <div class="kitchen-sheet-section">
      <div class="kitchen-sheet-label">Equipment (excludes recipes needing it — not populated in the library yet, has no effect until it is)</div>
      <div class="kitchen-chip-row">${equipRow}</div>
    </div>
    <button class="btn btn-ai" style="margin-top:8px" onclick="closeKitchenSheet();renderKitchenSearchResults()">Show results</button>
  `;
  openKitchenSheet(html);
}
function _kitchenToggleDietFilter(tag) {
  const f = S.kitchen.filters;
  f.diet = f.diet || [];
  const i = f.diet.indexOf(tag);
  if (i === -1) f.diet.push(tag); else f.diet.splice(i, 1);
  saveLocalOnly();
  openKitchenFiltersSheet();
  renderKitchenSearchResults();
}
function _kitchenSetCalBand(key) { S.kitchen.filters.calBand = S.kitchen.filters.calBand === key ? null : key; saveLocalOnly(); openKitchenFiltersSheet(); renderKitchenSearchResults(); }
function _kitchenSetProteinBand(key) { S.kitchen.filters.proteinBand = S.kitchen.filters.proteinBand === key ? null : key; saveLocalOnly(); openKitchenFiltersSheet(); renderKitchenSearchResults(); }
function _kitchenSetTimeBand(key) { S.kitchen.filters.timeBand = S.kitchen.filters.timeBand === key ? null : key; saveLocalOnly(); openKitchenFiltersSheet(); renderKitchenSearchResults(); }
function _kitchenSetEquipmentExclude(tag) { S.kitchen.filters.equipmentExclude = S.kitchen.filters.equipmentExclude === tag ? null : tag; saveLocalOnly(); openKitchenFiltersSheet(); renderKitchenSearchResults(); }
function _kitchenClearFilters() { S.kitchen.filters = {}; saveLocalOnly(); openKitchenFiltersSheet(); renderKitchenSearchResults(); }

// ── SORT — tiny animated expand below the "Sort By" button (not a
// slide-up sheet); all 5 options live in one list box, picking one
// collapses it back automatically. ──
const KITCHEN_SORT_OPTIONS = [
  { key: 'time_asc',  label: 'Cooking Fastest' },
  { key: 'time_desc', label: 'Cooking Slowest' },
  { key: 'kcal_desc', label: 'Highest Calories' },
  { key: 'popular',   label: 'Most Popular' },
  { key: 'kcal_asc',  label: 'Lowest Calories' },
];
function _kitchenSortExpandHtml() {
  const s = S.kitchen.sort;
  const rows = KITCHEN_SORT_OPTIONS.map(o =>
    `<div class="kitchen-sort-row${s===o.key?' active':''}" onclick="_kitchenSetSort('${o.key}')">${o.label}</div>`
  ).join('');
  return `<div class="kitchen-sort-list">${rows}${s ? `<div class="kitchen-sort-row kitchen-sort-row--clear" onclick="_kitchenClearSort()">Clear sort</div>` : ''}</div>`;
}
function toggleKitchenSortExpand() {
  const el = document.getElementById('kitchen-sort-expand');
  const btn = document.getElementById('kitchen-sort-btn');
  if (!el) return;
  const opening = !el.classList.contains('open');
  if (opening) {
    el.innerHTML = _kitchenSortExpandHtml();
    el.classList.add('open');
    if (btn) btn.classList.add('active');
  } else {
    el.classList.remove('open');
    if (btn) btn.classList.remove('active');
  }
}
function _kitchenSetSort(key) {
  S.kitchen.sort = key;
  saveLocalOnly();
  const el = document.getElementById('kitchen-sort-expand');
  const btn = document.getElementById('kitchen-sort-btn');
  if (el) el.classList.remove('open'); // picking a choice collapses it back
  if (btn) btn.classList.remove('active');
  renderKitchenSearchResults();
}
function _kitchenClearSort() {
  S.kitchen.sort = null;
  saveLocalOnly();
  const el = document.getElementById('kitchen-sort-expand');
  const btn = document.getElementById('kitchen-sort-btn');
  if (el) el.classList.remove('open');
  if (btn) btn.classList.remove('active');
  renderKitchenSearchResults();
}

// ── GENERIC SLIDE-UP SHEET ────────────────────────────────────────────────
// No bottom-sheet component existed anywhere else in the app (checked
// ui.js/entry-detail.js per kitchen-overhaul-prompt.md §4) — built new,
// following the same translateX-push visual language the app already uses
// for full-screen panels (entry-detail.js), just translateY from the
// bottom instead since this is a partial-height sheet, not a full screen.
function openKitchenSheet(innerHtml) {
  let overlay = document.getElementById('kitchen-sheet-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'kitchen-sheet-overlay';
    overlay.className = 'kitchen-sheet-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeKitchenSheet(); };
    overlay.innerHTML = `<div class="kitchen-sheet" id="kitchen-sheet"></div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById('kitchen-sheet').innerHTML = innerHtml;
  overlay.style.display = 'flex';
  void overlay.offsetWidth;
  overlay.classList.add('open');
}
function closeKitchenSheet() {
  const overlay = document.getElementById('kitchen-sheet-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { overlay.style.display = 'none'; }, 250);
}

// ── SAVED TAB (§5) — grid, 2 per row, from S.kitchen.saved ───────────────
function renderKitchenSavedGrid() {
  const panel = document.getElementById('kitchen-plantab-saved');
  if (!panel) return;
  const saved = MEAL_LIBRARY.filter(m => S.kitchen.saved[m.id])
    .concat((S.kitchen.custom || []).filter(m => S.kitchen.saved[m.id]));
  panel.innerHTML = saved.length
    ? `<div class="kitchen-grid">${saved.map(renderMealCard).join('')}</div>`
    : `<div class="kitchen-empty">Nothing saved yet — tap the bookmark on any meal card to save it here.</div>`;
}

// ── CREATE TAB (§6) — custom meal form ───────────────────────────────────
// Ingredient search index: de-duped ingredient names pulled straight from
// MEAL_LIBRARY (no separate ingredient dataset exists — see
// kitchen-overhaul-prompt.md §6).
let _kitchenIngredientIndex = null;
function _kitchenIngredientNames() {
  if (_kitchenIngredientIndex) return _kitchenIngredientIndex;
  const set = new Set();
  MEAL_LIBRARY.forEach(m => (m.ingredients || []).forEach(i => set.add((i.ingredient || i || '').trim())));
  _kitchenIngredientIndex = [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return _kitchenIngredientIndex;
}
let _kitchenCreateIngredients = [];
function renderKitchenCreateTab() {
  const panel = document.getElementById('kitchen-plantab-create');
  if (!panel) return;
  if (panel.dataset.built) return; // form state lives in the DOM + _kitchenCreateIngredients, no need to rebuild on every tab switch
  panel.innerHTML = `
    <div class="kitchen-create-form">
      <label class="kitchen-sheet-label">Name</label>
      <input type="text" id="kitchen-create-name" class="kitchen-search-input" placeholder="Meal name">
      <label class="kitchen-sheet-label" style="margin-top:10px">Description (optional)</label>
      <textarea id="kitchen-create-desc" class="themed-dashed-field" style="width:100%;box-sizing:border-box;background:var(--bark);border:1.5px dashed var(--mist);border-radius:10px;color:var(--sand);font-family:'Inter',sans-serif;font-size:14px;padding:10px 12px;min-height:60px" rows="2"></textarea>
      <label class="kitchen-sheet-label" style="margin-top:10px">Ingredients</label>
      <input type="text" id="kitchen-create-ing-search" class="kitchen-search-input" placeholder="Search ingredients…" oninput="_kitchenRenderIngredientSuggestions()">
      <div id="kitchen-create-ing-suggestions" class="kitchen-chip-row"></div>
      <div id="kitchen-create-ing-picked" class="kitchen-chip-row" style="margin-top:6px"></div>
      <button class="btn btn-ai" style="margin-top:14px" onclick="_kitchenSaveCustomMeal()">Save meal</button>
    </div>
  `;
  panel.dataset.built = '1';
  _kitchenRenderIngredientPicked();
}
function _kitchenRenderIngredientSuggestions() {
  const q = (document.getElementById('kitchen-create-ing-search').value || '').trim().toLowerCase();
  const el = document.getElementById('kitchen-create-ing-suggestions');
  if (!q) { el.innerHTML = ''; return; }
  const matches = _kitchenIngredientNames().filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  el.innerHTML = matches.map(n => `<button class="kitchen-chip" onclick="_kitchenAddIngredient('${n.replace(/'/g,"\\'")}')">${n}</button>`).join('');
}
function _kitchenAddIngredient(name) {
  if (!_kitchenCreateIngredients.includes(name)) _kitchenCreateIngredients.push(name);
  document.getElementById('kitchen-create-ing-search').value = '';
  document.getElementById('kitchen-create-ing-suggestions').innerHTML = '';
  _kitchenRenderIngredientPicked();
}
function _kitchenRemoveIngredient(name) {
  _kitchenCreateIngredients = _kitchenCreateIngredients.filter(n => n !== name);
  _kitchenRenderIngredientPicked();
}
function _kitchenRenderIngredientPicked() {
  const el = document.getElementById('kitchen-create-ing-picked');
  if (!el) return;
  el.innerHTML = _kitchenCreateIngredients.map(n =>
    `<button class="kitchen-chip active" onclick="_kitchenRemoveIngredient('${n.replace(/'/g,"\\'")}')">${n} ✕</button>`
  ).join('');
}
function _kitchenSaveCustomMeal() {
  const name = (document.getElementById('kitchen-create-name').value || '').trim();
  if (!name) { showToast('Give it a name first'); return; }
  const desc = (document.getElementById('kitchen-create-desc').value || '').trim();
  const meal = {
    id: 'custom-' + Date.now(),
    name,
    description: desc,
    category: 'Custom', area: '', diet_tag: 'Mixed',
    image: '', local_image: '',
    ingredients: _kitchenCreateIngredients.map(i => ({ ingredient: i, measure: '' })),
    instructions: desc,
    equipment_tags: [],
    // No macro/time fields — user-created meals skip nutrition entry per
    // kitchen-overhaul-prompt.md §6; renderMealCard shows '—' for these
    // rather than a fabricated number.
    prep_minutes: null, portions: null, kcal: null, protein_g: null, carbs_g: null, fat_g: null,
    is_new: false, is_custom: true
  };
  S.kitchen.custom.push(meal);
  save();
  showToast(name + ' saved');
  document.getElementById('kitchen-create-name').value = '';
  document.getElementById('kitchen-create-desc').value = '';
  _kitchenCreateIngredients = [];
  _kitchenRenderIngredientPicked();
}

// ── RECIPE PREVIEW SHEET (§7) — extends the existing openKitchenMealDetail
// pattern (#entry-detail-panel overlay, _edpShow/_edpInnerPush/_edDonutHtml)
// rather than building a new overlay system. ─────────────────────────────
function _kitchenInstructionsPreview(text) {
  if (!text) return '';
  const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
  return sentences;
}
function openKitchenMealDetail(mealId) {
  const m = kitchenFindMeal(mealId);
  if (!m) return;
  const img = m.image || m.local_image || '';
  const ingredientsHtml = (m.ingredients || []).map(i =>
    typeof i === 'string' ? i : `${i.ingredient}${i.measure ? ` — ${i.measure}` : ''}`
  ).join('<br>');
  const renderFn = () => {
    const inner = document.getElementById('entry-detail-inner');
    if (!inner) return;
    const saved = !!S.kitchen.saved[m.id];
    inner.innerHTML = `
      ${_edHeader(false)}
      ${img ? `<div style="padding:14px 16px 0;position:relative">
        <img src="${img}" alt="" style="width:100%;border-radius:14px;object-fit:cover;max-height:220px;display:block">
        <button class="meal-card-save${saved ? ' active' : ''}" style="position:absolute;top:14px;right:22px" onclick="toggleMealSaved('${m.id}');_edRefreshMealDetailButtons('${m.id}')" aria-label="Save">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        </button>
      </div>` : ''}
      <div style="padding:18px 16px 0">
        <div style="font-family:'Baloo 2',sans-serif;font-size:26px;color:var(--bone);line-height:1.15">${m.name}</div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--mist)">${m.category || ''}${m.area ? ' · ' + m.area : ''}${m.prep_minutes != null ? ' · ' + m.prep_minutes + ' min' : ''}${m.portions != null ? ' · ' + m.portions + ' portion' + (m.portions===1?'':'s') : ''}</span>
        </div>
      </div>
      ${m.kcal != null ? _edDonutHtml(m.kcal, m.protein_g || 0, m.carbs_g || 0, m.fat_g || 0) : ''}
      ${_ckMealHasVideo(m) ? `<div style="padding:14px 16px 0">
        <div style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:6px">Recipe Video</div>
        <div class="meal-detail-yt" id="meal-detail-yt-${m.id}" onclick="_kitchenPlayInlineVideo('${m.id}','${(m.video || m.strYoutube || m.youtube || '').replace(/'/g, "\\'")}')">
          <img src="${_ckYoutubeThumb(m.video || m.strYoutube || m.youtube)}" alt="Recipe video thumbnail" loading="lazy">
          <div class="meal-detail-yt-play"><svg width="20" height="20" viewBox="0 0 24 17" fill="none"><rect width="24" height="17" rx="4" fill="#FF0000"/><path d="M10 5l6 3.5L10 12V5z" fill="#fff"/></svg></div>
        </div>
      </div>` : ''}
      ${m.instructions ? `<div style="padding:14px 16px 0">
        <div style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:6px">Instructions Preview</div>
        <div style="font-size:14px;color:var(--sand);line-height:1.6">${_kitchenInstructionsPreview(m.instructions)}</div>
      </div>` : ''}
      <div style="padding:14px 16px 0">
        <div style="font-family:'Baloo 2',sans-serif;font-size:10px;letter-spacing:2px;color:var(--mist);text-transform:uppercase;margin-bottom:8px">Ingredients</div>
        <div style="font-size:14px;color:var(--sand);line-height:1.7">${ingredientsHtml || '—'}</div>
      </div>
      <div style="padding:18px 16px 0">${_kitchenMealActionsHtml(m)}</div>
      <div style="height:20px"></div>
    `;
  };
  const panel = document.getElementById('entry-detail-panel');
  const panelOpen = panel && panel.style.display === 'block';
  if (panelOpen) _edpInnerPush(renderFn);
  else { renderFn(); _edpShow(); }
}
// Re-render the save icon in place after toggling Save from the detail
// sheet (Add-to-List/Log/Cook already keep themselves in sync via
// _kitchenSyncActionButtons, called from their own onclick handlers).
function _edRefreshMealDetailButtons(mealId) {
  const inner = document.getElementById('entry-detail-inner');
  if (!inner) return;
  const saved = !!S.kitchen.saved[mealId];
  const saveBtn = inner.querySelector('.meal-card-save');
  if (saveBtn) saveBtn.classList.toggle('active', saved);
  _kitchenRerenderCards();
}

// ── MEAL CARD "LOG" MODAL ─────────────────────────────────────────────────
// Quick-log a specific library meal with an optional photo and/or a plain-
// words portion description. At least one of the two is required before
// Submit unlocks, since the library's own kcal/macro numbers aren't
// reliable enough to log from on their own — see buildKitchenLogPrompt().
let kitchenLogPhotos = []; // [{id, data, mime}]
let kitchenLogPhotoSeq = 0;
let kitchenLogMealId = null;

function openKitchenLogModal(mealId) {
  const meal = kitchenFindMeal(mealId);
  if (!meal) { showToast('Recipe not found'); return; }
  kitchenLogMealId = mealId;
  kitchenLogPhotos = [];
  let overlay = document.getElementById('kitchen-log-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'kitchen-log-overlay';
    overlay.className = 'kitchen-sheet-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeKitchenLogModal(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="kitchen-sheet" id="kitchen-log-sheet">
    <div class="kitchen-sheet-hdr">
      <div class="kitchen-sheet-title">Log ${meal.name}</div>
      <button class="kitchen-sheet-close" onclick="closeKitchenLogModal()" aria-label="Close">✕</button>
    </div>
    <div class="kitchen-sheet-section">
      <div class="kitchen-sheet-label">Photo of your portion (optional)</div>
      <input type="file" id="kitchen-log-photo-input" accept="image/*" capture="environment" multiple style="display:none" onchange="handleKitchenLogPhotos(event)">
      <button class="kitchen-filter-btn" onclick="document.getElementById('kitchen-log-photo-input').click()">Choose photo(s)</button>
      <div class="photo-thumb-row" id="kitchen-log-photo-preview" style="margin-top:8px"></div>
    </div>
    <div class="kitchen-sheet-section">
      <div class="kitchen-sheet-label">Describe your portion (optional)</div>
      <textarea id="kitchen-log-desc-input" class="kitchen-search-input" style="width:100%;min-height:64px;resize:vertical" placeholder="e.g. small bowl, about half the recipe…" oninput="syncKitchenLogSubmitState()"></textarea>
    </div>
    <button class="btn btn-ai" id="kitchen-log-submit-btn" style="margin-top:4px" disabled onclick="submitKitchenMealLog()">Submit Log</button>
  </div>`;
  overlay.style.display = 'flex';
  void overlay.offsetWidth;
  overlay.classList.add('open');
  syncKitchenLogSubmitState();
}
function closeKitchenLogModal() {
  const overlay = document.getElementById('kitchen-log-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { overlay.style.display = 'none'; }, 250);
  kitchenLogPhotos = [];
  kitchenLogMealId = null;
}
function handleKitchenLogPhotos(event) {
  const files = [...event.target.files];
  const prev = document.getElementById('kitchen-log-photo-preview');
  files.forEach(file => {
    const id = ++kitchenLogPhotoSeq;
    const reader = new FileReader();
    reader.onload = e => {
      kitchenLogPhotos.push({ id, data: e.target.result.split(',')[1], mime: file.type });
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
      del.onclick = () => removeKitchenLogPhoto(id);
      wrap.appendChild(img);
      wrap.appendChild(del);
      if (prev) prev.appendChild(wrap);
      syncKitchenLogSubmitState();
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}
function removeKitchenLogPhoto(id) {
  kitchenLogPhotos = kitchenLogPhotos.filter(p => p.id !== id);
  const el = document.querySelector('#kitchen-log-photo-preview .photo-thumb[data-photo-id="' + id + '"]');
  if (el) el.remove();
  syncKitchenLogSubmitState();
}
// Submit stays greyed out until a photo or a description exists — one or
// the other must be provided (per meal-card overhaul spec).
function syncKitchenLogSubmitState() {
  const desc = (document.getElementById('kitchen-log-desc-input') || {}).value || '';
  const btn = document.getElementById('kitchen-log-submit-btn');
  if (btn) btn.disabled = !(kitchenLogPhotos.length || desc.trim());
}
// Own prompt (not formatPrompt from ui.js): the meal library's own
// kcal/macro numbers are unreliable, so this explicitly tells the AI to
// ignore them and use the photo/description as the real portion
// reference, with the recipe reduced to just its ingredient list for
// composition context.
function buildKitchenLogPrompt(meal, desc, person) {
  const honeyRule = person === 'nacho'
    ? `This log is for Nacho. He always has honey in his coffee — include it by default unless the text explicitly says no honey.`
    : `This log is for Gabi. She never has honey in her coffee — never include it, even if the text doesn't mention it either way.`;
  const ingredients = (meal.ingredients || []).map(i => typeof i === 'string' ? i : `${i.ingredient}${i.measure ? ' — ' + i.measure : ''}`).join(', ') || 'no ingredient list available';
  return `You are a nutrition logging assistant. Just describe what's in front of you accurately — no personal or health context needed.

TASK: Create a single downloadable .txt file containing exactly one logged MEAL line — nothing else. Do not reply in the chat with the line; put it only inside the file. NEVER ask a question — there is no one available to answer. If something is ambiguous, make your best estimate and proceed.

RECIPE REFERENCE — "${meal.name}": ${ingredients}. Use this ONLY to know what's likely in the dish (its ingredients/composition) — do NOT use any calorie or macro numbers from this app's recipe library, they are unreliable.

PORTION RULE — IMPORTANT: The photo and/or the description below (from the person) are the real, specific reference for how much was actually eaten. Estimate calories/macros from THAT — be careful and realistic about the portion size shown/described, don't default to a "standard" serving of the recipe.

COFFEE / HONEY RULE (no question — always resolve automatically): ${honeyRule}

${desc ? 'Description from the person: ' + desc : '(no description given — estimate portion from the photo alone)'}

Output exactly one line in this format:
MEAL | Meal: [name] | Calories: [n] | Protein: [n]g | Carbs: [n]g | NetCarbs: [n]g | Fat: [n]g | Fibre: [n]g | Magnesium: [n]mg | VitD: [n]mcg | Iron: [n]mg | Calcium: [n]mg | Zinc: [n]mg | B12: [n]mcg | Omega3: [n]g | Potassium: [n]mg | VitC: [n]mg | Folate: [n]mcg | Time: [HH:MM]

Output: just the .txt file content, ready to download. No chat reply alongside it. No questions, ever.`;
}
async function submitKitchenMealLog() {
  const meal = kitchenFindMeal(kitchenLogMealId);
  if (!meal) { showToast('Recipe not found'); return; }
  const desc = (document.getElementById('kitchen-log-desc-input') || {}).value.trim() || '';
  if (!kitchenLogPhotos.length && !desc) { showToast('Add a photo or describe your portion first'); return; }
  const hasPhoto = kitchenLogPhotos.length > 0;
  if (!hasAnyAIKey()) { showToast('Add an AI API key in Settings first'); return; }
  // Photo parsing only works through Gemini's vision input — Groq/Cerebras
  // are text-only, same restriction as the main meal log (see submitLogAuto).
  if (hasPhoto && !getGeminiKeys().length) {
    showToast('Photo logging needs a Gemini key (Groq/Cerebras are text-only). Add one in Settings, or describe the portion in words instead.');
    return;
  }

  const btn = document.getElementById('kitchen-log-submit-btn');
  setBtnThinking(btn, true, 'Thinking…');
  try {
    const promptText = buildKitchenLogPrompt(meal, desc, S.currentPerson);
    let text;
    if (hasPhoto) {
      const imageParts = kitchenLogPhotos.map(p => ({ inline_data: { mime_type: p.mime, data: p.data } }));
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
    if (!parsed.length && !parsed.rejected?.length) { showToast('AI reply unreadable — try again'); setBtnThinking(btn, false); return; }
    commitEntries(parsed);
    _kitchenBumpPopularity(meal.id);
    save();
    renderVitals();
    renderLogTab();
    syncFullDayCheckbox();
    syncHypoQuickBtn();
    showToast('Logged ' + meal.name);
    closeKitchenLogModal();
  } catch (err) {
    showToast('Log failed: ' + (err.message || 'network error'));
  } finally {
    setBtnThinking(btn, false);
  }
}
