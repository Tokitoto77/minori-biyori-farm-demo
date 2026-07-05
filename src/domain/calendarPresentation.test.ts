import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCalendarDayStatus, selectInitialCalendarDate, visibleCalendarStatuses } from './calendarPresentation';
import type { DisplaySlotStatus } from './types';

function slot(displayStatus: DisplaySlotStatus, startAt: string) {
  return { displayStatus, startAt };
}

test('同日に複数状態があっても予約可能な状態を代表表示する', () => {
  assert.equal(resolveCalendarDayStatus([
    slot('cancelled', '2030-07-16T15:30:00+09:00'),
    slot('full', '2030-07-16T13:30:00+09:00'),
    slot('few', '2030-07-16T09:30:00+09:00'),
    slot('available', '2030-07-16T10:30:00+09:00'),
  ]), 'available');
});

test('初期日付は受付中、残りわずか、満員、非行動可能の順で選ぶ', () => {
  assert.equal(selectInitialCalendarDate([
    slot('paused', '2030-07-01T10:00:00+09:00'),
    slot('full', '2030-07-02T10:00:00+09:00'),
    slot('few', '2030-07-04T10:00:00+09:00'),
    slot('available', '2030-07-05T10:00:00+09:00'),
  ]), '2030-07-05T10:00:00+09:00');
  assert.equal(selectInitialCalendarDate([
    slot('paused', '2030-07-01T10:00:00+09:00'),
    slot('full', '2030-07-02T10:00:00+09:00'),
  ]), '2030-07-02T10:00:00+09:00');
  assert.equal(selectInitialCalendarDate([
    slot('cancelled', '2030-07-03T10:00:00+09:00'),
    slot('paused', '2030-07-01T10:00:00+09:00'),
  ]), '2030-07-01T10:00:00+09:00');
  assert.equal(selectInitialCalendarDate([]), null);
});

test('凡例は当月に存在する状態だけを行動優先順で返す', () => {
  assert.deepEqual(visibleCalendarStatuses([
    slot('cancelled', '2030-07-03T10:00:00+09:00'),
    slot('available', '2030-07-01T10:00:00+09:00'),
    slot('few', '2030-07-02T10:00:00+09:00'),
    slot('outside', '2030-07-04T10:00:00+09:00'),
  ]), ['available', 'few', 'cancelled']);
});
