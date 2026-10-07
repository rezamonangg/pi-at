import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import type { MentionTarget } from "./resolver.ts";

export function createMentionAutocomplete(
  current: AutocompleteProvider,
  getTargets: () => Promise<MentionTarget[]>,
): AutocompleteProvider {
  return {
    triggerCharacters: [...new Set([...(current.triggerCharacters ?? []), "@"])],
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const prefix = beforeCursor.match(/(?:^|[\s([{"'`])(@(?:(?:agent|skill):)?[A-Za-z0-9_/-]*)$/)?.[1];
      if (prefix === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);
      const targets = await getTargets();
      if (options.signal.aborted) return null;
      const items = targets.flatMap((target) => {
        const qualified = `@${target.type}:${target.name}`;
        const collision = targets.some((other) => other.name === target.name && other.type !== target.type);
        const value = prefix.includes(":") || collision || target.name.includes("/") ? qualified : `@${target.name}`;
        return value.startsWith(prefix) || (!prefix.includes(":") && `@${target.name}`.startsWith(prefix))
          ? [{ value, label: value, description: `${target.type}${target.description ? ` — ${target.description}` : ""}` }]
          : [];
      });
      // Unknown tokens keep Pi's existing file autocomplete.
      return items.length ? { items, prefix } : current.getSuggestions(lines, cursorLine, cursorCol, options);
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      // Pi's built-in @ completion expects file values WITHOUT @; ours include it.
      if (!item.value.startsWith("@")) return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      const line = lines[cursorLine] ?? "";
      const before = line.slice(0, cursorCol - prefix.length);
      const after = line.slice(cursorCol);
      const space = after === "" || /^\S/.test(after) && !/^[,.;!?)}\]]/.test(after) ? " " : "";
      const updated = [...lines];
      updated[cursorLine] = before + item.value + space + after;
      return { lines: updated, cursorLine, cursorCol: before.length + item.value.length + space.length };
    },
    shouldTriggerFileCompletion: current.shouldTriggerFileCompletion?.bind(current),
  };
}
