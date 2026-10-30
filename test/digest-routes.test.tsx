import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Fixtures live in a temp dir; runs/ is read-only and never touched.
const good = [
  '{"at":"2026-10-28T02:00:00+01:00","job":"backup-nightly","status":"ok","owner":"ops"}',
  '{"at":"2026-10-28T02:05:00+01:00","job":"backup-nightly","status":"retry","owner":"ops","error":"timeout"}',
  '{"at":"2026-10-28T02:10:00+01:00","job":"backup-nightly","status":"fail","owner":"ops","error":"disk full"}',
  '{"at":"2026-10-28T01:00:00+01:00","job":"alerts-sync","status":"ok","owner":null}',
  '{"at":"2026-10-28T03:00:00+01:00","job":"rotate-logs","status":"ok"}',
];

const NIGHT_GOOD = '2026-10-28';
const NIGHT_BAD = '2026-10-27';
const NIGHT_EMPTY = '2026-10-29';
const NIGHT_MISSING = '2026-10-30';

let runsDir: string;
let config: ReturnType<typeof configFor>;

function configFor(dir: string) {
  return { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  config = configFor(runsDir);
  writeFileSync(join(runsDir, `${NIGHT_GOOD}.jsonl`), good.join('\n') + '\n');
  writeFileSync(join(runsDir, `${NIGHT_BAD}.jsonl`), [good[0], 'this is not json', good[3]].join('\n') + '\n');
  writeFileSync(join(runsDir, `${NIGHT_EMPTY}.jsonl`), '');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// Job names in the order they appear in the page's table body (first cell of each row).
function htmlJobs(html: string): string[] {
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  return [...body.matchAll(/<tr[^>]*>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1]);
}

const EXPECTED_ROWS = [
  {
    job: 'alerts-sync',
    owner: null,
    runs: 1,
    retries: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T01:00:00+01:00',
    lastAt: '2026-10-28T01:00:00+01:00',
  },
  {
    job: 'backup-nightly',
    owner: 'ops',
    runs: 3,
    retries: 1,
    lastStatus: 'fail',
    lastError: 'disk full',
    firstAt: '2026-10-28T02:00:00+01:00',
    lastAt: '2026-10-28T02:10:00+01:00',
  },
  {
    job: 'rotate-logs',
    owner: null,
    runs: 1,
    retries: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T03:00:00+01:00',
    lastAt: '2026-10-28T03:00:00+01:00',
  },
];

describe('GET /digest/:night (HTML)', () => {
  it('renders the jobs in a table for a night with a file', async () => {
    const res = await createApp(config).request(`/digest/${NIGHT_GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    expect(html).toContain('backup-nightly');
    expect(html).toContain('alerts-sync');
    expect(html).toContain('rotate-logs');
    expect(html).toContain('disk full');
    expect(html).not.toContain('nothing ran');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${NIGHT_MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty file', async () => {
    const res = await createApp(config).request(`/digest/${NIGHT_EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders 200 with the good jobs when a line is bad', async () => {
    const res = await createApp(config).request(`/digest/${NIGHT_BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('backup-nightly');
    expect(html).toContain('alerts-sync');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns { night, rows, badLines } with rows sorted by job', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT_GOOD}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: NIGHT_GOOD, rows: EXPECTED_ROWS, badLines: 0 });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT_MISSING}`);
    expect(res.status).toBe(404);
  });

  it('gives rows: [] and badLines: 0 for an empty file', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT_EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: NIGHT_EMPTY, rows: [], badLines: 0 });
  });

  it('counts a bad line as badLines: 1 and keeps the good rows', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT_BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alerts-sync', 'backup-nightly']);
  });
});

describe('page and JSON agree', () => {
  it('lists the same jobs in the same order in the HTML table as in the JSON', async () => {
    const app = createApp(config);
    const json = (await (await app.request(`/api/digest/${NIGHT_GOOD}`)).json()) as {
      rows: { job: string }[];
    };
    const html = await (await app.request(`/digest/${NIGHT_GOOD}`)).text();
    expect(htmlJobs(html)).toEqual(json.rows.map((r) => r.job));
  });
});
