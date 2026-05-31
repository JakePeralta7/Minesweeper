'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateMines,
  cascadeReveal,
  countAdjacentMines,
} = require('../game');

test('generateMines excludes the safe cell and its neighbours', () => {
  const mines = generateMines(5, 5, 10, 2, 2);
  const excluded = new Set([
    '1,1', '1,2', '1,3',
    '2,1', '2,2', '2,3',
    '3,1', '3,2', '3,3',
  ]);

  for (const mine of mines) {
    assert.equal(excluded.has(mine), false);
  }
});

test('countAdjacentMines counts nearby mines correctly', () => {
  const mines = new Set(['0,0', '0,1', '1,0']);

  assert.equal(countAdjacentMines(mines, 1, 1, 3, 3), 3);
  assert.equal(countAdjacentMines(mines, 2, 2, 3, 3), 0);
});

test('cascadeReveal expands zero-adjacent cells', () => {
  const mines = new Set(['0,0']);
  const revealed = cascadeReveal(mines, 2, 2, 3, 3, new Set());

  assert.ok(revealed.some((cell) => cell.row === 2 && cell.col === 2));
  assert.ok(revealed.every((cell) => cell.row !== 0 || cell.col !== 0));
});