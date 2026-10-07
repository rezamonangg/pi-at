import { parseMentions, type Mention } from "./parser.ts";

export type MentionTarget = {
  name: string;
  type: "agent" | "skill";
  description?: string;
  filePath?: string;
};

export type Resolution =
  | { status: "resolved"; target: MentionTarget }
  | { status: "unknown"; mention: string }
  | { status: "ambiguous"; mention: string; candidates: MentionTarget[] };

export function resolveMention(mention: string | Mention, targets: MentionTarget[]): Resolution {
  const parsed = typeof mention === "string" ? parseMentions(mention)[0] : mention;
  const raw = typeof mention === "string" ? mention : mention.raw;
  if (!parsed || parsed.raw !== raw) return { status: "unknown", mention: raw };
  const matches = targets.filter((target) =>
    target.name === parsed.name && (!parsed.type || target.type === parsed.type),
  );
  if (matches.length === 0) return { status: "unknown", mention: raw };
  if (matches.length > 1) return { status: "ambiguous", mention: raw, candidates: matches };
  return { status: "resolved", target: matches[0] };
}

export function expandMentions(text: string, targets: MentionTarget[]): { text: string; warnings: string[] } {
  const mentions = parseMentions(text);
  if (mentions.length === 0) return { text, warnings: [] };
  const resolved = mentions.map((mention) => resolveMention(mention, targets));
  const warnings = resolved.flatMap((result) => {
    if (result.status === "unknown") return [`Unknown Pi mention: ${result.mention}`];
    if (result.status === "ambiguous") {
      const choices = result.candidates.map((target) => `@${target.type}:${target.name}`).join(" or ");
      return [`Ambiguous Pi mention: ${result.mention}. Use ${choices}.`];
    }
    return [];
  });
  if (warnings.length) {
    return {
      text: `Pi mention resolution failed:\n${warnings.join("\n")}\nAsk the user to clarify before executing this request. Do not guess or delegate unresolved mentions.\n\nOriginal user request (unchanged):\n${text}`,
      warnings,
    };
  }

  const ordered = resolved.flatMap((result) => result.status === "resolved" ? [result.target] : []);
  const agents = ordered.filter((target) => target.type === "agent");
  const skills = ordered.filter((target, index) => target.type === "skill" &&
    ordered.findIndex((other) => other.type === "skill" && other.name === target.name) === index,
  );
  const instructions = ["Pi @ mentions — explicit user instructions:"];
  if (agents.length) {
    instructions.push(
      "The user explicitly requests delegation, not a recommendation to work locally. Use the existing pi-subagents tool for every requested agent task; do not replace it with main-session work or another runtime.",
      `Agent mentions in textual order: ${agents.map((target) => JSON.stringify(target.name)).join(" -> ")}.`,
      "Preserve the task clauses and ordering in the original request. Unless the user explicitly requests parallel work, execute these delegations sequentially, wait for each result, and pass its relevant output to the next requested agent. Repeated mentions remain repeated requests.",
      "Follow pi-subagents' existing discovery, availability, safety, workflow, and context rules. If an agent cannot run, report the blocker rather than silently substituting it.",
    );
  }
  for (const [index, skill] of skills.entries()) {
    instructions.push(index === 0
      ? `Apply the ${JSON.stringify(skill.name)} skill loaded by Pi's native /skill command to this request.`
      : `Before doing the task, load and apply the existing Pi skill ${JSON.stringify(skill.name)} by reading ${JSON.stringify(skill.filePath)}. Resolve its resource references relative to that skill file's directory.`);
  }
  const expanded = `${instructions.join("\n")}\n\nOriginal user request (unchanged):\n${text}`;
  // Pi expands one leading skill command after the input hook, using its own loader.
  return { text: skills.length ? `/skill:${skills[0].name} ${expanded}` : expanded, warnings: [] };
}
