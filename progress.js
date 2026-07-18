// ── PROGRESS (bottom-nav tab) — trends & evolution ──────────────────────────

function _fmtChartDate(d) {
  const [y,m,day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${+day} ${months[+m-1]}`;
}

// ── CHART POINT TOOLTIP ──────────────────────────────────────────────────
// Tapping any chart point (circle.mc-dot, used by every mini-chart in this
// file) shows a small floating tooltip with that point's value + date.
// Tapping ANYWHERE else — another point, blank chart space, the rest of the
// screen — dismisses it. Implemented as a single shared, lazily-created
// element positioned via getBoundingClientRect() off the tapped dot itself,
// so it works the same regardless of each SVG's viewBox scaling. One
// delegated document-level click listener handles every dot on every chart;
// individual render functions don't need their own wiring — they just need
// to keep emitting circle.mc-dot with data-date/data-val/data-unit, as they
// already do.
function _chartTooltipEl() {
  let el = document.getElementById('chart-point-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chart-point-tooltip';
    el.style.cssText = 'position:fixed;z-index:5000;pointer-events:none;display:none;'
      + 'background:var(--bark,#2a2622);border:1px solid rgba(255,255,255,0.12);border-radius:8px;'
      + 'padding:6px 10px;box-shadow:0 4px 14px rgba(0,0,0,0.4);text-align:center;white-space:nowrap;';
    document.body.appendChild(el);
  }
  return el;
}

function hideChartTooltip() {
  const el = document.getElementById('chart-point-tooltip');
  if (el) el.style.display = 'none';
}

function _showChartTooltip(dot) {
  const val = +dot.dataset.val;
  const display = Number.isInteger(val) ? val : (Math.round(val*10)/10);
  const unit = dot.dataset.unit ? ' ' + dot.dataset.unit : '';
  const el = _chartTooltipEl();
  el.innerHTML = `<div style="font-size:13px;font-weight:700;color:var(--bone,#f0ebe1)">${display}${unit}</div>`
    + `<div style="font-size:10px;color:var(--mist,#9a9080);margin-top:1px">${_fmtChartDate(dot.dataset.date)}</div>`;
  el.style.display = 'block';

  // Position above the dot, clamped so it never runs off-screen — the app
  // shell is a narrow single-column layout, so horizontal clamping matters
  // more than vertical here.
  const dotRect = dot.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  let left = dotRect.left + dotRect.width/2 - elRect.width/2;
  left = Math.max(6, Math.min(left, window.innerWidth - elRect.width - 6));
  let top = dotRect.top - elRect.height - 8;
  if (top < 6) top = dotRect.bottom + 8; // not enough room above — flip below
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

if (!window._mcDotListenerBound) {
  window._mcDotListenerBound = true;
  document.addEventListener('click', e => {
    const dot = e.target.closest && e.target.closest('circle.mc-dot');
    if (dot) { _showChartTooltip(dot); return; }
    hideChartTooltip();
  });
}

function renderProgress() {
  const hasLocalData = (S.entries && S.entries.length) || (S.weightLog && S.weightLog.length);
  if (!cloudReady && !_cacheRendered && !hasLocalData) {
    const el = document.getElementById('trends-content');
    if (el) el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--mist);font-family:\'Baloo 2\',sans-serif;font-size:12px;letter-spacing:1px">⟳&nbsp;Syncing…</div>';
    return;
  }
  renderTrends();
}

function smoothPath(pts, tension) {
  if (pts.length < 2) return '';
  const t = tension != null ? tension : 0.15; // gentler tension — less overshoot on sharp turns
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i-1,0)];
    const p1 = pts[i];
    const p2 = pts[i+1];
    const p3 = pts[Math.min(i+2, pts.length-1)];
    const xLo = Math.min(p1.x, p2.x), xHi = Math.max(p1.x, p2.x);
    // Clamp control-point X to the segment's own x-range. Y is left
    // uncontrolled so curvature can still be as tall/deep as tension
    // demands — this only stops the curve from reversing direction on
    // the x-axis (which reads as a loop/hook) at high tension values.
    let cp1x = p1.x + (p2.x - p0.x) * t;
    let cp1y = p1.y + (p2.y - p0.y) * t;
    let cp2x = p2.x - (p3.x - p1.x) * t;
    let cp2y = p2.y - (p3.y - p1.y) * t;
    cp1x = Math.min(Math.max(cp1x, xLo), xHi);
    cp2x = Math.min(Math.max(cp2x, xLo), xHi);
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
// Breaks a coords array (with null gaps) into contiguous segments and
// builds the line + fill path strings. Shared by makeSVGLine (static
// render) and the period-switch animation loop (interpolated frames) so
// both draw gaps identically.
function buildLineAndFill(coords, height) {
  const segments = [];
  let current = [];
  coords.forEach(c => {
    if (c == null) { if (current.length) segments.push(current); current = []; }
    else current.push(c);
  });
  if (current.length) segments.push(current);
  const linePath = segments.filter(seg=>seg.length>=2).map(seg => smoothPath(seg)).join(' ');
  const fillPath = segments.filter(seg=>seg.length>=2).map(seg => {
    const p = smoothPath(seg);
    const lastX = seg[seg.length-1].x, firstX = seg[0].x;
    return `${p} L ${lastX.toFixed(1)},${height} L ${firstX.toFixed(1)},${height} Z`;
  }).join(' ');
  return { linePath, fillPath };
}

function makeSVGLine(points, color, width, height, target, yAxisMin, unitMode, fixedRange, valueLabel) {
  // Single point: there's nothing to draw a LINE between yet, but we can
  // still show one dot instead of an empty chart — so a first weight entry
  // is visible immediately rather than waiting for a second one. Kept as a
  // fully separate branch rather than folded into the length>=2 path below,
  // since that path divides by (points.length-1) in several places, which
  // is 0/undefined-behavior for a single point.
  if (points.length === 1) {
    const p = points[0];
    const targetVal = Array.isArray(target) ? (target[0] != null ? target[0] : null) : target;
    const padX = 6, padY = -10;
    let minV, maxV;
    if (fixedRange) { minV = fixedRange.min; maxV = fixedRange.max; }
    else {
      const vals = [p.y, targetVal].filter(v => v != null);
      minV = Math.min(...vals); maxV = Math.max(...vals);
      if (minV === maxV) { minV -= 1; maxV += 1; } // no target given — fabricate headroom so the dot isn't glued to an edge
      const breathing = (maxV - minV) * 0.3;
      minV -= breathing; maxV += breathing;
    }
    const range = (maxV - minV) || 1;
    const cx = width / 2;
    const cy = padY + (1 - (p.y - minV) / range) * (height - padY * 2);
    const gid = 'grad-' + color.replace(/[^a-z0-9]/g,'');
    let targetLine = '', targetLabelY = null;
    if (targetVal != null) {
      const ty = padY + (1 - (targetVal - minV) / range) * (height - padY * 2);
      targetLine = `<path d="M ${padX},${ty.toFixed(1)} L ${width-padX},${ty.toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.75" stroke-opacity="0.55" stroke-dasharray="4,3"/>`;
      targetLabelY = ty;
    }
    function fmtAxisVal(v) {
      if (v == null) return '';
      if (unitMode === 'L') { const l = v/1000; return (Math.round(l*10)/10) + 'L'; }
      if (Math.abs(v) >= 1000) { const k = v/1000; return (Math.abs(k%1)>0.001 ? k.toFixed(1) : Math.round(k)) + 'K'; }
      const r = Math.round(v*10)/10;
      return (Math.abs(r%1) > 0.001) ? r.toFixed(1) : String(Math.round(r));
    }
    const labels = [{ x: padX, y: height - padY + 3, anchor:'start', text: fmtAxisVal(yAxisMin != null ? yAxisMin : 0) }];
    if (targetLabelY != null) {
      const labelY = targetLabelY < padY + 9 ? targetLabelY + 11 : targetLabelY - 3;
      labels.push({ x: padX, y: labelY, anchor:'start', text: fmtAxisVal(targetVal) });
    }
    const labelsHtml = labels.map(l =>
      `<span class="mc-axis-label" style="left:${(l.x/width*100).toFixed(2)}%;top:${(l.y/height*100).toFixed(2)}%;text-align:${l.anchor==='end'?'right':'left'};transform:translate(${l.anchor==='end'?'-100%':'0'},-100%)">${l.text}</span>`
    ).join('');
    const svg = `<svg class="mini-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" data-h="${height}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      ${targetLine}
      <circle class="mc-dot" data-date="${p.x}" data-val="${p.y}" data-unit="${valueLabel||''}" data-newseg="0" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.6" fill="${color}" style="cursor:pointer"/>
    </svg>`;
    return { svg, labelsHtml };
  }
  if (points.length < 2) return { svg:`<svg class="mini-chart-svg" viewBox="0 0 ${width} ${height}"></svg>`, labelsHtml:'' };
  const vals = points.map(p=>p.y).filter(v=>v!=null);
  if (!vals.length) return { svg:`<svg class="mini-chart-svg" viewBox="0 0 ${width} ${height}"></svg>`, labelsHtml:'' };
  // `target` may be a single flat number (legacy callers, e.g. weight goal)
  // or an array of per-day values aligned 1:1 with `points`, letting the
  // dashed target line step up/down when the underlying goal changed
  // mid-period instead of always drawing as one flat line.
  const targetArr = Array.isArray(target) ? target : (target!=null ? points.map(()=>target) : null);
  const targetVals = targetArr ? targetArr.filter(v=>v!=null) : [];
  const lastTarget = targetVals.length ? targetVals[targetVals.length-1] : null;
  let minV, maxV;
  if (fixedRange) { minV = fixedRange.min; maxV = fixedRange.max; }
  else { minV = Math.min(...vals); maxV = Math.max(...vals); }
  if (targetVals.length) { minV = Math.min(minV, ...targetVals); maxV = Math.max(maxV, ...targetVals); }
  const rawRange = maxV - minV || 1;
  // Extra headroom top/bottom so the smoothed curve's overshoot near sharp
  // turns never gets clipped by the viewBox edges.
  const breathing = rawRange * 0.18;
  minV -= breathing; maxV += breathing;
  const range = maxV - minV || 1;
  const padX = 6, padTop = -8, padBottom = 5;
  // x position is based on the point's index in the FULL date range (even
  // for gaps) so every card's timeline lines up identically; y is null
  // for gap days, which we simply skip when drawing.
  const coords = points.map((p,i) => p.y==null ? null : {
    x: padX + (i/(points.length-1)) * (width - padX*2),
    y: padTop + (1 - (p.y - minV)/range) * (height - padTop - padBottom),
    date: p.x,
    val: p.y
  });
  const { linePath, fillPath } = buildLineAndFill(coords, height);
  const gid = 'grad-' + color.replace(/[^a-z0-9]/g,'');
  let targetLine = '';
  let targetLabelY = null;
  if (targetArr) {
    const tx = i => padX + (i/(points.length-1)) * (width - padX*2);
    const ty = v => padTop + (1 - (v - minV)/range) * (height - padTop - padBottom);
    // Anchor the curve on WEEKLY points, not daily ones — each anchor is
    // the actual (not averaged) target value that applied on that specific
    // day. Spacing anchors 7 days apart gives the S-curve a full week of
    // x-space to ease across on either side of a change, instead of
    // fighting for room inside a handful of days.
    const WEEK = 10; // wider anchor spacing = each transition gets more x-space, reads more subtle
    const lastIdx = targetArr.length - 1;
    const anchorIdx = [];
    for (let i = 0; i <= lastIdx; i += WEEK) anchorIdx.push(i);
    if (anchorIdx[anchorIdx.length-1] !== lastIdx) anchorIdx.push(lastIdx);
    // A day itself might be a gap (no entries logged), so pull the
    // nearest actual value within that week rather than dropping the
    // anchor — a missing anchor would break the curve into a separate
    // segment right where we most want continuity.
    const resolved = anchorIdx.map(i => {
      if (targetArr[i] != null) return targetArr[i];
      for (let d = 1; d < WEEK; d++) {
        if (targetArr[i+d] != null) return targetArr[i+d];
        if (targetArr[i-d] != null) return targetArr[i-d];
      }
      return null;
    });

    const smoothstep = t => { t = Math.min(1, Math.max(0, t)); return t*t*t*(t*(t*6 - 15) + 10); }; // quintic — flatter near each anchor than plain cubic smoothstep
    // Build contiguous runs of anchors (a run breaks only where an anchor
    // truly has no resolvable value anywhere in its week).
    const segments = [];
    let run = [];
    anchorIdx.forEach((i, k) => { if (resolved[k]==null) { if (run.length) segments.push(run); run=[]; } else run.push(k); });
    if (run.length) segments.push(run);

    // Ease across the FULL gap between consecutive anchors (not a fixed
    // window) — smoothstep has zero slope at both t=0 and t=1, so every
    // anchor is a slope-zero point on both the incoming and outgoing side.
    // Chain several changes back to back and it stays perfectly smooth —
    // no kinks — instead of a window overlapping into the next segment
    // and switching formulas mid-ease (which is what caused the kink).
    const valueAt = (idxFloat, seg) => {
      let k = 0;
      while (k < seg.length-2 && anchorIdx[seg[k+1]] <= idxFloat) k++;
      const x0 = anchorIdx[seg[k]], x1 = anchorIdx[seg[k+1]];
      const v0 = resolved[seg[k]], v1 = resolved[seg[k+1]];
      if (v0 === v1 || x1 === x0) return v0;
      const t = (idxFloat - x0) / (x1 - x0);
      return v0 + (v1 - v0) * smoothstep(t);
    };

    const parts = [];
    segments.forEach(seg => {
      const startIdx = anchorIdx[seg[0]], endIdx = anchorIdx[seg[seg.length-1]];
      const samples = Math.max(2, Math.round((endIdx-startIdx) * 6) + 1);
      let d = '';
      for (let s = 0; s <= samples; s++) {
        const idxFloat = startIdx + (endIdx-startIdx) * (s/samples);
        const x = tx(idxFloat), y = ty(valueAt(idxFloat, seg));
        d += (s===0 ? 'M ' : 'L ') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      }
      parts.push(d.trim());
    });
    targetLine = `<path d="${parts.join(' ')}" fill="none" stroke="${color}" stroke-width="0.75" stroke-opacity="0.55" stroke-dasharray="4,3"/>`;
    if (lastTarget != null) targetLabelY = ty(lastTarget);
  }
  // ── AXIS LABELS — rendered as plain HTML text OUTSIDE the SVG (see
  // caller), positioned via % so they never get warped by the chart's
  // scaleX period-switch animation, which only targets the SVG element.
  // Values are compacted (15000 → 15K, 3547 → 3.5K) and, for water,
  // shown in litres instead of ml. ──
  function fmtAxisVal(v) {
    if (v == null) return '';
    if (unitMode === 'L') {
      const l = v / 1000;
      return (Math.round(l*10)/10) + 'L';
    }
    if (Math.abs(v) >= 1000) {
      const k = v / 1000;
      return (Math.abs(k % 1) > 0.001 ? k.toFixed(1) : Math.round(k)) + 'K';
    }
    const r = Math.round(v * 10) / 10;
    return (Math.abs(r % 1) > 0.001) ? r.toFixed(1) : String(Math.round(r));
  }
  const labels = [];
  const bottomLabelVal = yAxisMin != null ? yAxisMin : 0;
  labels.push({ x: padX, y: height - padBottom + 3, anchor:'start', text: fmtAxisVal(bottomLabelVal) });
  if (targetLabelY != null) {
    const labelY = targetLabelY < padTop + 9 ? targetLabelY + 11 : targetLabelY - 3;
    labels.push({ x: padX, y: labelY, anchor:'start', text: fmtAxisVal(lastTarget) });
  }
  // ── PEAK OVERSHOOT LABEL (optional) ──
  // If any logged point is significantly over that day's own target (>20%),
  // call it out on the right side. Only the single highest point gets a
  // label. Compares against the per-day target so a mid-period target
  // change doesn't mis-flag days that were fine under their own goal.
  if (targetArr) {
    let peakIdx = -1, peakVal = -Infinity;
    points.forEach((p, i) => { const t = targetArr[i]; if (t!=null && t>0 && p.y!=null && p.y > t * 1.2 && p.y > peakVal) { peakVal = p.y; peakIdx = i; } });
    if (peakIdx !== -1) {
      const peakY = coords[peakIdx].y;
      const labelY = peakY < padTop + 9 ? peakY + 11 : peakY - 5;
      labels.push({ x: width - padX, y: labelY, anchor:'end', text: fmtAxisVal(peakVal) });
    }
  }
  const labelsHtml = labels.map(l =>
    `<span class="mc-axis-label" style="left:${(l.x/width*100).toFixed(2)}%;top:${(l.y/height*100).toFixed(2)}%;text-align:${l.anchor==='end'?'right':'left'};transform:translate(${l.anchor==='end'?'-100%':'0'},-100%)">${l.text}</span>`
  ).join('');
  const svg = `<svg class="mini-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" data-h="${height}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path class="mc-fill" d="${fillPath}" fill="url(#${gid})" />
    ${targetLine}
    <path class="mc-line" d="${linePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${coords.map((c,i) => c==null ? '' : `<circle class="mc-dot" data-date="${c.date}" data-val="${c.val}" data-unit="${valueLabel||''}" data-newseg="${(i>0&&coords[i-1]==null)?'1':'0'}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="1.3" fill="${color}" style="cursor:pointer"/>`).join('')}
  </svg>`;
  return { svg, labelsHtml };
}

// Positions the sliding underline indicator under the currently-active
// prog-period-opt span. Must be called after the DOM has been written
// (offsetLeft/offsetWidth require a layout pass — use rAF after innerHTML
// sets, or call directly when only classes changed without a re-render).
// Mirrors the moveNavIndicator() pattern from ui.js.
function positionPeriodIndicator() {
  const bar  = document.querySelector('.prog-period-bar');
  const ind  = document.getElementById('prog-period-indicator');
  const active = bar && bar.querySelector('.prog-period-opt.active');
  if (!bar || !ind || !active) return;
  const barRect    = bar.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  ind.style.width     = activeRect.width + 'px';
  ind.style.transform = 'translateX(' + (activeRect.left - barRect.left) + 'px)';
}

function _resamplePath(coords, n) {
  const m = coords.length;
  if (m < 2) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (i/(n-1)) * (m-1);
    const lo = Math.floor(f), hi = Math.min(lo+1, m-1), t = f - lo;
    out.push({ x: coords[lo].x + (coords[hi].x-coords[lo].x)*t, y: coords[lo].y + (coords[hi].y-coords[lo].y)*t });
  }
  return out;
}
function _easeOutCubic(t) { return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }

function setProgressPeriod(period) {
  if (period === (S.progressPeriod || 'month')) return;
  // Capture each dot's CURRENT position (by date), plus the raw curve's
  // coordinate list, before the re-render swaps the DOM out from under
  // us — this is what lets a specific day slide from where it was to
  // where it lands, and the area/line genuinely follow it, instead of
  // the chart just scaling or crossfading as a blob.
  const oldByChart = Array.from(document.querySelectorAll('#trends-content .mini-chart')).map(chart => {
    const dotMap = new Map();
    const coords = [];
    let color = null;
    chart.querySelectorAll('circle.mc-dot').forEach(c => {
      const p = { cx:+c.getAttribute('cx'), cy:+c.getAttribute('cy') };
      dotMap.set(c.dataset.date, p);
      coords.push({ x:p.cx, y:p.cy });
      if (!color) color = c.getAttribute('fill');
    });
    return { dotMap, coords, color };
  });
  S.progressPeriod = period;
  renderTrends();
  const newCharts = document.querySelectorAll('#trends-content .mini-chart');
  newCharts.forEach((chart, i) => {
    const old = oldByChart[i];
    if (!old) return;
    const dots = chart.querySelectorAll('circle.mc-dot');
    const line = chart.querySelector('.mc-line');
    const fill = chart.querySelector('.mc-fill');
    const svgEl = chart.querySelector('.mini-chart-svg');
    const height = svgEl ? +svgEl.dataset.h || 80 : 80;
    const finalLineD = line ? line.getAttribute('d') : null;
    const finalFillD = fill ? fill.getAttribute('d') : null;

    // Dots: prep starting offset (no transition — JS drives every frame below).
    const dotInfo = Array.from(dots).map(dot => {
      const date = dot.dataset.date;
      const newCx = +dot.getAttribute('cx'), newCy = +dot.getAttribute('cy');
      const prev = old.dotMap.get(date);
      dot.style.transition = 'none';
      const newseg = dot.dataset.newseg === '1';
      if (prev) {
        dot.style.opacity = '1';
        return { dot, newCx, newCy, dx: prev.cx-newCx, dy: prev.cy-newCy, entering:false, newseg };
      } else {
        dot.style.opacity = '0';
        return { dot, newCx, newCy, dx:0, dy:0, entering:true, newseg };
      }
    });

    // Entering dots (no old position) borrow the nearest matched
    // neighbor's offset, so the curve extends/shrinks smoothly instead
    // of holding them static while everything else moves (which drew a
    // sharp spike where matched and static points met).
    for (let i=0;i<dotInfo.length;i++) {
      if (!dotInfo[i].entering) continue;
      let src = null;
      for (let d=1; d<dotInfo.length; d++) {
        if (dotInfo[i-d] && !dotInfo[i-d].entering) { src = dotInfo[i-d]; break; }
        if (dotInfo[i+d] && !dotInfo[i+d].entering) { src = dotInfo[i+d]; break; }
      }
      if (src) { dotInfo[i].dx = src.dx; dotInfo[i].dy = 0; }
    }

    // Exiting dots (existed before, no longer in range): rather than just
    // vanishing, spawn a ghost circle at the old spot and carry it along
    // the same motion the nearest surviving neighbor is making, so it
    // visibly slides off the edge instead of popping out of existence.
    const newDates = new Set(Array.from(dots).map(d=>d.dataset.date));
    const edgeVec = dotInfo[0] || dotInfo[dotInfo.length-1];
    const ghosts = [];
    if (edgeVec && svgEl) {
      old.dotMap.forEach((pos, date) => {
        if (newDates.has(date)) return;
        const g = document.createElementNS('http://www.w3.org/2000/svg','circle');
        g.setAttribute('cx', pos.cx); g.setAttribute('cy', pos.cy);
        g.setAttribute('r', '1.3'); g.setAttribute('fill', old.color || '#888');
        svgEl.appendChild(g);
        ghosts.push({ g, startCx:pos.cx, startCy:pos.cy });
      });
    }
    ghosts.sort((a,b)=>a.startCx-b.startCx);
    const canMorph = (dotInfo.length + ghosts.length) >= 2 && line && fill;

    const duration = 320;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now-start)/duration);
      const e = _easeOutCubic(t);
      ghosts.forEach(gh => {
        gh.cx = gh.startCx - edgeVec.dx*e;
        gh.cy = gh.startCy - edgeVec.dy*e;
        gh.g.setAttribute('cx', gh.cx);
        gh.g.setAttribute('cy', gh.cy);
        gh.g.style.opacity = String(1-e);
      });
      // Dots and area read off the exact same per-dot position every
      // frame — the area is built FROM the dots' current spots (not a
      // separately-interpolated shape), so it's physically attached to
      // the line at all times and can't drift or morph independently.
      // A null is inserted wherever the resting render has a gap
      // (data-newseg), so the animated curve breaks in the same places
      // the final static curve does, instead of bridging across days
      // with no data mid-animation.
      const frame = [];
      const isLeftEdge = edgeVec === dotInfo[0];
      if (ghosts.length && isLeftEdge) ghosts.forEach(gh => frame.push({ x:gh.cx, y:gh.cy }));
      dotInfo.forEach((d,i) => {
        const x = d.newCx + d.dx*(1-e);
        const y = d.newCy + d.dy*(1-e);
        if (d.entering) { d.dot.style.opacity = String(e); }
        d.dot.style.transform = `translate(${(x-d.newCx).toFixed(1)}px,${(y-d.newCy).toFixed(1)}px)`;
        if (i>0 && d.newseg) frame.push(null);
        frame.push({ x, y });
      });
      if (ghosts.length && !isLeftEdge) ghosts.forEach(gh => frame.push({ x:gh.cx, y:gh.cy }));
      if (canMorph) {
        const { linePath, fillPath } = buildLineAndFill(frame, height);
        line.setAttribute('d', linePath);
        fill.setAttribute('d', fillPath);
      }
      if (t < 1) { requestAnimationFrame(step); return; }
      dotInfo.forEach(d => { d.dot.style.transform = 'translate(0,0)'; d.dot.style.opacity = '1'; });
      // Safety net only — at e=1 `frame` already equals the exact final
      // coordinates, so this normally reproduces the same string. It
      // only matters for the (rare) gapped-day case where the real path
      // splits into multiple segments that a single continuous frame
      // path doesn't represent mid-animation.
      if (canMorph) { line.setAttribute('d', finalLineD); fill.setAttribute('d', finalFillD); }
      ghosts.forEach(gh => gh.g.remove());
    }
    // Paint the t=0 state synchronously — waiting for the first
    // requestAnimationFrame left one rendered frame at the DEFAULT
    // (final) position/shape before the first animated frame corrected
    // it, which showed up as a quick jump right as the animation started.
    step(start);
  });
}

