// Shared test double for the D1 binding (`env.DB`).
//
// Mirrors the surface area of `D1Database` we actually rely on:
//   `db.prepare(sql)` → `{ bind(...), run(), all(), first() }`.
// Plus `db.batch(stmts)` which awaits each statement's `.run()` so a
// thrown error from any one statement still rejects the batch (matches
// real D1 transaction semantics closely enough for unit tests).
//
// Every `.bind(...)` call appends `{ sql, params }` to `db.__runs`, so
// assertions on what the helper actually wrote are just
// `db.__runs.find((r) => /pattern/.test(r.sql))`.
//
// Behaviour overrides:
//   `db.__nextFirst([row1, row2, ...])`  — queue sequential `first()` returns
//   `db.__nextAll([rows1, rows2, ...])`  — queue sequential `all()`   returns
//   `db.__throwOnRun(predicate, error)`  — throw from `run()` when the
//                                          prepared SQL matches `predicate`.
//
// All three default to a happy path; recorders we test mostly just
// care that the row was written with the right params.

import { vi } from "vitest";

export interface RecordedRun {
  sql: string;
  params: unknown[];
}

interface PreparedStatement {
  bind: (...args: unknown[]) => PreparedStatement;
  run: () => Promise<unknown>;
  all: () => Promise<unknown>;
  first: () => Promise<unknown>;
}

export interface FakeDb {
  prepare: ReturnType<typeof vi.fn>;
  batch: (stmts: PreparedStatement[]) => Promise<unknown[]>;
  __runs: RecordedRun[];
  __nextFirst: (queue: unknown[]) => void;
  __nextAll: (queue: unknown[]) => void;
  __throwOnRun: (pred: (sql: string) => boolean, err: Error) => void;
}

export const buildFakeDb = (): FakeDb => {
  const runs: RecordedRun[] = [];
  const firstQueue: unknown[] = [];
  const allQueue: unknown[] = [];
  let runError: { pred: (sql: string) => boolean; err: Error } | null = null;

  const fake: FakeDb = {
    __runs: runs,
    __nextFirst: (queue) => firstQueue.push(...queue),
    __nextAll: (queue) => allQueue.push(...queue),
    __throwOnRun: (pred, err) => {
      runError = { pred, err };
    },
    prepare: vi.fn((sql: string) => {
      const stmt: PreparedStatement = {
        bind: (...params: unknown[]) => {
          runs.push({ sql, params });
          return stmt;
        },
        run: async () => {
          if (runError && runError.pred(sql)) throw runError.err;
          return { success: true };
        },
        all: async () => {
          if (allQueue.length > 0) return allQueue.shift();
          return { results: [] };
        },
        first: async () => {
          if (firstQueue.length > 0) return firstQueue.shift();
          return null;
        },
      };
      return stmt;
    }),
    batch: async (stmts) => {
      const out: unknown[] = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
  return fake;
};

// Wire the fake DB into the Cloudflare env import used by the helpers.
// Must be called before `await import("…/d1.js")` so the dynamic
// import picks up the mocked `getCloudflareEnv`.
export const mockEnv = (db: FakeDb | null): void => {
  vi.doMock("../../../functions/api/_lib/context.js", () => ({
    getCloudflareEnv: () => (db ? { DB: db } : {}),
  }));
};
