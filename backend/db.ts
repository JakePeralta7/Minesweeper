'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join('/data', 'leaderboard.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initialise();
    scheduleCleanup();
  }
  return db;
}

function initialise() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id     TEXT PRIMARY KEY,
      difficulty     TEXT NOT NULL,
      rows           INTEGER NOT NULL,
      cols           INTEGER NOT NULL,
      mine_count     INTEGER NOT NULL,
      mines          TEXT,
      revealed_count INTEGER NOT NULL DEFAULT 0,
      started_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scores (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name  TEXT NOT NULL,
      time_seconds INTEGER NOT NULL,
      difficulty   TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scores_difficulty_time
      ON scores (difficulty, time_seconds ASC);
  `);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function saveSession(session_id, difficulty, rows, cols, mine_count) {
  getDb().prepare(`
    INSERT INTO sessions (session_id, difficulty, rows, cols, mine_count, mines, revealed_count, started_at)
    VALUES (?, ?, ?, ?, ?, NULL, 0, ?)
  `).run(session_id, difficulty, rows, cols, mine_count, Date.now());
}

function getSession(session_id) {
  const row = getDb().prepare(`
    SELECT * FROM sessions WHERE session_id = ?
  `).get(session_id);
  if (!row) return null;
  return {
    session_id:     row.session_id,
    difficulty:     row.difficulty,
    rows:           row.rows,
    cols:           row.cols,
    mine_count:     row.mine_count,
    mines:          row.mines ? JSON.parse(row.mines) : null,
    revealed_count: row.revealed_count,
    started_at:     row.started_at,
  };
}

function setSessionMines(session_id, mines) {
  getDb().prepare(`
    UPDATE sessions SET mines = ? WHERE session_id = ?
  `).run(JSON.stringify(mines), session_id);
}

function incrementRevealedCount(session_id, amount) {
  getDb().prepare(`
    UPDATE sessions SET revealed_count = revealed_count + ? WHERE session_id = ?
  `).run(amount, session_id);
}

function deleteSession(session_id) {
  getDb().prepare(`DELETE FROM sessions WHERE session_id = ?`).run(session_id);
}

function purgeExpiredSessions() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const result = getDb().prepare(`DELETE FROM sessions WHERE started_at < ?`).run(cutoff);
  if (result.changes > 0) {
    console.log(`[cleanup] Purged ${result.changes} expired session(s).`);
  }
}

function scheduleCleanup() {
  purgeExpiredSessions();
  setInterval(purgeExpiredSessions, 60 * 60 * 1000);
}

// ─── Scores ───────────────────────────────────────────────────────────────────

function saveScore(player_name, time_seconds, difficulty) {
  getDb().prepare(`
    INSERT INTO scores (player_name, time_seconds, difficulty, created_at)
    VALUES (?, ?, ?, ?)
  `).run(player_name, time_seconds, difficulty, Date.now());
}

function getLeaderboard(difficulty) {
  return getDb().prepare(`
    SELECT player_name, time_seconds, created_at
    FROM scores
    WHERE difficulty = ?
    ORDER BY time_seconds ASC
    LIMIT 10
  `).all(difficulty);
}

module.exports = {
  saveSession, getSession, setSessionMines, incrementRevealedCount,
  deleteSession, saveScore, getLeaderboard,
};
