#!/usr/bin/env node
import { createCli } from "benchmark-core";
import { benchmark } from "./benchmark.js";
import { scoreStabilityFiles } from "./stability.js";

const args = process.argv.slice(2);
if (args[0] === "score-stability") {
  try {
    const paths: string[] = []; const options: { seed?: number; resamples?: number; svgPath?: string } = {};
    for (let index = 1; index < args.length; index++) {
      const arg = args[index]!;
      if (["--seed", "--resamples", "--svg"].includes(arg)) {
        const next = args[++index]; if (next === undefined) throw new Error(`${arg} needs a value.`);
        if (arg === "--seed") options.seed = Number(next);
        else if (arg === "--resamples") options.resamples = Number(next);
        else options.svgPath = next;
      } else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
      else paths.push(arg);
    }
    const result = await scoreStabilityFiles(paths, options);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
} else {
  const delegated = args[0] === "run" && args.includes("--provider") && args[args.indexOf("--provider") + 1] === "mock" && !args.includes("--model")
    ? [...args, "--model", "offline"] : args;
  process.exitCode = await createCli(benchmark, { bin: "benchmark-ranking-stability" }).main(delegated);
}
