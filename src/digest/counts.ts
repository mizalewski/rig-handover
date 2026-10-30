import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';
import { NIGHT } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number; bad: number };

// Run-log lines per status for one night. Bad lines are counted apart, never thrown.
// null when the night's file is missing or unreadable.
export function countNight(runsDir: string, night: string): NightCounts | null {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0, bad: 0 };
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const l = parseLine(raw);
    if (l) counts[l.status] += 1;
    else counts.bad += 1;
  }
  return counts;
}
