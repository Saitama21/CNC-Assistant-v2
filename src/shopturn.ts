import OpenAI from "openai";
import {
  buildProjectMemoryPrompt,
  buildStructuredKnowledgePrompt
} from "./prompts.js";
import type { ProjectMemory } from "./openai.js";

const apiKey = process.env.OPENAI_API_KEY;
const SMART_MODEL = process.env.SMART_MODEL || "gpt-5.6-sol";
const SUPERVISOR_MODEL = process.env.SUPERVISOR_MODEL || SMART_MODEL;

const client = new OpenAI({ apiKey: apiKey || "missing-key" });

type Knowledge = {
  tools?: Array<any>;
  materials?: Array<any>;
  mCodes?: Array<any>;
  journal?: Array<any>;
};

export type GeometryFeature = {
  id: string;
  type: "cylinder" | "step" | "hole" | "thread" | "chamfer" | "radius" | "face" | "other";
  side: "front" | "back" | "axial" | "unknown";
  diameter: number | null;
  innerDiameter: number | null;
  length: number | null;
  fromZ: number | null;
  toZ: number | null;
  threadSize: string;
  pitch: number | null;
  value: number | null;
  quantity: number | null;
  confidence: "high" | "medium" | "low";
  sourceText: string;
  note: string;
};

export type GeometrySetupHint = {
  id: string;
  title: string;
  orientation: "front" | "back" | "unknown";
  z0Reference: "front_face" | "back_face" | "custom" | "unknown";
  reason: string;
};

export type DrawingGeometry = {
  partName: string;
  unit: "mm" | "inch";
  stockOuterDiameter: number | null;
  stockInnerDiameter: number | null;
  totalLength: number | null;
  features: GeometryFeature[];
  setupsRequired: number | null;
  setupHints: GeometrySetupHint[];
  warnings: string[];
};

export type ShopTurnContourElement = {
  kind: "lineX" | "lineZ" | "lineDiag" | "arc";
  x: number | null;
  z: number | null;
  radius: number | null;
  transitionType: "none" | "radius" | "chamfer";
  transitionValue: number | null;
};

export type ShopTurnOperation = {
  type: "turning" | "threadTurning" | "cutoff" | "contour" | "drilling" | "tapping";
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

  drillSurface: "faceC" | "faceY" | "sideC" | "sideY" | "faceB" | "unknown";
  drillPosition: "front" | "back" | "outside" | "inside" | "unknown";
  drillDepthReference: "tip" | "shank" | "unknown";
  pilotBore: boolean | null;
  ZA: number | null;
  FA: number | null;
  throughDrilling: boolean | null;
  ZD: number | null;
  FD: number | null;
  DT: number | null;

  tapChuckMode: "compensating" | "rigid" | "unknown";
  tapSensorMode: "sensor" | "no_sensor" | "unknown";
  tapProcess: "one_pass" | "chip_break" | "chip_removal" | "unknown";
  tapRetractMode: "manual" | "automatic" | "unknown";
  V2: number | null;
  VR: number | null;

  confidence: "high" | "medium" | "low";
  note: string;
};

export type ShopTurnSetup = {
  id: string;
  title: string;
  orientation: "front" | "back" | "unknown";
  workOffset: string;
  zZeroReference: "front_face" | "back_face" | "custom" | "unknown";
  zZeroNote: string;
  ZA: number | null;
  ZI: number | null;
  XRA: number | null;
  ZRA: number | null;
  note: string;
  operations: ShopTurnOperation[];
};

