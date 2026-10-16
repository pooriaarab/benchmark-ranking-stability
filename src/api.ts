import { createHandler } from "benchmark-core";
import { benchmark, createBenchmark, type BenchmarkTasksOptions } from "./benchmark.js";

export function createApi(options: BenchmarkTasksOptions = {}) {
  return createHandler(options.tasksPath ? createBenchmark(options) : benchmark);
}
export const handler = createApi();
