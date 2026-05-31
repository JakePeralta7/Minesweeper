'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  sessionId:      null,
  difficulty:     'medium',
  rows:           0,
  cols:           0,
  mineCount:      0,
  // cells[r][c] = { revealed: bool, flagged: bool, adjacent: number|null }
  cells:          null,
  flagsPlaced:    0,
  gameOver:       false,
  won:            false,
  firstClickDone: false,
  startTime:      null,
  timerHandle:    null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const boardEl          = document.getElementById('board');
const timerEl          = document.getElementById('timer');
const mineCounterEl    = document.getElementById('mine-counter');
const overlayEl        = document.getElementById('board-overlay');
const overlayMsgEl     = document.getElementById('overlay-message');
const btnNew           = document.getElementById('btn-new');
const btnOverlayNew    = document.getElementById('btn-overlay-new');
const btnTheme         = document.getElementById('btn-theme');
const btnLeaderboard   = document.getElementById('btn-leaderboard');
const diffBtns         = document.querySelectorAll<HTMLButtonElement>('.diff-btn');

const modalLeaderboard   = document.getElementById('modal-leaderboard');
const modalBackdrop      = document.getElementById('modal-backdrop');
const btnModalClose      = document.getElementById('btn-modal-close');
const tabBtns            = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
const leaderboardContent = document.getElementById('leaderboard-content');

const modalScore       = document.getElementById('modal-score');
const scoreForm        = document.getElementById('score-form');
const playerNameInput  = document.getElementById('player-name');
const scoreTimeDisplay = document.getElementById('score-time-display');
const btnSkipScore     = document.getElementById('btn-skip-score');

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'auto';
  applyTheme(saved);
}

btnTheme.addEventListener('click', () => {
  const current = localStorage.getItem('theme') || 'auto';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ── Timer ─────────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  stopTimer();
  state.startTime = Date.now();
  state.timerHandle = setInterval(() => {
    timerEl.textContent = formatTime(Math.floor((Date.now() - state.startTime) / 1000));
  }, 500);
}

function stopTimer() {
  if (state.timerHandle) { clearInterval(state.timerHandle); state.timerHandle = null; }
}

function getElapsedSeconds() {
  if (!state.startTime) return 1;
  return Math.max(1, Math.round((Date.now() - state.startTime) / 1000));
}

// ── Mine counter ──────────────────────────────────────────────────────────────
function updateMineCounter() {
  mineCounterEl.textContent = `💣 ${state.mineCount - state.flagsPlaced}`;
}

// ── Board: build & render ─────────────────────────────────────────────────────
function applyBoardCssVars() {
  document.documentElement.style.setProperty('--cols', String(state.cols));
  // Shrink cells on wide boards so they fit on screen
  if (state.cols >= 30) {
    document.documentElement.style.setProperty('--cell-size', 'clamp(22px, 3.5vw, 32px)');
  } else if (state.cols >= 16) {
    document.documentElement.style.setProperty('--cell-size', 'clamp(26px, 4.5vw, 36px)');
  } else {
    document.documentElement.style.setProperty('--cell-size', 'clamp(28px, 6vw, 40px)');
  }
}

function buildBoard() {
  applyBoardCssVars();
  boardEl.innerHTML = '';

  // Long-press state for mobile flagging
  let longPressTimer = null;
  let longPressCell  = null;

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell unrevealed';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.setAttribute('role', 'gridcell');

      // Left-click: reveal
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        handleReveal(r, c);
      });

      // Right-click: flag
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleFlag(r, c);
      });

      // Long-press for mobile flagging
      cell.addEventListener('pointerdown', () => {
        longPressCell = { r, c };
        longPressTimer = setTimeout(() => {
          handleFlag(r, c);
          longPressCell = null;
        }, 500);
      });
      cell.addEventListener('pointerup', () => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      });
      cell.addEventListener('pointerleave', () => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      });

      boardEl.appendChild(cell);
    }
  }
}

function getCellEl(r, c) {
  return boardEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
}