// ── PROGRESS ACTION BUTTON ────────────────────────────────────────────────
// Updates the label and behaviour of the static "Edit History / Log KG"
// button (#progress-action-btn) to match the currently-active category.
// Default category is 'food' (Food / Activity / Weight order), so the
// button defaults to "Edit History".
function updateProgressActionBtn() {
  const btn = document.getElementById('progress-action-btn');
  if (!btn) return;
  const isWeight = (S.progressCategory || 'food') === 'weight';
  btn.textContent = isWeight ? 'Log KG' : 'Edit History';
}

function handleProgressActionBtn() {
  const isWeight = (S.progressCategory || 'food') === 'weight';
  if (isWeight) {
    // Navigate to the Profile & Targets sub-screen (Profile was folded
    // into Targets in Phase 1), then scroll/focus the current person's
    // weight-log input so the action is immediately obvious.
    showSubSec('targets');
    const inputId = (S.currentPerson === 'gabi' ? 'g' : 'n') + '-weight-log';
    setTimeout(() => {
      const inp = document.getElementById(inputId);
      if (inp) {
        inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inp.focus();
      }
    }, 120); // small delay lets showSubSec() finish its transition first
  } else {
    openHistoryFromProgress();
  }
}

// Weight / Food / Activity — selected in the header toggle (#hdr-toggle-history).
// Syncs header button active states and re-renders.
// Syncs the Food/Activity/Weight header toggle's active state to match
// the given category — shared by setProgressCategory() and the
// tab-entry reset below so both stay in lockstep.
function syncProgressCategoryToggle(category) {
  ['food','activity','weight'].forEach(c => {
    const el = document.getElementById('prog-cat-' + c);
    if (el) el.classList.toggle('active', c === category);
  });
}

