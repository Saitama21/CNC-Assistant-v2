import { MANUAL_CHUNKS, type ManualChunk } from "./manualKnowledge.generated.js";

export type ManualHit = ManualChunk & { score: number };

const SOURCE_PRIORITY: Record<string, number> = {
  "siemens-2018": 1.15,
  "shopturn-2010": 1.0
};

const TECHNICAL_TERMS = new Set([
  "x0", "x1", "x2", "z0", "z1", "z2", "xa", "xi", "za", "zi", "zb", "xra", "xri", "zra", "zri",
  "fs", "fr", "sr", "sc", "sv", "dp", "lw", "lr", "cycle92", "cycle99", "g94", "g95", "shopturn", "sinumerik"
]);

const ALIAS_GROUPS: Array<{ test: RegExp; terms: string[] }> = [
  { test: /cut[\s-]?off|отрез|отрезк|cycle\s*92/i, terms: ["отрез", "cycle92", "x0", "z0", "fs", "x1", "fr", "sr", "x2"] },
  { test: /program\s*header|header|заготов|болван|blank|xa|xi|za|zi|zb|xra|zra/i, terms: ["заготовка", "xa", "xi", "za", "zi", "zb", "xra", "xri", "zra", "zri", "безопасное расстояние", "смещение нулевой точки"] },
  { test: /резьб|thread|cycle\s*99/i, terms: ["резьба", "cycle99", "шаг резьбы", "lw", "lr", "h1", "dp"] },
  { test: /торцев|face/i, terms: ["торцевание", "плоскость", "подача", "скорость резания"] },
  { test: /контур|contour/i, terms: ["контур", "контурный вычислитель", "обработка резаньем", "остатки материала"] },
  { test: /инструмент|резец|tool|пластин/i, terms: ["инструмент", "резец", "список инструментов", "износ инструментов"] },
  { test: /нулев|work\s*offset|z0|g54/i, terms: ["нулевая точка", "смещение нулевой точки", "g54", "z0"] },
  { test: /подач|feed|g94|g95/i, terms: ["подача", "g94", "g95", "мм/об", "мм/мин"] },
  { test: /оборот|шпиндел|скорост|rpm/i, terms: ["скорость шпинделя", "частота вращения", "постоянная скорость резания"] },
  { test: /сверл|drill/i, terms: ["сверление", "глубина сверления", "сверло"] },
  { test: /метчик|нарезан.*резьб|tapp/i, terms: ["нарезание резьбы", "метчик", "резьба"] },
  { test: /simulat|симуляц/i, terms: ["симуляция обработки", "simul", "траектория"] }
];

