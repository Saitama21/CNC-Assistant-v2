import "dotenv/config";
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { listAvailableModels, runChat, type AppMessage, type ProjectMemory } from "./openai.js";
import {
  databaseState,
  initDatabase,
  readCloudMemory,
  writeCloudMemory,
  type CloudMemory
} from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const SESSION_COOKIE = "cnc_session";

function expectedSessionToken() {
  if (!APP_PASSWORD) return "";
  return crypto.createHash("sha256").update(`cnc-ai-v8:${APP_PASSWORD}`).digest("hex");
}

function parseCookies(header: string | undefined) {
  const result: Record<string, string> = {};
  if (!header) return result;

  for (const item of header.split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;

    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();

    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }

  return result;
}

function isAuthenticated(req: express.Request) {
  if (!APP_PASSWORD) return false;

  const cookies = parseCookies(req.headers.cookie);
  const actual = cookies[SESSION_COOKIE] || "";
  const expected = expectedSessionToken();

  if (!actual || actual.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(actual, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

function authRequired(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!APP_PASSWORD) {
    res.status(503).json({
      error: "APP_PASSWORD is not configured"
    });
    return;
  }

  if (!isAuthenticated(req)) {
    res.status(401).json({
      error: "Authentication required"
    });
    return;
  }

  next();
}


const DEFAULT_MEMORY: CloudMemory = {
  machine: "Станок: SK52PT-Y\nСтойка: SINUMERIK 828D / ShopTurn",
  materials: "",
  tools: "",
  mCodes: "",
  cutting: "",
  notes: ""
};

function cleanMemoryField(value: unknown) {
  return typeof value === "string" ? value.slice(0, 12000) : "";
}

function sanitizeMemory(value: any): CloudMemory {
  const source =
    value && typeof value === "object"
      ? value
      : {};

  return {
    machine:
      typeof source.machine === "string"
        ? source.machine.slice(0, 12000)
        : DEFAULT_MEMORY.machine,
    materials: cleanMemoryField(source.materials),
    tools: cleanMemoryField(source.tools),
    mCodes: cleanMemoryField(source.mCodes),
    cutting: cleanMemoryField(source.cutting),
    notes: cleanMemoryField(source.notes)
  };
}

app.disable("x-powered-by");
app.use(express.json({ limit: "15mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "public");


app.get("/api/auth/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    configured: Boolean(APP_PASSWORD),
    authenticated: isAuthenticated(req)
  });
});

app.post("/api/auth/login", (req, res) => {
  if (!APP_PASSWORD) {
    res.status(503).json({
      error: "APP_PASSWORD is not configured"
    });
    return;
  }

  const supplied =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  const suppliedHash = crypto
    .createHash("sha256")
    .update(`cnc-ai-v8:${supplied}`)
    .digest();

  const expectedHash = crypto
    .createHash("sha256")
    .update(`cnc-ai-v8:${APP_PASSWORD}`)
    .digest();

  const ok =
    suppliedHash.length === expectedHash.length &&
    crypto.timingSafeEqual(suppliedHash, expectedHash);

  if (!ok) {
    res.status(401).json({
      error: "Неверный пароль"
    });
    return;
  }

  const secureCookie = Boolean(
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.NODE_ENV === "production"
  );

  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(expectedSessionToken())}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=2592000"
  ];

  if (secureCookie) attributes.push("Secure");

  res.setHeader("Set-Cookie", attributes.join("; "));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});

app.post("/api/auth/logout", (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`
  );
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  const db = databaseState();

  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    service: "cnc-assistant-v2",
    fastModel: process.env.FAST_MODEL || "gpt-5-mini",
    smartModel: process.env.SMART_MODEL || "gpt-5.6-sol",
    supervisorEnabled: process.env.ENABLE_SUPERVISOR !== "false",
    databaseConfigured: db.configured,
    databaseReady: db.ready
  });
});


app.get("/api/memory", authRequired, async (_req, res) => {
  try {
    const db = databaseState();

    if (!db.configured || !db.ready) {
      res.status(503).json({
        error: db.error || "Cloud memory is not configured",
        databaseConfigured: db.configured,
        databaseReady: db.ready
      });
      return;
    }

    const result = await readCloudMemory();

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";

    res.status(500).json({ error: message });
  }
});

app.put("/api/memory", authRequired, async (req, res) => {
  try {
    const db = databaseState();

    if (!db.configured || !db.ready) {
      res.status(503).json({
        error: db.error || "Cloud memory is not configured",
        databaseConfigured: db.configured,
        databaseReady: db.ready
      });
      return;
    }

    const memory = sanitizeMemory(req.body?.memory);
    const result = await writeCloudMemory(memory);

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";

    res.status(500).json({ error: message });
  }
});

app.get("/api/models", authRequired, async (_req, res) => {
  try {
    const models = await listAvailableModels();
    res.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/chat", authRequired, async (req, res) => {
  try {
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages: AppMessage[] = rawMessages
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .map((m: any) => ({
        role: m.role,
        content: m.content.slice(0, 20000)
      }));

    const imageDataUrl =
      typeof req.body?.imageDataUrl === "string" &&
      req.body.imageDataUrl.startsWith("data:image/")
        ? req.body.imageDataUrl
        : null;

    const mode =
      req.body?.mode === "fast" || req.body?.mode === "smart"
        ? req.body.mode
        : "auto";

    let memory: ProjectMemory = sanitizeMemory(req.body?.memory);

    const db = databaseState();

    if (db.ready) {
      try {
        const cloud = await readCloudMemory();

        if (cloud.exists && cloud.memory) {
          memory = cloud.memory;
        }
      } catch (error) {
        console.warn("Cloud memory read failed; using client fallback:", error);
      }
    }

    const result = await runChat({
      messages,
      imageDataUrl,
      mode,
      memory
    });

    res.json(result);
  } catch (error: any) {
    console.error(error);

    const status =
      typeof error?.status === "number" && error.status >= 400 && error.status < 600
        ? error.status
        : 500;

    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка сервера";

    res.status(status).json({
      error: message
    });
  }
});

app.use(
  express.static(publicDir, {
    etag: false,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      }
    }
  })
);

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"), {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
  });
});

async function startServer() {
  await initDatabase();

  app.listen(port, "0.0.0.0", () => {
    console.log(`CNC Assistant listening on port ${port}`);
  });
}

void startServer();
