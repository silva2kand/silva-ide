# Silva – Council Mode (Debate + Synthesis)

## Trigger
- "council mode"
- "debate this"
- "get legal and accounting view"
- "multi agent debate"
- "red team this"
- "steelman both sides"

## Purpose
Run a multi-specialist analysis (e.g., Legal + Accounting + Ops/Dev) and return a single, high-accuracy synthesized recommendation with an approval queue for any risky actions.

## Safety Rules (must follow)
- Do not send messages, submit forms, or log into sites without explicit approval and a preview.
- Do not run commands or modify files without explicit approval and a clear plan.
- Treat any CCTV/POS access as sensitive; ask approval before pulling data or snapshots.
- Keep outputs actionable and verifiable; cite sources for claims.

## Workflow
1) Restate the task, constraints, and what a good answer looks like.
2) Create 3–5 specialist roles (pick the minimum that fits):
   - UK Legal
   - Accounting/Finance
   - Ops/Process
   - DevOps/Engineering
   - Risk/Compliance
3) For each role, produce:
   - Key assumptions
   - 5–10 bullet arguments
   - “What could go wrong”
   - What evidence would change the conclusion
4) Cross-examine:
   - Identify conflicts and missing facts
   - Resolve disagreements where possible
5) Synthesize a single recommendation:
   - Decision summary (1 paragraph)
   - Decision matrix (options vs criteria)
   - Next actions (checklist)
   - Approval queue (explicit yes/no items)

## Output Format
- Summary
- Specialist Views
- Conflicts & Resolutions
- Recommendation
- Approval Queue
