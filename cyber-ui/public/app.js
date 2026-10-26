'use strict';

const state = {
  lessons: [],       // array as loaded (index !== day number)
  lessonByDay: {},   // { dayNumber -> lesson }
  progress: { days: {} },
  tree: null,
  file: null,
  tab: 'study',
  month: new Date(),
  selectedDay: null,
};

function lessonForDay(n) {
  return state.lessonByDay[n] || null;
}

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// Single-weight stroke icon set (16px, 1.4 stroke) — replaces all emoji/glyphs.
const ICON_PATHS = {
  folder: '<path d="M2 4.5a1 1 0 0 1 1-1h2.6l1.6 2H13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7Z"/>',
  lab: '<path d="M6 2v3.3L3.2 9.6A1.6 1.6 0 0 0 4.6 12h6.8a1.6 1.6 0 0 0 1.4-2.4L10 5.3V2M6 2h4M6.5 8h3M3 9h10"/>',
  doc: '<path d="M4 2h5.2L12 4.7V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M9 2v3h3M6.5 8.5h3M6.5 11h3"/>',
  code: '<path d="m6 4-4 4 4 4M10 4l4 4-4 4"/>',
  chev: '<path d="m6 4 4 4-4 4"/>',
  play: '<path d="M6 3.8v8.4L12 8 6 3.8Z"/>',
  check: '<path d="m3.5 8.5 3 3 6-6.5"/>',
  trash: '<path d="M3.5 4.5h9M6 4.5V2.5h4v2M4.5 4.5l.8 8a1 1 0 0 0 1 .93h3.4a1 1 0 0 0 1-.93l.8-8M6.7 7v4M9.3 7v4"/>',
  save: '<path d="M2.5 9v3.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9M8 2.5V9M5.2 6.2 8 9l2.8-2.8"/>',
};
function icon(name, cls) {
  return `<svg class="icon ${cls || ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

async function api(pathname, opts) {
  const res = await fetch(pathname, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function saveProgress() {
  return api('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.progress),
  });
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clamp(n, lo, hi) {
  return Number.isNaN(n) ? lo : Math.max(lo, Math.min(hi, n));
}

function mins(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function nextLessonNum() {
  // "Up next" advances only when a session is finished (check-out), so an
  // unfinished session stays in front of the learner instead of jumping ahead.
  const done = new Set();
  for (const k in state.progress.days) {
    const e = state.progress.days[k];
    const n = Number(e?.lesson);
    if (e?.checkOut && n >= 1 && n <= 100) done.add(n);
  }
  for (let n = 1; n <= 100; n++) if (!done.has(n)) return n;
  return null;
}

function findInProgress(lessonNum) {
  for (const k in state.progress.days) {
    const e = state.progress.days[k];
    if (e && e.checkIn && !e.checkOut && Number(e.lesson) === lessonNum) return k;
  }
  return null;
}

// ---------- Tabs ----------
function switchTab(tab) {
  state.tab = tab;
  $('#tab-study').classList.toggle('active', tab === 'study');
  $('#tab-calendar').classList.toggle('active', tab === 'calendar');
  $('#tab-dashboard').classList.toggle('active', tab === 'dashboard');
  $('#view-study').classList.toggle('hidden', tab !== 'study');
  $('#view-calendar').classList.toggle('hidden', tab !== 'calendar');
  $('#view-dashboard').classList.toggle('hidden', tab !== 'dashboard');
  if (tab === 'dashboard') renderDashboard();
}

// ---------- File explorer ----------
function renderTree(node) {
  const ul = document.createElement('ul');
  for (const child of node.children) {
    const li = document.createElement('li');
    if (child.type === 'dir') {
      const btn = document.createElement('button');
      btn.className = 'tree-dir';
      const dirIcon = child.name.toLowerCase() === 'lab' ? icon('lab') : icon('folder');
      btn.innerHTML = `<span class="tw">▾</span> ${dirIcon} ${esc(child.name)}`;
      const sub = renderTree(child);
      sub.classList.add('sub');
      btn.addEventListener('click', () => {
        const hidden = sub.classList.toggle('hidden');
        btn.querySelector('.tw').textContent = hidden ? '▸' : '▾';
      });
      li.append(btn, sub);
    } else {
      const b = document.createElement('button');
      const isMd = child.path.endsWith('.md');
      b.className = 'tree-file' + (isMd ? '' : ' code');
      b.innerHTML = `${isMd ? icon('doc') : icon('code')} ${esc(child.name)}`;
      b.title = child.path;
      b.addEventListener('click', () => openFile(child.path));
      li.appendChild(b);
    }
    ul.appendChild(li);
  }
  return ul;
}

// ---------- Markdown / code viewer ----------
async function openFile(relPath) {
  try {
    const data = await api('/api/file?path=' + encodeURIComponent(relPath));
    state.file = relPath;
    renderViewer(relPath, data.content);
    switchTab('study');
  } catch {
    $('#viewer').innerHTML = `<p class="muted">Could not open ${esc(relPath)}</p>`;
  }
}

function renderViewer(relPath, content) {
  if (relPath.endsWith('.md')) {
    $('#viewer').innerHTML =
      `<div class="viewer-head">${icon('doc')} ${esc(relPath)}</div>` +
      `<div class="markdown">${renderMarkdown(content)}</div>`;
  } else {
    $('#viewer').innerHTML =
      `<div class="viewer-head">${icon('code')} ${esc(relPath)}</div>` +
      `<pre class="code">${esc(content)}</pre>`;
  }
}

// Prefer the day's own content file over the phase README as the "source".
function lessonSource(lesson) {
  return lesson?.content || lesson?.source || null;
}

function basename(p) {
  return p ? p.split('/').pop() : '';
}

// Lab buttons to open a lesson's Lab files (may include .md, .py, etc.).
function labButtons(lesson, cls) {
  const labs = lesson?.lab || [];
  if (!labs.length) return '';
  return labs
    .map((p, i) => `<button class="btn ghost ${cls}-lab" data-idx="${i}" title="${esc(p)}">${icon('lab')} ${esc(basename(p))}</button>`)
    .join('');
}

// Resolve a repo-relative link (e.g. PHASE-1/README.md) against the current file.
function resolveLink(baseFile, hrefRaw) {
  const href = decodeURIComponent(hrefRaw.split('#')[0]);
  if (!href || /^(https?:)?\/\//.test(href)) return null;
  const baseDir = baseFile.includes('/') ? baseFile.slice(0, baseFile.lastIndexOf('/') + 1) : '';
  const out = [];
  for (const p of (baseDir + href).split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') { out.pop(); continue; }
    out.push(p);
  }
  return out.join('/');
}

// ---------- Calendar ----------
function renderCalendar() {
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  $('#cal-label').textContent = state.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const grid = $('#cal-grid');
  grid.innerHTML = '';
  for (const d of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    const h = document.createElement('div');
    h.className = 'dow';
    h.textContent = d;
    grid.appendChild(h);
  }

  const first = new Date(y, m, 1);
  for (let i = 0; i < first.getDay(); i++) {
    const e = document.createElement('div');
    e.className = 'cell pad';
    grid.appendChild(e);
  }

  const todayKey = dateKey(new Date());
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(new Date(y, m, d));
    const s = state.progress.days[key];
    const cell = document.createElement('div');
    let cls = 'cell';
    if (key === todayKey) cls += ' today';
    if (key === state.selectedDay) cls += ' selected';
    if (s) cls += s.checkOut ? ' done' : s.checkIn ? ' active' : '';
    cell.className = cls;
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-pressed', key === state.selectedDay ? 'true' : 'false');
    const topic = lessonForDay(Number(s?.lesson))?.topic || '';
    const status = s?.checkOut ? 'Completed' : s?.checkIn ? 'In progress' : 'No session';
    cell.title = topic ? `Day ${s.lesson}: ${topic} — ${status}` : status;
    cell.innerHTML = `<span class="daynum">${d}</span>` + (s?.lesson ? `<span class="lbl">D${s.lesson}</span>` : '');
    const select = () => {
      state.selectedDay = key;
      renderCalendar();
      renderDayDetail();
    };
    cell.addEventListener('click', select);
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
    });
    grid.appendChild(cell);
  }
}

function flushNote() {
  const ta = document.getElementById('dd-note');
  if (!ta || !state.selectedDay) return;
  const existing = state.progress.days[state.selectedDay];
  if (existing || ta.value) {
    const entry = existing || (state.progress.days[state.selectedDay] = {});
    entry.note = ta.value;
  }
}

function setFeedback(msg, ok) {
  const fb = document.getElementById('dd-feedback');
  if (!fb) return;
  fb.textContent = msg;
  fb.className = 'dd-feedback' + (ok ? ' ok' : ' err');
}

function renderDayDetail() {
  const el = $('#day-detail');
  const key = state.selectedDay;
  if (!key) {
    el.innerHTML = '<p class="muted">Select a day on the calendar to log your study session.</p>';
    return;
  }

  const s = state.progress.days[key] || {};
  const lessonNum = Number(s.lesson) || nextLessonNum() || 1;
  const lesson = lessonForDay(lessonNum);
  const src = lessonSource(lesson);
  const date = new Date(key + 'T00:00:00');

  let status;
  if (s.checkIn && s.checkOut) status = `Studied ${mins(s.checkIn, s.checkOut)} min`;
  else if (s.checkIn) status = `In progress since ${fmtTime(s.checkIn)}`;
  else status = 'No session logged yet';

  const hasSession = !!(s.checkIn || s.checkOut || s.lesson || s.note);

  el.innerHTML = `
    <div class="dd-head">
      <h3>${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</h3>
      <span class="dd-status">${status}</span>
    </div>
    <div class="dd-row">
      <label>Lesson day
        <input type="number" id="dd-lesson" min="1" max="100" value="${lessonNum}">
      </label>
    </div>
    <div class="dd-topic">Day ${lessonNum} — ${esc(lesson?.topic || 'Self-directed study')}</div>
    ${lesson?.objective ? `<div class="dd-obj">${esc(lesson.objective)}</div>` : ''}
    <div class="dd-row actions">
      ${!s.checkIn ? `<button class="btn primary" id="dd-in">${icon('play')} Start session</button>` : ''}
      ${s.checkIn && !s.checkOut ? `<button class="btn primary" id="dd-out">${icon('check')} Finish</button>` : ''}
      ${src ? `<button class="btn ghost" id="dd-open">${icon('doc')} Open lesson</button>` : ''}
      ${labButtons(lesson, 'dd')}
      ${hasSession ? `<button class="btn danger" id="dd-del">${icon('trash')} Delete</button>` : ''}
    </div>
    <label class="dd-note">What did you learn?
      <textarea id="dd-note" rows="4" placeholder="Notes, commands, takeaways…">${esc(s.note || '')}</textarea>
    </label>
    <div class="dd-actions2">
      <button class="btn" id="dd-save-note">${icon('save')} Save note</button>
    </div>
    <div class="dd-feedback" id="dd-feedback" role="status"></div>
  `;

  const persist = (okMsg) =>
    saveProgress()
      .then(() => { renderCalendar(); renderDayDetail(); renderQuickStart(); setFeedback(okMsg, true); })
      .catch(() => setFeedback('Could not save — is the server running?', false));

  const inBtn = $('#dd-in');
  if (inBtn) inBtn.addEventListener('click', () => {
    flushNote();
    const entry = state.progress.days[key] || (state.progress.days[key] = {});
    entry.lesson = clamp(parseInt($('#dd-lesson').value, 10), 1, 100);
    if (!entry.checkIn) entry.checkIn = new Date().toISOString();
    persist('Session started');
  });

  const outBtn = $('#dd-out');
  if (outBtn) outBtn.addEventListener('click', () => {
    flushNote();
    const entry = state.progress.days[key];
    if (entry) {
      entry.lesson = clamp(parseInt($('#dd-lesson').value, 10), 1, 100);
      if (!entry.checkIn) entry.checkIn = new Date().toISOString();
      entry.checkOut = new Date().toISOString();
    }
    persist('Session logged');
  });

  const delBtn = $('#dd-del');
  if (delBtn) delBtn.addEventListener('click', () => {
    const lose = s.note ? ' It also deletes your note.' : '';
    if (!confirm(`Remove the study session for ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}?${lose}`)) return;
    delete state.progress.days[key];
    persist('Session removed');
  });

  const openBtn = $('#dd-open');
  if (openBtn) openBtn.addEventListener('click', () => openFile(src));

  document.querySelectorAll('.dd-lab').forEach((b) => {
    b.addEventListener('click', () => openFile(lesson.lab[Number(b.dataset.idx)]));
  });

  $('#dd-save-note').addEventListener('click', () => {
    flushNote();
    saveProgress()
      .then(() => setFeedback('Note saved', true))
      .catch(() => setFeedback('Could not save — is the server running?', false));
  });
}

// ---------- Quick start ----------
function renderQuickStart() {
  const el = $('#quickstart');
  const n = nextLessonNum();
  if (!n) {
    el.innerHTML = '<div class="qs-done">All 100 days logged — nice work.</div>';
    return;
  }
  const lesson = lessonForDay(n);
  const src = lessonSource(lesson);
  const inProg = findInProgress(n);
  el.innerHTML = `
    <div class="qs-body">
      <div class="qs-main">Day ${n} — ${esc(lesson?.topic || 'Self-directed study')}${inProg ? ' · in progress' : ''}</div>
    </div>
    <div class="qs-actions">
      <button class="btn primary" id="qs-main">${inProg ? icon('check') + ' Finish' : icon('play') + ' Start'} Day ${n}</button>
      ${src ? `<button class="btn ghost" id="qs-open" aria-label="Open today's lesson" title="${esc(src)}">${icon('doc')}</button>` : ''}
      ${labButtons(lesson, 'qs')}
    </div>`;
  $('#qs-main').addEventListener('click', () => (inProg ? finishLesson(inProg) : startLesson(n)));
  const o = $('#qs-open');
  if (o) o.addEventListener('click', () => openFile(src));
  document.querySelectorAll('.qs-lab').forEach((b) => {
    b.addEventListener('click', () => openFile(lesson.lab[Number(b.dataset.idx)]));
  });
}

function startLesson(n) {
  const key = dateKey(new Date());
  flushNote();
  const entry = state.progress.days[key] || (state.progress.days[key] = {});
  if (!entry.lesson) entry.lesson = n;
  if (!entry.checkIn) entry.checkIn = new Date().toISOString();
  state.selectedDay = key;
  state.month = new Date();
  const src = lessonSource(lessonForDay(n));
  saveProgress().then(() => {
    renderCalendar();
    renderDayDetail();
    renderQuickStart();
    if (src) openFile(src);
    else switchTab('calendar');
  }).catch(() => setFeedback('Could not save — is the server running?', false));
}

function finishLesson(key) {
  const entry = state.progress.days[key];
  if (!entry) return;
  entry.checkOut = new Date().toISOString();
  state.selectedDay = key;
  const d = new Date(key + 'T00:00:00');
  state.month = new Date(d.getFullYear(), d.getMonth(), 1);
  saveProgress()
    .then(() => { switchTab('calendar'); renderCalendar(); renderDayDetail(); renderQuickStart(); setFeedback('Session logged', true); })
    .catch(() => setFeedback('Could not save — is the server running?', false));
}

// ---------- Dashboard ----------
const PHASES = [
  { name: 'Phase 1', color: '#6f7f96' },
  { name: 'Phase 2', color: '#a86a4f' },
  { name: 'Phase 3', color: '#6f9d84' },
  { name: 'Phase 4', color: '#a8864a' },
];

function computeStreak(days) {
  let streak = 0;
  const now = new Date();
  for (let i = 0; ; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const s = days[dateKey(d)];
    if (s && s.checkOut) { streak++; continue; }
    if (i === 0) continue; // today not checked out yet — don't break a live streak
    break;
  }
  return streak;
}

function fmtMins(total) {
  if (total >= 60) {
    const h = Math.floor(total / 60), m = total % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${total}m`;
}

