# Silva – Local Model Switchboard (Ollama + LM Studio)

## Trigger
- "switch model"
- "what models are available"
- "ollama models"
- "lm studio models"
- "local model switchboard"

## Purpose
Inspect local model servers (Ollama/LM Studio), list available models, and propose a safe switch plan for which model/profile to use.

## Safety Rules (must follow)
- Ask approval before changing any configuration files.
- Do not download models or pull large weights without explicit approval.
- Prefer read-only checks first.

## Checks
- Ollama tags: http://127.0.0.1:11434/api/tags
- LM Studio models: http://127.0.0.1:1234/v1/models

## Workflow
1) Detect which servers are reachable.
2) List available models with ids and sizes where available.
3) Recommend a default and 1–2 fallbacks based on the task:
   - Governor/reasoning
   - Coding
   - Fast research
4) If the user wants to apply a change:
   - Show the exact config change first.
   - Ask approval before writing.

## Output Format
- Server Status
- Available Models
- Recommendation
- Approval Queue