function renderCell(r, c) {
  const cell    = getCellEl(r, c);
  const data    = state.cells[r][c];

  cell.className = 'cell';
  cell.textContent = '';

  if (data.revealed) {
    cell.classList.add('revealed');
    if (data.adjacent > 0) {
      cell.classList.add(`n${data.adjacent}`);
      cell.textContent = data.adjacent;
    }
  } else if (data.flagged) {
    cell.classList.add('unrevealed', 'flagged');
    cell.textContent = '🚩';
  } else {
    cell.classList.add('unrevealed');
  }
}

function renderAllCells() {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      renderCell(r, c);
    }
  }
}

// ── Reveal ────────────────────────────────────────────────────────────────────
async function handleReveal(r, c) {
  if (state.gameOver || state.won) return;
  const data = state.cells[r][c];
  if (data.revealed || data.flagged) return;

  // Start timer on first reveal
  if (!state.firstClickDone) {
    state.firstClickDone = true;
    startTimer();
  }

  // Build the list of already-revealed cells to send to the server
  const revealed = [];
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      if (state.cells[row][col].revealed) revealed.push({ row, col });
    }
  }

  try {
    const res  = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId, row: r, col: c, revealed }),
    });
    const body = await res.json();
    if (!res.ok) { console.error(body.error); return; }

    if (body.hit) {
      // Game over — show all mines
      stopTimer();
      state.gameOver = true;
      // Mark the exploded cell
      state.cells[r][c] = { revealed: false, flagged: false, adjacent: null, exploded: true };
      // Reveal all mines
      for (const { row, col } of body.mines) {
        if (row === r && col === c) continue;
        const mineData = state.cells[row][col];
        if (!mineData.flagged) {
          state.cells[row][col] = { revealed: false, flagged: false, adjacent: null, isMine: true };
        }
      }
      renderLoss(r, c);
    } else {
      for (const { row, col, adjacent } of body.revealed) {
        state.cells[row][col] = { revealed: true, flagged: false, adjacent };
      }
      renderAllCells();

      if (body.won) {
        stopTimer();
        state.won = true;
        overlayEl.classList.add('hidden');
        openScoreModal(getElapsedSeconds());
      }
    }
  } catch {
    console.error('Network error during reveal.');
  }
}

function renderLoss(explodedRow, explodedCol) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell   = getCellEl(r, c);
      const data   = state.cells[r][c];
      cell.className = 'cell';
      cell.textContent = '';

      if (r === explodedRow && c === explodedCol) {
        cell.classList.add('exploded');
        cell.textContent = '💥';
      } else if (data.isMine) {
        cell.classList.add('mine');
        cell.textContent = '💣';
      } else if (data.flagged) {
        cell.classList.add('unrevealed', 'flagged');
        cell.textContent = '🚩';
      } else if (data.revealed) {
        cell.classList.add('revealed');
        if (data.adjacent > 0) {
          cell.classList.add(`n${data.adjacent}`);
          cell.textContent = data.adjacent;
        }
      } else {
        cell.classList.add('unrevealed');
      }
    }
  }
  showOverlay('💥 Game Over!');
}

// ── Flag ──────────────────────────────────────────────────────────────────────
function handleFlag(r, c) {
  if (state.gameOver || state.won) return;
  const data = state.cells[r][c];
  if (data.revealed) return;

  if (data.flagged) {
    data.flagged = false;
    state.flagsPlaced--;
  } else {
    data.flagged = true;
    state.flagsPlaced++;
  }
  renderCell(r, c);
  updateMineCounter();
}

// ── Overlay ───────────────────────────────────────────────────────────────────
function showOverlay(msg) {
  overlayMsgEl.textContent = msg;
  overlayEl.classList.remove('hidden');
}

btnOverlayNew.addEventListener('click', startNewGame);

// ── Leaderboard modal ─────────────────────────────────────────────────────────
let activeLbDifficulty = 'medium';

btnLeaderboard.addEventListener('click', () => openLeaderboardModal(state.difficulty));
btnModalClose.addEventListener('click',  closeLeaderboardModal);
modalBackdrop.addEventListener('click',  closeLeaderboardModal);

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeLbDifficulty = btn.dataset.difficulty;
    loadLeaderboard(activeLbDifficulty);
  });
});

