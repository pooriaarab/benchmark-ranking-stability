import type { Task } from "benchmark-core";

export interface ReportBucket { tasks: number; mean: number }
export interface ReportBreakdown { byFamily: Record<string, ReportBucket>; byVariant: Record<string, ReportBucket> }

function pack(map: Map<string, number[]>): Record<string, ReportBucket> {
  return Object.fromEntries([...map.entries()].sort().map(([key, scores]) => [key, { tasks: scores.length, mean: scores.reduce((sum, score) => sum + score, 0) / scores.length }]));
}

export function reportBreakdown(report: { rows: { taskId: string; score: number }[] }, tasks: readonly Task[]): ReportBreakdown {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const families = new Map<string, number[]>(); const variants = new Map<string, number[]>();
  const add = (map: Map<string, number[]>, key: string, score: number) => map.set(key, [...(map.get(key) ?? []), score]);
  for (const row of report.rows) {
    const task = byId.get(row.taskId);
    const family = task?.metadata?.family;
    const variant = task?.metadata?.variant ?? row.taskId.match(/-v(\d+)$/)?.[1];
    add(families, typeof family === "string" ? family : "untracked", row.score);
    add(variants, variant !== undefined ? `v${variant}` : "untracked", row.score);
  }
  return { byFamily: pack(families), byVariant: pack(variants) };
}
