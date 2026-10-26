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
  const done = new Set();
  for (const k in state.progress.days) {
    const n = Number(state.progress.days[k]?.lesson);
    if (n >= 1 && n <= 100) done.add(n);
  }
  for (let n = 1; n <= 100; n++) if (!done.has(n)) return n;
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
      const icon = child.name.toLowerCase() === 'lab' ? '🧪' : '📁';
      btn.innerHTML = `<span class="tw">▾</span> ${icon} ${esc(child.name)}`;
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
      b.textContent = (isMd ? '📄 ' : '🐍 ') + child.name;
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
      `<div class="viewer-head">📄 ${esc(relPath)}</div>` +
      `<div class="markdown">${renderMarkdown(content)}</div>`;
  } else {
    $('#viewer').innerHTML =
      `<div class="viewer-head">🐍 ${esc(relPath)}</div>` +
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

// 🧪 buttons to open a lesson's Lab files (may include .md, .py, etc.).
function labButtons(lesson, cls) {
  const labs = lesson?.lab || [];
  if (!labs.length) return '';
  return labs
    .map((p, i) => `<button class="btn ghost ${cls}-lab" data-idx="${i}" title="${esc(p)}">🧪 ${esc(basename(p))}</button>`)
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
    cell.innerHTML = `<span class="daynum">${d}</span>` + (s?.lesson ? `<span class="lbl">D${s.lesson}</span>` : '');
    cell.addEventListener('click', () => {
      state.selectedDay = key;
      renderCalendar();
      renderDayDetail();
    });
    grid.appendChild(cell);
  }
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
  const date = new Date(key + 'T00:00:00');

  let status;
  if (s.checkIn && s.checkOut) status = `Studied ${mins(s.checkIn, s.checkOut)} min`;
  else if (s.checkIn) status = `In progress since ${fmtTime(s.checkIn)}`;
  else status = 'No session logged yet';

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
      <button class="btn primary" id="dd-in" ${s.checkIn ? 'disabled' : ''}>▶ Check in</button>
      <button class="btn" id="dd-out" ${!s.checkIn || s.checkOut ? 'disabled' : ''}>■ Check out</button>
      ${lesson?.content ? `<button class="btn ghost" id="dd-open">📄 Open lesson</button>` : ''}
      ${labButtons(lesson, 'dd')}
      <button class="btn danger" id="dd-del">🗑 Delete</button>
    </div>
    <label class="dd-note">What did you learn?
      <textarea id="dd-note" rows="4" placeholder="Notes, commands, takeaways…">${esc(s.note || '')}</textarea>
    </label>
    <div class="dd-actions2">
      <button class="btn" id="dd-save-note">💾 Save note</button>
    </div>
  `;

  $('#dd-in').addEventListener('click', () => {
    const entry = state.progress.days[key] || (state.progress.days[key] = {});
    entry.lesson = clamp(parseInt($('#dd-lesson').value, 10), 1, 100);
    if (!entry.checkIn) entry.checkIn = new Date().toISOString();
    saveProgress().then(() => { renderCalendar(); renderDayDetail(); renderQuickStart(); });
  });

  $('#dd-out').addEventListener('click', () => {
    const entry = state.progress.days[key];
    if (entry && entry.checkIn && !entry.checkOut) {
      entry.checkOut = new Date().toISOString();
      saveProgress().then(() => { renderCalendar(); renderDayDetail(); renderQuickStart(); });
    }
  });

  $('#dd-del').addEventListener('click', () => {
    if (!confirm('Delete this session log?')) return;
    delete state.progress.days[key];
    saveProgress().then(() => { renderCalendar(); renderDayDetail(); renderQuickStart(); });
  });

  const openBtn = $('#dd-open');
  if (openBtn) openBtn.addEventListener('click', () => openFile(lessonSource(lesson)));

  document.querySelectorAll('.dd-lab').forEach((b) => {
    b.addEventListener('click', () => openFile(lesson.lab[Number(b.dataset.idx)]));
  });

  $('#dd-save-note').addEventListener('click', () => {
    const entry = state.progress.days[key] || (state.progress.days[key] = {});
    entry.note = $('#dd-note').value;
    saveProgress().then(() => renderDayDetail());
  });
}

// ---------- Quick start ----------
function renderQuickStart() {
  const el = $('#quickstart');
  const n = nextLessonNum();
  if (!n) {
    el.innerHTML = '<div class="qs-done">🎉 All 100 days logged — you rock!</div>';
    return;
  }
  const lesson = lessonForDay(n);
  const src = lessonSource(lesson);
  el.innerHTML = `
    <div class="qs-body">
      <div class="qs-label">UP NEXT</div>
      <div class="qs-main">Day ${n} — ${esc(lesson?.topic || 'Self-directed study')}</div>
    </div>
    <div class="qs-actions">
      <button class="btn primary" id="qs-start">▶ Start Day ${n}</button>
      ${src ? `<button class="btn ghost" id="qs-open" title="${esc(src)}">📄</button>` : ''}
      ${labButtons(lesson, 'qs')}
    </div>`;
  $('#qs-start').addEventListener('click', () => startLesson(n));
  const o = $('#qs-open');
  if (o) o.addEventListener('click', () => openFile(src));
  document.querySelectorAll('.qs-lab').forEach((b) => {
    b.addEventListener('click', () => openFile(lesson.lab[Number(b.dataset.idx)]));
  });
}

function startLesson(n) {
  const key = dateKey(new Date());
  const entry = state.progress.days[key] || (state.progress.days[key] = {});
  if (!entry.lesson) entry.lesson = n;
  if (!entry.checkIn) entry.checkIn = new Date().toISOString();
  state.selectedDay = key;
  state.month = new Date();
  saveProgress().then(() => {
    switchTab('calendar');
    renderCalendar();
    renderDayDetail();
    renderQuickStart();
  });
}

// ---------- Dashboard ----------
const PHASES = [
  { name: 'Phase 1', color: '#3987e5' },
  { name: 'Phase 2', color: '#d95926' },
  { name: 'Phase 3', color: '#199e70' },
  { name: 'Phase 4', color: '#c98500' },
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

// ---------- Init ----------
async function init() {
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

init();