#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { bootstrapCI, createCli, mockAdapter, openaiCompatAdapter, openrouterAdapter, renderMarkdown, run as coreRun, type Benchmark, type ModelAdapter, type RunReport, type RunRow, type Task } from "benchmark-core";
import { benchmark, createBenchmark } from "./benchmark.js";
import { reportBreakdown, type ReportBreakdown } from "./report.js";
import { startMcp } from "./mcp.js";
import { scoreStabilityFiles } from "./stability.js";

function takeTasksPath(args: string[]): { tasksPath: string | undefined; rest: string[] } {
  const rest: string[] = []; let tasksPath: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--tasks") {
      tasksPath = args[++index];
      if (tasksPath === undefined) throw new Error("--tasks needs a value.");
    } else if (arg.startsWith("--tasks=")) tasksPath = arg.slice("--tasks=".length);
    else rest.push(arg);
  }
  return { tasksPath, rest };
}

function breakdownLines(breakdown: ReportBreakdown): string {
  const table = (title: string, buckets: Record<string, { tasks: number; mean: number }>) => [
    `### ${title}`, "", "| Bucket | Tasks | Mean |", "| --- | ---: | ---: |",
    ...Object.entries(buckets).map(([key, value]) => `| ${key} | ${value.tasks} | ${(value.mean * 100).toFixed(1)}% |`),
  ];
  return ["", "## Breakdown", "", ...table("By family", breakdown.byFamily), "", ...table("By variant", breakdown.byVariant)].join("\n");
}

async function runCommand(args: string[], instance: Benchmark<Task>): Promise<number> {
  const parsed = parseArgs({ args, options: { model: { type: "string" }, provider: { type: "string" }, concurrency: { type: "string" }, timeout: { type: "string" }, retries: { type: "string" }, seed: { type: "string" }, "max-turns": { type: "string" }, "max-tool-calls": { type: "string" }, budget: { type: "string" }, json: { type: "boolean" } }, strict: true });
  const values = parsed.values;
  const provider = values.provider; const model = values.model ?? (provider === "mock" ? "offline" : undefined);
  if (!model || !provider) { console.error("run needs --model and --provider."); return 1; }
  const adapter: ModelAdapter = provider === "mock" ? mockAdapter({ seed: Number(values.seed ?? 1) })
    : provider === "openrouter" ? openrouterAdapter({ model })
    : provider === "openai" ? openaiCompatAdapter({ model })
    : (() => { throw new Error("--provider must be openrouter, openai, or mock."); })();
  const report = await coreRun(instance, adapter, {
    seed: Number(values.seed ?? 1),
    ...(values.concurrency ? { concurrency: Number(values.concurrency) } : {}),
    ...(values.timeout ? { timeoutMs: Number(values.timeout) } : {}),
    ...(values.retries ? { retries: Number(values.retries) } : {}),
    ...(values["max-turns"] ? { maxTurns: Number(values["max-turns"]) } : {}),
    ...(values["max-tool-calls"] ? { maxToolCalls: Number(values["max-tool-calls"]) } : {}),
    ...(values.budget ? { budgetUsd: Number(values.budget) } : {}),
  });
  const breakdown = reportBreakdown(report, await instance.listTasks());
  console.log(values.json ? JSON.stringify({ ...report, breakdown }) : `${renderMarkdown(report)}${breakdownLines(breakdown)}`);
  return report.rows.some((row) => row.error) ? 2 : 0;
}

async function scoreCommand(args: string[], instance: Benchmark<Task>): Promise<number> {
  const json = args.includes("--json"); const file = args.filter((arg) => arg !== "--json")[0];
  if (!file) { console.error("score needs a results JSON file."); return 1; }
  const original = JSON.parse(await readFile(file, "utf8")) as RunReport;
  if (!original || !Array.isArray(original.rows)) { console.error("File is not a run report."); return 1; }
  const rows: RunRow[] = [];
  for (const row of original.rows) {
    const task = await instance.getTask(row.taskId);
    if (!task || row.submission === undefined) { console.error(`Cannot score task ${row.taskId}.`); return 1; }
    const grade = await instance.score(task, row.submission, { seed: original.seed });
    rows.push({ ...row, score: grade.score, reason: grade.reason });
  }
  const scores = rows.map((row) => row.score);
  const rescored: RunReport = { ...original, rows, mean: scores.reduce((sum, score) => sum + score, 0) / scores.length, confidenceInterval95: bootstrapCI(scores, original.seed) };
  const breakdown = reportBreakdown(rescored, await instance.listTasks());
  console.log(json ? JSON.stringify({ ...rescored, breakdown }) : `${renderMarkdown(rescored)}${breakdownLines(breakdown)}`);
  return 0;
}

const args = process.argv.slice(2);
try {
  const { tasksPath, rest } = takeTasksPath(args);
  const instance = tasksPath ? createBenchmark({ tasksPath }) : benchmark;
  if (rest[0] === "score-stability") {
    const paths: string[] = []; const options: { seed?: number; resamples?: number; svgPath?: string } = {};
    for (let index = 1; index < rest.length; index++) {
      const arg = rest[index]!;
      if (["--seed", "--resamples", "--svg"].includes(arg)) {
        const next = rest[++index]; if (next === undefined) throw new Error(`${arg} needs a value.`);
        if (arg === "--seed") options.seed = Number(next);
        else if (arg === "--resamples") options.resamples = Number(next);
        else options.svgPath = next;
      } else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
      else paths.push(arg);
    }
    console.log(JSON.stringify(await scoreStabilityFiles(paths, options), null, 2));
  } else if (rest[0] === "run") process.exitCode = await runCommand(rest.slice(1), instance);
  else if (rest[0] === "score") process.exitCode = await scoreCommand(rest.slice(1), instance);
  else if (rest[0] === "mcp") { await startMcp(instance); process.exitCode = 0; }
  else process.exitCode = await createCli(instance, { bin: "benchmark-ranking-stability" }).main(rest);
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
