import { readFile, writeFile } from "node:fs/promises";
import { mulberry32 } from "benchmark-core";

interface ReportRow { taskId: string; score: number }
interface Report { model: string; rows: ReportRow[] }
export interface StabilityOptions { seed?: number; resamples?: number; svgPath?: string }
export interface ModelStability { model: string; mean: number; rank: number; probabilityFirst: number; rankInterval95: { low: number; high: number } }
export interface StabilityResult { seed: number; resamples: number; reports: number; sharedTasks: number; meanKendallTau: number; models: ModelStability[]; volatilityChart: string }

function parseReport(value: unknown, source: string): Report {
  if (!value || typeof value !== "object") throw new Error(`${source}: report must be an object.`);
  const raw = value as Record<string, unknown>;
  if (typeof raw.model !== "string" || !Array.isArray(raw.rows)) throw new Error(`${source}: model and rows are required.`);
  const seen = new Set<string>();
  const rows = raw.rows.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`${source}: row ${index} is invalid.`);
    const row = value as Record<string, unknown>;
    if (typeof row.taskId !== "string" || typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0 || row.score > 1) throw new Error(`${source}: row ${index} needs a taskId and score from 0 to 1.`);
    if (seen.has(row.taskId)) throw new Error(`${source}: duplicate task ${row.taskId}.`);
    seen.add(row.taskId); return { taskId: row.taskId, score: row.score };
  });
  if (!rows.length) throw new Error(`${source}: report has no rows.`);
  return { model: raw.model, rows };
}
function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value || a.index - b.index);
  const result = Array(values.length).fill(0) as number[];
  for (let start = 0; start < order.length;) {
    let end = start + 1; while (end < order.length && order[end]?.value === order[start]?.value) end++;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index++) result[order[index]!.index] = rank;
    start = end;
  }
  return result;
}
export function kendallTauB(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length < 2) throw new Error("Kendall tau needs equal arrays with at least two values.");
  let concordant = 0; let discordant = 0; let tiedLeft = 0; let tiedRight = 0;
  for (let a = 0; a < left.length; a++) for (let b = a + 1; b < left.length; b++) {
    const x = Math.sign(left[a]! - left[b]!); const y = Math.sign(right[a]! - right[b]!);
    if (x === 0 && y !== 0) tiedLeft++; else if (y === 0 && x !== 0) tiedRight++;
    else if (x * y > 0) concordant++; else if (x * y < 0) discordant++;
  }
  const denominator = Math.sqrt((concordant + discordant + tiedLeft) * (concordant + discordant + tiedRight));
  return denominator === 0 ? (left.every((value, index) => value === right[index]) ? 1 : 0) : (concordant - discordant) / denominator;
}
function quantile(values: number[], probability: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * probability))]!;
}
function escape(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!); }
export function renderVolatilityChart(models: ModelStability[]): string {
  const rows = models.map((model, index) => {
    const y = 135 + index * 70; const x1 = 300 + (model.rankInterval95.low - 1) * 140; const x2 = 300 + (model.rankInterval95.high - 1) * 140;
    return `<text x="60" y="${y + 7}" font-size="24">${escape(model.model)}</text><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#ffb000" stroke-width="12" stroke-linecap="round"/><circle cx="${300 + (model.rank - 1) * 140}" cy="${y}" r="8" fill="#13213c"/><text x="1050" y="${y + 7}" text-anchor="end" font-size="20">${(model.probabilityFirst * 100).toFixed(1)}% first</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f7f3e8"/><g font-family="system-ui,sans-serif" fill="#13213c"><text x="60" y="60" font-size="38" font-weight="700">Ranking volatility</text><text x="60" y="95" font-size="20">Dot: baseline rank · line: bootstrap 95% interval</text>${rows}</g></svg>`;
}
export async function scoreStabilityFiles(paths: string[], options: StabilityOptions = {}): Promise<StabilityResult> {
  if (paths.length < 2) throw new Error("Provide at least two RunReport files.");
  const reports = await Promise.all(paths.map(async (path) => parseReport(JSON.parse(await readFile(path, "utf8")) as unknown, path)));
  const groups = new Map<string, Report[]>();
  for (const report of reports) groups.set(report.model, [...(groups.get(report.model) ?? []), report]);
  if (groups.size < 2) throw new Error("Reports must contain at least two model names.");
  const models = [...groups.keys()].sort();
  const shared = reports.map((report) => new Set(report.rows.map((row) => row.taskId))).reduce((left, right) => new Set([...left].filter((id) => right.has(id))));
  const taskIds = [...shared].sort(); if (!taskIds.length) throw new Error("Reports have no shared task IDs.");
  const lookup = new Map(reports.map((report) => [report, new Map(report.rows.map((row) => [row.taskId, row.score]))]));
  const means = models.map((model) => groups.get(model)!.reduce((total, report) => total + taskIds.reduce((sum, id) => sum + lookup.get(report)!.get(id)!, 0) / taskIds.length, 0) / groups.get(model)!.length);
  const baselineRanks = ranks(means); const seed = options.seed ?? 20261015; const resamples = options.resamples ?? 2000;
  if (!Number.isInteger(seed) || !Number.isInteger(resamples) || resamples < 100 || resamples > 100_000) throw new Error("Seed must be an integer and resamples must be from 100 to 100000.");
  const random = mulberry32(seed); const sampledRanks = models.map(() => [] as number[]); const firstCounts = models.map(() => 0); let tau = 0;
  for (let sample = 0; sample < resamples; sample++) {
    const sampledMeans = models.map((model) => {
      const runs = groups.get(model)!; const report = runs[Math.floor(random() * runs.length)]!; const scores = lookup.get(report)!;
      let total = 0; for (let index = 0; index < taskIds.length; index++) total += scores.get(taskIds[Math.floor(random() * taskIds.length)]!)!;
      return total / taskIds.length;
    });
    const sampleRanks = ranks(sampledMeans); tau += kendallTauB(baselineRanks, sampleRanks);
    const best = Math.min(...sampleRanks); const winners = sampleRanks.filter((rank) => rank === best).length;
    sampleRanks.forEach((rank, index) => { sampledRanks[index]!.push(rank); if (rank === best) firstCounts[index]! += 1 / winners; });
  }
  const modelStats = models.map((model, index) => ({ model, mean: means[index]!, rank: baselineRanks[index]!, probabilityFirst: firstCounts[index]! / resamples, rankInterval95: { low: quantile(sampledRanks[index]!, 0.025), high: quantile(sampledRanks[index]!, 0.975) } })).sort((a, b) => b.mean - a.mean || a.model.localeCompare(b.model));
  const svgPath = options.svgPath ?? "volatility.svg"; await writeFile(svgPath, renderVolatilityChart(modelStats));
  return { seed, resamples, reports: reports.length, sharedTasks: taskIds.length, meanKendallTau: tau / resamples, models: modelStats, volatilityChart: svgPath };
}