function openLeaderboardModal(difficulty = 'medium') {
  activeLbDifficulty = difficulty;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.difficulty === difficulty));
  modalLeaderboard.classList.remove('hidden');
  modalBackdrop.classList.remove('hidden');
  loadLeaderboard(difficulty);
}

function closeLeaderboardModal() {
  modalLeaderboard.classList.add('hidden');
  modalBackdrop.classList.add('hidden');
}

async function loadLeaderboard(difficulty) {
  leaderboardContent.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const res  = await fetch(`/api/leaderboard?difficulty=${difficulty}`);
    const data = await res.json();
    if (!res.ok) { leaderboardContent.innerHTML = `<p class="empty-state">Error: ${data.error}</p>`; return; }
    renderLeaderboard(data.scores);
  } catch {
    leaderboardContent.innerHTML = '<p class="empty-state">Failed to load scores.</p>';
  }
}

function renderLeaderboard(scores) {
  if (!scores.length) {
    leaderboardContent.innerHTML = '<p class="empty-state">No scores yet — be the first!</p>';
    return;
  }
  const medal = ['🥇', '🥈', '🥉'];
  const rows = scores.map((s, i) => `
    <tr>
      <td class="rank ${i < 3 ? `rank-${i + 1}` : ''}">${medal[i] || i + 1}</td>
      <td>${escHtml(s.player_name)}</td>
      <td>${formatTime(s.time_seconds)}</td>
    </tr>
  `).join('');
  leaderboardContent.innerHTML = `
    <table class="leaderboard-table">
      <thead><tr><th>#</th><th>Player</th><th>Time</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Score submit modal ────────────────────────────────────────────────────────
let pendingElapsed = 0;

function openScoreModal(elapsed) {
  pendingElapsed = elapsed;
  scoreTimeDisplay.textContent = `You cleared the board in ${formatTime(elapsed)}! 🎉`;
  const playerInput = playerNameInput as HTMLInputElement;
  playerInput.value = localStorage.getItem('lastPlayerName') || '';
  modalScore.classList.remove('hidden');
  modalBackdrop.classList.remove('hidden');
  playerInput.focus();
}

function closeScoreModal() {
  modalScore.classList.add('hidden');
  modalBackdrop.classList.add('hidden');
}

scoreForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const playerInput = playerNameInput as HTMLInputElement;
  const name = playerInput.value.trim();
  if (!name) return;
  localStorage.setItem('lastPlayerName', name);
  await submitScore(name, pendingElapsed);
  closeScoreModal();
  openLeaderboardModal(state.difficulty);
});

btnSkipScore.addEventListener('click', () => {
  closeScoreModal();
  showOverlay('🎉 You Won!');
});

async function submitScore(playerName, elapsed) {
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name:  playerName,
        time_seconds: elapsed,
        difficulty:   state.difficulty,
        session_id:   state.sessionId,
      }),
    });
  } catch {
    console.warn('Score submission failed.');
  }
}

// ── New game ──────────────────────────────────────────────────────────────────
function makeCells(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ revealed: false, flagged: false, adjacent: null }))
  );
}

async function startNewGame() {
  overlayEl.classList.add('hidden');
  stopTimer();
  timerEl.textContent   = '00:00';
  state.gameOver        = false;
  state.won             = false;
  state.firstClickDone  = false;
  state.flagsPlaced     = 0;
  state.startTime       = null;

  try {
    const res  = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: state.difficulty }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to start new game.'); return; }

    state.sessionId = data.session_id;
    state.rows      = data.rows;
    state.cols      = data.cols;
    state.mineCount = data.mine_count;
    state.cells     = makeCells(data.rows, data.cols);

    buildBoard();
    updateMineCounter();
  } catch {
    alert('Network error. Is the server running?');
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────
btnNew.addEventListener('click', startNewGame);

diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    diffBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.difficulty = btn.dataset.difficulty;
    startNewGame();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
initTheme();
startNewGame();
