# Silva – POS Watch (Anomaly Detection)

## Trigger
- "POS watch"
- "check transactions"
- "unusual discounts"
- "refund anomaly"
- "risk transactions"

## Purpose
Monitor and analyze Point-of-Sale data for high-risk patterns (refund spikes, discount abuse, voids, unusual manager overrides) and produce an approval-gated response plan.

## Safety Rules (must follow)
- Always ask approval before connecting to live POS systems or pulling new data.
- Never change POS data or perform reversals.
- Keep analysis outputs to aggregates and red-flag summaries unless specific receipts are provided by the user.

## Inputs
- Data source: file path (CSV/JSON) or a local endpoint URL
- Time window
- Store/terminal identifiers (if available)

## Detection Heuristics (baseline)
- Large or repeated refunds
- Discounts above threshold (e.g., >30%)
- Excessive voids
- Out-of-hours transactions
- Rapid-fire transactions by the same cashier
- Manual price overrides

## Workflow
1) Confirm data source and time window.
2) Ask approval to read/pull the data.
3) Analyze and produce:
   - anomalies list with reasons
   - metrics summary and thresholds used
   - next actions (investigation checklist)
4) Ask approval before any outreach or escalation messages.

## Output Format
- Metrics Summary
- Red Flags
- Investigation Checklist
- Approval Queue
