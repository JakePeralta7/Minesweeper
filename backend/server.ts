'use strict';

const path = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { generateMines, cascadeReveal } = require('./game');
const {
  saveSession, getSession, setSessionMines, incrementRevealedCount,
  deleteSession, saveScore, getLeaderboard,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const BOARD_CONFIG = {
  easy:   { rows: 9,  cols: 9,  mine_count: 10 },
  medium: { rows: 16, cols: 16, mine_count: 40 },
  hard:   { rows: 16, cols: 30, mine_count: 99 },
};

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateDifficulty(res, difficulty) {
  if (!DIFFICULTIES.includes(difficulty)) {
    res.status(400).json({ error: `difficulty must be one of: ${DIFFICULTIES.join(', ')}` });
    return false;
  }
  return true;
}

function requireSession(req, res) {
  const { session_id } = req.body;
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required.' });
    return null;
  }
  const session = getSession(session_id);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired.' });
    return null;
  }
  return session;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/game — start a new game session (mines generated on first reveal)
app.post('/api/game', (req, res) => {
  const difficulty = (req.body.difficulty || 'medium').toLowerCase();
  if (!validateDifficulty(res, difficulty)) return;

  const { rows, cols, mine_count } = BOARD_CONFIG[difficulty];
  const session_id = uuidv4();
  saveSession(session_id, difficulty, rows, cols, mine_count);

  res.json({ session_id, difficulty, rows, cols, mine_count });
});

// POST /api/reveal — reveal a cell; generates mines on first call
app.post('/api/reveal', (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const { row, col } = req.body;
  if (typeof row !== 'number' || typeof col !== 'number') {
    return res.status(400).json({ error: 'row and col must be numbers.' });
  }
  if (row < 0 || row >= session.rows || col < 0 || col >= session.cols) {
    return res.status(400).json({ error: 'row or col out of bounds.' });
  }

  // Generate mines on first reveal (first-click safety).
  // session.mines is stored as a JSON array of "row,col" strings, or null before first click.
  let mines;
  if (!session.mines || !Array.isArray(session.mines)) {
    mines = generateMines(session.rows, session.cols, session.mine_count, row, col);
    setSessionMines(session.session_id, [...mines]); // spread Set → array for JSON storage
  } else {
    mines = new Set(session.mines); // restore array → Set
  }

  // Check if the player hit a mine
  if (mines.has(`${row},${col}`)) {
    // Reveal all mine positions and end the game
    deleteSession(session.session_id);
    const allMines = [...mines].map(key => {
      const [r, c] = key.split(',').map(Number);
      return { row: r, col: c };
    });
    return res.json({ hit: true, mines: allMines });
  }

  // Build the set of already-revealed cells from the client
  // (We trust the client here for rendering — win is verified server-side)
  const alreadyRevealed = new Set(
    (req.body.revealed || []).map(({ row: r, col: c }) => `${r},${c}`)
  );

  const newCells = cascadeReveal(
    mines, row, col, session.rows, session.cols, alreadyRevealed
  );

  if (newCells.length > 0) {
    incrementRevealedCount(session.session_id, newCells.length);
  }

  // Reload session to get updated revealed_count
  const updated = getSession(session.session_id);
  const totalSafe = session.rows * session.cols - session.mine_count;
  const won = updated.revealed_count >= totalSafe;

  if (won) {
    // Leave session alive so the score submission can verify it
  }

  res.json({ hit: false, revealed: newCells, won });
});

// GET /api/leaderboard?difficulty= — top 10 scores for a difficulty
app.get('/api/leaderboard', (req, res) => {
  const difficulty = (req.query.difficulty || 'medium').toLowerCase();
  if (!validateDifficulty(res, difficulty)) return;

  const rows = getLeaderboard(difficulty);
  res.json({ difficulty, scores: rows });
});

// POST /api/leaderboard — submit a score after winning
app.post('/api/leaderboard', (req, res) => {
  const { player_name, time_seconds, difficulty, session_id } = req.body;

  if (!player_name || typeof player_name !== 'string' || !player_name.trim()) {
    return res.status(400).json({ error: 'player_name is required.' });
  }
  if (typeof time_seconds !== 'number' || time_seconds <= 0) {
    return res.status(400).json({ error: 'time_seconds must be a positive number.' });
  }
  if (!validateDifficulty(res, (difficulty || '').toLowerCase())) return;

  // Verify session exists and the game was actually won (anti-cheat)
  const session = getSession(session_id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired.' });
  }
  if (session.difficulty !== difficulty.toLowerCase()) {
    return res.status(400).json({ error: 'Difficulty mismatch with session.' });
  }
  const totalSafe = session.rows * session.cols - session.mine_count;
  if (session.revealed_count < totalSafe) {
    return res.status(400).json({ error: 'Game not yet won.' });
  }

  saveScore(player_name.trim(), Math.round(time_seconds), difficulty.toLowerCase());
  deleteSession(session_id);

  res.status(201).json({ message: 'Score saved.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Minesweeper server running on http://localhost:${PORT}`);
});
