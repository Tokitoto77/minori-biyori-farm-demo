import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthGrid, moveMonth, toLocalDateKey } from './calendarGrid';

test('2026年7月は水曜始まり・31日までを5行で生成する', () => {
  const rows = buildMonthGrid(new Date(2026, 6, 1));

  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0].slice(0, 3).map((cell) => cell.day), [null, null, null]);
  assert.equal(rows[0][3].day, 1);
  assert.equal(rows[4][5].day, 31);
  assert.equal(rows[4][6].day, null);
});

test('6行必要な月も42セル以内で生成する', () => {
  const rows = buildMonthGrid(new Date(2026, 7, 1));

  assert.equal(rows.length, 6);
  assert.equal(rows.flat().length, 42);
  assert.equal(rows[0][6].day, 1);
  assert.equal(rows[5][1].day, 31);
});

test('年をまたいで前月・翌月へ移動できる', () => {
  assert.equal(toLocalDateKey(moveMonth(new Date(2026, 0, 1), -1)), '2025-12-01');
  assert.equal(toLocalDateKey(moveMonth(new Date(2026, 11, 1), 1)), '2027-01-01');
});
