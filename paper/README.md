# Ranking stability paper

Run `npm ci`, then `sh paper/template/reproduce.sh` from the repository root.
Use Node 20+, npm, Python 3, Tectonic, and Poppler (`pdfinfo` and `pdftotext`).
The command runs scripted controls and labelled simulations, renders results, builds the PDF, and verifies the packet.
Output: `paper/ranking-stability-paper.pdf`. PDFs and the downloaded style remain untracked.
The unchanged pilot template pins the official NeurIPS style archive hash. First builds can download TeX dependencies.
Experiments use no network, provider credentials, or paid inference. They include no learned-model scores.

The paper measures ranking sensitivity, not honesty. Nine controls run twice through the evaluator.
The simulated sweep varies population and correctness gap. A paired ablation removes item grouping.
Confidence intervals use items for policy scores and independent seeds for simulation summaries.
Raw policy reports, repeat reports, simulated minimal reports, analysis outputs, and source hashes live in `data/`.
Generated files use `.generated.json`, `.generated.csv`, or the `generated/` directory. `meta.json` is generated too.
The local study plan predates results. It is not an independent public registration. All fixed cells and nulls remain reported.
The verifier checks source hashes, raw-to-summary agreement, repeated traces, the full analysis grid, metadata, and PDF content.
The paper and figures use CC-BY-4.0. Software and benchmark tasks retain MIT.
No publication or merge is authorized. The parent handles those steps.
