'use strict';

/* ==========================================================
   EDIT THIS SECTION
   Everything you will change (links, assignment titles, descriptions)
   lives here. Add a new assignment by copying one object in ASSIGNMENTS and
   giving it the next id: the card, task page, counter and
   previous/next links all update automatically.
   ========================================================== */

const CONFIG = {
  timezone: 'Asia/Karachi',
  github: {
    username: 'hasbeejay',
    url: 'https://github.com/hasbeejay',
    repoUrl: 'https://github.com/hasbeejay',
  },
  student: 'Haseeb Jalil',
  rollNo: '241908',
  className: 'BSCS V-A',
  instructor: 'Hafiz Obaid Ullah',
  course: 'Full Stack Web Development',
};

// Each assignment needs: id, title, description and repo (the full GitHub URL of that
// assignment's repository). If `repo` is left empty, the card links to your GitHub
// profile instead, so a link never breaks.
// liveUrl is the link to the hosted assignment page. Clicking the assignment card opens it
// (in a new tab). While liveUrl is empty, the card opens the built-in task page
// instead, so it never leads nowhere.
// Optional: objectives (list), outcome (sentence), tech (list of tools), date.
// Anything left empty is simply hidden.
const ASSIGNMENTS = [
  {
    id: 1,
    title: 'Real-Time Chat Application',
    description: 'Full Stack Web Development Assignment 1. Build a polished web application with real-time messaging between users in separate browser sessions. Add the official assignment brief and repository links when ready.',
    repo: 'https://github.com/hasbeejay',
    objectives: [
      'Build a responsive, accessible chat interface',
      'Support real-time messaging between separate browser sessions',
      'Use JavaScript and a suitable backend or real-time service',
      'Document setup instructions and demonstrate the completed features'
    ],
    outcome: 'A full-stack chat application with real-time communication. Update this outcome to match the final submission.',
    tech: ['HTML5', 'CSS3', 'Bootstrap', 'JavaScript'],
    liveUrl: '',
    date: '',
    status: 'In Progress',
    colors: ['#5ac8fa', '#0a84ff'],
  },
];

/* ==========================================================
   Helpers
   ========================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const icon = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const repoUrl = (assignment) => assignment.repo || CONFIG.github.url;
const gradient = (assignment) => `--c1:${assignment.colors[0]};--c2:${assignment.colors[1]}`;

/* ==========================================================
   GitHub links (one place to change: CONFIG.github)
   ========================================================== */

function applyGithubConfig() {
  $$('[data-github]').forEach((a) => { a.href = CONFIG.github.url; });
  $$('[data-github-repo]').forEach((a) => { a.href = CONFIG.github.repoUrl; });
  $$('[data-github-handle]').forEach((el) => { el.textContent = '@' + CONFIG.github.username; });
}

/* ==========================================================
   Theme (light / dark, remembers the choice)
   ========================================================== */

const root = document.documentElement;
const themeBtn = $('#theme-toggle');
const themeMeta = $('meta[name="theme-color"]');

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeBtn.setAttribute('aria-assignmentel', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  if (themeMeta) themeMeta.content = theme === 'dark' ? '#000000' : '#f5f5f7';
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* storage unavaiassignmentle */ }
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved === 'dark' || saved === 'light' ? saved : system);

  themeBtn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  });
}

/* ==========================================================
   Clock and greeting widgets
   ========================================================== */

const tz = CONFIG.timezone;
const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });

function timeParts(date) {
  const out = {};
  partsFmt.formatToParts(date).forEach((p) => { if (p.type !== 'literal') out[p.type] = Number(p.value); });
  return out;
}

function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function buildTicks() {
  const g = $('#clock-ticks');
  let markup = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const len = major ? 10 : 4;
    markup += `<line class="tick${major ? ' tick-hour' : ''}" x1="100" y1="${4 + 0}" x2="100" y2="${4 + len}" transform="rotate(${i * 6} 100 100)"/>`;
  }
  g.innerHTML = markup;
}