export type ShopTurnPlan = {
  geometry: DrawingGeometry;
  program: {
    name: string;
    unit: "mm" | "inch";
    workOffset: string;
    writeWorkOffset: boolean;
    ZV: number | null;
    stockShape: "cylinder" | "tube" | "polygon" | "centeredCuboid" | "none" | "unknown";
    XA: number | null;
    XI: number | null;
    XIMode: "abs" | "inc";
    ZA: number | null;
    ZI: number | null;
    ZIMode: "abs" | "inc";
    ZB: number | null;
    ZBMode: "abs" | "inc";
    retractMode: "simple" | "extended" | "all";
    XRA: number | null;
    XRAMode: "abs" | "inc";
    XRI: number | null;
    XRIMode: "abs" | "inc";
    ZRA: number | null;
    ZRAMode: "abs" | "inc";
    ZRI: number | null;
    toolChangeFrame: "WCS" | "MCS";
    XT: number | null;
    ZT: number | null;
    SC: number | null;
    S1: number | null;
    machiningDirection: "up_cut" | "synchronous" | "unknown";
    headerConfirmed: boolean;
  };
  setups: ShopTurnSetup[];
  warnings: string[];
  assumptions: string[];
};

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] } as const;
const nullableBoolean = { anyOf: [{ type: "boolean" }, { type: "null" }] } as const;

const geometrySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "partName", "unit", "stockOuterDiameter", "stockInnerDiameter", "totalLength",
    "features", "setupsRequired", "setupHints", "warnings"
  ],
  properties: {
    partName: { type: "string" },
    unit: { type: "string", enum: ["mm", "inch"] },
    stockOuterDiameter: nullableNumber,
    stockInnerDiameter: nullableNumber,
    totalLength: nullableNumber,
    features: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "type", "side", "diameter", "innerDiameter", "length", "fromZ", "toZ",
          "threadSize", "pitch", "value", "quantity", "confidence", "sourceText", "note"
        ],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["cylinder", "step", "hole", "thread", "chamfer", "radius", "face", "other"] },
          side: { type: "string", enum: ["front", "back", "axial", "unknown"] },
          diameter: nullableNumber,
          innerDiameter: nullableNumber,
          length: nullableNumber,
          fromZ: nullableNumber,
          toZ: nullableNumber,
          threadSize: { type: "string" },
          pitch: nullableNumber,
          value: nullableNumber,
          quantity: nullableNumber,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          sourceText: { type: "string" },
          note: { type: "string" }
        }
      }
    },
    setupsRequired: nullableNumber,
    setupHints: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "orientation", "z0Reference", "reason"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          orientation: { type: "string", enum: ["front", "back", "unknown"] },
          z0Reference: { type: "string", enum: ["front_face", "back_face", "custom", "unknown"] },
          reason: { type: "string" }
        }
      }
    },
    warnings: { type: "array", maxItems: 40, items: { type: "string" } }
  }
} as const;

