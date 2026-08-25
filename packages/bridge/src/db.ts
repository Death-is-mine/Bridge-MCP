import Database from "better-sqlite3";
import { resolve } from "node:path";

export interface BridgeDatabase {
  db: Database.Database;
  close: () => void;
}

export function createDatabase(dbPath?: string): BridgeDatabase {
  const path = dbPath || resolve(process.cwd(), "bridge.db");
  const db = new Database(path);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT,
      platform TEXT,
      status TEXT DEFAULT 'PAIRING',
      last_seen INTEGER,
      capabilities TEXT DEFAULT '[]',
      paired_at INTEGER,
      ws_connection_id TEXT,
      auth_token TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      bridge_id TEXT UNIQUE NOT NULL,
      worker_id TEXT,
      opencode_session_id TEXT,
      user_id TEXT NOT NULL,
      repository TEXT,
      working_directory TEXT,
      title TEXT,
      status TEXT DEFAULT 'created',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_event_at INTEGER,
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    );

    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT,
      user_id TEXT,
      worker_id TEXT,
      session_id TEXT,
      tool TEXT,
      args TEXT,
      result TEXT,
      repository TEXT,
      permission TEXT,
      approval_status TEXT,
      status TEXT,
      error_code TEXT,
      start_time INTEGER,
      end_time INTEGER
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      client_secret TEXT,
      redirect_uris TEXT DEFAULT '[]',
      grant_types TEXT DEFAULT '["authorization_code"]',
      response_types TEXT DEFAULT '["code"]',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      access_token TEXT PRIMARY KEY,
      refresh_token TEXT,
      client_id TEXT,
      user_id TEXT,
      scope TEXT,
      expires_at INTEGER,
      FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id)
    );

    CREATE TABLE IF NOT EXISTS oauth_codes (
      code TEXT PRIMARY KEY,
      client_id TEXT,
      redirect_uri TEXT,
      code_challenge TEXT,
      code_challenge_method TEXT DEFAULT 'S256',
      scope TEXT,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      user_id TEXT,
      worker_id TEXT,
      session_id TEXT,
      action TEXT,
      repository TEXT,
      reason TEXT,
      proposed_effect TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER,
      expires_at INTEGER,
      resolved_at INTEGER,
      resolved_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_worker ON sessions(worker_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit(start_time);
    CREATE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_user ON approvals(user_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
  `);

  return {
    db,
    close: () => db.close(),
  };
}
