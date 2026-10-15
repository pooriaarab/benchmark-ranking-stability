# Working on benchmark-ranking-stability

## Commands

- Install with `npm ci`.
- Run the full gate with `npm run ci:local`.
- Generate public tasks with `node scripts/gen-tasks.mjs --seed 20261015 --split public`.
- Generate an ignored hidden split with `node scripts/gen-tasks.mjs --seed N --split hidden`.
- Generate provenance after building with `npm run provenance`.
- Analyze reports with `node dist/cli.js score-stability a.json b.json`.
- Add no unit tests. Extend `scripts/e2e.mjs` through a public surface.

## Contracts

Keep the 60 underlying items and five prompt variants in sync. Do not edit generated JSON Lines by hand. Keep private split seeds and files outside version control.

The task grader must remain deterministic. Update `docs/grading.md` before changing scoring behavior or statistics. The E2E weak-answer policies must stay below 0.10.

Mode A must read only files supplied by the caller. Never read provider keys from repository files. OpenRouter uses `OPENROUTER_API_KEY`; OpenAI-compatible providers use `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

Open an issue before a branch. Use `brnk-<issue>-<slug>` and `[brnk-<issue>] Imperative subject`. Keep pull requests below 500 counted lines. Do not merge your own pull request or push `release`.
