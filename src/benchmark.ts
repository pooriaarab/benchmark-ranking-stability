import { readFile } from "node:fs/promises";
import { defineBenchmark, type Benchmark, type Task } from "benchmark-core";
import { gradeAnswer } from "./answer.js";

export interface BenchmarkTasksOptions { tasksPath?: string }

export function createBenchmark(options: BenchmarkTasksOptions = {}): Benchmark<Task> {
  async function loadTasks(): Promise<Task[]> {
    const text = await readFile(options.tasksPath ?? new URL("../data/tasks.jsonl", import.meta.url), "utf8");
    return text.trim().split("\n").map((line) => JSON.parse(line) as Task);
  }
  return defineBenchmark({
    id: "benchmark-ranking-stability", name: "Ranking Stability", tagline: "Measure ranking movement across seeds, prompts, and task samples.", tags: ["helpful","viral","science"], category: "model-evaluation",
    whatItMeasures: "How model rankings move when the seed, prompt wording, or task sample changes.", version: "0.1.0", status: "alpha", loadTasks,
    grade: (task, submission) => gradeAnswer(task, submission.answer),
    provenance: [{
      name: "Seeded synthetic reasoning bank (Mode B; Mode A uses only user-supplied reports)", kind: "synthetic", url: "https://github.com/pooriaarab/benchmark-ranking-stability/blob/main/scripts/gen-tasks.mjs",
      licence: "MIT", howToGet: "Run `node scripts/gen-tasks.mjs --seed 20261015 --split public`. Mode A reads the RunReport files supplied on its command line and downloads no data.", retrievedAt: "2026-10-15T00:00:00.000Z",
      contaminationNotes: "The 300 public prompt variants use seed 20261015 and are visible in the package. The hidden split uses the `hid-` id prefix and requires an explicit private `--seed`; keep its seed and file outside version control.",
      refresh: "Quarterly, choose a new seed, generate both splits, review the public JSONL diff, and keep the hidden seed and file outside version control.",
    }],
    gradingMethod: "Deterministic answer match after stripping one code fence, taking the last JSON object when present, and normalizing case, whitespace, money and units; name answers match the last option mentioned.",
  });
}

export const benchmark = createBenchmark();
