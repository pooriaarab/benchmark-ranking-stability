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
const runResult = await cli("run", "--model", "offline", "--provider", "mock", "--json");
const report = JSON.parse(runResult.stdout); assert.equal(report.rows.length, 300);
assert.ok(report.rows.some((row) => row.score === 1)); assert.ok(report.rows.some((row) => row.score === 0));
await writeFile("artifacts/mock-report.json", `${JSON.stringify(report)}\n`);

const { benchmark } = await import("../dist/index.js"); const tasks = await benchmark.listTasks();
async function policyMean(answer) {
  const scores = await Promise.all(tasks.map(async (task) => (await benchmark.score(task, { answer: answer(task) })).score));
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
const graderPolicies = {
  good: await policyMean((task) => task.expected), empty: await policyMean(() => ""),
  random: await policyMean(() => "z9-random-wrong"), alwaysYes: await policyMean(() => "yes"), sameAnswer: await policyMean(() => "1"),
  nullAnswer: await policyMean(() => null), numberAnswer: await policyMean(() => 12), arrayAnswer: await policyMean(() => ["1"]),
};
assert.equal(graderPolicies.good, 1);
for (const [name, mean] of Object.entries(graderPolicies).filter(([name]) => name !== "good")) assert.ok(mean < 0.1, `${name} scored ${mean}`);

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
assert.match(await readFile("artifacts/volatility.svg", "utf8"), /width="1200" height="630"/);

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

const artifact = { task_count: report.rows.length, scores: report.rows.map((row) => row.score), grader_policies: graderPolicies, stability: { models: stability.models.length, shared_tasks: stability.sharedTasks }, route_status_codes: routes, tool_names: toolNames };
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.match(await readFile("data/PROVENANCE.md", "utf8"), /Seeded synthetic reasoning bank/);
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools, adversarial grading and stability -> all surfaces passed, ok`);
