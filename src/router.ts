export type RouteMode = "auto" | "fast" | "smart";

const SMART_PATTERNS = [
  /sinumerik/i,
  /shopturn/i,
  /\bg-?code\b/i,
  /\bm-?code\b/i,
  /\bm\d{1,3}\b/i,
  /\bg\d{1,3}\b/i,
  /cut[\s-]?off/i,
  /stock removal/i,
  /отрез/i,
  /резец/i,
  /пластин/i,
  /шпиндел/i,
  /подач/i,
  /оборот/i,
  /корректор/i,
  /инструмент/i,
  /черт[её]ж/i,
  /авари/i,
  /alarm/i,
  /ошибк/i,
  /ось [cxyz]/i,
  /\bc[- ]?axis\b/i,
  /цикл/i,
  /программ/i,
  /технолог/i,
  /столкнов/i,
  /вибрац/i,
  /пищит/i
];

export function chooseModelMode(
  text: string,
  hasImage: boolean,
  requestedMode: RouteMode
): "fast" | "smart" {
  if (requestedMode === "fast" || requestedMode === "smart") {
    return requestedMode;
  }

  if (hasImage) return "smart";
  return SMART_PATTERNS.some((pattern) => pattern.test(text)) ? "smart" : "fast";
}
