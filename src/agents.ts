import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { MentionTarget } from "./resolver.ts";

export async function discoverAgents(
  pi: ExtensionAPI, cwd: string, provider?: string,
): Promise<MentionTarget[]> {
  const command = pi.getCommands().find((item) => item.source === "extension" && item.name === "subagents");
  if (!command) return [];
  const root = dirname(command.sourceInfo.path);
  const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (metadata.name !== "pi-subagents") throw new Error("/subagents is not provided by the pi-subagents package");

  // Compatibility adapter: pi-subagents 0.76.1 has no public catalog export.
  // Reuse its exact discovery rules; do not copy directory scanning or config parsing.
  const catalog = await import(pathToFileURL(join(root, "src/agents/agents.js")).href);
  if (typeof catalog.discoverAgents !== "function" || typeof catalog.findBlockingAgentDiagnostic !== "function") {
    throw new Error(`Unsupported pi-subagents discovery API (${metadata.version})`);
  }
  const discovered = catalog.discoverAgents(cwd, "both", provider);
  return discovered.agents
    .filter((agent: { name: string; disabled?: boolean }) => !agent.disabled &&
      !catalog.findBlockingAgentDiagnostic(agent.name, agent, discovered.agentDiagnostics))
    .map((agent: { name: string; description?: string }) => ({
      name: agent.name, type: "agent", description: agent.description,
    }));
}
