# benchmark-ranking-stability

[![npm](https://img.shields.io/npm/v/benchmark-ranking-stability)](https://www.npmjs.com/package/benchmark-ranking-stability) [![downloads](https://img.shields.io/npm/dm/benchmark-ranking-stability)](https://www.npmjs.com/package/benchmark-ranking-stability) [![license](https://img.shields.io/npm/l/benchmark-ranking-stability)](./LICENSE) [![types](https://img.shields.io/badge/TypeScript-types-3178c6)](#sdk)

[AI Benchmark Index](https://aibenchmarkindex.com/benchmarks/benchmark-ranking-stability) · [npm](https://www.npmjs.com/package/benchmark-ranking-stability) · [SDK](#sdk) · [HTTP API](#http-api) · [MCP](#model-context-protocol)

benchmark-ranking-stability is an open-source model evaluation benchmark. It shows how rankings change across task samples, prompt wording, and repeated runs.

```bash
npx benchmark-ranking-stability run --provider mock --json
```

```json
{"model":"mock:1","mean":0.5,"confidenceInterval95":{"low":0.44333333333333336,"high":0.5566666666666666},"totals":{"tasks":300,"passed":150,"failed":0},"breakdown":{"byFamily":{"multi-step-arithmetic":{"tasks":50,"mean":0.48},"ordering":{"tasks":50,"mean":0.52},"remainder":{"tasks":50,"mean":0.48},"rule-tracing":{"tasks":50,"mean":0.52},"sequence":{"tasks":50,"mean":0.52},"set-counting":{"tasks":50,"mean":0.48}},"byVariant":{"v1":{"tasks":60,"mean":0.5},"v2":{"tasks":60,"mean":0.5},"v3":{"tasks":60,"mean":0.5},"v4":{"tasks":60,"mean":0.5},"v5":{"tasks":60,"mean":0.5}}}}
```

The mock deliberately mixes correct and wrong answers. The 300 public tasks come from a committed seeded generator: 60 reasoning items with five paraphrases each.

Run a real model through OpenRouter:

```bash
OPENROUTER_API_KEY=your_key npx benchmark-ranking-stability run --provider openrouter --model openai/gpt-5-mini --json
```

## Install

Node.js 20 or newer is required.

```bash
npm install benchmark-ranking-stability
```

## Measure ranking stability

Mode A is free and offline. Pass reports from at least two models:

```bash
npx benchmark-ranking-stability score-stability run-a.json run-b.json --seed 7 --svg volatility.svg
```

The command writes JSON statistics and a 1200×630 SVG. Each bootstrap resample draws items once and applies the draw to every model, then picks one run per model, so comparisons stay paired. A fixed seed makes it reproducible.

Mode B runs the included suite. For a real provider, run the same `--model` more than once to collect repeated reports; `score-stability` then resamples run-to-run variation as well as the task sample. The `--seed` flag drives only the bootstrap and the mock's answer pattern — providers never see it, and the mock encodes it in its model id (`mock:N`), so mock runs from different seeds compare as different models, not repeated runs.

## How it works

```text
Mode A: RunReport files -> align task IDs -> bootstrap tasks and runs
                                         -> rank intervals + tau-b + SVG

Mode B: 60 items × 5 prompts -> model -> normalized grader -> RunReport
```

The stability result reports:

- `meanKendallTau`: average agreement between the baseline and resampled rankings. One is stable; lower values mean more movement.
- `probabilityFirst`: the share of resamples where a model ranks first. Tied models split that resample.
- `rankInterval95`: the central 95% of bootstrapped ranks.
- `mean`: the model's mean task score across its supplied reports.
- `promptSensitivity`: per-variant rankings and each model's rank range, present when task IDs carry `-vN` variants.
- `warnings`: conditions that weaken the result, such as fewer than 30 shared tasks, one run per model, or under 500 resamples.
- `sharedItems`: the number of resampled items; paraphrase variants of one item count once.

Read intervals and first-place probabilities together. A small mean gap can coexist with uncertain rank order.

## Why it exists

A leaderboard position can look exact when its underlying task and prompt choices are not. This package makes that sensitivity visible from ordinary benchmark reports.

The implementation builds on [Kendall's treatment of rank ties](https://doi.org/10.1093/biomet/33.3.239) and [Efron's bootstrap](https://doi.org/10.1214/aos/1176344552). It does not claim a new statistical estimator.

## Compare

Checked on 2026-10-15.

| Property | benchmark-ranking-stability | lm-evaluation-harness | Inspect AI | Chatbot Arena |
| --- | --- | --- | --- | --- |
| Main scope | Ranking sensitivity | Model task evaluation | Evaluation framework | Hosted pairwise preference ranking |
| Accepts existing reports | Yes, family RunReport JSON | No family format | No family format | No |
| Seeded rank bootstrap | Tasks and repeated runs | Not this package's workflow | User-defined analysis | Service-defined |
| Included task suite | 300 synthetic prompt variants | Many external tasks | User-selected tasks | User prompts |
| Deployment | Local CLI, SDK, MCP, HTTP | Local runner | Local runner | Managed website |

## Coverage

| Surface | Included behavior |
| --- | --- |
| Offline analysis | Multiple reports per model, shared-task alignment, fixed-seed bootstrap |
| Own suite | 60 items across six reasoning families, five prompt forms each |
| Grading | Deterministic match after fence stripping, last-JSON-object extraction, and case, whitespace, money, and unit normalization |
| Output | JSON statistics and a 1200×630 volatility SVG |
| Runtime | SDK, CLI, Model Context Protocol, and fetch-style HTTP API |

The E2E gate runs all 300 tasks and every HTTP and MCP operation. It also checks weak policies: empty, constants, refusal, a repeated tool call, and a first-name heuristic must each score below 0.10.

## Common use cases

1. **Evaluation teams:** test whether a release winner survives task resampling.
2. **Model teams:** compare prompt variants before publishing a benchmark claim.
3. **Researchers:** attach rank intervals to repeated OpenRouter runs.
4. **Reviewers:** audit a ranking with fixed seeds and local report files.
5. **Benchmark authors:** find task samples that reverse close model rankings.

## Features

- **Two modes:** analyze existing reports or run the included reasoning suite.
- **Reproducible statistics:** fixed seeds control 2,000 bootstrap resamples by default.
- **Tie handling:** Kendall tau-b and average ranks retain tied scores.
- **Inspectable data:** JSON Lines tasks and their generator ship in the package.
- **Adversarial gate:** empty, constant, refusal, repeated-tool-call, and first-name answers must score below 0.10.
- **Shareable output:** volatility and benchmark cards are plain SVG files.

## SDK

```ts
import { benchmark, run, score, scoreStabilityFiles } from "benchmark-ranking-stability";

const result = await scoreStabilityFiles(
  ["run-a.json", "run-b.json"],
  { seed: 7, resamples: 2000, svgPath: "volatility.svg" },
);
```

`benchmark` exposes task metadata. `run(adapter, options)` runs Mode B and attaches a `breakdown` of means by family and variant; pass `options.tasksPath` to run a split file such as `artifacts/hidden-tasks.jsonl`. `createBenchmark({ tasksPath })` binds the task list, `score(taskId, submission)` applies its deterministic grader, and `reportBreakdown(report, tasks)` recomputes the aggregates.

## CLI

The standard commands are `list`, `show`, `run`, `score`, `card`, `provenance`, `index-entry`, `serve`, and `mcp`. This package also adds `score-stability` for Mode A.

Use `run --provider mock` without a key. Use `--provider openrouter` with `OPENROUTER_API_KEY`, or `--provider openai` with `OPENAI_BASE_URL` and `OPENAI_API_KEY`. Add `--tasks <path>` to `list`, `show`, `run`, `score`, `serve`, or `mcp` to work from a split file; `run` and `score` attach a `breakdown` of means by family and variant.

## Model Context Protocol

Start the Model Context Protocol (MCP) server over standard input and output:

```bash
npx benchmark-ranking-stability mcp
```

Its tools are `list_tasks`, `get_task`, `score_answer`, `run_benchmark`, and `get_provenance`. `run_benchmark` returns the report with the same `breakdown`; pass `provider: "mock"` for a keyless offline run, and start the server as `mcp --tasks <path>` to serve a split file.

## HTTP API

Import `handler` from `benchmark-ranking-stability/api`, or call `createApi({ tasksPath })` for a handler bound to a split file. To self-host on Node:

```bash
npx benchmark-ranking-stability serve 3000
```

Routes are `GET /health`, `GET /v1/tasks`, `GET /v1/tasks/:id`, `POST /v1/score`, `GET /v1/provenance`, and `GET /v1/index-entry`.

## Data provenance

`scripts/gen-tasks.mjs` creates all Mode B data under the MIT license. Seed `20261015` reproduces the committed public split.

```bash
node scripts/gen-tasks.mjs --seed 20261015 --split public
node scripts/gen-tasks.mjs --seed YOUR_PRIVATE_SEED --split hidden
```

The hidden command writes `hid-`-prefixed tasks to ignored `artifacts/hidden-tasks.jsonl` and refuses to run without an explicit private `--seed`. Keep the file outside version control and run it with `--tasks artifacts/hidden-tasks.jsonl`. Refreshes happen quarterly after a reviewed public diff.

Mode A downloads no dataset. It reads only the RunReport files named on the command line. See [`data/PROVENANCE.md`](data/PROVENANCE.md) for the machine-aligned record.

## Limits and known weaknesses

- The grader reads the last number or last mentioned option as the answer; a stray trailing value can be misread.
- Public tasks can enter training data. Use a privately seeded split for final claims.
- Five paraphrases of one item are correlated observations, so `score-stability` resamples items, not task rows.
- Small samples and ties can produce wide rank intervals or low-information rankings.
- Reports use the intersection of task IDs. Missing rows can shrink the effective sample.
- Different benchmark versions, graders, or provider settings can invalidate a comparison; 0.1.0 scores are not comparable to 0.2.0.
- The MCP `score_answer` tool declares `submission` as an open object schema in benchmark-core, so OpenAI strict tool mode may reject it.
- Bootstrap results describe the supplied reports. They do not cover every future prompt.
- The synthetic suite covers six compact reasoning families, not broad model quality.

The package has no public leaderboard yet. No real-model results are published because none were run for this release.

## Integration guides

- [Task grading and statistical assumptions](docs/grading.md)
- [Data source and refresh record](data/PROVENANCE.md)
- [TypeScript SDK](#sdk)
- [Model Context Protocol](#model-context-protocol)
- [HTTP API](#http-api)

## Status

Version 0.2.0 is alpha. Schemas and statistical output can change before 1.0. Report defects through [GitHub Issues](https://github.com/pooriaarab/benchmark-ranking-stability/issues).

Public case studies are not yet published.

## FAQ

### What does benchmark-ranking-stability measure?

benchmark-ranking-stability measures rank movement under resampled tasks, repeated runs, and prompt variants. It reports agreement, first-place probability, and rank intervals.

### Can benchmark-ranking-stability analyze another benchmark?

benchmark-ranking-stability accepts RunReport JSON from any package in the benchmark family. Reports need model names, task IDs, and finite scores from zero to one.

### Does benchmark-ranking-stability run offline?

benchmark-ranking-stability runs Mode A and the mock Mode B path without network access. Real model calls need an OpenRouter or OpenAI-compatible endpoint.

### How many reports should I collect?

benchmark-ranking-stability accepts one report per model, but repeated runs let it resample run-to-run variation. More shared tasks and runs usually make the diagnostic more informative.

### How does benchmark-ranking-stability handle ties?

benchmark-ranking-stability assigns average ranks to equal means. First-place ties split probability equally, and ranking agreement uses Kendall tau-b.

### Does benchmark-ranking-stability provide a managed service?

benchmark-ranking-stability provides software you run. The HTTP server is self-hosted and has no built-in authentication.

### Is the included suite a general intelligence test?

benchmark-ranking-stability uses a narrow synthetic suite to expose prompt sensitivity. It does not measure every capability or produce a universal model rank.

### How is benchmark-ranking-stability different from lm-evaluation-harness?

benchmark-ranking-stability focuses on uncertainty in a ranking and can consume existing family reports. lm-evaluation-harness focuses on running a broad task catalog.

### Why is there no public model leaderboard?

benchmark-ranking-stability has no verified real-model runs for version 0.2.0. The project does not invent or extrapolate scores.

## License

[MIT](LICENSE) © Pooria Arab
