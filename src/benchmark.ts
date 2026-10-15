import { readFile } from "node:fs/promises";
import { defineBenchmark, type Task } from "benchmark-core";

async function loadTasks(): Promise<Task[]> {
  const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as Task);
}
const normalize = (value: string) => value.normalize("NFKC").trim();
export const benchmark = defineBenchmark({
  id: "benchmark-ranking-stability", name: "Ranking Stability", tagline: "Measure ranking movement across seeds, prompts, and task samples.", tags: ["helpful","viral","science"], category: "model-evaluation",
  whatItMeasures: "How model rankings move when the seed, prompt wording, or task sample changes.", version: "0.1.0", status: "alpha", loadTasks,
  grade(task, submission) {
    if (typeof submission.answer !== "string") return { score: 0, reason: "Submission has no answer." };
    const pass = typeof task.expected === "string" && normalize(submission.answer) === normalize(task.expected);
    return { score: pass ? 1 : 0, reason: pass ? "Answer matches after whitespace and Unicode normalization." : "Answer does not match the generated answer key." };
  },
  provenance: [{
    name: "Seeded synthetic reasoning bank (Mode B; Mode A uses only user-supplied reports)", kind: "synthetic", url: "https://github.com/pooriaarab/benchmark-ranking-stability/blob/main/scripts/gen-tasks.mjs",
    licence: "MIT", howToGet: "Run `node scripts/gen-tasks.mjs --seed 20261015 --split public`. Mode A reads the RunReport files supplied on its command line and downloads no data.", retrievedAt: "2026-10-15T00:00:00.000Z",
    contaminationNotes: "The 300 public prompt variants use seed 20261015 and are visible in the package. Generate the uncommitted hidden split with a private seed after the 2026-10-15 cutoff.",
    refresh: "Quarterly, choose a new seed, generate both splits, review the public JSONL diff, and keep the hidden seed and file outside version control.",
  }],
  gradingMethod: "Full-answer exact match after trimming whitespace and applying Unicode NFKC normalization.",
});
