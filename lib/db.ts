import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
export type Row = Record<string, string | number | null>;
let cached: DatabaseSync | undefined;
export function db(): DatabaseSync {
  if (!cached) {
    // Runtime database paths are not application source dependencies.
    const path = resolve(
      /*turbopackIgnore: true*/
      process.env.CARECIRCLE_DB_PATH || ".agent-local/carecircle.sqlite",
    );
    mkdirSync(dirname(path), { recursive: true });
    cached = new DatabaseSync(path);
    cached.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    cached.exec(readFileSync(resolve("migrations/sqlite.sql"), "utf8"));
  }
  return cached;
}
export function rows<T = Row>(sql: string, ...args: SQLInputValue[]): T[] {
  return db()
    .prepare(sql)
    .all(...args) as T[];
}
export function one<T = Row>(
  sql: string,
  ...args: SQLInputValue[]
): T | undefined {
  return db()
    .prepare(sql)
    .get(...args) as T | undefined;
}
export function run(sql: string, ...args: SQLInputValue[]) {
  return db()
    .prepare(sql)
    .run(...args);
}
let transactionDepth = 0;
export function transaction<T>(fn: () => T): T {
  if (transactionDepth) return fn();
  db().exec("BEGIN IMMEDIATE");
  transactionDepth++;
  try {
    const result = fn();
    db().exec("COMMIT");
    return result;
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  } finally {
    transactionDepth--;
  }
}
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function audit(
  actor: string | null,
  action: string,
  entity: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  run(
    "INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?)",
    id(),
    actor,
    action,
    entity,
    entityId,
    now(),
    JSON.stringify(metadata),
  );
}
export function closeDb() {
  cached?.close();
  cached = undefined;
}