function setProgressCategory(category) {
  S.progressCategory = category;
  syncProgressCategoryToggle(category);
  renderTrends();
  updateProgressActionBtn();
}

// Progress always opens on Food — both the toggle and the charts —
// regardless of whatever category was last selected in the session, and
// the same way for both profiles. Called at every Progress tab-entry
// point (nav tap AND swipe navigation), right before renderProgress(),
// rather than baked into renderProgress() itself — renderProgress() also
// re-fires on cloud-sync and person-switch while the user may already be
// sitting on a different category mid-session, and those refreshes
// shouldn't yank the toggle back to Food out from under them.
function resetProgressCategoryToFood() {
  S.progressCategory = 'food';
  syncProgressCategoryToggle('food');
}

// The four workout types a person can log, in fixed display order — kept in
// one place so the "always show all four, even at zero" guarantee can't
// silently drift if a type is added/renamed in the logging UI later.
const WORKOUT_TYPES = ['Walking', 'Cardio', 'Strength', 'Mobility'];
const WORKOUT_TYPE_ICON = { Walking:'🚶', Cardio:'🔥', Strength:'💪', Mobility:'🧘' };

// ── STEP 11 PART C — per-type weekly target config ──────────────────────
// HIIT is NOT a separate workout_type in the logging data (confirmed in
// log.js: both the manual logger's Zone2/HIIT picker and normaliseAIWorkout()
// always store HIIT sessions as workout_type:'Cardio' with intensity:'HIIT',
// vs intensity:'Zone2' for regular cardio). So "Cardio" below means
// Zone2-only — it explicitly excludes intensity:'HIIT' entries, which get
// their own bucket. Strength/Mobility entries never carry a meaningful
// intensity value (normaliseAIWorkout only sets it for Cardio), so no
// filtering needed there beyond workout_type.
//
// Target fields confirmed from settings.js (saveTargets()/renderTargetsBody()):
// sessions live at S.settings.<type>Sessions[person], minutes-per-session at
// S.settings.<type>Mins[person] (Strength has no minutes field — sessions
// only, by design). Weekly minutes target = sessions × minutes-per-session.
//
// floorMin is the minimum logged duration for a session to count toward the
// weekly tally at all (Step 11 Part C's "20-min floor rule", 10-min for
// Mobility) — distinct from the minutes-per-session *target*, which is what
// a "full" session should run, not the bar for counting at all.
const ACTIVITY_TYPES = {
  cardio: {
    label: 'Cardio (Zone 2)',
    color: '#C8863A',
    match: e => e.workout_type === 'Cardio' && e.intensity !== 'HIIT',
    floorMin: 20,
    sessionsTarget: p => (S.settings.cardioSessions && S.settings.cardioSessions[p]) ?? 3,
    minsPerSession:  p => (S.settings.cardioMins     && S.settings.cardioMins[p])     ?? 30,
    dualLine: true   // sessions/week AND minutes/week are co-equal targets
  },
  hiit: {
    label: 'HIIT',
    color: '#C4614A',
    match: e => e.workout_type === 'Cardio' && e.intensity === 'HIIT',
    floorMin: 20,
    sessionsTarget: p => (S.settings.hiitSessions && S.settings.hiitSessions[p]) ?? 1,
    minsPerSession:  p => (S.settings.hiitMins     && S.settings.hiitMins[p])     ?? 30,
    dualLine: false
  },
  strength: {
    label: 'Strength',
    color: '#9C8AC4',
    match: e => e.workout_type === 'Strength',
    floorMin: 20,
    sessionsTarget: p => (S.settings.strengthSessions && S.settings.strengthSessions[p]) ?? 3,
    minsPerSession: null, // no minutes target for Strength — sessions only
    dualLine: false
  },
  mobility: {
    label: 'Mobility',
    color: '#7A9E7E',
    match: e => e.workout_type === 'Mobility',
    floorMin: 10, // exception to the 20-min floor rule
    sessionsTarget: p => (S.settings.mobilitySessions && S.settings.mobilitySessions[p]) ?? 5,
    minsPerSession:  p => (S.settings.mobilityMins     && S.settings.mobilityMins[p])     ?? 15,
    dualLine: false
  }
};