const operationProperties = {
  type: { type: "string", enum: ["turning", "threadTurning", "cutoff", "contour", "drilling", "tapping"] },
  title: { type: "string" }, tool: { type: "string" }, edge: nullableNumber,
  feed: nullableNumber, speedMode: { type: "string", enum: ["S", "V"] }, speed: nullableNumber,
  machining: { type: "string", enum: ["rough", "finish", "combined", "none"] },
  X0: nullableNumber, Z0: nullableNumber, X1: nullableNumber, Z1: nullableNumber,
  D: nullableNumber, UX: nullableNumber, UZ: nullableNumber, FS: nullableNumber, R: nullableNumber,
  FR: nullableNumber, SR: nullableNumber, X2: nullableNumber,
  threadTable: { type: "string", enum: ["none", "ISO_metric", "BSW", "BSP", "UNC"] },
  threadSize: { type: "string" }, P: nullableNumber, G: nullableNumber,
  threadSide: { type: "string", enum: ["external", "internal", "none"] },
  LW: nullableNumber, LW2: nullableNumber, LR: nullableNumber, H1: nullableNumber,
  DP: nullableNumber, alphaP: nullableNumber,
  contourName: { type: "string" }, contourStartX: nullableNumber, contourStartZ: nullableNumber,
  contourTransitionType: { type: "string", enum: ["none", "radius", "chamfer"] },
  contourTransitionValue: nullableNumber,
  contourElements: {
    type: "array", maxItems: 80,
    items: {
      type: "object", additionalProperties: false,
      required: ["kind", "x", "z", "radius", "transitionType", "transitionValue"],
      properties: {
        kind: { type: "string", enum: ["lineX", "lineZ", "lineDiag", "arc"] },
        x: nullableNumber, z: nullableNumber, radius: nullableNumber,
        transitionType: { type: "string", enum: ["none", "radius", "chamfer"] },
        transitionValue: nullableNumber
      }
    }
  },
  drillSurface: { type: "string", enum: ["faceC", "faceY", "sideC", "sideY", "faceB", "unknown"] },
  drillPosition: { type: "string", enum: ["front", "back", "outside", "inside", "unknown"] },
  drillDepthReference: { type: "string", enum: ["tip", "shank", "unknown"] },
  pilotBore: nullableBoolean, ZA: nullableNumber, FA: nullableNumber,
  throughDrilling: nullableBoolean, ZD: nullableNumber, FD: nullableNumber, DT: nullableNumber,
  tapChuckMode: { type: "string", enum: ["compensating", "rigid", "unknown"] },
  tapSensorMode: { type: "string", enum: ["sensor", "no_sensor", "unknown"] },
  tapProcess: { type: "string", enum: ["one_pass", "chip_break", "chip_removal", "unknown"] },
  tapRetractMode: { type: "string", enum: ["manual", "automatic", "unknown"] },
  V2: nullableNumber, VR: nullableNumber,
  confidence: { type: "string", enum: ["high", "medium", "low"] }, note: { type: "string" }
} as const;

const operationRequired = Object.keys(operationProperties);

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program", "setups", "warnings", "assumptions"],
  properties: {
    program: {
      type: "object", additionalProperties: false,
      required: [
        "name","unit","workOffset","writeWorkOffset","ZV","stockShape",
        "XA","XI","XIMode","ZA","ZI","ZIMode","ZB","ZBMode",
        "retractMode","XRA","XRAMode","XRI","XRIMode","ZRA","ZRAMode","ZRI",
        "toolChangeFrame","XT","ZT","SC","S1","machiningDirection","headerConfirmed"
      ],
      properties: {
        name: { type: "string" },
        unit: { type: "string", enum: ["mm", "inch"] },
        workOffset: { type: "string" },
        writeWorkOffset: { type: "boolean" },
        ZV: nullableNumber,
        stockShape: { type: "string", enum: ["cylinder","tube","polygon","centeredCuboid","none","unknown"] },
        XA: nullableNumber,
        XI: nullableNumber,
        XIMode: { type: "string", enum: ["abs","inc"] },
        ZA: nullableNumber,
        ZI: nullableNumber,
        ZIMode: { type: "string", enum: ["abs","inc"] },
        ZB: nullableNumber,
        ZBMode: { type: "string", enum: ["abs","inc"] },
        retractMode: { type: "string", enum: ["simple","extended","all"] },
        XRA: nullableNumber,
        XRAMode: { type: "string", enum: ["abs","inc"] },
        XRI: nullableNumber,
        XRIMode: { type: "string", enum: ["abs","inc"] },
        ZRA: nullableNumber,
        ZRAMode: { type: "string", enum: ["abs","inc"] },
        ZRI: nullableNumber,
        toolChangeFrame: { type: "string", enum: ["WCS","MCS"] },
        XT: nullableNumber,
        ZT: nullableNumber,
        SC: nullableNumber,
        S1: nullableNumber,
        machiningDirection: { type: "string", enum: ["up_cut","synchronous","unknown"] },
        headerConfirmed: { type: "boolean" }
      }
    },
    setups: {
      type: "array", maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "title", "orientation", "workOffset", "zZeroReference", "zZeroNote", "ZA", "ZI", "XRA", "ZRA", "note", "operations"],
        properties: {
          id: { type: "string" }, title: { type: "string" },
          orientation: { type: "string", enum: ["front", "back", "unknown"] },
          workOffset: { type: "string" },
          zZeroReference: { type: "string", enum: ["front_face", "back_face", "custom", "unknown"] },
          zZeroNote: { type: "string" }, ZA: nullableNumber, ZI: nullableNumber, XRA: nullableNumber, ZRA: nullableNumber,
          note: { type: "string" },
          operations: {
            type: "array", maxItems: 40,
            items: { type: "object", additionalProperties: false, required: operationRequired, properties: operationProperties }
          }
        }
      }
    },
    warnings: { type: "array", maxItems: 50, items: { type: "string" } },
    assumptions: { type: "array", maxItems: 50, items: { type: "string" } }
  }
} as const;

