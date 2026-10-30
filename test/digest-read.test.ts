import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    expect(n!.badLines).toBe(1);
    expect(n!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds a job into one row, keeping offsets and the last error', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const refresh = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    const backup = rows.find((r) => r.job === 'notes/backup')!;
    expect(backup.lastStatus).toBe('fail');
    expect(backup.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    const render = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render')!;
    expect(render.owner).toBeNull();
  });

  it('returns null for a night with no file, or a name that is not a night', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('reads an empty file as nothing ran', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts lines of the wrong shape as bad, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      ['{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}', '{"job":"b"}', '[1]', '{"at":"t","job":"c","status":"maybe","owner":null}', 'nope', ''].join('\n'),
    );
    const n = readNight(dir, '2026-01-02')!;
    expect(n.rows.map((r) => r.job)).toEqual(['a']);
    expect(n.badLines).toBe(4);
  });
});
