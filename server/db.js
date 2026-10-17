import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.DATA_DIR || join(here, 'data')
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new DatabaseSync(join(DATA_DIR, 'blizkie.db'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',          -- 'user' | 'staff'
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  staff_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  staff_read_at TEXT,
  created_at TEXT NOT NULL
);
-- Доступ человека к семье. access: owner | add | view. profile_ids: NULL = все профили.
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_label TEXT NOT NULL,
  access TEXT NOT NULL,
  profile_ids TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (family_id, user_id)
);
CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_label TEXT NOT NULL,
  access TEXT NOT NULL,
  profile_ids TEXT,
  access_days INTEGER,
  expires_at TEXT NOT NULL,
  accepted_by TEXT,
  accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_year INTEGER,
  sex TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  questions TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS lab_results (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  lab_name TEXT NOT NULL,
  source_file TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  lab_result_id TEXT NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  ref_low REAL,
  ref_high REAL,
  normalized_value REAL,
  normalized_unit TEXT,
  indicator_key TEXT
);
CREATE TABLE IF NOT EXISTS vitals (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  datetime TEXT NOT NULL,
  systolic INTEGER NOT NULL,
  diastolic INTEGER NOT NULL,
  pulse INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',       -- ready | requested | processing
  added_by_kind TEXT NOT NULL DEFAULT 'client',
  added_by_name TEXT,
  file_name TEXT,
  file_mime TEXT,
  file_path TEXT,
  lab_result_id TEXT REFERENCES lab_results(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',    -- accepted | working | done
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  author_id TEXT,
  author_name TEXT NOT NULL,
  author_kind TEXT NOT NULL,                  -- client | staff
  text TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 0,        -- заметка для сотрудников, клиент её не видит
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS access_log (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  profile_id TEXT,
  user_id TEXT,
  who TEXT NOT NULL,
  action TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS share_links (
  token TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_family ON messages(family_id, created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_family ON profiles(family_id);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  family_id TEXT,
  profile_id TEXT,
  doc_id TEXT NOT NULL,
  doc_version TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  method TEXT NOT NULL,                        -- checkbox | otp | attestation
  subject_name TEXT,
  subject_contact TEXT,
  given_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT,
  ua TEXT
);
CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  target TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subject_links (
  token TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS data_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  email TEXT,
  type TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',          -- new | done
  created_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  resolved_at TEXT
);
`)

function addColumn(table, column, ddl) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
}
addColumn('profiles', 'basis', "TEXT NOT NULL DEFAULT 'self'")             // self | adult | guardian_child | guardian_ward
addColumn('profiles', 'consent_status', "TEXT NOT NULL DEFAULT 'self'")    // self | attested | confirmed
addColumn('families', 'processing_stopped', 'INTEGER NOT NULL DEFAULT 0')
addColumn('families', 'delete_after', 'TEXT')

export const tx = (fn) => {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
