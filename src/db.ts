import { Pool } from "pg";

export type CloudMemory = {
  machine: string;
  materials: string;
  tools: string;
  mCodes: string;
  cutting: string;
  notes: string;
};

type StoredMemoryRow = {
  payload: CloudMemory;
  updated_at: Date | string;
};

const DATABASE_URL = process.env.DATABASE_URL || "";
const PROFILE_KEY = "primary";

let pool: Pool | null = null;
let ready = false;
let initError: string | null = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  pool.on("error", (error) => {
    ready = false;
    initError = error.message;
    console.error("Postgres pool error:", error);
  });
}

export async function initDatabase() {
  if (!pool) {
    ready = false;
    initError = "DATABASE_URL is not configured";
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cnc_project_memory (
        profile_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    ready = true;
    initError = null;
    console.log("Postgres memory ready");
  } catch (error) {
    ready = false;
    initError = error instanceof Error ? error.message : "Unknown database error";
    console.error("Postgres init failed:", error);
  }
}

export function databaseState() {
  return {
    configured: Boolean(DATABASE_URL),
    ready,
    error: initError
  };
}

function requirePool() {
  if (!pool || !ready) {
    throw new Error(
      initError || "Postgres memory is not ready"
    );
  }

  return pool;
}

export async function readCloudMemory(): Promise<{
  exists: boolean;
  memory: CloudMemory | null;
  updatedAt: string | null;
}> {
  const db = requirePool();

  const result = await db.query<StoredMemoryRow>(
    `
      SELECT payload, updated_at
      FROM cnc_project_memory
      WHERE profile_key = $1
      LIMIT 1
    `,
    [PROFILE_KEY]
  );

  if (!result.rowCount) {
    return {
      exists: false,
      memory: null,
      updatedAt: null
    };
  }

  const row = result.rows[0];

  return {
    exists: true,
    memory: row.payload,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export async function writeCloudMemory(memory: CloudMemory): Promise<{
  memory: CloudMemory;
  updatedAt: string;
}> {
  const db = requirePool();

  const result = await db.query<StoredMemoryRow>(
    `
      INSERT INTO cnc_project_memory (profile_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (profile_key)
      DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = NOW()
      RETURNING payload, updated_at
    `,
    [PROFILE_KEY, JSON.stringify(memory)]
  );

  const row = result.rows[0];

  return {
    memory: row.payload,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
