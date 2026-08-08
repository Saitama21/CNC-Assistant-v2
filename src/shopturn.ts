import OpenAI from "openai";
import {
  buildProjectMemoryPrompt,
  buildStructuredKnowledgePrompt
} from "./prompts.js";
import type { ProjectMemory } from "./openai.js";

const apiKey = process.env.OPENAI_API_KEY;
const SMART_MODEL = process.env.SMART_MODEL || "gpt-5.6-sol";
const SUPERVISOR_MODEL = process.env.SUPERVISOR_MODEL || SMART_MODEL;

const client = new OpenAI({
  apiKey: apiKey || "missing-key"
});

export type ShopTurnContourElement = {
  kind: "lineX" | "lineZ" | "lineDiag" | "arc";
  x: number | null;
  z: number | null;
  radius: number | null;
  transitionType: "none" | "radius" | "chamfer";
  transitionValue: number | null;
};

export type ShopTurnOperation = {
  type: "turning" | "thread" | "cutoff" | "contour";
  title: string;
  tool: string;
  edge: number | null;
  feed: number | null;
  speedMode: "S" | "V";
  speed: number | null;
  machining: "rough" | "finish" | "combined" | "none";

  X0: number | null;
  Z0: number | null;
  X1: number | null;
  Z1: number | null;
  D: number | null;
  UX: number | null;
  UZ: number | null;
  FS: number | null;
  R: number | null;

  FR: number | null;
  SR: number | null;
  X2: number | null;

  threadTable: "none" | "ISO_metric" | "BSW" | "BSP" | "UNC";
  threadSize: string;
  P: number | null;
  G: number | null;
  threadSide: "external" | "internal" | "none";
  LW: number | null;
  LW2: number | null;
  LR: number | null;
  H1: number | null;
  DP: number | null;
  alphaP: number | null;

  contourName: string;
  contourStartX: number | null;
  contourStartZ: number | null;
  contourTransitionType: "none" | "radius" | "chamfer";
  contourTransitionValue: number | null;
  contourElements: ShopTurnContourElement[];

  confidence: "high" | "medium" | "low";
  note: string;
};

export type ShopTurnPlan = {
  program: {
    name: string;
    unit: "mm" | "inch";
    workOffset: string;
    stockShape: "cylinder" | "tube" | "unknown";
    XA: number | null;
    XI: number | null;
    ZA: number | null;
    ZI: number | null;
    ZB: number | null;
    XRA: number | null;
    ZRA: number | null;
    SC: number | null;
    Smax: number | null;
  };
  operations: ShopTurnOperation[];
  warnings: string[];
  assumptions: string[];
};

type Knowledge = {
  tools?: Array<any>;
  materials?: Array<any>;
  mCodes?: Array<any>;
  journal?: Array<any>;
};

const nullableNumber = {
  anyOf: [
    { type: "number" },
    { type: "null" }
  ]
};

const shopTurnSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program", "operations", "warnings", "assumptions"],
  properties: {
    program: {
      type: "object",
      additionalProperties: false,
      required: [
        "name", "unit", "workOffset", "stockShape",
        "XA", "XI", "ZA", "ZI", "ZB", "XRA", "ZRA", "SC", "Smax"
      ],
      properties: {
        name: { type: "string" },
        unit: { type: "string", enum: ["mm", "inch"] },
        workOffset: { type: "string" },
        stockShape: { type: "string", enum: ["cylinder", "tube", "unknown"] },
        XA: nullableNumber,
        XI: nullableNumber,
        ZA: nullableNumber,
        ZI: nullableNumber,
        ZB: nullableNumber,
        XRA: nullableNumber,
        ZRA: nullableNumber,
        SC: nullableNumber,
        Smax: nullableNumber
      }
    },
    operations: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type", "title", "tool", "edge", "feed", "speedMode", "speed", "machining",
          "X0", "Z0", "X1", "Z1", "D", "UX", "UZ", "FS", "R",
          "FR", "SR", "X2",
          "threadTable", "threadSize", "P", "G", "threadSide",
          "LW", "LW2", "LR", "H1", "DP", "alphaP",
          "contourName", "contourStartX", "contourStartZ",
          "contourTransitionType", "contourTransitionValue", "contourElements",
          "confidence", "note"
        ],
        properties: {
          type: { type: "string", enum: ["turning", "thread", "cutoff", "contour"] },
          title: { type: "string" },
          tool: { type: "string" },
          edge: nullableNumber,
          feed: nullableNumber,
          speedMode: { type: "string", enum: ["S", "V"] },
          speed: nullableNumber,
          machining: { type: "string", enum: ["rough", "finish", "combined", "none"] },

          X0: nullableNumber,
          Z0: nullableNumber,
          X1: nullableNumber,
          Z1: nullableNumber,
          D: nullableNumber,
          UX: nullableNumber,
          UZ: nullableNumber,
          FS: nullableNumber,
          R: nullableNumber,

          FR: nullableNumber,
          SR: nullableNumber,
          X2: nullableNumber,

          threadTable: {
            type: "string",
            enum: ["none", "ISO_metric", "BSW", "BSP", "UNC"]
          },
          threadSize: { type: "string" },
          P: nullableNumber,
          G: nullableNumber,
          threadSide: {
            type: "string",
            enum: ["external", "internal", "none"]
          },
          LW: nullableNumber,
          LW2: nullableNumber,
          LR: nullableNumber,
          H1: nullableNumber,
          DP: nullableNumber,
          alphaP: nullableNumber,

          contourName: { type: "string" },
          contourStartX: nullableNumber,
          contourStartZ: nullableNumber,
          contourTransitionType: {
            type: "string",
            enum: ["none", "radius", "chamfer"]
          },
          contourTransitionValue: nullableNumber,
          contourElements: {
            type: "array",
            maxItems: 80,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "kind", "x", "z", "radius", "transitionType", "transitionValue"
              ],
              properties: {
                kind: {
                  type: "string",
                  enum: ["lineX", "lineZ", "lineDiag", "arc"]
                },
                x: nullableNumber,
                z: nullableNumber,
                radius: nullableNumber,
                transitionType: {
                  type: "string",
                  enum: ["none", "radius", "chamfer"]
                },
                transitionValue: nullableNumber
              }
            }
          },

          confidence: {
            type: "string",
            enum: ["high", "medium", "low"]
          },
          note: { type: "string" }
        }
      }
    },
    warnings: {
      type: "array",
      maxItems: 30,
      items: { type: "string" }
    },
    assumptions: {
      type: "array",
      maxItems: 30,
      items: { type: "string" }
    }
  }
} as const;

const manualRules = `
Ты формируешь не текстовый ответ, а структуру для визуального редактора ShopTurn
SINUMERIK Operate 840D sl/828D V4.8 SP3.

Поддерживаемые в v11 операции:
1) turning — "Обработка резаньем" / CYCLE951.
   ShopTurn-поля: T, D, F, S/V; режим rough/finish; X0, Z0, X1, Z1;
   для черновой D, UX, UZ; при необходимости FS/R.
2) thread — "Нарезание резьбы резцом" / CYCLE99.
   ShopTurn-поля: T, D, S/V; таблица резьбы, размер (например M12), P,
   наружная/внутренняя, X0, Z0, Z1, LW/LW2, LR, H1, DP или alphaP.
3) cutoff — "Отрез" / CYCLE92.
   ShopTurn-поля: T, D, F, S/V, X0, Z0, FS или R, X1,
   FR, SR, X2.
4) contour — контурная обточка.
   Сначала имя и старт X/Z (X всегда диаметр), затем элементы:
   lineX, lineZ, lineDiag, arc. Между элементами возможен радиус или фаска.

Заголовок ShopTurn:
- unit: mm/inch;
- workOffset;
- заготовка cylinder/tube;
- XA наружный диаметр;
- XI внутренний диаметр для трубы;
- ZA начальный Z; ZI конечный Z; ZB размер под обработку;
- XRA/ZRA плоскости отвода;
- SC безопасное расстояние;
- Smax ограничение частоты вращения.

Критические правила:
- X в токарной геометрии задавай как диаметр.
- Не выдумывай размеры, которых нет на чертеже/фото/тексте.
- Не угадывай OEM M-коды.
- Если размер или режим неизвестен, ставь null и добавляй предупреждение.
- Если фаска/радиус не читается однозначно, не добавляй его в геометрию.
- Режимы резания из журнала прошлых деталей — только ориентир, а не универсальная истина.
- Сначала геометрия, затем технология. Не подменяй отсутствующие размеры "типичными".
`.trim();