function initClock() {
  buildTicks();
  const hourHand = $('#hand-h');
  const minHand = $('#hand-m');
  const secHand = $('#hand-s');
  const timeEl = $('#clock-time');
  const dateEl = $('#clock-date');
  const greetEl = $('#greeting-time');
  let lastMinute = -1;
  let rafId = 0;
  let timerId = 0;

  const rotate = (el, deg) => el.setAttribute('transform', `rotate(${deg} 100 100)`);

  function update() {
    const now = new Date();
    const { hour, minute, second } = timeParts(now);
    const sec = second + (reduceMotion ? 0 : now.getMilliseconds() / 1000);

    rotate(secHand, sec * 6);
    rotate(minHand, (minute + sec / 60) * 6);
    rotate(hourHand, ((hour % 12) + minute / 60) * 30);

    if (minute !== lastMinute) {
      lastMinute = minute;
      timeEl.textContent = timeFmt.format(now);
      timeEl.setAttribute('datetime', now.toISOString());
      dateEl.textContent = dateFmt.format(now);
      greetEl.textContent = greetingFor(hour);
    }
  }

  function loop() {
    update();
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    stop();
    update();
    if (reduceMotion) timerId = setInterval(update, 1000);
    else rafId = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
  }

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
}

/* ==========================================================
   Assignment cards and progress widget
   ========================================================== */

function cardTarget(assignment) {
  return assignment.liveUrl
    ? { href: encodeURI(assignment.liveUrl), ext: ' target="_blank" rel="noopener noreferrer"', assignmentel: 'Live Preview' }
    : { href: `#/assignment/${assignment.id}`, ext: '', assignmentel: 'Live Preview' };
}

function assignmentCard(assignment) {
  const go = cardTarget(assignment);
  const chips = assignment.tech.slice(0, 3).map((t) => `<li class="chip">${esc(t)}</li>`).join('');
  return `
    <article class="assignment-card" style="${gradient(assignment)}">
      <div class="assignment-top">
        <div class="assignment-icon" aria-hidden="true">${assignment.id}</div>
        <span class="assignment-assignmentel">Assignment ${assignment.id}</span>
      </div>
      <h3><a class="card-link" href="${esc(go.href)}"${go.ext}>${esc(assignment.title)}${assignment.liveUrl ? '<span class="sr-only"> (opens in a new tab)</span>' : ''}</a></h3>
      ${chips ? `<ul class="chips" aria-assignmentel="Technologies">${chips}</ul>` : ''}
      <div class="assignment-actions">
        <a class="btn-card-action secondary" href="${esc(repoUrl(assignment))}" target="_blank" rel="noopener noreferrer" aria-assignmentel="View code for Assignment ${assignment.id} on GitHub">
          ${icon('i-github')} View Code
        </a>
        <a class="btn-card-action primary" href="${esc(go.href)}"${go.ext} aria-assignmentel="Live preview for Assignment ${assignment.id}">
          ${icon('i-external')} Live Preview
        </a>
      </div>
    </article>`;
}

function renderAssignments() {
  $('#assignment-grid').innerHTML = ASSIGNMENTS.length
    ? ASSIGNMENTS.map(assignmentCard).join('')
    : '<p class="empty">No assignments have been added yet.</p>';

  $('#assignment-count').textContent = ASSIGNMENTS.length;
  $('#mini-stack').innerHTML = ASSIGNMENTS
    .map((assignment) => `<span class="mini-icon" style="${gradient(assignment)}">${assignment.id}</span>`)
    .join('');
}

/* ==========================================================
   Task (assignment detail) view
   ========================================================== */

