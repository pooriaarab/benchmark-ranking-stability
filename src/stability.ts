import { readFile, writeFile } from "node:fs/promises";
import { mulberry32 } from "benchmark-core";

interface ReportRow { taskId: string; score: number }
interface Report { model: string; rows: ReportRow[] }
export interface StabilityOptions { seed?: number; resamples?: number; svgPath?: string }
export interface ModelStability { model: string; mean: number; rank: number; probabilityFirst: number; rankInterval95: { low: number; high: number } }
export interface VariantRanking { variant: number; rankings: { model: string; mean: number; rank: number }[] }
export interface PromptSensitivity { variants: number[]; perVariant: VariantRanking[]; rankRange: { model: string; low: number; high: number }[] }
export interface StabilityResult { seed: number; resamples: number; reports: number; sharedTasks: number; sharedItems: number; meanKendallTau: number; models: ModelStability[]; promptSensitivity?: PromptSensitivity; warnings: string[]; volatilityChart: string }

export const MIN_SHARED_TASKS = 30;
const VARIANT = /^(.*)-v(\d+)$/;

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
  const count = Math.max(1, models.length);
  const rowStep = Math.min(70, (630 - 190) / count);
  const fontSize = Math.min(24, rowStep * 0.55);
  const left = 300; const right = 1050;
  const step = count > 1 ? Math.min(140, (right - left) / (count - 1)) : 0;
  const x = (rank: number) => count > 1 ? left + (rank - 1) * step : (left + right) / 2;
  const rows = models.map((model, index) => {
    const y = 140 + index * rowStep;
    return `<text x="60" y="${y + fontSize * 0.35}" font-size="${fontSize}">${escape(model.model)}</text><line x1="${x(model.rankInterval95.low)}" y1="${y}" x2="${x(model.rankInterval95.high)}" y2="${y}" stroke="#ffb000" stroke-width="${Math.min(12, rowStep * 0.3)}" stroke-linecap="round"/><circle cx="${x(model.rank)}" cy="${y}" r="${Math.min(8, rowStep * 0.2)}" fill="#13213c"/><text x="1050" y="${y + fontSize * 0.3}" text-anchor="end" font-size="${Math.min(20, fontSize)}">${(model.probabilityFirst * 100).toFixed(1)}% first</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f7f3e8"/><g font-family="system-ui,sans-serif" fill="#13213c"><text x="60" y="60" font-size="38" font-weight="700">Ranking volatility</text><text x="60" y="95" font-size="20">Dot: baseline rank · line: bootstrap 95% interval</text>${rows}</g></svg>`;
}
function meanOver(report: Report, lookup: Map<Report, Map<string, number>>, ids: string[]): number {
  const scores = lookup.get(report)!;
  return ids.reduce((sum, id) => sum + scores.get(id)!, 0) / ids.length;
}
function promptSensitivity(models: string[], groups: Map<string, Report[]>, lookup: Map<Report, Map<string, number>>, taskIds: string[]): PromptSensitivity | undefined {
  const byVariant = new Map<number, string[]>();
  for (const id of taskIds) {
    const variant = id.match(VARIANT)?.[2];
    if (variant === undefined) continue;
    const key = Number(variant); byVariant.set(key, [...(byVariant.get(key) ?? []), id]);
  }
  const variants = [...byVariant.keys()].sort((a, b) => a - b);
  if (variants.length < 2) return undefined;
  const perVariant = variants.map((variant) => {
    const ids = byVariant.get(variant)!;
    const means = models.map((model) => {
      const runs = groups.get(model)!;
      return runs.reduce((total, report) => total + meanOver(report, lookup, ids), 0) / runs.length;
    });
    const variantRanks = ranks(means);
    return { variant, rankings: models.map((model, index) => ({ model, mean: means[index]!, rank: variantRanks[index]! })).sort((a, b) => a.rank - b.rank || a.model.localeCompare(b.model)) };
  });
  const rankRange = models.map((model) => {
    const seen = perVariant.map((entry) => entry.rankings.find((ranking) => ranking.model === model)!.rank);
    return { model, low: Math.min(...seen), high: Math.max(...seen) };
  });
  return { variants, perVariant, rankRange };
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
  const items = new Map<string, string[]>();
  for (const id of taskIds) {
    const item = id.match(VARIANT)?.[1] ?? id;
    items.set(item, [...(items.get(item) ?? []), id]);
  }
  const clusters = [...items.values()];
  const lookup = new Map(reports.map((report) => [report, new Map(report.rows.map((row) => [row.taskId, row.score]))]));
  const means = models.map((model) => groups.get(model)!.reduce((total, report) => total + taskIds.reduce((sum, id) => sum + lookup.get(report)!.get(id)!, 0) / taskIds.length, 0) / groups.get(model)!.length);
  const baselineRanks = ranks(means); const seed = options.seed ?? 20261015; const resamples = options.resamples ?? 2000;
  if (!Number.isInteger(seed) || !Number.isInteger(resamples) || resamples < 100 || resamples > 100_000) throw new Error("Seed must be an integer and resamples must be from 100 to 100000.");
  const warnings: string[] = [];
  if (taskIds.length < MIN_SHARED_TASKS) warnings.push(`Only ${taskIds.length} shared tasks (< ${MIN_SHARED_TASKS}); rank intervals, first-place probabilities, and tau are unreliable at this size.`);
  if (clusters.length < MIN_SHARED_TASKS) warnings.push(`Only ${clusters.length} shared items (< ${MIN_SHARED_TASKS}); the bootstrap resamples items, so a low item count means the resamples barely vary.`);
  if ([...groups.values()].every((runs) => runs.length === 1)) warnings.push("Each model has a single run; resampling covers the task sample but not run-to-run variation.");
  if (resamples < 500) warnings.push("Fewer than 500 resamples; the tails of the rank intervals are noisy.");
  const random = mulberry32(seed); const sampledRanks = models.map(() => [] as number[]); const firstCounts = models.map(() => 0); let tau = 0;
  for (let sample = 0; sample < resamples; sample++) {
    const draw = Array.from({ length: clusters.length }, () => clusters[Math.floor(random() * clusters.length)]!);
    let drawnTasks = 0; for (const cluster of draw) drawnTasks += cluster.length;
    const sampledMeans = models.map((model) => {
      const runs = groups.get(model)!; const scores = lookup.get(runs[Math.floor(random() * runs.length)]!)!;
      let total = 0; for (const cluster of draw) for (const id of cluster) total += scores.get(id)!;
      return total / drawnTasks;
    });
    const sampleRanks = ranks(sampledMeans); tau += kendallTauB(baselineRanks, sampleRanks);
    const best = Math.min(...sampleRanks); const winners = sampleRanks.filter((rank) => rank === best).length;
    sampleRanks.forEach((rank, index) => { sampledRanks[index]!.push(rank); if (rank === best) firstCounts[index]! += 1 / winners; });
  }
  const modelStats = models.map((model, index) => ({ model, mean: means[index]!, rank: baselineRanks[index]!, probabilityFirst: firstCounts[index]! / resamples, rankInterval95: { low: quantile(sampledRanks[index]!, 0.025), high: quantile(sampledRanks[index]!, 0.975) } })).sort((a, b) => b.mean - a.mean || a.model.localeCompare(b.model));
  const svgPath = options.svgPath ?? "volatility.svg"; await writeFile(svgPath, renderVolatilityChart(modelStats));
  const sensitivity = promptSensitivity(models, groups, lookup, taskIds);
  return { seed, resamples, reports: reports.length, sharedTasks: taskIds.length, sharedItems: clusters.length, meanKendallTau: tau / resamples, models: modelStats, ...(sensitivity ? { promptSensitivity: sensitivity } : {}), warnings, volatilityChart: svgPath };
}
