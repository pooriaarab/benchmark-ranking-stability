# Ranking Stability provenance

This file is generated from the benchmark definition.

## Seeded synthetic reasoning bank (Mode B; Mode A uses only user-supplied reports)

- Kind: `synthetic`
- URL: https://github.com/pooriaarab/benchmark-ranking-stability/blob/main/scripts/gen-tasks.mjs
- Licence: `MIT`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Run `node scripts/gen-tasks.mjs --seed 20261015 --split public`. Mode A reads the RunReport files supplied on its command line and downloads no data.
- Contamination notes: The 300 public prompt variants use seed 20261015 and are visible in the package. The hidden split uses the `hid-` id prefix and an unpublished default seed; keep its seed and file outside version control.
- Refresh: Quarterly, choose a new seed, generate both splits, review the public JSONL diff, and keep the hidden seed and file outside version control.