// Builds the weekly date-buckets for a given Progress period. Per the
// confirmed design decision: Week = 1 bucket, Month = exactly 4 buckets
// (last 28 days, not 30 — "weekly and monthly display will show the same
// for actions with weekly targets as it will only involve 4 weeks"), and
// Year/Max get weekly buckets too but are flagged for smoothing (rolled up
// to ~13 points) since 52+ raw weekly points is too dense for a phone
// screen. Buckets are ordered oldest → newest to match how every other
// chart in this file builds its point arrays.
function getWeekBuckets(progressPeriod) {
  let totalDays;
  if (progressPeriod === 'week')       totalDays = 7;
  else if (progressPeriod === 'month') totalDays = 28;
  else if (progressPeriod === 'year')  totalDays = 364;
  else                                 totalDays = 1820; // 'max' — ~5yr, 260 weeks pre-smoothing

  const totalWeeks = totalDays / 7;
  const weeks = [];
  for (let w = totalWeeks - 1; w >= 0; w--) {
    const weekDates = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date(); dt.setDate(dt.getDate() - (w * 7 + d) - 1);
      weekDates.push(toLocalDateStr(dt));
    }
    weeks.push(weekDates);
  }
  const smooth = (progressPeriod === 'year' || progressPeriod === 'max');
  return { weeks, smooth };
}

// Computes the weekly %-of-target series for one activity type. Missing
// weeks read as 0% (no skip/interpolate) per Part C's explicit instruction
// — a visible dip to 0 is the whole point (shows trips, illness, etc.).
function buildActivitySeries(type, person, progressPeriod, entries) {
  const cfg = ACTIVITY_TYPES[type];
  const { weeks, smooth } = getWeekBuckets(progressPeriod);
  const grouped = groupEntriesByPersonDate(entries);

  let weeklyPct = weeks.map(weekDates => {
    let sessions = 0, minutes = 0;
    weekDates.forEach(d => {
      (grouped.get(person + '|' + d) || [])
        .filter(e => e.record_type === 'workout' && cfg.match(e))
        .forEach(e => {
          const dur = e.duration_min || 0;
          if (dur >= cfg.floorMin) { sessions++; minutes += dur; }
        });
    });
    const sessionsTarget = cfg.sessionsTarget(person) || 0;
    const minsTarget = cfg.minsPerSession ? (cfg.minsPerSession(person) || 0) * sessionsTarget : 0;
    return {
      sessionsPct: sessionsTarget > 0 ? (sessions / sessionsTarget) * 100 : 0,
      minutesPct:  minsTarget > 0 ? (minutes / minsTarget) * 100 : null,
      sessions, minutes
    };
  });

  // Year/Max: roll every 4 consecutive weekly points into 1 averaged point
  // (~13 readable points instead of 52+).
  if (smooth) {
    const rolled = [];
    for (let i = 0; i < weeklyPct.length; i += 4) {
      const chunk = weeklyPct.slice(i, i + 4);
      const avgSessions = chunk.reduce((a, b) => a + b.sessionsPct, 0) / chunk.length;
      const mVals = chunk.filter(c => c.minutesPct != null).map(c => c.minutesPct);
      const avgMinutes = mVals.length ? mVals.reduce((a, b) => a + b, 0) / mVals.length : null;
      rolled.push({ sessionsPct: avgSessions, minutesPct: avgMinutes });
    }
    weeklyPct = rolled;
  }

  const avgSessionsPct = weeklyPct.length
    ? weeklyPct.reduce((a, b) => a + b.sessionsPct, 0) / weeklyPct.length
    : 0;

  return { series: weeklyPct, avgSessionsPct };
}

// Single- or dual-line % chart for the Activity redesign (Step 11 Part C).
// Reuses the same smoothing/curve approach as makeSVGLine() but supports
// a second overlaid series (Cardio's sessions% + minutes% lines) and fixes
// the y-axis to 0–100%+ (target is always 100%, per the normalised-%
// design) rather than makeSVGLine()'s data-driven min/max — kept as a
// separate function rather than overloading makeSVGLine() so every
// existing single-series caller (Weight/Calories/etc.) is untouched.
function makeActivitySVG(seriesArr, width, height) {
  const padX = 6, padY = 10;
  const allVals = seriesArr.flatMap(s => s.points.map(p => p.y)).concat([100]);
  let maxV = Math.max(100, ...allVals);
  maxV *= 1.12; // headroom so a >100% peak doesn't clip the top edge
  const minV = 0;
  const range = maxV - minV || 1;

  function coordsFor(points) {
    if (points.length < 2) return null;
    return points.map((p, i) => ({
      x: padX + (i / (points.length - 1)) * (width - padX * 2),
      y: padY + (1 - (p.y - minV) / range) * (height - padY * 2)
    }));
  }
  function smoothPath(pts) {
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      const t = 0.15;
      const cp1x = p1.x + (p2.x - p0.x) * t, cp1y = p1.y + (p2.y - p0.y) * t;
      const cp2x = p2.x - (p3.x - p1.x) * t, cp2y = p2.y - (p3.y - p1.y) * t;
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  const targetY = padY + (1 - (100 - minV) / range) * (height - padY * 2);
  const targetLine = `<line x1="${padX}" y1="${targetY.toFixed(1)}" x2="${(width - padX).toFixed(1)}" y2="${targetY.toFixed(1)}" stroke="rgba(255,255,255,0.4)" stroke-width="0.75" stroke-opacity="0.55" stroke-dasharray="4,3"/>`;

  let paths = '';
  seriesArr.forEach(s => {
    const coords = coordsFor(s.points);
    if (!coords) return;
    paths += `<path d="${smoothPath(coords)}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    paths += coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2" fill="${s.color}"/>`).join('');
  });

  const bottomY = height - padY + 3;
  const axisLabels = `
    <text x="${padX}" y="${bottomY.toFixed(1)}" font-size="9" fill="rgba(255,255,255,0.35)" text-anchor="start">0%</text>
    <text x="${padX}" y="${(targetY - 3).toFixed(1)}" font-size="9" fill="rgba(255,255,255,0.35)" text-anchor="start">100%</text>`;

  return `<svg class="mini-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    ${targetLine}
    ${paths}
    ${axisLabels}
  </svg>`;
}

// Weight doesn't get judged against a single daily target like the metrics
// above — it's judged against an expected RATE of change toward the goal
// over the selected period, so it gets its own pacing-specific labels
// ("on pace" / "too slow" / "too fast" / "wrong direction"). Same symmetric
// principle though: drifting too fast is flagged just as much as too slow.
// WEIGHT_PACE_KG_PER_WEEK is a generic placeholder healthy-pace assumption —
// promote this to a per-person setting later if/when one exists.
// STEP 11 PART B: colours migrated from --status-* to the finer --adh-*
// palette so Weight's pacing label shares the same hue-white vocabulary as
// every other trend card. Wording is unchanged — only the colour source.
const WEIGHT_PACE_KG_PER_WEEK = 0.4;
function weightPaceLabel(actualChange, startW, goalW, days) {
  const direction = Math.sign(goalW - startW); // -1 lose, +1 gain, 0 maintain
  if (direction === 0) {
    const a = Math.abs(actualChange);
    if (a <= 0.3) return { label:'On target', color:'var(--adh-great)' };
    if (a <= 1)   return { label:'Drifting', color:'var(--adh-warn)' };
    return { label:'Off target', color:'var(--adh-poor)' };
  }
  const expected = direction * WEIGHT_PACE_KG_PER_WEEK * (days/7);
  const ratio = expected !== 0 ? actualChange/expected : 0;
  if (ratio >= 1.4)  return { label:'Too fast', color:'var(--adh-warn)' };
  if (ratio >= 0.7)  return { label:'On pace', color:'var(--adh-great)' };
  if (ratio >= 0.3)  return { label:'A bit slow', color:'var(--adh-warn)' };
  if (ratio >= -0.2) return { label:'Too slow', color:'var(--adh-warn)' };
  return                    { label:'Wrong direction', color:'var(--adh-poor)' };
}

// ── UNIFIED ADHERENCE LABEL (Step 11 Part A + B) ────────────────────────
// The shared "how close to target" helper described in Step 11 — one
// function, one palette, used by every Progress trend card that fits its
// shape, instead of each card inventing its own scale/wording/colour logic.
//
// STEP 11 PART B — WIRED IN: Calories and Water now call this in 'abs'
// mode (symmetric — too little and too much both move you off target);
// Steps calls it in 'under' mode (extra steps are never penalised). The
// old single-arg adherenceColor()/adherenceLabel(pct) pair (--status-*
// based) has been retired and removed — every call site below now goes
// through getAdherence(), macroAdherence(), or weightPaceLabel().
// Protein/Carbs/Fat use the separate macroAdherence() helper below instead
// (own wording — "On target/Close/A bit low" — since surplus there isn't
// just "fine", it's a genuinely different judgement) and Weight keeps its
// own pacing-based weightPaceLabel() above. Neither is a fit for this
// generic helper, by design, per the Part B inventory.
//
//   pct  = (avg - target) / target * 100   — signed % distance from target
//   mode = 'abs'   → symmetric: distance in EITHER direction is penalised
//                     equally (e.g. Calories, Water — too little and too
//                     much both move you off target).
//          'under' → only being UNDER target is penalised; over is fine
//                     or good (e.g. Steps — extra steps are never bad).
//          'over'  → only being OVER target is penalised; under is fine
//                     (e.g. a strict ceiling).
//
// Tier wording/thresholds below are the Calories 7-tier set from Part B —
// the "Impeccable/Excellent/Good/Fair/Off track/Poor/Very poor" wording
// the client specifically said they liked.
function getAdherence(pct, mode) {
  mode = mode || 'abs';
  let p;
  if (mode === 'under')      p = -pct;   // only "below target" counts as distance
  else if (mode === 'over')  p = pct;    // only "above target" counts as distance
  else                       p = Math.abs(pct); // 'abs' — either direction counts
  p = Math.max(p, 0); // the "good" side of a one-directional mode never penalises

  if (p <= 5)  return { label: 'Impeccable', color: 'var(--adh-great)' };
  if (p <= 8)  return { label: 'Excellent',  color: 'var(--adh-great)' };
  if (p <= 12) return { label: 'Good',       color: 'var(--adh-good)' };
  if (p <= 18) return { label: 'Fair',       color: 'var(--adh-neutral)' };
  if (p <= 25) return { label: 'Off track',  color: 'var(--adh-warn)' };
  if (p <= 35) return { label: 'Poor',       color: 'var(--adh-poor)' };
  return            { label: 'Very poor', color: 'var(--adh-poor)' };
}

