import assert from "node:assert/strict";
import test from "node:test";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { createMentionAutocomplete } from "../src/autocomplete.ts";

test("completion filters mentions, qualifies collisions, and preserves native file completion", async () => {
  const nativeSuggestion = { items: [{ value: "src/index.ts", label: "index.ts" }], prefix: "@src" };
  const native: AutocompleteProvider = {
    getSuggestions: async () => nativeSuggestion,
    applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
    shouldTriggerFileCompletion: () => true,
  };
  const provider = createMentionAutocomplete(native, async () => [
    { name: "oracle", type: "agent", description: "Architecture" },
    { name: "reviewer", type: "agent" },
    { name: "reviewer", type: "skill" },
    { name: "go-review", type: "skill" },
  ]);
  const options = { signal: new AbortController().signal };
  const suggest = (text: string) => provider.getSuggestions([text], 0, text.length, options);
  const all = await suggest("Fix using @");
  assert.equal(all?.items.length, 4);
  assert.ok(provider.triggerCharacters?.includes("@"));
  assert.equal(provider.shouldTriggerFileCompletion?.([""], 0, 0), true);
  const oracle = await suggest("Use @ora");
  assert.equal(oracle?.prefix, "@ora");
  assert.deepEqual(oracle?.items.map((item) => item.value), ["@oracle"]);
  assert.match(oracle!.items[0].description!, /agent.*Architecture/);
  assert.deepEqual((await suggest("@rev"))?.items.map((item) => item.value), ["@agent:reviewer", "@skill:reviewer"]);
  assert.deepEqual((await suggest("@skill:rev"))?.items.map((item) => item.value), ["@skill:reviewer"]);
  for (const text of ["@src/index", "foo@example", "https://example.com/@ora", "@does-not-exist"]) {
    assert.equal(await suggest(text), nativeSuggestion);
  }
  assert.deepEqual(provider.applyCompletion(["Use @ora"], 0, 8, oracle!.items[0], "@ora"), {
    lines: ["Use @oracle "], cursorLine: 0, cursorCol: 12,
  });
  assert.deepEqual(provider.applyCompletion(["Use @ora."], 0, 8, oracle!.items[0], "@ora").lines, ["Use @oracle."]);
  assert.deepEqual(provider.applyCompletion(["Use @ora now"], 0, 8, oracle!.items[0], "@ora").lines, ["Use @oracle now"]);
  assert.deepEqual(provider.applyCompletion(["@src"], 0, 4, nativeSuggestion.items[0], "@src").lines, ["@src"]);
  const cancelled = new AbortController();
  cancelled.abort();
  assert.equal(await provider.getSuggestions(["@"], 0, 1, { signal: cancelled.signal }), null);
});
