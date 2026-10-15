import { readFile } from "node:fs/promises";
import { defineBenchmark, exactMatch, replay, type Environment, type JsonValue, type Task, type ToolResult } from "benchmark-core";

async function loadTasks(): Promise<Task[]> {
  const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as Task);
}
class StarterEnvironment implements Environment {
  #finished = false;
  reset() {
    this.#finished = false;
    return { system: "Call finish_task once, then stop.", tools: [{ name: "finish_task", description: "Mark the task finished.", parameters: { type: "object" as const, properties: {}, additionalProperties: false } }] };
  }
  callTool(name: string, _args: Record<string, JsonValue>): ToolResult {
    if (name !== "finish_task") return { result: null, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` } };
    this.#finished = true; return { result: { finished: true } };
  }
  state() { return { finished: this.#finished }; }
  done() { return this.#finished; }
}
export const benchmark = defineBenchmark({
  id: "benchmark-ranking-stability", name: "Ranking Stability", tagline: "Measure ranking movement across seeds, prompts, and task samples.", tags: ["helpful","viral","science"], category: "model-evaluation",
  whatItMeasures: "How model rankings move when the seed, prompt wording, or task sample changes.", version: "0.1.0", status: "alpha", loadTasks,
  async grade(task, submission, context) {
    if (task.kind === "single") return submission.answer === undefined ? { score: 0, reason: "Submission has no answer." } : exactMatch(task.expected ?? null, submission.answer);
    const state = await replay(new StarterEnvironment(), task, submission.toolLog ?? [], context.seed) as { finished?: boolean };
    return state.finished ? { score: 1, reason: "The trace finished the task." } : { score: 0, reason: "The trace did not finish the task." };
  },
  environment: () => new StarterEnvironment(),
  mockPolicies: {
    good: (task) => task.kind === "episode" ? [{ toolCalls: [{ name: "finish_task", args: {} }] }] : [],
    bad: (task) => task.kind === "episode" ? [{ content: "Skipped the tool." }] : [],
  },
  provenance: [{
    name: "Seeded synthetic reasoning bank (Mode B; Mode A uses only user-supplied reports)", kind: "synthetic", url: "https://github.com/pooriaarab/benchmark-ranking-stability/blob/main/scripts/gen-tasks.mjs",
    licence: "MIT", howToGet: "Run `node scripts/gen-tasks.mjs --seed 20261015 --split public`. Mode A reads the RunReport files supplied on its command line and downloads no data.", retrievedAt: "2026-10-15T00:00:00.000Z",
    contaminationNotes: "The 300 public prompt variants use seed 20261015 and are visible in the package. Generate the uncommitted hidden split with a private seed after the 2026-10-15 cutoff.",
    refresh: "Quarterly, choose a new seed, generate both splits, review the public JSONL diff, and keep the hidden seed and file outside version control.",
  }],
  gradingMethod: "Exact match for single answers; deterministic state replay for episodes.",
});
