import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAvailableModels, runChat, type AppMessage } from "./openai.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "15mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "..", "public");

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "cnc-assistant-v2",
    fastModel: process.env.FAST_MODEL || "gpt-5-mini",
    smartModel: process.env.SMART_MODEL || "gpt-5.6-sol",
    supervisorEnabled: process.env.ENABLE_SUPERVISOR !== "false"
  });
});

app.get("/api/models", async (_req, res) => {
  try {
    const models = await listAvailableModels();
    res.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/chat", async (req, res) => {
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

    const result = await runChat({
      messages,
      imageDataUrl,
      mode
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
    etag: true,
    maxAge: "1h"
  })
);

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});