// ── WATER-SPECIFIC ADHERENCE — asymmetric, unlike getAdherence('abs') ───
// Drinking too little water is judged on the normal degrading scale
// (Fair/Off track/Poor/etc., same tiers as getAdherence). Drinking too
// much is never penalised beyond "Good": up to +10% over goal still runs
// through the normal tiers (so a small overshoot can still read as
// Impeccable/Excellent/Good), but anything past +10% over goal is capped
// at "Good" rather than continuing to degrade the way calories/steps do.
// pct is signed: (avg - goal) / goal * 100.
function getWaterAdherence(pct) {
  if (pct > 10) return { label: 'Good', color: 'var(--adh-good)' };
  return getAdherence(pct, 'abs');
}

// ── STEP 11 PART B — macro-specific wording (Protein/Carbs/Fat) ─────────
// Per the Part B inventory, Protein keeps its own distinct word set rather
// than reusing Calories' "Impeccable/.../Very poor" — surplus isn't
// penalised the way undershooting is, so the judgement reads differently
// ("On target"/"Close"/"Low" instead of "Good"/"Fair"/"Poor"). Carbs and
// Fat were modelled directly on Protein's card (Step 5B), so they share
// this same wording and tier thresholds rather than getAdherence()'s.
// pct is signed: (avg - target) / target * 100 — negative means under.
//
// BUGFIX: the surplus side used to have only two tiers — "On target"
// (0–5% over) and "Impeccable" (anything 5%+ over, with NO upper bound).
// That meant any surplus, however large (e.g. +24%, +100%...), was
// reported as "Impeccable", which is exactly backwards. Surplus is still
// treated more leniently than an equivalent shortfall (per the design
// intent above), but it now degrades through the same number of tiers as
// the under-target side instead of topping out early and staying there.
function macroAdherence(pct) {
  if (pct >= 35)  return { label: 'Very high', color: 'var(--adh-poor)' };
  if (pct >= 20)  return { label: 'High',      color: 'var(--adh-poor)' };
  if (pct >= 10)  return { label: 'A bit high', color: 'var(--adh-warn)' };
  if (pct >= 5)   return { label: 'Impeccable', color: 'var(--adh-great)' };
  if (pct >= 0)   return { label: 'On target',  color: 'var(--adh-great)' };
  if (pct >= -5)  return { label: 'Close',      color: 'var(--adh-good)' };
  if (pct >= -10) return { label: 'A bit low',  color: 'var(--adh-warn)' };
  if (pct >= -18) return { label: 'Low',        color: 'var(--adh-poor)' };
  return                { label: 'Very low',  color: 'var(--adh-poor)' };
}

// ── STEP 11 PART B/C — activity % of weekly target ──────────────────────
// Used by the Workouts summary card's new third stat. Unlike the metrics
// above, this takes an already-normalised 0-100 "% of target achieved"
// value (not a signed distance from target) — the tier thresholds here
// match the Activity redesign's tier list in Part C, reused early since
// the underlying data (days workout target hit, already computed for the
// "Target hit rate" card) is available without needing Part C's full
// per-type weekly-target/week-bucketing work to land first.
function activityAdherence(pctOfTarget) {
  const p = pctOfTarget;
  if (p >= 95) return { label: 'Impeccable', color: 'var(--adh-great)' };
  if (p >= 80) return { label: 'Excellent',  color: 'var(--adh-great)' };
  if (p >= 65) return { label: 'Good',       color: 'var(--adh-good)' };
  if (p >= 50) return { label: 'Fair',       color: 'var(--adh-neutral)' };
  if (p >= 35) return { label: 'Off track',  color: 'var(--adh-warn)' };
  if (p >= 20) return { label: 'Poor',       color: 'var(--adh-poor)' };
  return            { label: 'Very poor', color: 'var(--adh-poor)' };
}

// Builds the per-day target series for one macro across `dates`, used to
// draw the stepped (discontinuous) target line and to compute an Avg
// Target for the period. Reads the value actually stamped on that day's
// meals when present (real historical target); if a day has no stamped
// value for THIS macro but does have a stamped day_kcal_target (older
// entries, back when only kcal was stamped), infers it by scaling that
// day's kcal target using today's live macro:kcal ratio — approximate,
// but far more honest than silently using today's flat number for every
// past day. Days with no meal entries at all fall back to the live
// mission value so gaps in logging don't break the line.
function getDailyTargetSeries(dayEntriesCache, dates, person, macroKey) {
  const fieldMap = { kcal:'day_kcal_target', protein:'day_protein_target', carbs:'day_carbs_target', fat:'day_fat_target' };
  const field = fieldMap[macroKey];
  const mission = S.mission[person] || {};
  return dates.map(d => {
    const dayMeals = (dayEntriesCache.get(d) || []).filter(e=>e.record_type==='meal');
    const stamped = dayMeals.find(e => e[field] > 0);
    if (stamped) return stamped[field];
    if (macroKey !== 'kcal') {
      const kcalStamped = dayMeals.find(e => e.day_kcal_target > 0);
      if (kcalStamped && mission.kcal && mission[macroKey] != null) {
        return Math.round(kcalStamped.day_kcal_target * (mission[macroKey] / mission.kcal));
      }
    }
    return mission[macroKey] != null ? mission[macroKey] : null;
  });
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  const mid = Math.floor(s.length/2);
  return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2;
}

