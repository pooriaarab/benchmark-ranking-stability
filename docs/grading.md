# Grading and stability statistics

## Task grader

Each Mode B task has one generated answer. The grader trims surrounding whitespace and compares the full answer after Unicode normalization. It does not extract a number from prose or accept partial work.

Ways this grader can fail:

- A leaked public answer key can turn recall into an apparent reasoning success.
- Exact matching rejects equivalent formats such as `12.0` for `12`.
- A repeated answer can pass tasks that happen to share that answer.
- Generator mistakes become authoritative until a human reviews the task diff.
- The six synthetic families cover only a narrow slice of reasoning.

The E2E gate submits empty text, random text, `yes`, and one repeated answer to every task. Each policy must remain below 0.10 mean score. A direct answer-key policy must score 1.00.

## Ranking analysis

`score-stability` groups input RunReport rows by model and aligns them by task ID. It computes model means, pairwise Kendall tau-b with tie correction, first-place probabilities, and 95% rank intervals. Bootstrap samples first choose input runs with replacement and then choose shared task IDs with replacement. A fixed seed makes the result reproducible.

Ways the statistics can mislead:

- Small task or run samples produce wide, unstable intervals.
- Missing task IDs reduce the comparison to the intersection.
- Ties make rank order less informative even with tau-b correction.
- Reports from different benchmark versions may not be comparable.
- Bootstrap resampling describes the supplied sample, not all future prompts.
- Correlated prompt variants make uncertainty look smaller than independent tasks would.

The command rejects malformed reports, duplicate task IDs within one report, fewer than two models, no shared tasks, and non-finite scores. Treat the SVG as a diagnostic, not a universal leaderboard.
