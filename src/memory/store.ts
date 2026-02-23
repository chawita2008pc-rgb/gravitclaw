import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "..", "data", "gravity-claw.db");

export interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      pinecone_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  `);

  return db;
}

export function saveMessage(role: "user" | "assistant", content: string): number {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO messages (role, content) VALUES (?, ?)"
  );
  const result = stmt.run(role, content);
  return Number(result.lastInsertRowid);
}

export function getRecentMessages(limit: number = 20): StoredMessage[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT id, role, content, timestamp FROM messages ORDER BY id DESC LIMIT ?"
  );
  return (stmt.all(limit) as StoredMessage[]).reverse();
}

export function updatePineconeId(messageId: number, pineconeId: string): void {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE messages SET pinecone_id = ? WHERE id = ?"
  );
  stmt.run(pineconeId, messageId);
}
