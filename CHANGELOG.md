# Changelog

## 0.2.0 - 2026-10-16

Scoring and analysis fixes from an independent deep review. Scores from 0.1.0 are not comparable to 0.2.0.

- Ordering tasks are now generated from the seed: names, clause order, and the winner vary, so the hidden split no longer reproduces the public items and a first-name heuristic falls to chance. Public task data changed.
- The grader strips one code fence, takes the last JSON object, and normalizes case, whitespace, money, and units; ordering answers match the last option name mentioned. Prose-wrapped or reformatted answers score differently than in 0.1.0.
- `score-stability` pairs each bootstrap resample across models and resamples paraphrase items instead of individual task rows. Tau, first-place probabilities, and rank intervals differ from 0.1.0 output.
- New output: `warnings`, `sharedItems`, and `promptSensitivity` in stability results; `breakdown` of means by family and variant on run and score reports.
- New input: `--tasks <path>` on the CLI (including `serve` and `mcp`), `tasksPath` on the SDK `run` and `createApi`, so a hidden split file can be run; `run_benchmark` gains `provider: "mock"` for keyless runs.
- The hidden split uses the `hid-` id prefix and refuses to generate without an explicit private `--seed`. Hidden task metadata no longer carries the seed, so a served task cannot reveal how to regenerate the split, and generation redraws until no hidden question equals a public one.
- Numeric answers compare the first number token, so a trailing check like `81 (check: 2+2=4)` scores correctly.
- `score-stability` also warns when fewer than 30 shared items are available, since the bootstrap resamples items rather than task rows.
