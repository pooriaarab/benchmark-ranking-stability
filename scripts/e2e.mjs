import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const execFile = promisify(execFileCallback);
const cli = (...args) => execFile(process.execPath, ["dist/cli.js", ...args], { maxBuffer: 4_000_000 });

await execFile("npm", ["run", "build"]); await mkdir("artifacts", { recursive: true });
const runResult = await cli("run", "--provider", "mock", "--json");
const report = JSON.parse(runResult.stdout); assert.equal(report.rows.length, 300);
assert.ok(report.rows.some((row) => row.score === 1)); assert.ok(report.rows.some((row) => row.score === 0));
await writeFile("artifacts/mock-report.json", `${JSON.stringify(report)}\n`);

const { benchmark } = await import("../dist/index.js"); const tasks = await benchmark.listTasks();
async function policyMean(make) {
  const scores = await Promise.all(tasks.map(async (task) => (await benchmark.score(task, make(task))).score));
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
const firstNamedOption = (task) => {
  let best = ""; let position = Number.POSITIVE_INFINITY;
  for (const name of Array.isArray(task.metadata?.options) ? task.metadata.options : []) {
    const at = task.prompt.indexOf(name); if (at >= 0 && at < position) { position = at; best = name; }
  }
  return best;
};
const graderPolicies = {
  good: await policyMean((task) => ({ answer: task.expected })),
  fenced: await policyMean((task) => ({ answer: `\`\`\`\n${task.expected}\n\`\`\`` })),
  proseWrapped: await policyMean((task) => ({ answer: `The answer is ${task.expected}.` })),
  jsonWrapped: await policyMean((task) => ({ answer: JSON.stringify({ answer: task.expected }) })),
  empty: await policyMean(() => ({ answer: "" })),
  zero: await policyMean(() => ({ answer: "0" })),
  one: await policyMean(() => ({ answer: "1" })),
  fortyTwo: await policyMean(() => ({ answer: "42" })),
  constantName: await policyMean(() => ({ answer: "Ari" })),
  alwaysYes: await policyMean(() => ({ answer: "yes" })),
  alwaysRefuse: await policyMean(() => ({ answer: "I cannot help with that request." })),
  sameToolCall: await policyMean(() => ({ toolLog: [{ name: "noop", args: {}, result: null }] })),
  firstName: await policyMean((task) => ({ answer: firstNamedOption(task) })),
  nullAnswer: await policyMean(() => ({ answer: null })),
  numberAnswer: await policyMean(() => ({ answer: 12 })),
  arrayAnswer: await policyMean(() => ({ answer: ["1"] })),
};
assert.equal(graderPolicies.good, 1);
for (const name of ["fenced", "proseWrapped", "jsonWrapped"]) assert.equal(graderPolicies[name], 1, `${name} scored ${graderPolicies[name]}`);
for (const [name, mean] of Object.entries(graderPolicies).filter(([name]) => !["good", "fenced", "proseWrapped", "jsonWrapped"].includes(name))) assert.ok(mean < 0.1, `${name} scored ${mean}`);

await execFile(process.execPath, ["scripts/gen-tasks.mjs", "--split", "hidden"]);
const hiddenTasks = (await readFile("artifacts/hidden-tasks.jsonl", "utf8")).trim().split("\n").map((line) => JSON.parse(line));
assert.equal(hiddenTasks.length, tasks.length);
assert.ok(hiddenTasks.every((task) => task.id.startsWith("hid-")), "hidden split needs the hid- prefix");
assert.ok(hiddenTasks.every((task, index) => task.prompt !== tasks[index]?.prompt), "hidden prompts must differ from public");
const leakedScores = await Promise.all(hiddenTasks.map(async (task, index) => (await benchmark.score(task, { answer: tasks[index].expected })).score));
const leakedMean = leakedScores.reduce((sum, score) => sum + score, 0) / leakedScores.length;
assert.ok(leakedMean < 0.5, `public answer key scored ${leakedMean} on hidden tasks`);

await cli("list", "--json"); await cli("show", "reason-01-v1", "--json");
await cli("score", "artifacts/mock-report.json", "--json"); await cli("card", "artifacts/mock-report.json", "artifacts/card.svg");
await cli("provenance", "--json"); const entry = JSON.parse((await cli("index-entry", "--json")).stdout); assert.equal(entry.task_count, 300);
const stabilityReports = [
  { model: "model-a", rows: report.rows.map((row, index) => ({ taskId: row.taskId, score: index % 10 < 8 ? 1 : 0 })) },
  { model: "model-b", rows: report.rows.map((row, index) => ({ taskId: row.taskId, score: index % 10 < 6 ? 1 : 0 })) },
  { model: "model-c", rows: report.rows.map((row, index) => ({ taskId: row.taskId, score: index % 10 < 4 ? 1 : 0 })) },
];
for (const [index, value] of stabilityReports.entries()) await writeFile(`artifacts/stability-${index}.json`, JSON.stringify(value));
const stability = JSON.parse((await cli("score-stability", ...stabilityReports.map((_, index) => `artifacts/stability-${index}.json`), "--resamples", "500", "--seed", "7", "--svg", "artifacts/volatility.svg")).stdout);
assert.equal(stability.models[0].model, "model-a"); assert.equal(stability.sharedTasks, 300); assert.equal(stability.models.length, 3);
assert.equal(stability.sharedItems, 60); assert.ok(stability.models[0].probabilityFirst > 0.9, `dominant model pFirst ${stability.models[0].probabilityFirst}`);
assert.ok(Array.isArray(stability.warnings));
assert.deepEqual(stability.promptSensitivity?.variants, [1, 2, 3, 4, 5]);
assert.equal(stability.promptSensitivity?.perVariant.length, 5);
assert.equal(stability.promptSensitivity?.rankRange.length, 3);
assert.match(await readFile("artifacts/volatility.svg", "utf8"), /width="1200" height="630"/);

const identical = [{ model: "same-a", rows: report.rows }, { model: "same-b", rows: report.rows }];
for (const [index, value] of identical.entries()) await writeFile(`artifacts/same-${index}.json`, JSON.stringify(value));
const sameResult = JSON.parse((await cli("score-stability", "artifacts/same-0.json", "artifacts/same-1.json", "--resamples", "500", "--seed", "11", "--svg", "artifacts/same.svg")).stdout);
assert.ok(sameResult.meanKendallTau > 0.99, `identical models tau ${sameResult.meanKendallTau}`);
for (const model of sameResult.models) assert.ok(Math.abs(model.probabilityFirst - 0.5) < 0.05, `identical model pFirst ${model.probabilityFirst}`);

const dominant = [
  { model: "always-first", rows: report.rows.map((row) => ({ taskId: row.taskId, score: 1 })) },
  { model: "always-last", rows: report.rows.map((row) => ({ taskId: row.taskId, score: 0 })) },
];
for (const [index, value] of dominant.entries()) await writeFile(`artifacts/dominant-${index}.json`, JSON.stringify(value));
const dominantResult = JSON.parse((await cli("score-stability", "artifacts/dominant-0.json", "artifacts/dominant-1.json", "--resamples", "500", "--seed", "13", "--svg", "artifacts/dominant.svg")).stdout);
assert.equal(dominantResult.models[0].model, "always-first");
assert.equal(dominantResult.models[0].probabilityFirst, 1);
assert.deepEqual(dominantResult.models[0].rankInterval95, { low: 1, high: 1 });

const tiny = [
  { model: "tiny-a", rows: report.rows.slice(0, 10).map((row) => ({ taskId: row.taskId, score: 1 })) },
  { model: "tiny-b", rows: report.rows.slice(0, 10).map((row) => ({ taskId: row.taskId, score: 0.5 })) },
];
for (const [index, value] of tiny.entries()) await writeFile(`artifacts/tiny-${index}.json`, JSON.stringify(value));
const tinyResult = JSON.parse((await cli("score-stability", "artifacts/tiny-0.json", "artifacts/tiny-1.json", "--resamples", "500", "--seed", "17", "--svg", "artifacts/tiny.svg")).stdout);
assert.equal(tinyResult.sharedTasks, 10); assert.ok(tinyResult.warnings.some((warning) => warning.includes("shared tasks")), `expected small-sample warning, got ${tinyResult.warnings}`);

const tenModelReports = Array.from({ length: 10 }, (_, index) => ({ model: `m${index}`, rows: report.rows.map((row) => ({ taskId: row.taskId, score: index / 10 })) }));
const tenFiles = [];
for (const value of tenModelReports) { const file = `artifacts/ten-${value.model}.json`; await writeFile(file, JSON.stringify(value)); tenFiles.push(file); }
await cli("score-stability", ...tenFiles, "--resamples", "200", "--seed", "19", "--svg", "artifacts/ten.svg");
const tenSvg = await readFile("artifacts/ten.svg", "utf8");
const coordinates = [...tenSvg.matchAll(/(?:x1|x2|cx|x)="(\d+(?:\.\d+)?)"/g)].map((match) => Number(match[1]));
const heights = [...tenSvg.matchAll(/(?:y1|y2|cy|y)="(\d+(?:\.\d+)?)"/g)].map((match) => Number(match[1]));
assert.ok(coordinates.every((value) => value <= 1200), "chart x overflow");
assert.ok(heights.every((value) => value <= 630), "chart y overflow");

const probe = createNetServer(); await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const address = probe.address(); assert.ok(address && typeof address === "object"); await new Promise((resolve) => probe.close(resolve));
const server = spawn(process.execPath, ["dist/cli.js", "serve", String(address.port)], { stdio: ["ignore", "pipe", "pipe"] });
const base = `http://127.0.0.1:${address.port}`; const routes = {};
async function get(path) { const response = await fetch(`${base}${path}`); routes[`GET ${path}`] = response.status; return { response, value: await response.json() }; }
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { await get("/health"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 20)); } }
  assert.equal((await get("/health")).response.status, 200);
  assert.equal((await get("/v1/tasks")).value.tasks.length, 300);
  assert.equal((await get("/v1/tasks/reason-01-v1")).value.task.id, "reason-01-v1");
  const score = await fetch(`${base}/v1/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "reason-01-v1", submission: report.rows[0].submission }) });
  routes["POST /v1/score"] = score.status; assert.equal(score.status, 200);
  assert.equal((await get("/v1/provenance")).response.status, 200); assert.equal((await get("/v1/index-entry")).value.task_count, 300);
} finally { if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }

const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "benchmark-ranking-stability-e2e", version: "0.1.0" }); await client.connect(transport); let toolNames;
try {
  toolNames = (await client.listTools()).tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ["get_provenance", "get_task", "list_tasks", "run_benchmark", "score_answer"]);
  const calls = [["list_tasks", {}], ["get_task", { taskId: "reason-01-v1" }], ["score_answer", { taskId: "reason-01-v1", submission: report.rows[0].submission }], ["get_provenance", {}], ["run_benchmark", { model: "offline" }]];
  for (const [name, args] of calls) { const result = await client.callTool({ name, arguments: args }); if (name === "run_benchmark") assert.equal(result.isError, true); else assert.notEqual(result.isError, true); }
} finally { await client.close(); }

const artifact = { task_count: report.rows.length, scores: report.rows.map((row) => row.score), grader_policies: graderPolicies, hidden_split: { tasks: hiddenTasks.length, public_key_mean: leakedMean }, stability: { models: stability.models.length, shared_tasks: stability.sharedTasks }, route_status_codes: routes, tool_names: toolNames };
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.match(await readFile("data/PROVENANCE.md", "utf8"), /Seeded synthetic reasoning bank/);
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools, adversarial grading and stability -> all surfaces passed, ok`);
