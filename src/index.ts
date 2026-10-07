import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { discoverAgents } from "./agents.ts";
import { createMentionAutocomplete } from "./autocomplete.ts";
import { parseMentions } from "./parser.ts";
import { expandMentions } from "./resolver.ts";
import { discoverSkills } from "./skills.ts";

export default function piAt(pi: ExtensionAPI) {
  let lastDiscoveryError: string | undefined;
  async function getTargets(ctx: ExtensionContext) {
    const skills = discoverSkills(pi);
    try {
      const agents = await discoverAgents(pi, ctx.cwd, ctx.model?.provider);
      lastDiscoveryError = undefined;
      return [...agents, ...skills];
    } catch (error) {
      const message = `pi-at agent discovery failed: ${error instanceof Error ? error.message : String(error)}`;
      if (message !== lastDiscoveryError) ctx.ui.notify(message, "warning");
      lastDiscoveryError = message;
      // Fail closed: without the agent catalog, short skill aliases might collide.
      return [];
    }
  }

  pi.on("input", async (event, ctx) => {
    // Injected prompts and bash commands are not user delegation requests.
    if (event.source === "extension" || event.text.startsWith("!") || !parseMentions(event.text).length) {
      return { action: "continue" };
    }
    const expanded = expandMentions(event.text, await getTargets(ctx));
    if (lastDiscoveryError) expanded.text = `${lastDiscoveryError}\n\n${expanded.text}`;
    for (const warning of expanded.warnings) ctx.ui.notify(warning, "warning");
    return { action: "transform", text: expanded.text, images: event.images };
  });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui") {
      ctx.ui.addAutocompleteProvider((current) => createMentionAutocomplete(current, () => getTargets(ctx)));
    }
  });
}