function renderTrends() {
  const el = document.getElementById('trends-content');
  if (!el) return;
  const wl = S.weightLog || [];
  const entries = S.entries || [];
  const person = S.currentPerson;
  const themeClass = person==='gabi' ? 'tc-gabi' : 'tc-nacho';
  const color = person==='gabi' ? '#6BA3C8' : '#C8863A';

  // Date range driven by the Week/Month/Year toggle in the header
  // (#hdr-toggle-history). Defaults to 'month' (the original 30-day window)
  // if S.progressPeriod hasn't been set yet.
  const progressPeriod = S.progressPeriod || 'month';
  const progressCategory = S.progressCategory || 'food';
  const rangeDays = progressPeriod === 'week' ? 7 : progressPeriod === 'year' ? 365 : progressPeriod === 'max' ? 1825 : 30;
  const grouped = groupEntriesByPersonDate(entries);
  const allPersonDates = Array.from(new Set(
    Array.from(grouped.keys()).filter(k => k.startsWith(person+'|')).map(k => k.slice(person.length+1))
  )).sort();
  const earliestDataDate = allPersonDates[0] || null;

  const dates = [];
  for (let i=rangeDays;i>=1;i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const s = toLocalDateStr(d);
    // Week always shows the full 7 days regardless of data; Month/Year/Max
    // stop at the earliest date any data actually exists, instead of
    // padding the chart out with a long stretch of empty history.
    if (progressPeriod !== 'week' && earliestDataDate && s < earliestDataDate) continue;
    dates.push(s);
  }
  if (!dates.length) dates.push(toLocalDateStr(new Date(Date.now()-86400000)));

  // Fetch each day's entries for this person ONCE — the calorie/protein/water
  // blocks below each used to re-scan the full entries array per day; they
  // now read from this cache and apply their own specific sub-filters to it.
  const dayEntriesCache = new Map();
  dates.forEach(d => dayEntriesCache.set(d, grouped.get(person+'|'+d) || []));

  // All-time dates this person has ANY entry for — used only to compute a
  // fixed y-axis scale (see globalMinMax) so the vertical scale doesn't
  // jump around as you switch Week/Month/Year/Max; it's always anchored
  // to the full history, same as if you were looking at "Max".
  function globalMinMax(extractFn) {
    const vals = allPersonDates.map(extractFn).filter(v => v != null);
    return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
  }

  // ── Stock-market style period bar — Week / Month / Year / Max ──
  // The bar itself lives statically in index.html (like #bnav-indicator)
  // so it and its indicator are never destroyed/recreated on re-render —
  // only its active class is synced here. That's what lets the CSS
  // transition slide smoothly from the old position to the new one,
  // instead of snapping in fresh every time (see moveNavIndicator pattern).
  document.querySelectorAll('.prog-period-opt').forEach(o => {
    o.classList.toggle('active', o.dataset.period === progressPeriod);
  });

  let html = '';

  // ── WEIGHT CHART ──
  if (progressCategory === 'weight') {
    const wLogs = wl.filter(w=>w.person===person).sort((a,b)=>a.date.localeCompare(b.date));
    const mission = S.mission[person];
    const startW = wLogs.length ? wLogs[0].kg : mission.weight;
    const latestW = wLogs.length ? wLogs[wLogs.length-1].kg : mission.weight;
    const delta = (latestW - startW).toFixed(1);
    const goalW = mission.goalTargetWeight != null ? mission.goalTargetWeight : mission.weight;
    // Pace must be measured against the ACTUAL time the weigh-ins span
    // (first log → last log), never the Week/Month/Year VIEW toggle's
    // window (rangeDays) — those are unrelated numbers. Using rangeDays
    // here previously compared, e.g., a real 5-week weight change against
    // what "should" happen in a full year (whenever Year was selected),
    // making the ratio absurdly small and mislabelling someone who'd
    // already hit their goal early as "Too slow". Also short-circuits to
    // an explicit "At goal" state once you're within the same small
    // tolerance weightPaceLabel already uses for "maintain" goals (0.3kg)
    // — grading pace toward a target you've already reached isn't
    // meaningful, and a "you're X% too fast/slow" label after arriving
    // reads as discouraging rather than useful.
    const atGoal = Math.abs(latestW - goalW) <= 0.3;
    const actualSpanDays = wLogs.length >= 2 ? Math.max(1, daysBetween(wLogs[0].date, wLogs[wLogs.length-1].date)) : 0;
    const pace = atGoal
      ? { label:'At goal 🎉', color:'var(--adh-great)' }
      : wLogs.length >= 2
        ? weightPaceLabel(parseFloat(delta), startW, goalW, actualSpanDays)
        : { label:'—', color:'var(--mist)' };

    const points = wLogs.map(w=>({x:w.date, y:w.kg}));
    const { svg, labelsHtml } = makeSVGLine(points, color, 320, 80, goalW, startW);
    const labels = wLogs.length >= 2
      ? [wLogs[0].date.slice(5), wLogs[wLogs.length-1].date.slice(5)]
      : wLogs.length === 1
        ? [wLogs[0].date.slice(5), wLogs[0].date.slice(5)]
        : ['—','—'];

    html += `<div class="trend-card">
      <div class="trend-card-title ${themeClass}">Weight</div>
      <div class="mini-chart-wrap"><div class="mini-chart">${svg}</div>${labelsHtml}</div>
      <div class="chart-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div>
      <div class="trend-stat-row">
        <div class="trend-stat">
          <div class="trend-stat-val">${latestW}</div>
          <div class="trend-stat-lbl">Current kg</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val">${goalW}</div>
          <div class="trend-stat-lbl">Goal kg</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val" style="color:${pace.color}">${pace.label}</div>
          <div class="trend-stat-lbl">Pace vs goal</div>
        </div>
      </div>
      ${wLogs.length < 1 ? '<div style="font-size:12px;color:var(--mist);margin-top:10px">Log a weight entry in Mission to see the chart.</div>' : ''}
    </div>`;
  }

  // ── CALORIE TREND (last 30 days, complete days only) ──
  if (progressCategory === 'food') {
    const targetArr = getDailyTargetSeries(dayEntriesCache, dates, person, 'kcal');
    const targetVals = targetArr.filter(v=>v!=null);
    const avgTarget = targetVals.length ? Math.round(targetVals.reduce((a,b)=>a+b,0)/targetVals.length) : null;
    const completeDays = dates.map(d => {
      const dayAll = dayEntriesCache.get(d);
      const dayMeals = dayAll.filter(e=>e.record_type==='meal'&&!e.hypo_correction);
      const isComplete = dayAll.some(e=>e.record_type==='meal'&&e.full_day);
      const total = dayMeals.reduce((a,b)=>a+(b.calories||0),0);
      return { date:d, total, isComplete };
    });
    const loggedDays = completeDays.filter(d=>d.isComplete&&d.total>0);

    const points = completeDays.map(d=>({x:d.date, y:(d.isComplete&&d.total>0)?d.total:null}));
    const range = globalMinMax(d => {
      const dayAll = grouped.get(person+'|'+d) || [];
      const isComplete = dayAll.some(e=>e.record_type==='meal'&&e.full_day);
      if (!isComplete) return null;
      const total = dayAll.filter(e=>e.record_type==='meal'&&!e.hypo_correction).reduce((a,b)=>a+(b.calories||0),0);
      return total>0 ? total : null;
    });
    const { svg, labelsHtml } = makeSVGLine(points, color, 320, 80, targetArr, null, null, range, 'kcal');
    const avg = loggedDays.length ? Math.round(median(loggedDays.map(d=>d.total))) : 0;
    const labels = [dates[0].slice(5), dates[dates.length-1].slice(5)];

    html += `<div class="trend-card">
      <div class="trend-card-title ${themeClass}">Calories</div>
      <div class="mini-chart-wrap"><div class="mini-chart">${svg}</div>${labelsHtml}</div>
      <div class="chart-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div>
      <div class="trend-stat-row">
        <div class="trend-stat">
          <div class="trend-stat-val">${avg||'—'}</div>
          <div class="trend-stat-lbl">Avg kcal</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val">${avgTarget!=null?avgTarget:'—'}</div>
          <div class="trend-stat-lbl">Avg Target</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val" style="color:${(()=>{if(!avg||!avgTarget)return'var(--mist)';return getAdherence((avg-avgTarget)/avgTarget*100,'abs').color;})()}">${(()=>{if(!avg||!avgTarget)return'—';return getAdherence((avg-avgTarget)/avgTarget*100,'abs').label;})()}</div>
          <div class="trend-stat-lbl">Avg vs target</div>
        </div>
      </div>
    </div>`;
  }

  // ── PROTEIN TREND ──
  if (progressCategory === 'food') {
    const proteinColor = '#7A9E7E';
    const targetArr = getDailyTargetSeries(dayEntriesCache, dates, person, 'protein');
    const targetVals = targetArr.filter(v=>v!=null);
    const avgTarget = targetVals.length ? Math.round(targetVals.reduce((a,b)=>a+b,0)/targetVals.length) : null;
    const completeDays = dates.map(d => {
      const dayMeals = dayEntriesCache.get(d).filter(e=>e.record_type==='meal');
      const isComplete = dayMeals.some(e=>e.full_day);
      const total = dayMeals.reduce((a,b)=>a+(b.protein_g||0),0);
      return { date:d, total, isComplete };
    });
    const loggedDays = completeDays.filter(d=>d.isComplete&&d.total>0);

    const avg = loggedDays.length ? Math.round(loggedDays.reduce((a,b)=>a+b.total,0)/loggedDays.length) : 0;
    const points = completeDays.map(d=>({x:d.date, y:(d.isComplete&&d.total>0)?d.total:null}));
    const range = globalMinMax(d => {
      const dayMeals = (grouped.get(person+'|'+d) || []).filter(e=>e.record_type==='meal');
      const isComplete = dayMeals.some(e=>e.full_day);
      if (!isComplete) return null;
      const total = dayMeals.reduce((a,b)=>a+(b.protein_g||0),0);
      return total>0 ? total : null;
    });
    const { svg, labelsHtml } = makeSVGLine(points, proteinColor, 320, 80, targetArr, null, null, range, 'g');
    const labels = [dates[0].slice(5), dates[dates.length-1].slice(5)];

    html += `<div class="trend-card">
      <div class="trend-card-title ${themeClass}">Protein</div>
      <div class="mini-chart-wrap"><div class="mini-chart">${svg}</div>${labelsHtml}</div>
      <div class="chart-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div>
      <div class="trend-stat-row">
        <div class="trend-stat">
          <div class="trend-stat-val">${avg||'—'}g</div>
          <div class="trend-stat-lbl">Avg daily</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val">${avgTarget!=null?avgTarget+'g':'—'}</div>
          <div class="trend-stat-lbl">Avg Target</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val" style="color:${(()=>{if(!avg||!avgTarget)return'var(--mist)';return macroAdherence((avg-avgTarget)/avgTarget*100).color;})()}">${(()=>{if(!avg||!avgTarget)return'—';return macroAdherence((avg-avgTarget)/avgTarget*100).label;})()}</div>
          <div class="trend-stat-lbl">Avg vs target</div>
        </div>
      </div>
    </div>`;
  }

  // ── CARBS TREND ── (Step 5B: new card — same pattern as Protein, surplus
  // isn't penalized so it uses 'signed' mode same as Protein/Water/Steps.)
  if (progressCategory === 'food') {
    const carbsColor = '#C9954B';
    const targetArr = getDailyTargetSeries(dayEntriesCache, dates, person, 'carbs');
    const targetVals = targetArr.filter(v=>v!=null);
    const avgTarget = targetVals.length ? Math.round(targetVals.reduce((a,b)=>a+b,0)/targetVals.length) : null;
    const completeDays = dates.map(d => {
      const dayMeals = dayEntriesCache.get(d).filter(e=>e.record_type==='meal');
      const isComplete = dayMeals.some(e=>e.full_day);
      const total = dayMeals.reduce((a,b)=>a+(b.carbs_g||0),0);
      return { date:d, total, isComplete };
    });
    const loggedDays = completeDays.filter(d=>d.isComplete&&d.total>0);

    const avg = loggedDays.length ? Math.round(loggedDays.reduce((a,b)=>a+b.total,0)/loggedDays.length) : 0;
    const points = completeDays.map(d=>({x:d.date, y:(d.isComplete&&d.total>0)?d.total:null}));
    const range = globalMinMax(d => {
      const dayMeals = (grouped.get(person+'|'+d) || []).filter(e=>e.record_type==='meal');
      const isComplete = dayMeals.some(e=>e.full_day);
      if (!isComplete) return null;
      const total = dayMeals.reduce((a,b)=>a+(b.carbs_g||0),0);
      return total>0 ? total : null;
    });
    const { svg, labelsHtml } = makeSVGLine(points, carbsColor, 320, 80, targetArr, null, null, range, 'g');
    const labels = [dates[0].slice(5), dates[dates.length-1].slice(5)];

    html += `<div class="trend-card">
      <div class="trend-card-title ${themeClass}">Carbs</div>
      <div class="mini-chart-wrap"><div class="mini-chart">${svg}</div>${labelsHtml}</div>
      <div class="chart-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div>
      <div class="trend-stat-row">
        <div class="trend-stat">
          <div class="trend-stat-val">${avg||'—'}g</div>
          <div class="trend-stat-lbl">Avg daily</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val">${avgTarget!=null?avgTarget+'g':'—'}</div>
          <div class="trend-stat-lbl">Avg Target</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val" style="color:${(()=>{if(!avg||!avgTarget)return'var(--mist)';return macroAdherence((avg-avgTarget)/avgTarget*100).color;})()}">${(()=>{if(!avg||!avgTarget)return'—';return macroAdherence((avg-avgTarget)/avgTarget*100).label;})()}</div>
          <div class="trend-stat-lbl">Avg vs target</div>
        </div>
      </div>
    </div>`;
  }

  // ── FAT TREND ── (Step 5B: new card — same pattern as Protein/Carbs.)
  if (progressCategory === 'food') {
    const fatColor = MACRO_FAT_COLOR; // shared with the Vitals/Log donuts (ui.js) — kept as a local alias since this whole block reads `fatColor`
    const targetArr = getDailyTargetSeries(dayEntriesCache, dates, person, 'fat');
    const targetVals = targetArr.filter(v=>v!=null);
    const avgTarget = targetVals.length ? Math.round(targetVals.reduce((a,b)=>a+b,0)/targetVals.length) : null;
    const completeDays = dates.map(d => {
      const dayMeals = dayEntriesCache.get(d).filter(e=>e.record_type==='meal');
      const isComplete = dayMeals.some(e=>e.full_day);
      const total = dayMeals.reduce((a,b)=>a+(b.fat_g||0),0);
      return { date:d, total, isComplete };
    });
    const loggedDays = completeDays.filter(d=>d.isComplete&&d.total>0);

    const avg = loggedDays.length ? Math.round(loggedDays.reduce((a,b)=>a+b.total,0)/loggedDays.length) : 0;
    const points = completeDays.map(d=>({x:d.date, y:(d.isComplete&&d.total>0)?d.total:null}));
    const range = globalMinMax(d => {
      const dayMeals = (grouped.get(person+'|'+d) || []).filter(e=>e.record_type==='meal');
      const isComplete = dayMeals.some(e=>e.full_day);
      if (!isComplete) return null;
      const total = dayMeals.reduce((a,b)=>a+(b.fat_g||0),0);
      return total>0 ? total : null;
    });
    const { svg, labelsHtml } = makeSVGLine(points, fatColor, 320, 80, targetArr, null, null, range, 'g');
    const labels = [dates[0].slice(5), dates[dates.length-1].slice(5)];

    html += `<div class="trend-card">
      <div class="trend-card-title ${themeClass}">Fat</div>
      <div class="mini-chart-wrap"><div class="mini-chart">${svg}</div>${labelsHtml}</div>
      <div class="chart-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div>
      <div class="trend-stat-row">
        <div class="trend-stat">
          <div class="trend-stat-val">${avg||'—'}g</div>
          <div class="trend-stat-lbl">Avg daily</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val">${avgTarget!=null?avgTarget+'g':'—'}</div>
          <div class="trend-stat-lbl">Avg Target</div>
        </div>
        <div class="trend-stat">
          <div class="trend-stat-val" style="color:${(()=>{if(!avg||!avgTarget)return'var(--mist)';return macroAdherence((avg-avgTarget)/avgTarget*100).color;})()}">${(()=>{if(!avg||!avgTarget)return'—';return macroAdherence((avg-avgTarget)/avgTarget*100).label;})()}</div>
          <div class="trend-stat-lbl">Avg vs target</div>
        </div>
      </div>
    </div>`;
  }

  // ── WATER TREND ──
  if (progressCategory === 'food') {
    const waterColor = '#5B8DB8';
    const goal = getWaterGoal(person);
    const waterDays = dates.map(d => {
      const e = dayEntriesCache.get(d).find(en=>en.record_type==='water');
      return { date:d, total: getWaterMlForEntry(e) };
    });
    const loggedWaterDays = waterDays.filter(d=>d.total>0);
    const avgWaterMl = loggedWaterDays.length ? Math.round(loggedWaterDays.reduce((a,b)=>a+b.total,0)/loggedWaterDays.length) : 0;
    const points = waterDays.map(d=>({x:d.date, y:d.total>0?d.total:null}));
    const range = globalMinMax(d => {
      const e = (grouped.get(person+'|'+d) || []).find(en=>en.record_type==='water');
      const t = getWaterMlForEntry(e);
      return t>0 ? t : null;
    });
    const { svg, labelsHtml } = makeSVGLine(points, waterColor, 320, 80, goal, null, 'L', range, 'ml');
    const labels = [dates[0].slice(5), dates[dates.length-1].slice(5)];
    html += `<div class="trend-card">
      <div class="trend-card-title ${themeClass}">Water</div>
      <div class="mini-chart-wrap"><div class="mini-chart">${svg}</div>${labelsHtml}</div>
      <div class="chart-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div>
      <div class="trend-stat-row">
        <div class="trend-stat"><div class="trend-stat-val">${avgWaterMl||'—'} ml</div><div class="trend-stat-lbl">Avg daily</div></div>
        <div class="trend-stat"><div class="trend-stat-val">${goal} ml</div><div class="trend-stat-lbl">Goal</div></div>
        <div class="trend-stat">
          <div class="trend-stat-val" style="color:${(()=>{if(!avgWaterMl||!goal)return'var(--mist)';return getWaterAdherence((avgWaterMl-goal)/goal*100).color;})()}">${(()=>{if(!avgWaterMl||!goal)return'—';return getWaterAdherence((avgWaterMl-goal)/goal*100).label;})()}</div>
          <div class="trend-stat-lbl">Avg vs goal</div>
        </div>
      </div>
    </div>`;
  }

  // NOTE: the old standalone "Target hit rate" card (raw Steps%/Workout%,
  // no chart, no colour) was REMOVED here per explicit decision — it was
  // fully redundant once Steps got its own adherence chip (below) and
  // Workouts got its own adherence chip (further below), each duplicating
  // one of these two numbers in a more informative, charted form.

  // ── STEPS ──
  // Steps are logged as Walking-type workout entries. Walking is steps-only
  // everywhere in the app now (no duration-based logging mode), so every
  // Walking entry has steps_logged populated — this pulls that field off
  // the Walking subset specifically rather than off duration_min.
  if (progressCategory === 'activity') {
    // BUG FIX (found while scoping Step 11 Part C): this used to read
    // S.settings.movementTargets[person].steps_day, but settings.js never
    // writes to that path — the Steps target field on the Targets screen
    // (set-steps-${p}) saves to S.mission[person].stepsTarget instead (see
    // settings.js saveTargets(), line ~148). The old reference silently fell
    // through to the 10000 fallback every time, ignoring whatever either of
    // you actually configured.
    const stepGoal = S.mission[person].stepsTarget || 10000;
    const stepDays = dates.map(d => {
      const dayWalks = dayEntriesCache.get(d).filter(e=>e.record_type==='workout'&&e.workout_type==='Walking');
      const total = dayWalks.reduce((a,b)=>a+(b.steps_logged||0),0);
      return { date:d, total };
    });
    const loggedStepDays = stepDays.filter(d=>d.total>0);
    const avgSteps = loggedStepDays.length ? Math.round(loggedStepDays.reduce((a,b)=>a+b.total,0)/loggedStepDays.length) : 0;
    const points = stepDays.map(d=>({x:d.date, y:d.total>0?d.total:null}));
    const stepColor = '#9C8AC4';
    const range = globalMinMax(d => {
      const t = (grouped.get(person+'|'+d) || []).filter(e=>e.record_type==='workout'&&e.workout_type==='Walking').reduce((a,b)=>a+(b.steps_logged||0),0);
      return t>0 ? t : null;
    });
    const { svg, labelsHtml } = makeSVGLine(points, stepColor, 320, 80, stepGoal, null, null, range, 'steps');
    const labels = [dates[0].slice(5), dates[dates.length-1].slice(5)];

    html += `<div class="trend-card">
      <div class="trend-card-title ${themeClass}">Steps</div>
      <div class="mini-chart-wrap"><div class="mini-chart">${svg}</div>${labelsHtml}</div>
      <div class="chart-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div>
      <div class="trend-stat-row">
        <div class="trend-stat"><div class="trend-stat-val">${avgSteps||'—'}</div><div class="trend-stat-lbl">Avg daily</div></div>
        <div class="trend-stat"><div class="trend-stat-val">${stepGoal}</div><div class="trend-stat-lbl">Goal</div></div>
        <div class="trend-stat">
          <div class="trend-stat-val" style="color:${(()=>{if(!avgSteps||!stepGoal)return'var(--mist)';return getAdherence((avgSteps-stepGoal)/stepGoal*100,'under').color;})()}">${(()=>{if(!avgSteps||!stepGoal)return'—';return getAdherence((avgSteps-stepGoal)/stepGoal*100,'under').label;})()}</div>
          <div class="trend-stat-lbl">Avg vs goal</div>
        </div>
      </div>
      ${stepDays.length === 0 ? '<div style="font-size:12px;color:var(--mist);margin-top:10px">No steps logged this period. Log Walking by step count to see this chart.</div>' : ''}
    </div>`;
  }

  // ── ACTIVITY TYPE TREND CARDS (Step 11 Part C) ──
  // % of weekly target achieved, bucketed by week (not by day) since every
  // target here is a weekly one. Missing weeks read as 0%, by design — a
  // visible dip is exactly what shows a trip/illness/dip in routine, which
  // raw daily session-count charts couldn't show clearly. Cardio gets two
  // co-equal lines (sessions% + minutes%); HIIT/Strength/Mobility get one.
  if (progressCategory === 'activity') {
    ['cardio', 'hiit', 'strength', 'mobility'].forEach(typeKey => {
      const cfg = ACTIVITY_TYPES[typeKey];
      const { series, avgSessionsPct } = buildActivitySeries(typeKey, person, progressPeriod, entries);
      const adh = activityAdherence(avgSessionsPct);

      const sessionsPoints = series.map((s, i) => ({ x: i, y: s.sessionsPct }));
      let svg, legend = '';
      if (cfg.dualLine) {
        const minutesPoints = series.map((s, i) => ({ x: i, y: s.minutesPct == null ? 0 : s.minutesPct }));
        svg = makeActivitySVG([
          { points: sessionsPoints, color: cfg.color },
          { points: minutesPoints, color: '#E8D5B0' }
        ], 320, 80);
        legend = `<div style="display:flex;gap:14px;font-size:10px;color:var(--mist);margin:4px 0 0;font-family:'Baloo 2',sans-serif">
          <span><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${cfg.color};margin-right:4px"></span>Sessions</span>
          <span><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#E8D5B0;margin-right:4px"></span>Minutes</span>
        </div>`;
      } else {
        svg = makeActivitySVG([{ points: sessionsPoints, color: cfg.color }], 320, 80);
      }

      const sessionsTarget = cfg.sessionsTarget(person) || 0;
      const minsTarget = cfg.minsPerSession ? (cfg.minsPerSession(person) || 0) * sessionsTarget : null;

      html += `<div class="trend-card">
        <div class="trend-card-title ${themeClass}">${cfg.label}</div>
        <div class="mini-chart-wrap"><div class="mini-chart">${svg}</div></div>
        ${legend}
        <div class="trend-stat-row">
          <div class="trend-stat">
            <div class="trend-stat-val">${Math.round(avgSessionsPct)}%</div>
            <div class="trend-stat-lbl">Avg sessions/wk</div>
          </div>
          <div class="trend-stat">
            <div class="trend-stat-val">${sessionsTarget}${minsTarget != null ? ` · ${minsTarget}m` : ''}</div>
            <div class="trend-stat-lbl">Target</div>
          </div>
          <div class="trend-stat">
            <div class="trend-stat-val" style="color:${adh.color}">${adh.label}</div>
            <div class="trend-stat-lbl">Adherence</div>
          </div>
        </div>
      </div>`;
    });
  }

  el.innerHTML = html || '<div class="empty-state">Not enough data yet.<br>Keep logging meals and weight.</div>';
  // Reposition in case the bar just became visible (screen switch) or
  // layout shifted. Since the bar/indicator persist across renders now,
  // this doesn't cause a spurious slide-in on category (Weight/Food/
  // Activity) switches — only setProgressPeriod's active-class change
  // actually moves the indicator, and it animates from its real previous spot.
  requestAnimationFrame(positionPeriodIndicator);
  updateProgressActionBtn();
}

