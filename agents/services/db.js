import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'screening-data');
const DB_PATH = path.join(DATA_DIR, 'screening.sqlite');

let dbInstance = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map(column => String(column?.name || ''));

  if (columns.includes(columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS screening_tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      target_profile TEXT NOT NULL,
      rejection_message TEXT NOT NULL,
      unread_candidate_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      current_candidate_id TEXT,
      current_candidate_name TEXT,
      summary TEXT NOT NULL DEFAULT '',
      error TEXT,
      started_at TEXT,
      finished_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS screening_candidates (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      matched INTEGER,
      reason TEXT NOT NULL DEFAULT '',
      rejection_message TEXT NOT NULL DEFAULT '',
      resume_summary TEXT NOT NULL DEFAULT '',
      resume_json TEXT,
      resume_segments_json TEXT,
      note_file_json TEXT,
      error TEXT,
      step_count INTEGER NOT NULL DEFAULT 0,
      tool_call_count INTEGER NOT NULL DEFAULT 0,
      tool_result_count INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT,
      tool_timeline_json TEXT,
      steps_json TEXT,
      started_at TEXT,
      finished_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES screening_tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS screening_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      candidate_id TEXT,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES screening_tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_screening_candidates_task_id
      ON screening_candidates(task_id);
    CREATE INDEX IF NOT EXISTS idx_screening_candidates_task_id_updated_at_id
      ON screening_candidates(task_id, updated_at, id);
    CREATE INDEX IF NOT EXISTS idx_screening_events_task_id
      ON screening_events(task_id);
    CREATE INDEX IF NOT EXISTS idx_screening_events_task_id_kind_created_at_id
      ON screening_events(task_id, kind, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_screening_tasks_status_updated_at
      ON screening_tasks(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS job_profiles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      recruitment_info TEXT NOT NULL DEFAULT '',
      responsibilities TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL DEFAULT '',
      preferred_qualifications TEXT NOT NULL DEFAULT '',
      candidate_persona TEXT NOT NULL DEFAULT '',
      deal_breakers TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      rejection_message TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_job_profiles_updated_at
      ON job_profiles(updated_at DESC);
  `);

  ensureColumn(db, 'screening_tasks', 'current_candidate_id', 'TEXT');
  db.exec(`
    UPDATE screening_candidates
    SET logs_json = NULL
    WHERE logs_json IS NOT NULL AND logs_json != '';
  `);
}

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  ensureDataDir();
  dbInstance = new DatabaseSync(DB_PATH);
  initializeSchema(dbInstance);
  return dbInstance;
}