const geometryRules = `
Ты — модуль чтения машиностроительного чертежа для токарной детали.
Твоя задача — НЕ строить программу, а извлечь только геометрию, которая реально поддерживается изображением/текстом.

Правила:
- Чертёж может быть повернут. Сначала мысленно нормализуй ориентацию главного вида.
- Игнорируй числа из основной надписи, рамки, штампа, номера документа, масштаба и технических примечаний, если они не привязаны размерной линией к детали.
- Диаметр фиксируй только когда видно Ø/диаметр либо геометрия однозначно является диаметральной.
- Для резьбы сохраняй обозначение (например M12) и шаг только если он указан или однозначно следует из таблицы резьбы; не угадывай глубину.
- Фаску/радиус сохраняй только если ясно, к какой кромке относится размер.
- Если деталь требует переворота/второй установки из-за обработки с противоположного торца — добавь setupHint.
- Никаких режимов S/F/Vc и никакого ShopTurn на этом этапе.
- Не заполняй неизвестное типичным значением. Используй null и предупреждение.
`.trim();

const planRules = `
Ты — технологический модуль Visual ShopTurn для SINUMERIK Operate 840D sl/828D V4.8 SP3.
Получаешь уже извлечённую и провалидированную геометрию. Строй ShopTurn ТОЛЬКО из неё и пользовательского контекста.

В v13 поддерживаются:
1) turning — CYCLE951 «Обработка резаньем»: T,D,F,S/V, rough/finish, X0,Z0,X1,Z1,D,UX,UZ,FS/R.
2) threadTurning — CYCLE99 резьба резцом: таблица/размер/P, наружная/внутренняя, X0,Z0,Z1,LW/LW2,LR,H1,DP/alphaP.
3) cutoff — CYCLE92: T,D,F,S/V,X0,Z0,FS/R,X1,FR,SR,X2.
4) contour — контурная обточка: старт X/Z и элементы lineX/lineZ/lineDiag/arc; X всегда диаметр.
5) drilling — CYCLE82: T,D,F,S/V; поверхность/положение ShopTurn; глубина по острию/хвостовику; Z1; засверловка ZA/FA; сквозное сверление ZD/FD; DT.
6) tapping — CYCLE84/CYCLE840 «Нарезание внутренней резьбы»: T,D,S/V; режим компенсирующего патрона; sensor/no_sensor; SR или VR для отвода; поверхность/положение; Z1/X1; таблица/размер/P; one_pass/chip_break/chip_removal; D,V2,DT.


Заголовок / фактическая заготовка:
- Поля program описывают РЕАЛЬНУЮ исходную заготовку и программный заголовок ShopTurn, а не готовую геометрию детали.
- XA — наружный диаметр трубы/цилиндра; XI — внутренний диаметр при abs или толщина стенки при inc для трубы.
- ZA — начальный размер; ZI — конечный размер (abs) или конечный размер относительно ZA (inc); ZB — размер под обработку (abs/inc).
- XRA/XRI/ZRA/ZRI — плоскости отвода; SC — безопасное расстояние; XT/ZT — точка смены инструмента; S1 — ограничение частоты главного шпинделя.
- workOffset — выбранное смещение нулевой точки; writeWorkOffset/ZV относятся к записи Z значения смещения в программе.
- НЕЛЬЗЯ выводить фактическую заготовку из размеров готовой детали на чертеже, если пользователь явно не сообщил размер болванки/трубы.
- Если фактическая заготовка не дана явно, XA/XI/ZA/ZI/ZB и связанные поля оставляй null/пустыми.
- Если во входе есть OPERATOR-CONFIRMED PROGRAM HEADER, скопируй его значения без изменений.

Установки:
- Каждая физическая установка детали имеет отдельный setup и отдельный Z0/workOffset.
- Никогда не переноси координаты Z одной установки в другую как будто это одна система координат.
- Если рабочее смещение неизвестно — оставляй пустую строку и warning.
- Если противоположный торец требует переворота, создай второй setup.

Критически:
- X — диаметр.
- Не придумывай размеры/глубины отверстия/резьбы.
- Для внутренней резьбы Mxx, если нужен предварительный диаметр, но он не дан/не вычислен уверенно, drilling.Z1/диаметр оставляй null и предупреждай.
- Внутренняя M-резьба не равна CYCLE99 автоматически: если предполагается метчик, используй tapping; CYCLE99 оставляй для резьбы резцом.
- OEM M-коды не угадывать.
- Старый журнал режимов — только ориентир.
`.trim();

