import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import piAt from "../src/index.ts";
import { discoverAgents } from "../src/agents.ts";
import { discoverSkills } from "../src/skills.ts";

test("input hook discovers the loaded extension, preserves images, and routes only user input", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-at-"));
  try {
    await mkdir(join(root, "src/agents"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "pi-subagents", version: "0.76.1", type: "module" }));
    await writeFile(join(root, "src/agents/agents.js"), `
      export function discoverAgents(cwd, scope, provider) {
        if (scope !== "both" || !cwd || provider !== "test") throw Error("Wrong discovery context");
        return { agents: [{ name: "custom-agent", description: "Configured agent" }, { name: "off", disabled: true }], agentDiagnostics: [] };
      }
      export function findBlockingAgentDiagnostic() { return undefined; }
    `);
    const handlers = new Map<string, (event: InputEvent, ctx: ExtensionContext) => Promise<InputEventResult>>();
    const commands = [
      { name: "subagents", source: "extension", sourceInfo: { path: join(root, "index.js") } },
      { name: "skill:local-skill", source: "skill", description: "Project skill", sourceInfo: { path: "/project/.pi/skills/local-skill/SKILL.md" } },
      { name: "oracle", source: "prompt", sourceInfo: { path: "/prompts/oracle.md" } },
    ];
    const pi = {
      on: (name: string, handler: (event: InputEvent, ctx: ExtensionContext) => Promise<InputEventResult>) => handlers.set(name, handler),
      getCommands: () => commands,
    } as unknown as ExtensionAPI;
    const warnings: string[] = [];
    const ctx = { cwd: root, model: { provider: "test" }, mode: "print", ui: { notify: (message: string) => warnings.push(message) } } as unknown as ExtensionContext;
    piAt(pi);
    assert.deepEqual((await discoverAgents(pi, root, "test")).map((target) => target.name), ["custom-agent"]);
    assert.deepEqual(discoverSkills(pi).map((target) => [target.name, target.filePath]), [["local-skill", "/project/.pi/skills/local-skill/SKILL.md"]]);
    const input = handlers.get("input")!;
    const images: InputEvent["images"] = [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }];
    const transformed = await input({ type: "input", text: "@custom-agent inspect", source: "rpc", images }, ctx);
    assert.equal(transformed.action, "transform");
    if (transformed.action === "transform") {
      assert.equal(transformed.images, images);
      assert.match(transformed.text, /existing pi-subagents tool/);
    }
    const skill = await input({ type: "input", text: "@local-skill inspect", source: "interactive" }, ctx);
    assert.equal(skill.action, "transform");
    if (skill.action === "transform") assert.ok(skill.text.startsWith("/skill:local-skill "));
    for (const [text, source] of [["@custom-agent inspect", "extension"], ["ordinary input", "interactive"], ["!echo @custom-agent", "interactive"]] as const) {
      assert.deepEqual(await input({ type: "input", text, source }, ctx), { action: "continue" });
    }
    await input({ type: "input", text: "@missing inspect", source: "rpc" }, ctx);
    assert.equal(warnings.at(-1), "Unknown Pi mention: @missing");
    // An incompatible catalog cannot turn a potentially colliding alias into a skill.
    const incompatible = join(root, "incompatible");
    await mkdir(incompatible);
    await writeFile(join(incompatible, "package.json"), JSON.stringify({ name: "different-extension" }));
    commands[0].sourceInfo.path = join(incompatible, "index.js");
    const failed = await input({ type: "input", text: "@local-skill inspect", source: "rpc" }, ctx);
    assert.equal(failed.action, "transform");
    if (failed.action === "transform") {
      assert.match(failed.text, /pi-at agent discovery failed:/);
      assert.match(failed.text, /Unknown Pi mention: @local-skill/);
      assert.ok(!failed.text.startsWith("/skill:"));
    }
    assert.ok(warnings.some((warning) => warning.startsWith("pi-at agent discovery failed:")));
    commands.splice(0, 1);
    assert.deepEqual(await discoverAgents(pi, root, "test"), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
