// Plan morning-digest § 1. The contract every part of § 2 builds against: read a night's run log
// (runs/<night>.jsonl) into one row per job.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log (styleguide), never converted to UTC.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as `—`
  runs: number; // lines for this job, any status
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // `error` of the last line, null if it has none
  firstAt: string;
  lastAt: string;
};

export type DigestNight = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // non-empty lines that did not parse; counted, never thrown
};

// Returns null when runs/<night>.jsonl does not exist (the routes answer 404).
// An empty file gives `rows: []` ("nothing ran").
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;

// A night is YYYY-MM-DD; anything else never reaches the file system.
export const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