function inputFor(prompt: string, imageDataUrl?: string | null) {
  if (imageDataUrl) {
    return [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageDataUrl }] }] as any;
  }
  return [{ role: "user", content: prompt }] as any;
}

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(cleaned) as T;
}

async function structured<T>(model: string, instructions: string, prompt: string, schemaName: string, schema: any, imageDataUrl?: string | null): Promise<T> {
  try {
    const response = await client.responses.create({
      model,
      instructions,
      input: inputFor(prompt, imageDataUrl),
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } } as any,
      store: false
    } as any);
    return parseJson<T>(response.output_text || "");
  } catch (error) {
    console.warn(`${schemaName} structured-output fallback:`, error);
    const response = await client.responses.create({
      model,
      instructions: instructions + "\n\nВерни только валидный JSON без markdown.",
      input: inputFor(prompt, imageDataUrl),
      store: false
    });
    return parseJson<T>(response.output_text || "");
  }
}

function finiteOrNull(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validateGeometry(raw: DrawingGeometry): DrawingGeometry {
  const geometry: DrawingGeometry = JSON.parse(JSON.stringify(raw));
  const warnings = [...(geometry.warnings || [])];

  geometry.stockOuterDiameter = finiteOrNull(geometry.stockOuterDiameter);
  geometry.stockInnerDiameter = finiteOrNull(geometry.stockInnerDiameter);
  geometry.totalLength = finiteOrNull(geometry.totalLength);
  geometry.setupsRequired = finiteOrNull(geometry.setupsRequired);

  const dimensions: number[] = [];
  const push = (v: any) => {
    const n = finiteOrNull(v);
    if (n !== null && Math.abs(n) > 0 && Math.abs(n) < 100000) dimensions.push(Math.abs(n));
  };
  push(geometry.stockOuterDiameter); push(geometry.stockInnerDiameter); push(geometry.totalLength);
  for (const f of geometry.features || []) {
    push(f.diameter); push(f.innerDiameter); push(f.length); push(f.fromZ); push(f.toZ); push(f.pitch); push(f.value);
  }

  const med = median(dimensions.filter((v) => v > 0.01));
  const grossOutlier = med ? Math.max(500, med * 20) : 5000;

  if (geometry.totalLength !== null && Math.abs(geometry.totalLength) > grossOutlier) {
    warnings.push(`Общая длина ${geometry.totalLength} отброшена валидатором как выброс относительно остальных размеров.`);
    geometry.totalLength = null;
  }
  if (geometry.stockOuterDiameter !== null && Math.abs(geometry.stockOuterDiameter) > grossOutlier) {
    warnings.push(`Диаметр заготовки ${geometry.stockOuterDiameter} отброшен как вероятное число из рамки/штампа.`);
    geometry.stockOuterDiameter = null;
  }

  geometry.features = (geometry.features || []).map((f, index) => {
    const feature = { ...f, id: f.id || `F${index + 1}` };
    for (const key of ["diameter", "innerDiameter", "length", "fromZ", "toZ", "pitch", "value", "quantity"] as const) {
      (feature as any)[key] = finiteOrNull((feature as any)[key]);
    }
    for (const key of ["diameter", "innerDiameter", "length", "fromZ", "toZ", "value"] as const) {
      const n = (feature as any)[key] as number | null;
      if (n !== null && Math.abs(n) > grossOutlier) {
        warnings.push(`${feature.id}: ${key}=${n} отброшено как статистический выброс/возможное число из основной надписи.`);
        (feature as any)[key] = null;
        feature.confidence = "low";
      }
    }
    return feature;
  });

  geometry.warnings = Array.from(new Set(warnings)).slice(0, 60);
  return geometry;
}

function zLimit(geometry: DrawingGeometry) {
  if (geometry.totalLength && geometry.totalLength > 0) return Math.max(geometry.totalLength * 3, geometry.totalLength + 20);
  const lengths = geometry.features.flatMap((f) => [f.length, f.fromZ, f.toZ]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)).map(Math.abs);
  const med = median(lengths);
  return med ? Math.max(200, med * 20) : 5000;
}

