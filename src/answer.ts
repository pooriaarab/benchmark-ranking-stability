import type { JsonValue, Task, TaskScore } from "benchmark-core";

const FENCE = /^```[^\n`]*\n?([\s\S]*?)```\s*$/;
const ANSWER_KEYS = ["answer", "result", "final", "value", "output"];
const NUMBER = /[-+]?[$€£¥]?\d[\d,]*(?:\.\d+)?%?/g;

function optionsOf(task: Task): string[] | undefined {
  const options = task.metadata?.options;
  return Array.isArray(options) && options.every((option) => typeof option === "string") ? options : undefined;
}

function objectValue(value: Record<string, unknown>): string {
  for (const key of ANSWER_KEYS) {
    const hit = value[key];
    if (typeof hit === "string" || typeof hit === "number" || typeof hit === "boolean") return String(hit);
  }
  const keys = Object.keys(value);
  if (keys.length === 1) {
    const hit = value[keys[0]!];
    if (typeof hit === "string" || typeof hit === "number" || typeof hit === "boolean") return String(hit);
  }
  return JSON.stringify(value);
}

function lastJsonObject(text: string): string | undefined {
  let depth = 0; let start = -1; let span: string | undefined;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "{") { if (depth === 0) start = index; depth++; }
    else if (char === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) span = text.slice(start, index + 1);
    }
  }
  if (span === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(span);
    if (parsed === null || typeof parsed !== "object") return String(parsed);
    if (Array.isArray(parsed)) return span;
    return objectValue(parsed as Record<string, unknown>);
  } catch { return undefined; }
}

function extract(text: string): string {
  const stripped = text.trim().match(FENCE)?.[1]?.trim() ?? text.trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") return String(parsed);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return objectValue(parsed as Record<string, unknown>);
  } catch { /* not bare JSON; look for an embedded object */ }
  return lastJsonObject(stripped) ?? stripped;
}

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().replace(/^["'`]+|["'`.!,;:?]+$/g, "").trim();
const parseNumber = (value: string) => { const parsed = Number(value.replace(/[$€£¥,%]/g, "")); return Number.isFinite(parsed) ? parsed : undefined; };

function firstNumber(text: string): number | undefined {
  const matches = text.match(NUMBER);
  return matches ? parseNumber(matches[0]!) : undefined;
}

function lastMention(text: string, choices: string[]): string | undefined {
  let best: string | undefined; let position = -1;
  for (const choice of choices) {
    const pattern = new RegExp(`\\b${choice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    let match; while ((match = pattern.exec(text))) if (match.index >= position) { position = match.index; best = choice; }
  }
  return best;
}

function firstMention(text: string, choices: string[]): string | undefined {
  let best: string | undefined; let position = Number.POSITIVE_INFINITY;
  for (const choice of choices) {
    const at = text.search(new RegExp(`\\b${choice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    if (at >= 0 && at < position) { position = at; best = choice; }
  }
  return best;
}

const ORDER_CUE = /\b(first|ahead|before|won|beats?|leads?|fastest|winner)\b/;

function mentionedName(text: string, choices: string[]): string | undefined {
  const cue = ORDER_CUE.exec(text);
  if (!cue) return lastMention(text, choices);
  if (cue[0] === "winner") return firstMention(text.slice(cue.index), choices) ?? lastMention(text, choices);
  return lastMention(text.slice(0, cue.index), choices) ?? firstMention(text, choices);
}

export function gradeAnswer(task: Task, answer: unknown): TaskScore {
  const details: Record<string, JsonValue> = { family: task.metadata?.family ?? "unknown", item: task.metadata?.item ?? 0, variant: task.metadata?.variant ?? 0 };
  const fail = (reason: string): TaskScore => ({ score: 0, reason, details });
  if (typeof answer !== "string" || !answer.trim()) return fail("Submission has no answer.");
  const expected = task.expected;
  if (typeof expected !== "string" || !expected.trim()) return fail("Task has no string answer key.");
  const candidate = extract(answer);
  details.extracted = candidate;
  const wanted = normalize(expected);
  const got = normalize(candidate);
  const expectedNumber = parseNumber(wanted);
  const pass = expectedNumber !== undefined
    ? firstNumber(candidate) === expectedNumber
    : got === wanted || mentionedName(got, (optionsOf(task) ?? [expected]).map(normalize)) === wanted;
  return { score: pass ? 1 : 0, reason: pass ? "Answer matches after normalization." : "Answer does not match the generated answer key.", details };
}