// ════════════════════════════════════════════════════════════════════════
// HISTORY LIST — moved in from settings.js during file consolidation (July
// 2026). 'History' is the internal id for this tab (sec-history), which is
// the 'Progress' tab in the bottom nav (see SEC_ORDER in ui.js) — this is
// the per-day list of past entries shown below the trend charts above.
// ════════════════════════════════════════════════════════════════════════

let lastHistoryCheckTick = null; // set right before a re-render so the
// checkbox that triggered it can get a little bounce animation once redrawn

function renderHistory() {
  const el = document.getElementById('history-content');
  if (!cloudReady) {
    if (el) el.innerHTML = '<div style="color:var(--mist);font-size:12px;font-family:\'Baloo 2\',sans-serif;letter-spacing:1px;padding:20px 0">⟳&nbsp;Syncing…</div>';
    return;
  }
  // Remember which day panels are currently open so a re-render (e.g. after
  // deleting an entry) doesn't collapse the day the user is looking at.
  const openIds = new Set(
    Array.from(document.querySelectorAll('.hday-detail-wrap.open')).map(n => n.id)
  );
  const p = S.currentPerson || 'gabi';
  const allDates = [...new Set(S.entries.filter(e=>e.person===p).map(e => e.date))].sort().reverse();
  if (!allDates.length) { el.innerHTML = `<div style="color:var(--mist);font-size:13px">No entries yet for ${p==='gabi'?'Gabi':'Nacho'}.</div>`; return; }
  const mealTypeLabel = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner', snack:'Snack', vitamins:'Vitamins' };

  // Fetch each date's entries for this person ONCE — was doing two full
  // S.entries.filter() passes (meals + workouts) per date, for every date
  // ever logged, every time History rendered.
  const grouped = groupEntriesByPersonDate(S.entries);

  el.innerHTML = allDates.map(date => {
    const [y,m,d] = date.split('-');
    const displayDate = new Date(+y,+m-1,+d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    const dayEntries = grouped.get(p+'|'+date) || [];
    const summaries = [p].map(person => {
      const meals = dayEntries.filter(e=>e.record_type==='meal'&&!e.hypo_correction);
      const workouts = dayEntries.filter(e=>e.record_type==='workout');
      if (!meals.length && !workouts.length) return null;
      return { person, meals, workouts, kcal: Math.round(meals.reduce((a,e)=>a+(e.calories||0),0)), complete: meals.some(e=>e.full_day) };
    }).filter(Boolean);
    if (!summaries.length) return '';
    const id = 'hday-' + date.replace(/-/g,'');

    const pills = summaries.map(s => {
      const color = s.person==='gabi'?'var(--gabi-c)':'var(--nacho-c)';
      const dot = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:3px;vertical-align:middle"></span>`;
      const items = [s.meals.length?s.kcal+'kcal':'', s.workouts.length?s.workouts.length+'🏋':''].filter(Boolean).join(' · ');
      return `${dot}<span style="color:${color}">${s.person.charAt(0).toUpperCase()+s.person.slice(1)}</span> ${items}${s.complete?' ✓':''}`;
    }).join('<span style="color:var(--clay);margin:0 6px">|</span>');

    const detail = summaries.map(s => {
      const color = s.person==='gabi'?'var(--gabi-c)':'var(--nacho-c)';
      const mealLines = s.meals.map(e => {
        const label = mealTypeLabel[e.meal_type] || '';
        const name = e.meal || e.name || '—';
        return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid var(--bark);cursor:pointer" onclick="openEntryDetail(${e.id})">
          <div>${label?`<span style="font-size:10px;color:var(--mist);font-family:'Baloo 2',sans-serif;letter-spacing:1px;margin-right:5px">${label.toUpperCase()}</span>`:''}<span style="font-size:12px;color:var(--sand)">${name}</span></div>
          <span style="display:flex;align-items:center;flex-shrink:0;margin-left:8px">
            <span style="font-size:11px;color:var(--mist)">${e.calories?Math.round(e.calories)+' kcal':''}</span>
            <button class="meal-delete" onclick="event.stopPropagation();deleteHistoryEntry(${e.id})" title="Delete entry">×</button>
          </span>
        </div>`;
      }).join('');
      const workoutLines = s.workouts.map(e => {
        const walkLabel = e.workout_type === 'Walking' && e.steps_logged
          ? ' · ' + e.steps_logged.toLocaleString() + ' steps'
          : e.duration_min ? ' · ' + e.duration_min + 'min' : '';
        return `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--bark);cursor:pointer" onclick="openEntryDetail(${e.id})">
          <span style="font-size:12px;color:var(--mist)">🏋 ${e.workout_type||e.type||e.name||'Workout'}${walkLabel}</span>
          <span style="display:flex;align-items:center">
            <span style="font-size:11px;color:var(--mist)">${e.calories_burned?'−'+Math.round(e.calories_burned)+' kcal':''}</span>
            <button class="meal-delete" onclick="event.stopPropagation();deleteHistoryEntry(${e.id})" title="Delete entry">×</button>
          </span>
        </div>`;
      }).join('');
      return `<div style="margin-top:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:12px;font-weight:600;color:${color}">${s.person.charAt(0).toUpperCase()+s.person.slice(1)}${s.meals.length?' · '+s.kcal+' kcal':''}</span>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
            <span style="font-size:10px;color:${s.complete?'var(--sage)':'var(--mist)'}">${s.complete?'Full day ✓':'Incomplete'}</span>
            <input type="checkbox" id="hday-check-${s.person}-${date.replace(/-/g,'')}" ${s.complete?'checked':''} onchange="toggleHistoryFullDay('${s.person}','${date}',this.checked)" style="width:15px;height:15px;accent-color:var(--sage);cursor:pointer">
          </label>
        </div>
        ${mealLines}${workoutLines}
      </div>`;
    }).join('');

    return `<div class="day-card hist-day-card">
      <div class="hist-day-hdr" onclick="toggleHistoryDay('${id}')">
        <span class="hist-day-date" style="cursor:pointer" onclick="event.stopPropagation();openDayDetail('${p}','${date}')">${displayDate}</span>
        <span class="hday-arr" style="font-size:11px;color:var(--mist);cursor:pointer" id="${id}-arr">▸</span>
      </div>
      <div style="padding:6px 12px 8px;font-size:12px;color:var(--mist)">${pills}</div>
      <div class="hday-detail-wrap" id="${id}"><div style="padding:0 12px 10px">${detail}</div></div>
    </div>`;
  }).join('');
  // Restore any panels that were open before the re-render.
  openIds.forEach(id => {
    const wrap = document.getElementById(id);
    const arr  = document.getElementById(id + '-arr');
    if (wrap) wrap.classList.add('open');
    if (arr)  arr.classList.add('open');
  });
  if (lastHistoryCheckTick) {
    const cb = document.getElementById('hday-check-' + lastHistoryCheckTick.person + '-' + lastHistoryCheckTick.date.replace(/-/g,''));
    if (cb) cb.classList.add('check-bounce');
    lastHistoryCheckTick = null;
  }
}

function toggleHistoryDay(id) {
  const wrap = document.getElementById(id), arr = document.getElementById(id+'-arr');
  if (!wrap) return;
  const open = wrap.classList.contains('open');
  if (open) {
    wrap.classList.remove('open');
  } else {
    wrap.classList.add('open');
  }
  if (arr) arr.classList.toggle('open', !open);
}

// Delete a single logged entry from inside the expanded History day view.
// Re-renders History in place (rather than full deleteEntry's tab targets)
// so the day stays open and the list just loses that one row.
function deleteHistoryEntry(id) {
  if (!_requireOnlineForDelete()) return;

  // Register this key as a pending delete BEFORE mutating S.entries, same as
  // deleteEntry()/deleteWeight() do. Without this, legacy (non-subcollection)
  // mode's additive-merge circuit breaker in pushToCloud() — which exists
  // specifically to heal back entries that vanish from S.entries without a
  // matching pending-delete key, since normally that means data loss, not an
  // intentional delete — has no way to know this removal was intentional. It
  // was treating this exact case as accidental loss and re-adding the entry
  // from the server's copy on the very next save(), which is why the entry
  // reappeared after navigating away and back despite the success toast.
  const _deletedEntry = S.entries.find(e => e.id === id);
  if (_deletedEntry) _pendingDeleteEntryKeys.add(entryKey(_deletedEntry));
  S.entries = S.entries.filter(e => e.id !== id);

  if (S.usingSubcollections && window.__firebaseSync) {
    // Fire the Firestore delete.  Same reasoning as deleteEntry — do NOT touch
    // localStorage here; let the server-confirmed subcollection snapshot do it.
    const { db, collection, doc, deleteDoc } = window.__firebaseSync;
    deleteDoc(doc(collection(db, 'la-salud', 'sharedData', 'entries'), String(id)))
      .then(() => { setTimeout(_fetchFromServer, 300); }) // re-poll to confirm deletion
      .catch(err => { console.error('[sync] deleteHistoryEntry failed', id, err); showToast('Delete failed — check connection'); _fetchFromServer(); });
  } else {
    save();
  }

  renderHistory();
  renderVitals();
  renderTodayWorkouts();
  showToast('Entry deleted');
}

function toggleHistoryFullDay(person, date, checked) {
  let touched = false;
  S.entries.forEach(e => { if (e.person===person&&e.date===date&&e.record_type==='meal') { e.full_day=checked; touched=true; } });
  if (!touched) return;
  save();
  renderVitals();
  if (checked) lastHistoryCheckTick = { person, date };
  renderHistory();
  showToast(checked ? 'Day marked complete ✓' : 'Full-day mark removed');
}

