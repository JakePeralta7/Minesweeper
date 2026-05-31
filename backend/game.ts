'use strict';

/**
 * Generate mine positions for a Minesweeper board.
 * Mines are never placed on the safe cell or any of its 8 neighbours
 * (first-click safety guarantee).
 *
 * @param {number} rows
 * @param {number} cols
 * @param {number} count   Total number of mines to place
 * @param {number} safeRow Row of the first-clicked cell
 * @param {number} safeCol Col of the first-clicked cell
 * @returns {Set<string>}  Set of "row,col" strings that contain mines
 */
function generateMines(rows, cols, count, safeRow, safeCol) {
  // Build the exclusion set (safe cell + neighbours)
  const excluded = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeRow + dr;
      const c = safeCol + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        excluded.add(`${r},${c}`);
      }
    }
  }

  // Collect all eligible positions
  const candidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!excluded.has(`${r},${c}`)) candidates.push(`${r},${c}`);
    }
  }

  // Fisher-Yates shuffle, keep first `count` elements
  const n = Math.min(count, candidates.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return new Set(candidates.slice(0, n));
}

/**
 * Return valid neighbouring positions for (row, col).
 */
function getNeighbours(row, col, rows, cols) {
  const neighbours = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        neighbours.push([r, c]);
      }
    }
  }
  return neighbours;
}

/**
 * Count how many mines neighbour (row, col).
 */
function countAdjacentMines(mines, row, col, rows, cols) {
  return getNeighbours(row, col, rows, cols)
    .filter(([r, c]) => mines.has(`${r},${c}`))
    .length;
}

/**
 * BFS cascade reveal from (startRow, startCol).
 * Returns an array of { row, col, adjacent } objects for every newly
 * revealed cell. Cells already in `alreadyRevealed` are skipped.
 *
 * Cascade rule: if a revealed cell has 0 adjacent mines, all its
 * unrevealed, unflagged neighbours are also revealed recursively.
 *
 * @param {Set<string>} mines           Mine positions "row,col"
 * @param {number}      startRow
 * @param {number}      startCol
 * @param {number}      rows
 * @param {number}      cols
 * @param {Set<string>} alreadyRevealed Cells already visible to the client
 * @returns {{ row: number, col: number, adjacent: number }[]}
 */
function cascadeReveal(mines, startRow, startCol, rows, cols, alreadyRevealed) {
  const revealed = [];
  const visited  = new Set(alreadyRevealed);
  const queue    = [[startRow, startCol]];

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const key = `${r},${c}`;

    if (visited.has(key)) continue;
    if (mines.has(key))   continue;  // Should not happen; caller checks first

    visited.add(key);
    const adjacent = countAdjacentMines(mines, r, c, rows, cols);
    revealed.push({ row: r, col: c, adjacent });

    // Cascade into neighbours only when this cell has no adjacent mines
    if (adjacent === 0) {
      for (const [nr, nc] of getNeighbours(r, c, rows, cols)) {
        const nkey = `${nr},${nc}`;
        if (!visited.has(nkey) && !mines.has(nkey)) {
          queue.push([nr, nc]);
        }
      }
    }
  }

  return revealed;
}

module.exports = { generateMines, cascadeReveal, countAdjacentMines };
