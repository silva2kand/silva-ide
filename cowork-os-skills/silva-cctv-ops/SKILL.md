# Silva – CCTV Ops (Snapshots + Monitoring)

## Trigger
- "CCTV snapshot"
- "check camera"
- "dvr snapshot"
- "motion check"
- "person detection"

## Purpose
Operate a CCTV workflow in a privacy-sensitive, approval-gated way. Prefer read-only snapshots and analysis. Integrates with a local snapshot proxy when available.

## Safety Rules (must follow)
- Always ask approval before capturing any camera snapshots or reviewing CCTV frames.
- Never share CCTV imagery externally.
- Keep outputs limited to incident summaries, timestamps, and actions required.

## Integration (if available)
If a local DVR snapshot proxy is running, it commonly exposes:
- http://127.0.0.1:12090/dvr/snapshot?channel=<N>

## Workflow
1) Ask which channel(s) and what time window.
2) Ask approval to capture snapshots.
3) If approved:
   - Download snapshot(s) to workspace evidence folder.
   - Summarize what is visible and any anomalies.
4) If the snapshot proxy is not running:
   - Provide a checklist to start/verify the local service.
5) For motion/person detection:
   - Propose a monitoring plan and thresholds.
   - Ask approval before enabling any continuous monitoring.

## Output Format
- Snapshot Plan
- Findings
- Incident Summary
- Approval Queue
