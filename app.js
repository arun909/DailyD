/* ════════════════════════════════════════════════
   JRF Master – Study App Logic
   ════════════════════════════════════════════════ */

'use strict';

// ─── State ───
let currentPaper = 'yourfile';
let paperData = null;
let revealedSet = new Set();
let debounceTimers = {};
let currentTheme = localStorage.getItem('jrf_theme') || 'dark';

// ─── DOM refs ───
const $ = (s) => document.querySelector(s);
const container = $('#questionsContainer');
const typeFilter = $('#typeFilter');
const totalQEl = $('#totalQ');
const notesCountEl = $('#notesCount');
const revealedCountEl = $('#revealedCount');
const progressBar = $('#progressBar');
const mobileProgress = $('#mobileProgress');
const backToTop = $('#backToTop');
const hamburger = $('#hamburger');
const sidebar = $('#sidebar');
const btnReset = $('#btnResetNotes');

// Theme refs
const btnDark = $('#themeDark');
const btnNight = $('#themeNight');

// ─── Overlay for mobile sidebar ───
const overlay = document.querySelector('.sidebar-overlay') || document.createElement('div');
if (!overlay.parentNode) {
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);
}

// ─── Init ───
async function init() {
  applyTheme(currentTheme);
  await loadPaper(currentPaper);
  bindEvents();
}

// ─── Themes ───
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  currentTheme = theme;
  localStorage.setItem('jrf_theme', theme);

  // Update active button
  if (theme === 'night') {
    btnNight.classList.add('active');
    btnDark.classList.remove('active');
  } else {
    btnDark.classList.add('active');
    btnNight.classList.remove('active');
  }
}

// ─── Load Paper JSON ───
async function loadPaper(name) {
  try {
    const res = await fetch("/data/yourfile.json");
    if (!res.ok) throw new Error('Failed to load');
    paperData = await res.json();
    revealedSet = new Set();
    renderQuestions(paperData.questions);
    updateStats();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">😕</div><p>Could not load question paper.</p></div>`;
  }
}

// ─── Render Questions ───
function renderQuestions(questions) {
  const filter = typeFilter.value;
  const filtered = filter === 'all' ? questions : questions.filter(q => q.type === filter);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">🔍</div><p>No questions match this filter.</p></div>`;
    return;
  }

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  let lastPassage = null;

  filtered.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.style.animationDelay = `${Math.min(i * 0.05, 1)}s`;
    card.id = `q-${q.id}`;

    const typeLabels = {
      simple: 'MCQ', match: 'Match', arrange: 'Arrange',
      assertion: 'Assertion', comprehension: 'Reading', statements: 'Statements'
    };

    let passageHTML = '';
    if (q.type === 'comprehension' && q.passage && q.passage !== lastPassage) {
      lastPassage = q.passage;
      passageHTML = `
          <button class="q-passage-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'; this.textContent=this.textContent==='▶ Show Passage'?'▼ Hide Passage':'▶ Show Passage'">▼ Hide Passage</button>
          <div class="q-passage">${escapeHtml(q.passage)}</div>`;
    }

    const savedNote = getNoteFromStorage(currentPaper, q.id);
    const isRevealed = revealedSet.has(q.id);

    card.innerHTML = `
        <div class="q-header">
          <span class="q-number">${q.id}</span>
          <span class="q-type-badge">${typeLabels[q.type] || q.type}</span>
        </div>
        ${passageHTML}
        <div class="q-text">${escapeHtml(q.questionText)}</div>
        <div class="options-grid">
          ${q.options.map((opt, oi) => `
            <div class="option-item${isRevealed && (oi + 1) === q.correctAnswer ? ' correct' : ''}" data-opt="${oi + 1}">
              <span class="option-num">${oi + 1}</span>
              <span class="option-text">${escapeHtml(opt)}</span>
            </div>
          `).join('')}
        </div>
        <button class="btn-show-answer${isRevealed ? ' revealed' : ''}" data-qid="${q.id}" data-ans="${q.correctAnswer}">
          ${isRevealed ? '✓ Answer Revealed' : '👁 Show Answer'}
        </button>
        <hr class="q-divider">
        <div class="notepad-section">
          <label class="notepad-label">
            📝 Your Notes
          </label>
          <textarea class="notepad" id="note-${q.id}" placeholder="Type index/key points for instant recall..." data-qid="${q.id}">${escapeHtml(savedNote)}</textarea>
        </div>
      `;

    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

// ─── Events ───
function bindEvents() {
  // Theme switching
  btnDark.addEventListener('click', () => applyTheme('dark'));
  btnNight.addEventListener('click', () => applyTheme('night'));

  // Filter change
  typeFilter.addEventListener('change', () => {
    if (paperData) renderQuestions(paperData.questions);
  });

  // Show answer
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-show-answer');
    if (!btn || btn.classList.contains('revealed')) return;

    const qid = parseInt(btn.dataset.qid);
    const ans = parseInt(btn.dataset.ans);
    const card = btn.closest('.question-card');

    card.querySelectorAll('.option-item').forEach(opt => {
      if (parseInt(opt.dataset.opt) === ans) opt.classList.add('correct');
    });

    btn.classList.add('revealed');
    btn.innerHTML = '✓ Answer Revealed';
    revealedSet.add(qid);
    updateStats();
  });

  // Notepad auto-save
  container.addEventListener('input', (e) => {
    if (!e.target.classList.contains('notepad')) return;
    const qid = e.target.dataset.qid;
    clearTimeout(debounceTimers[qid]);
    debounceTimers[qid] = setTimeout(() => {
      saveNoteToStorage(currentPaper, qid, e.target.value);
      updateStats();
    }, 500);
  });

  // Mobile Navigation
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });

  // Back to top
  window.addEventListener('scroll', () => {
    backToTop.classList.toggle('visible', window.scrollY > 500);
  });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Reset notes
  btnReset.addEventListener('click', () => {
    if (!confirm('Clear all saved notes?')) return;
    clearNotesForPaper(currentPaper);
    if (paperData) renderQuestions(paperData.questions);
    updateStats();
  });
}

// ─── Stats ───
function updateStats() {
  if (!paperData) return;
  const total = paperData.questions.length;
  const notesCount = countNotesForPaper(currentPaper);
  const revealedCount = revealedSet.size;

  totalQEl.textContent = total;
  notesCountEl.textContent = notesCount;
  revealedCountEl.textContent = revealedCount;

  const progress = Math.round((revealedCount / total) * 100);
  progressBar.style.width = `${progress}%`;
  mobileProgress.textContent = `${revealedCount}/${total}`;
}

// ─── storage ───
function storageKey(paper, qid) { return `jrf_note_${paper}_${qid}`; }
function getNoteFromStorage(paper, qid) { return localStorage.getItem(storageKey(paper, qid)) || ''; }
function saveNoteToStorage(paper, qid, val) {
  if (val.trim()) localStorage.setItem(storageKey(paper, qid), val);
  else localStorage.removeItem(storageKey(paper, qid));
}
function countNotesForPaper(paper) {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i).startsWith(`jrf_note_${paper}_`)) count++;
  }
  return count;
}
function clearNotesForPaper(paper) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i).startsWith(`jrf_note_${paper}_`)) keys.push(localStorage.key(i));
  }
  keys.forEach(k => localStorage.removeItem(k));
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

init();

