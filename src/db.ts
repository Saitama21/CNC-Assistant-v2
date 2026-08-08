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


export type ToolRecord = {
  toolNo: string;
  name: string;
  holder: string;
  insertCode: string;
  widthMm: number | null;
  noseRadiusMm: number | null;
  purpose: string;
  notes: string;
  confirmed: boolean;
  updatedAt?: string;
};

export type MaterialRecord = {
  id?: number;
  name: string;
  grade: string;
  condition: string;
  notes: string;
  confirmed: boolean;
  updatedAt?: string;
};

export type MCodeRecord = {
  code: string;
  function: string;
  source: string;
  notes: string;
  confirmed: boolean;
  updatedAt?: string;
};

export type JournalRecord = {
  id?: number;
  occurredAt: string;
  operation: string;
  material: string;
  toolNo: string;
  diameterMm: number | null;
  spindle: string;
  feed: string;
  result: string;
  notes: string;
  createdAt?: string;
};

export type StructuredKnowledge = {
  tools: ToolRecord[];
  materials: MaterialRecord[];
  mCodes: MCodeRecord[];
  journal: JournalRecord[];
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
      );

      CREATE TABLE IF NOT EXISTS cnc_tools (
        tool_no TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        holder TEXT NOT NULL DEFAULT '',
        insert_code TEXT NOT NULL DEFAULT '',
        width_mm DOUBLE PRECISION,
        nose_radius_mm DOUBLE PRECISION,
        purpose TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        confirmed BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cnc_materials (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        grade TEXT NOT NULL DEFAULT '',
        condition TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        confirmed BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cnc_m_codes (
        code TEXT PRIMARY KEY,
        function TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        confirmed BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cnc_journal (
        id BIGSERIAL PRIMARY KEY,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        operation TEXT NOT NULL DEFAULT '',
        material TEXT NOT NULL DEFAULT '',
        tool_no TEXT NOT NULL DEFAULT '',
        diameter_mm DOUBLE PRECISION,
        spindle TEXT NOT NULL DEFAULT '',
        feed TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS cnc_materials_name_idx
        ON cnc_materials (LOWER(name));

      CREATE INDEX IF NOT EXISTS cnc_journal_occurred_idx
        ON cnc_journal (occurred_at DESC);

      CREATE TABLE IF NOT EXISTS cnc_shopturn_projects (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS cnc_shopturn_projects_updated_idx
        ON cnc_shopturn_projects (updated_at DESC);
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


function numOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function readStructuredKnowledge(limit = 100): Promise<StructuredKnowledge> {
  const db = requirePool();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));

  const [toolsResult, materialsResult, mCodesResult, journalResult] = await Promise.all([
    db.query(
      `SELECT tool_no, name, holder, insert_code, width_mm, nose_radius_mm,
              purpose, notes, confirmed, updated_at
         FROM cnc_tools
        ORDER BY tool_no
        LIMIT $1`,
      [safeLimit]
    ),
    db.query(
      `SELECT id, name, grade, condition, notes, confirmed, updated_at
         FROM cnc_materials
        ORDER BY updated_at DESC, id DESC
        LIMIT $1`,
      [safeLimit]
    ),
    db.query(
      `SELECT code, function, source, notes, confirmed, updated_at
         FROM cnc_m_codes
        ORDER BY code
        LIMIT $1`,
      [safeLimit]
    ),
    db.query(
      `SELECT id, occurred_at, operation, material, tool_no, diameter_mm,
              spindle, feed, result, notes, created_at
         FROM cnc_journal
        ORDER BY occurred_at DESC, id DESC
        LIMIT $1`,
      [safeLimit]
    )
  ]);

  return {
    tools: toolsResult.rows.map((row: any) => ({
      toolNo: row.tool_no,
      name: row.name,
      holder: row.holder,
      insertCode: row.insert_code,
      widthMm: row.width_mm === null ? null : Number(row.width_mm),
      noseRadiusMm: row.nose_radius_mm === null ? null : Number(row.nose_radius_mm),
      purpose: row.purpose,
      notes: row.notes,
      confirmed: Boolean(row.confirmed),
      updatedAt: new Date(row.updated_at).toISOString()
    })),
    materials: materialsResult.rows.map((row: any) => ({
      id: Number(row.id),
      name: row.name,
      grade: row.grade,
      condition: row.condition,
      notes: row.notes,
      confirmed: Boolean(row.confirmed),
      updatedAt: new Date(row.updated_at).toISOString()
    })),
    mCodes: mCodesResult.rows.map((row: any) => ({
      code: row.code,
      function: row.function,
      source: row.source,
      notes: row.notes,
      confirmed: Boolean(row.confirmed),
      updatedAt: new Date(row.updated_at).toISOString()
    })),
    journal: journalResult.rows.map((row: any) => ({
      id: Number(row.id),
      occurredAt: new Date(row.occurred_at).toISOString(),
      operation: row.operation,
      material: row.material,
      toolNo: row.tool_no,
      diameterMm: row.diameter_mm === null ? null : Number(row.diameter_mm),
      spindle: row.spindle,
      feed: row.feed,
      result: row.result,
      notes: row.notes,
      createdAt: new Date(row.created_at).toISOString()
    }))
  };
}

export async function upsertTool(record: ToolRecord) {
  const db = requirePool();

  const result = await db.query(
    `INSERT INTO cnc_tools
      (tool_no, name, holder, insert_code, width_mm, nose_radius_mm,
       purpose, notes, confirmed, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (tool_no)
     DO UPDATE SET
       name = EXCLUDED.name,
       holder = EXCLUDED.holder,
       insert_code = EXCLUDED.insert_code,
       width_mm = EXCLUDED.width_mm,
       nose_radius_mm = EXCLUDED.nose_radius_mm,
       purpose = EXCLUDED.purpose,
       notes = EXCLUDED.notes,
       confirmed = EXCLUDED.confirmed,
       updated_at = NOW()
     RETURNING tool_no, name, holder, insert_code, width_mm, nose_radius_mm,
               purpose, notes, confirmed, updated_at`,
    [
      record.toolNo,
      record.name,
      record.holder,
      record.insertCode,
      numOrNull(record.widthMm),
      numOrNull(record.noseRadiusMm),
      record.purpose,
      record.notes,
      record.confirmed
    ]
  );

  return result.rows[0];
}

export async function deleteTool(toolNo: string) {
  const db = requirePool();
  await db.query(`DELETE FROM cnc_tools WHERE tool_no = $1`, [toolNo]);
}

export async function createMaterial(record: MaterialRecord) {
  const db = requirePool();

  const result = await db.query(
    `INSERT INTO cnc_materials (name, grade, condition, notes, confirmed, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     RETURNING id, name, grade, condition, notes, confirmed, updated_at`,
    [record.name, record.grade, record.condition, record.notes, record.confirmed]
  );

  return result.rows[0];
}

export async function deleteMaterial(id: number) {
  const db = requirePool();
  await db.query(`DELETE FROM cnc_materials WHERE id = $1`, [id]);
}

export async function upsertMCode(record: MCodeRecord) {
  const db = requirePool();

  const result = await db.query(
    `INSERT INTO cnc_m_codes (code, function, source, notes, confirmed, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (code)
     DO UPDATE SET
       function = EXCLUDED.function,
       source = EXCLUDED.source,
       notes = EXCLUDED.notes,
       confirmed = EXCLUDED.confirmed,
       updated_at = NOW()
     RETURNING code, function, source, notes, confirmed, updated_at`,
    [record.code, record.function, record.source, record.notes, record.confirmed]
  );

  return result.rows[0];
}

export async function deleteMCode(code: string) {
  const db = requirePool();
  await db.query(`DELETE FROM cnc_m_codes WHERE code = $1`, [code]);
}

export async function createJournalEntry(record: JournalRecord) {
  const db = requirePool();

  const occurredAt =
    record.occurredAt && !Number.isNaN(Date.parse(record.occurredAt))
      ? new Date(record.occurredAt).toISOString()
      : new Date().toISOString();

  const result = await db.query(
    `INSERT INTO cnc_journal
      (occurred_at, operation, material, tool_no, diameter_mm,
       spindle, feed, result, notes, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     RETURNING id, occurred_at, operation, material, tool_no, diameter_mm,
               spindle, feed, result, notes, created_at`,
    [
      occurredAt,
      record.operation,
      record.material,
      record.toolNo,
      numOrNull(record.diameterMm),
      record.spindle,
      record.feed,
      record.result,
      record.notes
    ]
  );

  return result.rows[0];
}

export async function deleteJournalEntry(id: number) {
  const db = requirePool();
  await db.query(`DELETE FROM cnc_journal WHERE id = $1`, [id]);
}


export async function listShopTurnProjects(limit = 20) {
  const db = requirePool();
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

  const result = await db.query(
    `SELECT id, title, payload, created_at, updated_at
       FROM cnc_shopturn_projects
      ORDER BY updated_at DESC, id DESC
      LIMIT $1`,
    [safeLimit]
  );

  return result.rows.map((row: any) => ({
    id: Number(row.id),
    title: row.title,
    payload: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }));
}

export async function saveShopTurnProject(args: {
  id?: number | null;
  title: string;
  payload: any;
}) {
  const db = requirePool();

  if (args.id && Number.isInteger(args.id) && args.id > 0) {
    const result = await db.query(
      `UPDATE cnc_shopturn_projects
          SET title = $2,
              payload = $3::jsonb,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, payload, created_at, updated_at`,
      [args.id, args.title, JSON.stringify(args.payload)]
    );

    if (result.rowCount) {
      const row: any = result.rows[0];
      return {
        id: Number(row.id),
        title: row.title,
        payload: row.payload,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      };
    }
  }

  const result = await db.query(
    `INSERT INTO cnc_shopturn_projects (title, payload, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     RETURNING id, title, payload, created_at, updated_at`,
    [args.title, JSON.stringify(args.payload)]
  );

  const row: any = result.rows[0];

  return {
    id: Number(row.id),
    title: row.title,
    payload: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export async function deleteShopTurnProject(id: number) {
  const db = requirePool();
  await db.query(`DELETE FROM cnc_shopturn_projects WHERE id = $1`, [id]);
}