function xLimit(geometry: DrawingGeometry) {
  if (geometry.stockOuterDiameter && geometry.stockOuterDiameter > 0) return Math.max(geometry.stockOuterDiameter * 2.5, geometry.stockOuterDiameter + 20);
  const ds = geometry.features.flatMap((f) => [f.diameter, f.innerDiameter]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)).map(Math.abs);
  const med = median(ds);
  return med ? Math.max(200, med * 10) : 5000;
}

function validatePlan(plan: Omit<ShopTurnPlan, "geometry">, geometry: DrawingGeometry): ShopTurnPlan {
  const raw: any = JSON.parse(JSON.stringify(plan || {}));
  const result: ShopTurnPlan = {
    program: {
      name: String(raw.program?.name || geometry.partName || "SHOPTURN_1"),
      unit: raw.program?.unit === "inch" ? "inch" : "mm",
      workOffset: String(raw.program?.workOffset || ""),
      writeWorkOffset: Boolean(raw.program?.writeWorkOffset),
      ZV: finiteOrNull(raw.program?.ZV),
      stockShape: ["cylinder","tube","polygon","centeredCuboid","none","unknown"].includes(raw.program?.stockShape)
        ? raw.program.stockShape
        : "unknown",
      XA: finiteOrNull(raw.program?.XA),
      XI: finiteOrNull(raw.program?.XI),
      XIMode: raw.program?.XIMode === "inc" ? "inc" : "abs",
      ZA: finiteOrNull(raw.program?.ZA),
      ZI: finiteOrNull(raw.program?.ZI),
      ZIMode: raw.program?.ZIMode === "inc" ? "inc" : "abs",
      ZB: finiteOrNull(raw.program?.ZB),
      ZBMode: raw.program?.ZBMode === "inc" ? "inc" : "abs",
      retractMode: ["simple","extended","all"].includes(raw.program?.retractMode) ? raw.program.retractMode : "simple",
      XRA: finiteOrNull(raw.program?.XRA),
      XRAMode: raw.program?.XRAMode === "abs" ? "abs" : "inc",
      XRI: finiteOrNull(raw.program?.XRI),
      XRIMode: raw.program?.XRIMode === "inc" ? "inc" : "abs",
      ZRA: finiteOrNull(raw.program?.ZRA),
      ZRAMode: raw.program?.ZRAMode === "abs" ? "abs" : "inc",
      ZRI: finiteOrNull(raw.program?.ZRI),
      toolChangeFrame: raw.program?.toolChangeFrame === "WCS" ? "WCS" : "MCS",
      XT: finiteOrNull(raw.program?.XT),
      ZT: finiteOrNull(raw.program?.ZT),
      SC: finiteOrNull(raw.program?.SC),
      S1: finiteOrNull(raw.program?.S1),
      machiningDirection: ["up_cut","synchronous","unknown"].includes(raw.program?.machiningDirection)
        ? raw.program.machiningDirection
        : "unknown",
      headerConfirmed: Boolean(raw.program?.headerConfirmed)
    },
    setups: Array.isArray(raw.setups) ? raw.setups : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(String) : [],
    geometry
  };
  const warnings = [...geometry.warnings, ...(result.warnings || [])];
  const maxZ = zLimit(geometry);
  const maxX = xLimit(geometry);

  for (const key of ["ZV","XA","XI","ZA","ZI","ZB","XRA","XRI","ZRA","ZRI","XT","ZT","SC","S1"] as const) {
    result.program[key] = finiteOrNull(result.program[key]) as any;
  }

  if (
    geometry.stockOuterDiameter &&
    result.program.XA &&
    Math.abs(result.program.XA - geometry.stockOuterDiameter) > Math.max(5, geometry.stockOuterDiameter * 0.35)
  ) {
    warnings.push(
      `XA=${result.program.XA} отличается от максимального Ø, извлечённого с чертежа (${geometry.stockOuterDiameter}). ` +
      `Это допустимо, если XA — фактический диаметр исходной заготовки. Значение XA не заменено автоматически.`
    );
  }

  const checkZ = (holder: any, key: string, context: string) => {
    const n = finiteOrNull(holder[key]);
    if (n !== null && Math.abs(n) > maxZ) {
      warnings.push(`${context}: ${key}=${n} отброшено: превышает проверочный диапазон геометрии (±${maxZ.toFixed(1)}).`);
      holder[key] = null;
    } else holder[key] = n;
  };
  const checkX = (holder: any, key: string, context: string) => {
    const n = finiteOrNull(holder[key]);
    if (n !== null && Math.abs(n) > maxX) {
      warnings.push(`${context}: ${key}=${n} отброшено: не согласуется с диаметральным масштабом детали.`);
      holder[key] = null;
    } else holder[key] = n;
  };

  result.setups = (result.setups || []).map((setup, si) => {
    const s: any = setup;
    ["ZA", "ZI", "ZRA"].forEach((k) => checkZ(s, k, `Установка ${si + 1}`));
    checkX(s, "XRA", `Установка ${si + 1}`);
    s.operations = (s.operations || []).map((op: any, oi: number) => {
      ["Z0", "Z1", "ZA", "ZD", "contourStartZ"].forEach((k) => checkZ(op, k, `Установка ${si + 1}, кадр ${oi + 1}`));
      ["X0", "X1", "X2", "contourStartX"].forEach((k) => checkX(op, k, `Установка ${si + 1}, кадр ${oi + 1}`));
      if (Array.isArray(op.contourElements)) {
        op.contourElements.forEach((el: any, ei: number) => {
          checkX(el, "x", `Контур ${si + 1}.${oi + 1}, элемент ${ei + 1}`);
          checkZ(el, "z", `Контур ${si + 1}.${oi + 1}, элемент ${ei + 1}`);
        });
      }
      return op;
    });
    return s;
  });

  if (!result.setups.length) {
    warnings.push("Модель не сформировала ни одной установки; добавлена пустая установка для ручного заполнения.");
    result.setups = [{
      id: "SETUP1", title: "Установка 1", orientation: "unknown", workOffset: "",
      zZeroReference: "unknown", zZeroNote: "", ZA: null, ZI: null, XRA: null, ZRA: null,
      note: "", operations: []
    }];
  }

  result.warnings = Array.from(new Set(warnings)).slice(0, 80);
  return result;
}

