import { run as runBenchmark, type ModelAdapter, type RunOptions, type RunReport, type Trace } from "benchmark-core";
import { benchmark, createBenchmark } from "./benchmark.js";
import { reportBreakdown, type ReportBreakdown } from "./report.js";
export { benchmark, createBenchmark };
export type { BenchmarkTasksOptions } from "./benchmark.js";
export type { ReportBreakdown } from "./report.js";
export { reportBreakdown } from "./report.js";

export interface RankingRunOptions extends RunOptions { tasksPath?: string }
export type RankedRunReport = RunReport & { breakdown: ReportBreakdown };

export const run = async (adapter: ModelAdapter, options: RankingRunOptions = {}): Promise<RankedRunReport> => {
  const instance = createBenchmark(options.tasksPath === undefined ? {} : { tasksPath: options.tasksPath });
  const report = await runBenchmark(instance, adapter, options);
  return { ...report, breakdown: reportBreakdown(report, await instance.listTasks()) };
};
export async function score(taskId: string, submission: Trace) {
  const task = await benchmark.getTask(taskId); if (!task) throw new Error(`Task not found: ${taskId}`);
  return benchmark.score(task, submission);
}

export { kendallTauB, renderVolatilityChart, scoreStabilityFiles, MIN_SHARED_TASKS } from "./stability.js";
export type { ModelStability, PromptSensitivity, StabilityOptions, StabilityResult, VariantRanking } from "./stability.js";