function normalize(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[^a-zа-я0-9+*/.°%_-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEARCHABLE = MANUAL_CHUNKS.map((chunk) => ({
  chunk,
  normalized: normalize(chunk.text)
}));

function queryTerms(query: string) {
  const normalized = normalize(query);
  const terms = new Set(
    normalized
      .split(" ")
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .slice(-90)
  );

  for (const group of ALIAS_GROUPS) {
    if (group.test.test(query)) {
      for (const term of group.terms) terms.add(normalize(term));
    }
  }

  return Array.from(terms).filter(Boolean);
}

function scoreChunk(normalizedText: string, terms: string[], sourceId: string) {
  let score = 0;

  for (const term of terms) {
    if (!term) continue;

    if (normalizedText.includes(term)) {
      score += TECHNICAL_TERMS.has(term) ? 9 : term.length >= 8 ? 4 : term.length >= 5 ? 2.5 : 1.5;
      continue;
    }

    // Russian inflection fallback: a five-character prefix is usually enough to
    // connect variants such as "отрезке" ↔ "отрез" without external NLP deps.
    if (/^[а-я]+$/i.test(term) && term.length >= 6) {
      const stem = term.slice(0, 5);
      if (normalizedText.includes(stem)) score += 1.1;
    }
  }

  if (/cycle92|отрез/.test(normalizedText) && terms.some((t) => ["cutoff", "отрез", "cycle92", "x2", "fr", "sr"].includes(t))) {
    score += 18;
  }

  if (/параметр.*описание/.test(normalizedText) && terms.some((t) => TECHNICAL_TERMS.has(t))) {
    score += 4;
  }

  return score * (SOURCE_PRIORITY[sourceId] || 1);
}

export function searchManualKnowledge(query: string, limit = 7): ManualHit[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];

  const hits: ManualHit[] = [];
  for (const item of SEARCHABLE) {
    const score = scoreChunk(item.normalized, terms, item.chunk.sourceId);
    if (score > 1.5) hits.push({ ...item.chunk, score });
  }

  hits.sort((a, b) => b.score - a.score || a.page - b.page);

  const selected: ManualHit[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const key = `${hit.sourceId}:${hit.page}:${hit.part}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(hit);
    if (selected.length >= limit) break;
  }

  return selected;
}

const CUTOFF_CORE = `
### Постоянная справка Siemens: Отрез / Cutoff (CYCLE92)
По SINUMERIK 840D sl/828D, Руководство по эксплуатации 08/2018, стр. 446–448:
- T — имя инструмента; D — номер режущей кромки/резца.
- F — рабочая подача, для ShopTurn в мм/об.
- S — скорость шпинделя, об/мин; V — постоянная скорость резания, м/мин; SV — граница максимальной скорости при V.
- X0 — исходная точка по X, абсолютная, всегда задаётся как диаметр.
- Z0 — исходная точка по Z, абсолютная.
- FS или R — ширина фаски или радиус закругления.
- X1 — глубина/диаметр, начиная с которой допускается уменьшение скорости; может быть абсолютной или инкрементальной относительно X0.
- FR (ShopTurn) — уменьшенная подача, мм/об.
- SR — уменьшенная скорость, об/мин.
- X2 — конечная глубина/диаметр отреза, абсолютная или инкрементальная относительно X1.
Ход цикла: отрез идёт рабочей подачей до X1, затем при заданных FR/SR продолжается до X2, после чего инструмент отводится на безопасное расстояние.
`.trim();

function isCutoffQuery(query: string) {
  return /cut[\s-]?off|отрез|cycle\s*92|\b(fs|fr|sr|x0|x1|x2)\b/i.test(query);
}

export function buildManualKnowledgePrompt(query: string, options?: { maxChars?: number; limit?: number }) {
  const maxChars = Math.max(4000, Math.min(options?.maxChars ?? 15000, 24000));
  const limit = Math.max(2, Math.min(options?.limit ?? 7, 12));
  const hits = searchManualKnowledge(query, limit);

  const sections: string[] = [];
  if (isCutoffQuery(query)) sections.push(CUTOFF_CORE);

  let used = sections.reduce((sum, s) => sum + s.length, 0);
  for (const hit of hits) {
    const header = `### ${hit.sourceTitle} — стр. ${hit.page}`;
    const remaining = maxChars - used - header.length - 4;
    if (remaining < 500) break;
    const body = hit.text.slice(0, remaining);
    sections.push(`${header}\n${body}`);
    used += header.length + body.length + 2;
  }

  if (!sections.length) return "";

  return `
ВСТРОЕННАЯ БАЗА РУКОВОДСТВ SIEMENS — локально встроенные выдержки из документов пользователя.
Используй их как первичный источник для стандартных функций SINUMERIK/ShopTurn.
Правила:
- если в этой базе есть определение стандартного параметра, НЕ проси пользователя прислать ту же справку повторно;
- при фото стандартной маски ShopTurn сопоставляй видимые подписи полей с определениями ниже;
- значения, реально видимые на фото, считай входными данными, но не додумывай невидимые числа;
- руководство 2018 относится к стандартному SINUMERIK 840D sl/828D V4.8 SP3; OEM-изменения станкостроителя всё ещё могут отличаться;
- учебное пособие 2010 используй для логики ShopTurn и практического рабочего процесса, а руководство 2018 — для точных параметров/циклов;
- если выдержки конфликтуют с подтверждённой OEM-памятью конкретного SK52PT-Y, явно укажи конфликт.

${sections.join("\n\n")}
`.trim();
}

export function manualKnowledgeStats() {
  const sources = Array.from(new Set(MANUAL_CHUNKS.map((c) => c.sourceId)));
  return { sources: sources.length, chunks: MANUAL_CHUNKS.length };
}
