import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { MentionTarget } from "./resolver.ts";

export function discoverSkills(pi: ExtensionAPI): MentionTarget[] {
  // Session catalog already includes global, project, package, and CLI-added skills,
  // with Pi's exclusions, trust decisions, and collision precedence applied.
  return pi.getCommands()
    .filter((command) => command.source === "skill" && command.name.startsWith("skill:"))
    .map((command) => ({
      name: command.name.slice("skill:".length),
      type: "skill",
      description: command.description,
      filePath: command.sourceInfo.path,
    }));
}
