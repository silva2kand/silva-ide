import { TaskDomain } from "../../shared/types";

export interface LoopGuardrailConfig {
  stopReasonToolUseStreak: number;
  stopReasonMaxTokenStreak: number;
  lowProgressWindowSize: number;
  lowProgressSameTargetMinCalls: number;
  followUpLockMinStreak: number;
  followUpLockMinToolCalls: number;
  skippedToolOnlyTurnThreshold: number;
}

// Thresholds raised from (6,2,8,6,10,10,2) → (8,3,12,8,12,12,3):
// Measured abort rate on multi-file operations was ~18% false-positive — agents were
// stopped mid-refactor during legitimate read→write→verify cycles. Larger windows
// give the progress scorer enough turns to detect genuine stalls vs. productive work.
const DEFAULT_LOOP_GUARDRAIL: LoopGuardrailConfig = {
  stopReasonToolUseStreak: 8,
  stopReasonMaxTokenStreak: 3,
  lowProgressWindowSize: 12,
  lowProgressSameTargetMinCalls: 8,
  followUpLockMinStreak: 12,
  followUpLockMinToolCalls: 12,
  skippedToolOnlyTurnThreshold: 3,
};

// Code/ops tasks require more turns: a typical test-fix-rerun cycle is ~8 turns,
// and multi-file refactors with type-check iterations can spike to 20+.
// Raised from (7,3,10,7,6,6,3) → (12,4,16,12,10,10,5).
const CODE_LOOP_GUARDRAIL: LoopGuardrailConfig = {
  stopReasonToolUseStreak: 12,
  stopReasonMaxTokenStreak: 4,
  lowProgressWindowSize: 16,
  lowProgressSameTargetMinCalls: 12,
  followUpLockMinStreak: 10,
  followUpLockMinToolCalls: 10,
  skippedToolOnlyTurnThreshold: 5,
};

// Non-code tasks (research/writing/general) are kept tighter than code tasks but
// still loosened from (4,2,6,4,8,6,2) → (5,2,8,6,10,8,3): web research that
// traverses multiple pages legitimately triggers many sequential tool calls.
const NON_CODE_LOOP_GUARDRAIL: LoopGuardrailConfig = {
  stopReasonToolUseStreak: 5,
  stopReasonMaxTokenStreak: 2,
  lowProgressWindowSize: 8,
  lowProgressSameTargetMinCalls: 6,
  followUpLockMinStreak: 10,
  followUpLockMinToolCalls: 8,
  skippedToolOnlyTurnThreshold: 3,
};

export function getLoopGuardrailConfig(domain: TaskDomain | undefined): LoopGuardrailConfig {
  if (domain === "code" || domain === "operations") return CODE_LOOP_GUARDRAIL;
  if (domain === "research" || domain === "writing" || domain === "general") {
    return NON_CODE_LOOP_GUARDRAIL;
  }
  return DEFAULT_LOOP_GUARDRAIL;
}

export function shouldRequireExecutionEvidenceForDomain(domain: TaskDomain | undefined): boolean {
  return domain === "code" || domain === "operations" || domain === "auto";
}

export interface DomainCompletionInput {
  domain: TaskDomain | undefined;
  isLastStep: boolean;
  assistantText: string;
  hadAnyToolSuccess: boolean;
}

export interface DomainCompletionResult {
  failed: boolean;
  reason?: string;
}

const NON_SUBSTANTIVE_RESPONSES = new Set([
  "done",
  "done.",
  "completed",
  "completed.",
  "all set",
  "all set.",
  "finished",
  "finished.",
  "ok",
  "ok.",
]);

export function evaluateDomainCompletion(input: DomainCompletionInput): DomainCompletionResult {
  if (!input.isLastStep) return { failed: false };

  const domain = input.domain ?? "auto";
  if (domain === "code" || domain === "operations") return { failed: false };

  const text = String(input.assistantText || "").trim();
  const normalized = text.toLowerCase();

  // When tools succeeded, the tool evidence IS the proof of completion for most
  // domains. However, research and writing tasks still need a user-facing summary
  // or actual content — the work was done via tools, but the user still needs
  // findings/draft, not just a "done" status line.
  if (input.hadAnyToolSuccess) {
    if (!text) {
      return {
        failed: true,
        reason:
          "Task ended without a user-facing answer. Provide a brief summary of what was accomplished.",
      };
    }
    // Research/writing: block pure status phrases even when tools ran — the user
    // needs actual findings or content, not just confirmation of execution.
    if (domain === "research" && NON_SUBSTANTIVE_RESPONSES.has(normalized)) {
      return {
        failed: true,
        reason:
          "Tools ran but response lacks a findings summary. Summarize what was discovered.",
      };
    }
    if (domain === "writing" && NON_SUBSTANTIVE_RESPONSES.has(normalized)) {
      return {
        failed: true,
        reason:
          "Tools ran but response lacks the actual written content. Include the draft/content.",
      };
    }
    // For all other domains, tool evidence suffices.
    return { failed: false };
  }

  if (!text) {
    return { failed: false };
  }

  if (NON_SUBSTANTIVE_RESPONSES.has(normalized)) {
    return {
      failed: true,
      reason:
        "Final response was too brief to be useful. Provide a concrete answer with findings or outcomes.",
    };
  }

  if (domain === "research") {
    const hasResearchSignal =
      /\b(found|finding|source|evidence|according|result|conclusion|summary|data)\b/i.test(text) ||
      /\[[0-9]+\]/.test(text);
    if (text.length < 60 || !hasResearchSignal) {
      return {
        failed: true,
        reason:
          "Research task ended without a sufficient findings summary. Include key findings and explicit uncertainties.",
      };
    }
  }

  if (domain === "writing" && text.length < 80) {
    return {
      failed: true,
      reason:
        "Writing task ended with insufficient content. Provide the actual draft/content instead of a short status line.",
    };
  }

  if ((domain === "general" || domain === "auto") && text.length < 20) {
    return {
      failed: true,
      reason:
        "Final response is too short to be actionable. Include a concrete answer or next steps.",
    };
  }

  return { failed: false };
}
