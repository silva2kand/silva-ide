// Shared starter mission templates used across Onboarding and MainContent welcome screen

export interface StarterMission {
  id: string;
  title: string;
  prompt: string;
  icon: string;
  category: "productivity" | "code" | "research" | "writing" | "planning";
}

/**
 * Starter missions shown during onboarding and on the welcome screen.
 * Each mission provides an actionable, one-click task that demonstrates
 * CoWork OS capabilities immediately.
 */
export const STARTER_MISSIONS: StarterMission[] = [
  {
    id: "plan-30min",
    title: "Plan my next 30 minutes",
    prompt:
      "Plan my next 30 minutes. Ask me what I'm working on, then create a focused, realistic schedule with specific tasks and time blocks.",
    icon: "⏱️",
    category: "productivity",
  },
  {
    id: "landing-page",
    title: "Build a landing page",
    prompt:
      "Help me build a landing page for my idea. I'll describe the concept and you'll create a clean HTML/CSS page with a hero section, features list, and call to action.",
    icon: "🚀",
    category: "code",
  },
  {
    id: "competitor-research",
    title: "Research my competitors",
    prompt:
      "Research the top 3-5 competitors in a market I'll describe. For each, find their positioning, key features, pricing, strengths, and weaknesses. Then identify gaps I could exploit.",
    icon: "🔍",
    category: "research",
  },
  {
    id: "autoresearch-report",
    title: "Research a science question",
    prompt:
      "Use the autoresearch-report skill to research a scientific question I give you. Build a scope, gather evidence, and produce a cited report with an uncertainty section and artifact manifest.",
    icon: "🔬",
    category: "research",
  },
  {
    id: "review-commit",
    title: "Review my last commit",
    prompt:
      "Review the most recent Git commit in this workspace. Check for bugs, security issues, code quality, and suggest improvements.",
    icon: "🔎",
    category: "code",
  },
  {
    id: "draft-brief",
    title: "Draft a project brief",
    prompt:
      "Help me draft a project brief. I'll describe the project and you'll create a structured document with goals, scope, timeline, risks, and success criteria.",
    icon: "📋",
    category: "writing",
  },
  {
    id: "novelist",
    title: "Write a novel end-to-end",
    prompt:
      "Use the novelist skill. Build a complete novel pipeline from my seed concept. Create the world bible, characters, outline, voice guide, canon, chapter drafts, revision notes, and final publishable artifacts.",
    icon: "📚",
    category: "writing",
  },
  {
    id: "summarize-pdf",
    title: "Summarize a document",
    prompt:
      "Summarize a document for me. I'll share the file and you'll extract the key points, action items, and decisions into a concise summary.",
    icon: "📄",
    category: "writing",
  },
  {
    id: "weekly-plan",
    title: "Create a weekly plan",
    prompt:
      "Help me create a weekly plan. Ask about my goals, deadlines, and priorities, then build a day-by-day schedule with clear deliverables.",
    icon: "📅",
    category: "planning",
  },
  {
    id: "debug-error",
    title: "Debug an error",
    prompt:
      "Help me debug an error. I'll paste the error message and describe what I was doing, and you'll investigate the root cause and suggest a fix.",
    icon: "🐛",
    category: "code",
  },
  {
    id: "follow-up-email",
    title: "Draft a follow-up email",
    prompt:
      "Help me draft a professional follow-up email. I'll describe the context and recipient, and you'll write something clear, warm, and actionable.",
    icon: "✉️",
    category: "writing",
  },
  {
    id: "focus-today",
    title: "What should I focus on today?",
    prompt:
      "Help me decide what to focus on today. Ask about my current projects, deadlines, and energy level, then recommend my top 3 priorities with reasoning.",
    icon: "🎯",
    category: "planning",
  },
];
