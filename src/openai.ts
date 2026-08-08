import OpenAI from "openai";
import { CNC_SYSTEM_PROMPT, SUPERVISOR_PROMPT, buildProjectMemoryPrompt, buildStructuredKnowledgePrompt } from "./prompts.js";
import { chooseModelMode, type RouteMode } from "./router.js";

export type AppMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ProjectMemory = {
  machine?: string;
  materials?: string;
  tools?: string;
  mCodes?: string;
  cutting?: string;
  notes?: string;
};

type ChatRequest = {
  messages: AppMessage[];
  imageDataUrl?: string | null;
  mode?: RouteMode;
  memory?: ProjectMemory;
  knowledge?: {
    tools?: Array<any>;
    materials?: Array<any>;
    mCodes?: Array<any>;
    journal?: Array<any>;
  };
};

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("OPENAI_API_KEY is not set. /api/chat will fail until it is configured.");
}

const client = new OpenAI({
  apiKey: apiKey || "missing-key"
});

const FAST_MODEL = process.env.FAST_MODEL || "gpt-5-mini";
const SMART_MODEL = process.env.SMART_MODEL || "gpt-5.6-sol";
const SUPERVISOR_MODEL = process.env.SUPERVISOR_MODEL || SMART_MODEL;

function toOpenAIInput(messages: AppMessage[], imageDataUrl?: string | null) {
  const trimmed = messages.slice(-14);
  const input: any[] = trimmed.map((message, index) => {
    const isLast = index === trimmed.length - 1;
    const isUser = message.role === "user";

    if (isLast && isUser && imageDataUrl) {
      return {
        role: "user",
        content: [
          { type: "input_text", text: message.content || "Проанализируй это изображение." },
          { type: "input_image", image_url: imageDataUrl }
        ]
      };
    }

    return {
      role: message.role,
      content: message.content
    };
  });

  return input;
}

export async function runChat(request: ChatRequest) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const messages = request.messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );

  if (!messages.length) {
    throw new Error("No messages supplied");
  }

  const lastUserText =
    [...messages].reverse().find((m) => m.role === "user")?.content || "";

  const route = chooseModelMode(
    lastUserText,
    Boolean(request.imageDataUrl),
    request.mode || "auto"
  );

  const selectedModel = route === "smart" ? SMART_MODEL : FAST_MODEL;
  const memoryPrompt = buildProjectMemoryPrompt(request.memory);
  const knowledgePrompt = buildStructuredKnowledgePrompt(request.knowledge);
  const instructions = [CNC_SYSTEM_PROMPT, memoryPrompt, knowledgePrompt]
    .filter(Boolean)
    .join("\n\n");

  const response = await client.responses.create({
    model: selectedModel,
    instructions,
    input: toOpenAIInput(messages, request.imageDataUrl) as any,
    store: false
  });

  let answer = response.output_text?.trim() || "Модель не вернула текстовый ответ.";

  const shouldSupervise =
    process.env.ENABLE_SUPERVISOR !== "false" &&
    (route === "smart" || Boolean(request.imageDataUrl));

  if (shouldSupervise) {
    const review = await client.responses.create({
      model: SUPERVISOR_MODEL,
      instructions: [SUPERVISOR_PROMPT, memoryPrompt, knowledgePrompt]
        .filter(Boolean)
        .join("\n\n"),
      input: [
        {
          role: "user",
          content:
            `Запрос пользователя:\n${lastUserText}\n\n` +
            `Черновик ответа:\n${answer}`
        }
      ] as any,
      store: false
    });

    if (review.output_text?.trim()) {
      answer = review.output_text.trim();
    }
  }

  return {
    answer,
    route,
    model: selectedModel,
    supervised: shouldSupervise,
    supervisorModel: shouldSupervise ? SUPERVISOR_MODEL : null
  };
}

export async function listAvailableModels() {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const page = await client.models.list();
  return page.data
    .map((m) => m.id)
    .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id))
    .sort((a, b) => a.localeCompare(b));
}