export async function generateShopTurnPlan(args: {
  prompt: string;
  imageDataUrl?: string | null;
  memory?: ProjectMemory;
  knowledge?: Knowledge;
  programHeader?: Partial<ShopTurnPlan["program"]> | null;
}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const memoryPrompt = buildProjectMemoryPrompt(args.memory);
  const knowledgePrompt = buildStructuredKnowledgePrompt(args.knowledge);

  const geometryRaw = await structured<DrawingGeometry>(
    SMART_MODEL,
    [geometryRules, memoryPrompt].filter(Boolean).join("\n\n"),
    (args.prompt || "Разбери геометрию детали по чертежу.") + "\n\nСначала извлеки геометрию. Не используй числа из рамки/штампа как размеры детали.",
    "drawing_geometry_v12",
    geometrySchema,
    args.imageDataUrl
  );

  const geometry = validateGeometry(geometryRaw);

  const planPrompt = `
Пользовательская задача:
${args.prompt || "Составь ShopTurn."}

ПРОВЕРЕННАЯ ГЕОМЕТРИЯ ЧЕРТЕЖА:
${JSON.stringify(geometry, null, 2)}

${args.programHeader?.headerConfirmed
  ? `OPERATOR-CONFIRMED PROGRAM HEADER (копировать без изменений):\n${JSON.stringify(args.programHeader, null, 2)}`
  : "Фактическая заготовка оператором не подтверждена. Не выводи размеры болванки из размеров готовой детали."}

Сформируй установки и технологические кадры. Если данных недостаточно, оставляй null и предупреждай.
`.trim();

  const planInstructions = [planRules, memoryPrompt, knowledgePrompt].filter(Boolean).join("\n\n");

  let rawPlan = await structured<Omit<ShopTurnPlan, "geometry">>(
    SMART_MODEL,
    planInstructions,
    planPrompt,
    "shopturn_plan_v13",
    planSchema,
    args.imageDataUrl
  );

  let plan = validatePlan(rawPlan, geometry);

  if (args.programHeader?.headerConfirmed) {
    plan.program = {
      ...plan.program,
      ...(args.programHeader as ShopTurnPlan["program"]),
      headerConfirmed: true
    };
  }

  const shouldSupervise = process.env.ENABLE_SUPERVISOR !== "false";

  if (shouldSupervise) {
    const supervisorPrompt = `
Проверь ShopTurn-план против ПРОВЕРЕННОЙ ГЕОМЕТРИИ. Особенно:
- не попали ли числа из основной надписи/рамки;
- нет ли Z/X, несогласованных с масштабом детали;
- действительно ли разделены физические установки;
- для внутренней резьбы добавлено ли предварительное сверление, если оно необходимо;
- неизвестные глубины остались null.
Не выдумывай недостающие размеры. Верни полный исправленный план без поля geometry.

ГЕОМЕТРИЯ:
${JSON.stringify(geometry)}

ПЛАН:
${JSON.stringify({ program: plan.program, setups: plan.setups, warnings: plan.warnings, assumptions: plan.assumptions })}
`.trim();

    rawPlan = await structured<Omit<ShopTurnPlan, "geometry">>(
      SUPERVISOR_MODEL,
      planInstructions,
      supervisorPrompt,
      "shopturn_plan_v13_supervised",
      planSchema,
      args.imageDataUrl
    );
    plan = validatePlan(rawPlan, geometry);

    if (args.programHeader?.headerConfirmed) {
      plan.program = {
        ...plan.program,
        ...(args.programHeader as ShopTurnPlan["program"]),
        headerConfirmed: true
      };
    }
  }

  return {
    plan,
    model: SMART_MODEL,
    supervised: shouldSupervise,
    supervisorModel: shouldSupervise ? SUPERVISOR_MODEL : null,
    pipeline: "actual-blank→drawing→geometry→validation→setups→shopturn→supervisor"
  };
}
