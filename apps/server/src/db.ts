/**
 * Room persistence — a single better-sqlite3 file so an in-flight game survives a
 * server restart. Each room is stored as one JSON blob (see room.ts's
 * PersistedRoom); the server is the only writer, so a whole-row upsert after every
 * mutation is simple and cheap (better-sqlite3 is synchronous, no await points).
 *
 * The database path comes from MD_DB_PATH. When unset the store is in-memory, which
 * is what tests, netSim and any other embedder of createExpressApp get; only the
 * real entrypoint (index.ts) points it at a file on disk.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { log } from './logger.js';

export interface RoomRow {
  code: string;
  status: string;
  snapshot: string;
  updatedAt: number;
}

interface RoomStore {
  upsert(row: RoomRow): void;
  remove(code: string): void;
  loadAll(): RoomRow[];
  close(): void;
}

let store: RoomStore | null = null;

function openStore(path: string): RoomStore {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const upsert = db.prepare(
    `INSERT INTO rooms (code, status, snapshot, updated_at)
     VALUES (@code, @status, @snapshot, @updatedAt)
     ON CONFLICT(code) DO UPDATE SET
       status = excluded.status,
       snapshot = excluded.snapshot,
       updated_at = excluded.updated_at`,
  );
  const remove = db.prepare('DELETE FROM rooms WHERE code = ?');
  const loadAll = db.prepare(
    'SELECT code, status, snapshot, updated_at AS updatedAt FROM rooms ORDER BY updated_at',
  );

  log('info', 'db_opened', { path });
  return {
    upsert: (row) => {
      upsert.run(row);
    },
    remove: (code) => {
      remove.run(code);
    },
    loadAll: () => loadAll.all() as RoomRow[],
    close: () => db.close(),
  };
}

export function getRoomStore(): RoomStore {
  if (!store) store = openStore(process.env.MD_DB_PATH ?? ':memory:');
  return store;
}

/** Test helper — drop the current connection (an in-memory store loses its rows). */
export function closeRoomStore(): void {
  store?.close();
  store = null;
}
