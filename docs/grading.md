# Grading and stability statistics

## Task grader

Each Mode B task has one generated answer. The grader normalizes the submission before comparing:

- One surrounding code fence is stripped.
- The last balanced `{...}` JSON object is used when one is present; keys named `answer`, `result`, `final`, `value`, or `output` (or a single-key object) supply the answer.
- Text is normalized for case, Unicode form (NFKC), whitespace, quotes, and trailing punctuation.
- Numeric keys compare the last number in the answer; `$`, `,`, `%`, and currency symbols are ignored, so `42`, `$42.00`, and `42 dollars` agree.
- Ordering tasks carry `metadata.options`; the pass check takes the last option name mentioned, so `Ari finished first.` and `The winner is Ari` both score.
- Empty or non-string answers score 0.

Ways this grader can fail:

- A leaked public answer key can turn recall into an apparent reasoning success. The hidden split (`hid-` prefix, unpublished seed) exists for that reason; keep it outside version control.
- Prose that mentions the expected value for the wrong reason still scores. The last-mention rule also credits a guess that happens to land on the key.
- Numbers embedded in a longer explanation are read as the answer; a trailing value is assumed final.
- Generator mistakes become authoritative until a human reviews the task diff.
- The six synthetic families cover only a narrow slice of reasoning.
- MCP `score_answer.submission` is an open object schema in benchmark-core, so OpenAI strict tool mode may reject it; the shape is documented upstream, not here.

The E2E gate submits empty text, constant answers, a refusal, a repeated tool call, and a first-name heuristic to every task. Each policy must remain below 0.10 mean score. A direct answer-key policy must score 1.00.

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