function renderDashboard() {
  let done = 0, minutes = 0, inProgress = 0;
  const phaseDone = { 'Phase 1': 0, 'Phase 2': 0, 'Phase 3': 0, 'Phase 4': 0 };
  const phaseTotal = { 'Phase 1': 0, 'Phase 2': 0, 'Phase 3': 0, 'Phase 4': 0 };
  for (const l of state.lessons) phaseTotal[l.phase] = (phaseTotal[l.phase] || 0) + 1;

  const completed = [];
  for (const key in state.progress.days) {
    const s = state.progress.days[key];
    if (!s) continue;
    if (s.checkIn && s.checkOut) {
      done++;
      minutes += mins(s.checkIn, s.checkOut);
      const phase = lessonForDay(Number(s.lesson))?.phase;
      if (phase && phaseDone[phase] != null) phaseDone[phase]++;
      completed.push({ key, s, lesson: lessonForDay(Number(s.lesson)) });
    } else if (s.checkIn) {
      inProgress++;
    }
  }

  $('#stat-done').textContent = done;
  $('#stat-streak').textContent = computeStreak(state.progress.days);
  $('#stat-time').textContent = fmtMins(minutes);
  $('#stat-active').textContent = inProgress;

  const total = state.lessons.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('#overall-meta').textContent = `${done} / ${total} days · ${pct}%`;
  $('#overall-bar').style.width = pct + '%';

  const phaseEl = $('#phase-bars');
  phaseEl.innerHTML = '';
  for (const p of PHASES) {
    const t = phaseTotal[p.name] || 0;
    const d = phaseDone[p.name] || 0;
    const pp = t ? Math.round((d / t) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'phase-row';
    row.innerHTML =
      `<div class="phase-top">` +
        `<span class="phase-name">${p.name}</span>` +
        `<span class="phase-label">${d} of ${t} days</span>` +
        `<span class="phase-meta">${pp}%</span>` +
      `</div>` +
      `<div class="bar"><div class="bar-fill" style="width:${pp}%;background:${p.color}"></div></div>`;
    phaseEl.appendChild(row);
  }

  completed.sort((a, b) => b.key.localeCompare(a.key));
  const recent = $('#recent-list');
  recent.innerHTML = '';
  if (!completed.length) {
    recent.innerHTML = '<li class="muted">No completed study sessions yet.</li>';
  } else {
    for (const e of completed.slice(0, 8)) {
      const li = document.createElement('li');
      const dt = new Date(e.key + 'T00:00:00');
      li.innerHTML =
        `<span class="rec-date">${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` +
        `<span class="rec-day">Day ${esc(e.s.lesson)}</span>` +
        `<span class="rec-topic">${esc(e.lesson?.topic || 'Self-directed study')}</span>`;
      recent.appendChild(li);
    }
  }
}

// ---------- Sidebar toggle ----------
const SIDE_KEY = 'cyber-ui.side-collapsed';
function setSideCollapsed(collapsed) {
  document.body.classList.toggle('side-collapsed', collapsed);
  const btn = $('#side-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }
}
function toggleSidebar() {
  const collapsed = document.body.classList.toggle('side-collapsed');
  setSideCollapsed(collapsed);
  try { localStorage.setItem(SIDE_KEY, collapsed ? '1' : '0'); } catch {}
}

// ---------- Init ----------
async function init() {
  try {
    if (localStorage.getItem(SIDE_KEY) === '1') setSideCollapsed(true);
  } catch {}
  const [lessons, prog, tree] = await Promise.all([
    (await fetch('lessons.json')).json(),
    api('/api/progress'),
    api('/api/tree'),
  ]);
  state.lessons = lessons;
  state.lessonByDay = Object.fromEntries(lessons.map((l) => [l.day, l]));
  state.progress = prog && prog.days ? prog : { days: {} };
  state.tree = tree;

  const treeEl = $('#tree');
  treeEl.innerHTML = '';
  treeEl.appendChild(renderTree(state.tree));

  $('#viewer').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || /^(https?:)?\/\//.test(href.trim())) return;
    e.preventDefault();
    const r = resolveLink(state.file, href);
    if (r) openFile(r);
  });

  $('#tab-study').addEventListener('click', () => switchTab('study'));
  $('#tab-calendar').addEventListener('click', () => switchTab('calendar'));
  $('#tab-dashboard').addEventListener('click', () => switchTab('dashboard'));
  $('#side-toggle').addEventListener('click', toggleSidebar);
  $('#cal-prev').addEventListener('click', () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    renderCalendar();
  });
  $('#cal-today').addEventListener('click', () => {
    state.month = new Date();
    renderCalendar();
  });

  renderQuickStart();
  renderCalendar();
  renderDayDetail();
  renderDashboard();
}

init().catch(() => {
  const el = $('#viewer');
  if (el) {
    el.innerHTML = '<p class="muted">Couldn\'t load your study data — is the server running? Start it with <code>cd cyber-ui && npm start</code>.</p>';
  }
  $('#quickstart').innerHTML = '';
});