function inputFor(prompt: string, imageDataUrl?: string | null) {
  if (imageDataUrl) {
    return [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageDataUrl }
      ]
    }] as any;
  }

  return [{
    role: "user",
    content: prompt
  }] as any;
}

function parsePlan(text: string): ShopTurnPlan {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(cleaned) as ShopTurnPlan;
}

async function createStructuredPlan(
  model: string,
  instructions: string,
  prompt: string,
  imageDataUrl?: string | null
): Promise<ShopTurnPlan> {
  try {
    const response = await client.responses.create({
      model,
      instructions,
      input: inputFor(prompt, imageDataUrl),
      text: {
        format: {
          type: "json_schema",
          name: "shopturn_plan",
          strict: true,
          schema: shopTurnSchema as any
        }
      } as any,
      store: false
    } as any);

    return parsePlan(response.output_text || "");
  } catch (structuredError) {
    console.warn("Structured output fallback:", structuredError);

    const response = await client.responses.create({
      model,
      instructions:
        instructions +
        "\n\nВерни ТОЛЬКО валидный JSON без markdown. JSON обязан соответствовать заданной структуре.",
      input: inputFor(
        prompt +
        "\n\nПоля JSON: program{name,unit,workOffset,stockShape,XA,XI,ZA,ZI,ZB,XRA,ZRA,SC,Smax}, " +
        "operations[] с типами turning/thread/cutoff/contour и всеми полями схемы v11, warnings[], assumptions[].",
        imageDataUrl
      ),
      store: false
    });

    return parsePlan(response.output_text || "");
  }
}

export async function generateShopTurnPlan(args: {
  prompt: string;
  imageDataUrl?: string | null;
  memory?: ProjectMemory;
  knowledge?: Knowledge;
}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const memoryPrompt = buildProjectMemoryPrompt(args.memory);
  const knowledgePrompt = buildStructuredKnowledgePrompt(args.knowledge);

  const instructions = [
    manualRules,
    memoryPrompt,
    knowledgePrompt
  ].filter(Boolean).join("\n\n");

  let plan = await createStructuredPlan(
    SMART_MODEL,
    instructions,
    args.prompt || "Составь ShopTurn по изображению.",
    args.imageDataUrl
  );

  const shouldSupervise = process.env.ENABLE_SUPERVISOR !== "false";

  if (shouldSupervise) {
    const reviewPrompt =
      "Проверь этот ShopTurn-план на внутренние противоречия и соответствие правилам полей. " +
      "Исправь только то, что можно обосновать исходными данными. Не заполняй неизвестные размеры. " +
      "Верни полный исправленный объект.\n\nПлан:\n" +
      JSON.stringify(plan);

    plan = await createStructuredPlan(
      SUPERVISOR_MODEL,
      instructions,
      reviewPrompt,
      args.imageDataUrl
    );
  }

  return {
    plan,
    model: SMART_MODEL,
    supervised: shouldSupervise,
    supervisorModel: shouldSupervise ? SUPERVISOR_MODEL : null
  };
}