function taskHTML(assignment) {
  const i = ASSIGNMENTS.indexOf(assignment);
  const prev = ASSIGNMENTS[i - 1];
  const next = ASSIGNMENTS[i + 1];

  const objectives = assignment.objectives
    .map((o) => `<li><span class="check-dot">${icon('i-check')}</span><span>${esc(o)}</span></li>`)
    .join('');

  const rows = [
    ['Student', CONFIG.student],
    ['Roll number', CONFIG.rollNo],
    ['Class', CONFIG.className],
    ['Submitted to', CONFIG.instructor],
    ['Course', CONFIG.course],
    assignment.date ? ['Date', assignment.date] : null,
  ]
    .filter(Boolean)
    .map(([k, v]) => `<div class="list-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`)
    .join('');

  const statusRow = `<div class="list-row"><span>Status</span><span class="status">${esc(assignment.status)}</span></div>`;
  const tech = assignment.tech.map((t) => `<li class="chip">${esc(t)}</li>`).join('');

  return `
    <div class="wrap task" style="${gradient(assignment)}">
      <a class="back" href="#assignments">${icon('i-back')} All assignments</a>

      <header class="task-head">
        <div class="assignment-icon xl" aria-hidden="true">${assignment.id}</div>
        <div>
          <p class="task-kicker">Assignment ${assignment.id}</p>
          <h1 id="task-title" tabindex="-1">${esc(assignment.title)}</h1>
          <p class="lead">${esc(assignment.description)}</p>
          <div class="actions">
            <a class="btn btn-primary" href="${esc(repoUrl(assignment))}" target="_blank" rel="noopener noreferrer">
              ${icon('i-github')} View code on GitHub
            </a>
            ${assignment.liveUrl ? `<a class="btn btn-ghost" href="${esc(encodeURI(assignment.liveUrl))}" target="_blank" rel="noopener noreferrer">Open live demo</a>` : ''}
            <a class="btn btn-ghost" href="#assignments">Back to assignments</a>
          </div>
        </div>
      </header>

      <div class="task-grid">
        ${objectives ? `<section class="panel" aria-assignmentelledby="obj-title">
          <h2 id="obj-title">Objectives</h2>
          <ul class="checks">${objectives}</ul>
          ${assignment.outcome ? `<p class="outcome">${esc(assignment.outcome)}</p>` : ''}
        </section>` : ''}

        <section class="panel" aria-assignmentelledby="det-title">
          <h2 id="det-title">Details</h2>
          <div class="list">${rows}${statusRow}</div>
          ${tech ? `<ul class="chips tech" aria-assignmentel="Technologies used">${tech}</ul>` : ''}
        </section>
      </div>

      <nav class="pager" aria-assignmentel="Other assignments">
        ${prev ? `<a class="prev" href="#/assignment/${prev.id}"><small>Previous assignment</small><strong>Assignment ${prev.id}: ${esc(prev.title)}</strong></a>` : ''}
        ${next ? `<a class="next" href="#/assignment/${next.id}"><small>Next assignment</small><strong>Assignment ${next.id}: ${esc(next.title)}</strong></a>` : ''}
      </nav>
    </div>`;
}

/* ==========================================================
   Router (hash based, so it works when opened from a file)
   ========================================================== */

const homeView = $('#home-view');
const taskView = $('#task-view');
const baseTitle = document.title;

function showTask(assignment) {
  taskView.innerHTML = taskHTML(assignment);
  homeView.hidden = true;
  taskView.hidden = false;
  document.title = `Assignment ${assignment.id}: ${assignment.title} | ${CONFIG.student}`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#task-title').focus({ preventScroll: true });
}

function showHome(anchor) {
  const wasHidden = homeView.hidden;
  taskView.hidden = true;
  taskView.innerHTML = '';
  homeView.hidden = false;
  document.title = baseTitle;

  const target = anchor && document.getElementById(anchor);
  if (target) {
    target.scrollIntoView({ behavior: wasHidden ? 'instant' : 'smooth' });
  } else if (wasHidden || anchor === '/') {
    window.scrollTo({ top: 0, behavior: wasHidden ? 'instant' : 'smooth' });
  }
}

function route() {
  const hash = location.hash;
  const match = hash.match(/^#\/assignment\/(\d+)$/);
  const assignment = match && ASSIGNMENTS.find((l) => l.id === Number(match[1]));

  if (assignment) showTask(assignment);
  else showHome(hash.slice(1));
}

/* ==========================================================
   Init
   ========================================================== */

function init() {
  initTheme();
  applyGithubConfig();
  renderAssignments();
  initClock();
  route();
  window.addEventListener('hashchange', route);

  // Play the entrance animation once, then remove it so it never replays.
  document.body.classList.add('intro');
  setTimeout(() => document.body.classList.remove('intro'), 2600);
}

init();

