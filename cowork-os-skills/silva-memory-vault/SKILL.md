# Silva – Memory Vault (Persistent Context)

## Trigger
- "remember this"
- "save this preference"
- "what do you know about my setup"
- "memory vault"
- "load context"

## Purpose
Maintain durable preferences, rules, and project context across sessions by appending to a workspace-local memory file.

## Safety Rules (must follow)
- Memory is additive; never delete or overwrite entries.
- Never store secrets (passwords, API keys, tokens, private keys).
- Keep memory scoped to the current workspace unless explicitly told otherwise.

## Storage Location
Create (if missing) and use:
- Silva-Memory/agent_memory.json

## Schema (agent_memory.json)
An array of entries:
- id: string
- createdAt: ISO timestamp
- type: preference | rule | project | contact | system | observation
- tags: string[]
- content: string
- source: user | system | derived

## Workflow
1) Determine whether the user request is a memory write, memory read, or both.
2) For writes:
   - Propose the exact memory entry content first.
   - Ask for approval before writing.
   - Append a new entry (do not edit older entries).
3) For reads:
   - Search by tags and keywords.
   - Return the minimal relevant context and link it back to the stored entry ids.

## Output Format
- Proposed Memory Entry (if writing)
- Retrieved Context (if reading)
- Approval Queue (if any)
