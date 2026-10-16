import { run as runBenchmark, type ModelAdapter, type RunOptions, type Trace } from "benchmark-core";
import { benchmark } from "./benchmark.js";
export { benchmark };
export const run = (adapter: ModelAdapter, options?: RunOptions) => runBenchmark(benchmark, adapter, options);
export async function score(taskId: string, submission: Trace) {
  const task = await benchmark.getTask(taskId); if (!task) throw new Error(`Task not found: ${taskId}`);
  return benchmark.score(task, submission);
}

export { kendallTauB, renderVolatilityChart, scoreStabilityFiles, MIN_SHARED_TASKS } from "./stability.js";
export type { ModelStability, PromptSensitivity, StabilityOptions, StabilityResult, VariantRanking } from "./stability.js";
