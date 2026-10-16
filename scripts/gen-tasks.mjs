import { mkdir, writeFile } from "node:fs/promises";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
}
const split = option("split", "public");
if (split === "hidden" && !process.argv.includes("--seed")) {
  throw new Error("The hidden split requires an explicit private --seed; never commit it.");
}
const seed = Number(option("seed", "20261015"));
if (!Number.isInteger(seed) || !["public", "hidden"].includes(split)) {
  throw new Error("Usage: gen-tasks.mjs [--seed INTEGER] [--split public|hidden]");
}
function mulberry32(value) {
  return () => {
    value |= 0; value = value + 0x6d2b79f5 | 0;
    let out = Math.imul(value ^ value >>> 15, 1 | value);
    out = out + Math.imul(out ^ out >>> 7, 61 | out) ^ out;
    return ((out ^ out >>> 14) >>> 0) / 4294967296;
  };
}
const PUBLIC_SEED = 20261015;
const names = ["Ari", "Bo", "Cy", "Dee", "Eli", "Fay", "Gus", "Han", "Ivo", "Joy", "Kai", "Lux", "Moe", "Nia", "Ola", "Pim"];
const variants = [
  (q) => `Solve the problem. Return only the final answer. ${q}`,
  (q) => `Give only the answer, without explanation: ${q}`,
  (q) => `Work this out carefully, then respond with the answer alone. ${q}`,
  (q) => `What is the result? Use no words beyond the answer. ${q}`,
  (q) => `Respond with a single final answer to this question: ${q}`,
];
function buildItems(random) {
  const integer = (low, high) => low + Math.floor(random() * (high - low + 1));
  const items = [];
  for (let index = 0; index < 10; index++) {
    const start = integer(8, 30) + index * 3; const multiplier = integer(2, 5);
    const added = integer(7, 28); const removed = integer(2, 9);
    items.push({ family: "multi-step-arithmetic", question: `Start with ${start}, multiply by ${multiplier}, add ${added}, then subtract ${removed}. What number remains?`, answer: String(start * multiplier + added - removed) });
  }
  for (let index = 0; index < 10; index++) {
    const first = integer(3, 20) + index; const step = integer(3, 9); const count = integer(5, 8);
    const sequence = Array.from({ length: count }, (_, offset) => first + step * offset);
    items.push({ family: "sequence", question: `The sequence is ${sequence.join(", ")}. Continue the same pattern with the next number.`, answer: String(first + step * count) });
  }
  for (let index = 0; index < 10; index++) {
    const divisor = 11 + index; const quotient = integer(4, 12); const remainder = integer(1, divisor - 1);
    const dividend = divisor * quotient + remainder;
    items.push({ family: "remainder", question: `What is the remainder when ${dividend} is divided by ${divisor}?`, answer: String(remainder) });
  }
  for (let index = 0; index < 10; index++) {
    const pool = [...names]; const order = [];
    for (let pick = 0; pick < 4; pick++) order.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    const link = (ahead, behind) => random() < 0.5 ? `${ahead} finished before ${behind}.` : `${behind} finished after ${ahead}.`;
    const clauses = [link(order[0], order[1]), link(order[1], order[2]), link(order[2], order[3])];
    for (let place = clauses.length - 1; place > 0; place--) {
      const swap = Math.floor(random() * (place + 1)); [clauses[place], clauses[swap]] = [clauses[swap], clauses[place]];
    }
    items.push({ family: "ordering", question: `${clauses.join(" ")} Who finished first? Answer with one name.`, answer: order[0], options: [...order].sort() });
  }
  for (let index = 0; index < 10; index++) {
    const shared = integer(2, 14); const onlyA = integer(3, 18); const onlyB = integer(4, 21);
    items.push({ family: "set-counting", question: `A group has ${onlyA} people who chose only tea, ${onlyB} who chose only coffee, and ${shared} who chose both. How many chose tea or coffee?`, answer: String(onlyA + onlyB + shared) });
  }
  for (let index = 0; index < 10; index++) {
    const start = integer(12, 40) + index; const threshold = integer(4, 9); const first = start % 2 === 0 ? start / 2 : start + threshold;
    const result = first > threshold * 2 ? first - threshold : first + threshold;
    items.push({ family: "rule-tracing", question: `Let x be ${start}. If x is even, halve it; otherwise add ${threshold}. Then, if x is greater than ${threshold * 2}, subtract ${threshold}; otherwise add ${threshold}. What is x?`, answer: String(result) });
  }
  return items;
}
const bankSeed = seed ^ (split === "hidden" ? 0x5eed5eed : 0);
let items = buildItems(mulberry32(bankSeed));
if (split === "hidden") {
  const publicQuestions = new Set(buildItems(mulberry32(PUBLIC_SEED)).map((item) => item.question));
  let salt = 0;
  while (items.some((item) => publicQuestions.has(item.question))) {
    salt += 1;
    items = buildItems(mulberry32(bankSeed ^ (salt * 0x9e3779b9)));
  }
}
const prefix = split === "hidden" ? "hid" : "reason";
const tasks = items.flatMap((item, itemIndex) => variants.map((render, variantIndex) => ({
  id: `${prefix}-${String(itemIndex + 1).padStart(2, "0")}-v${variantIndex + 1}`,
  kind: "single",
  prompt: render(item.question),
  expected: item.answer,
  metadata: { source: "seeded-synthetic", ...(split === "public" ? { seed } : {}), split, item: itemIndex + 1, variant: variantIndex + 1, family: item.family, ...(item.options ? { options: item.options } : {}) },
})));
const path = split === "public" ? "data/tasks.jsonl" : "artifacts/hidden-tasks.jsonl";
await mkdir(path.split("/")[0], { recursive: true });
await writeFile(path, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks from 60 items at ${path} (seed ${seed})`);
