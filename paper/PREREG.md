# Ranking stability study plan

This plan precedes collection. Source inspection is complete; no study results exist.
This is a local git preregistration, not an independent public registration.
The user prohibits publication to a registry or venue.

## Questions and hypotheses
H1: The answer-key control scores above every weak policy. This validates a ceiling, not reasoning ability.
H2: In simulated populations, the designated leader's mean bootstrap first-place share increases with its probability gap.
H3: In simulated populations, adding equal-ability rivals reduces the designated leader's first-place share.
All hypotheses are descriptive. Report nulls and reversals. No significance tests or post hoc cell selection.

## Design and sampling
Run the full public suite through the public run function with empty, zero, forty-two, echo, refusal, first-number, last-number, and answer-key policies.
Use one independent repeat for each policy and the packaged mock with seed 1. Record actual reports and semantic hashes.
No human baseline. No learned models. Free hosted inference is not configured for this study; availability is not probed.
Use zero retries and zero API spending. Exclude no scored task. Infrastructure errors abort the study rather than become failures.

The extra experiment is explicitly SIMULATED: populations of 2, 4, and 8 synthetic agents; leader probability gaps 0, 0.05, and 0.15.
Rivals have correctness probability 0.55, the designated leader 0.55 plus the gap.
For seeds 1 through 12, generate three runs per agent. Draw one independent uniform value per item, agent, and run.
Copy each item's correctness to its five prompt variants. Correct submissions use the answer key; wrong submissions use empty text.
Use mulberry32(seed) for each cell, holding the sequence across gap conditions for paired comparisons.
Each simulated report passes through the actual runner and grader. Pass all reports to scoreStabilityFiles with seed 7 and 500 draws.
These choices model complete within-item correlation and independent agent/run errors. They do not model learned-agent behavior.

A paired control ablation uses the same simulated reports for population 2, gap 0.05, at every seed.
Rename task IDs to remove variant suffixes, then repeat analysis. This intentionally treats correlated prompts as independent items.
It changes the analysis only. Record rank widths and leader first-place shares for both analyses.
One simulated prompt control uses two agents: one correct only on variants 1 and 2, another correct only on variants 3, 4, and 5.
An exact-tie control duplicates the answer-key report with two model names. It should split first place and retain tied ranks.

## Metrics and uncertainty
Report each policy's mean score using item-cluster bootstrap intervals (2,000 draws, seed 20261029).
Also report Wilson intervals for all-variants-correct item success, including boundary policies.
Do not treat 300 prompt rows as 300 independent observations. Use all 60 item clusters.
For each simulated cell, bootstrap the 12 independent seed summaries for mean leader share, mean tau-b, and mean rank width.
Use paired seed resampling for gap contrasts and the cluster-removal ablation. No individual fractional tie share gets a binomial interval.
These intervals describe simulation replication means, not model-population coverage. Rank intervals are conditional percentile ranges.
Report fixed design counts without intervals. Repeat runs do not increase the effective task sample.

## Failure checks and artifacts
Before implementation: anticipate accidental key exposure to weak policies, loss of item pairing, cost leakage, unstable repeats, and stale generated prose.
Reject runner errors and nonzero costs; give weak policies only prompt text; assert repeat semantic equality and raw-to-summary agreement.
Verify frozen source hashes, identical template hashes, metadata bounds, PDF pages, figure inputs, and finite statistics.
Save full primary policy reports, repeat reports, simulated minimal reports, analysis outputs, summary, hashes, and figure CSV files.
Produce policy, population, and ablation figures. Do not manually type results into the paper.
Stop after the fixed grid. Report every cell. No adaptive model selection or tuning.

## Deviations
None at registration. Record changes here before affected runs.
