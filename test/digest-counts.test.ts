import { describe, expect, it } from 'vitest';
import { countNight } from '../src/digest/counts.js';

describe('countNight', () => {
  it('counts statuses per line and bad lines apart', () => {
    expect(countNight('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1, bad: 1 });
  });

  it('is null for a missing or malformed night', () => {
    expect(countNight('runs', '2001-01-01')).toBeNull();
    expect(countNight('runs', '../x')).toBeNull();
  });
});
