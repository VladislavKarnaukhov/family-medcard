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

db.exec(`
CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
`)
addColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0')
addColumn('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0')
addColumn('families', 'client_read_at', 'TEXT')
addColumn('families', 'notified_at', 'TEXT')

// ---------- уход: лекарства, приёмы, дневник, визиты, уведомления, экстренная карточка ----------
addColumn('families', 'timezone', "TEXT NOT NULL DEFAULT 'Europe/Moscow'")
addColumn('profiles', 'allergies', "TEXT NOT NULL DEFAULT ''")
addColumn('profiles', 'emergency_contacts', "TEXT NOT NULL DEFAULT '[]'")   // JSON [{name, relation, phone}]
addColumn('profiles', 'notify_bad_mood', 'INTEGER NOT NULL DEFAULT 0')
addColumn('users', 'email_events', "TEXT NOT NULL DEFAULT ''")             // instant | daily | off; пусто = по роли
addColumn('users', 'email_intake', 'INTEGER NOT NULL DEFAULT 0')
addColumn('users', 'simple_mode', 'INTEGER NOT NULL DEFAULT 0')
addColumn('users', 'emailed_at', 'TEXT')
addColumn('users', 'digest_date', 'TEXT')
addColumn('profiles', 'share_peers', 'INTEGER NOT NULL DEFAULT 0')   // показывать результаты другим участникам общей карты, которые тоже разрешили
addColumn('grants', 'self_profile_id', 'TEXT REFERENCES profiles(id) ON DELETE CASCADE')
addColumn('invites', 'self_profile_id', 'TEXT')

db.exec(`
CREATE TABLE IF NOT EXISTS medications (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  form TEXT NOT NULL DEFAULT '',
  dose TEXT NOT NULL DEFAULT '',
  times TEXT NOT NULL DEFAULT '[]',
  days TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  prescribed_by TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  stopped_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS intakes (
  id TEXT PRIMARY KEY,
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_at TEXT,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  marked_by_id TEXT,
  marked_by_name TEXT,
  marked_by_self INTEGER NOT NULL DEFAULT 0,
  marked_at TEXT,
  UNIQUE (medication_id, scheduled_at)
);
CREATE TABLE IF NOT EXISTS care_notes (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  mood TEXT,
  needs_doctor TEXT,
  author_id TEXT,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT '',
  by_self INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  specialist TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  companion TEXT NOT NULL DEFAULT '',
  bring TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  result_note TEXT NOT NULL DEFAULT '',
  document_ids TEXT NOT NULL DEFAULT '[]',
  request_id TEXT REFERENCES requests(id) ON DELETE SET NULL,
  reminded_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  name TEXT NOT NULL,
  user_id TEXT,
  family_id TEXT,
  role TEXT
);
CREATE INDEX IF NOT EXISTS events_name_at ON events (name, at);
CREATE INDEX IF NOT EXISTS events_family ON events (family_id, at);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  ref_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  emailed_at TEXT,
  UNIQUE (user_id, kind, ref_id)
);
CREATE TABLE IF NOT EXISTS emergency_links (
  token TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_intakes_profile ON intakes(profile_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notes_profile ON care_notes(profile_id, at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_grants_self ON grants(self_profile_id) WHERE self_profile_id IS NOT NULL;
`)

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
