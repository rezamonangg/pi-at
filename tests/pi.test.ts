import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

test("real Pi loads the TypeScript extension and natively expands skill mentions without a model call", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-at-sdk-"));
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    const skillDir = join(root, ".pi/skills/native-check");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: native-check\ndescription: Offline integration test\n---\nREAL_SKILL_BODY_MARKER\n");
    const settingsManager = SettingsManager.inMemory({ enableSkillCommands: false });
    const resourceLoader = new DefaultResourceLoader({
      cwd: root,
      agentDir: join(root, "agent"),
      settingsManager,
      noExtensions: true,
      noContextFiles: true,
      noPromptTemplates: true,
      noThemes: true,
      additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    });
    await resourceLoader.reload();
    assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const modelRuntime = await ModelRuntime.create({
      authPath: join(root, "auth.json"), modelsPath: null,
      modelsStorePath: join(root, "models-store.json"), refreshOnCreate: false,
      allowModelNetwork: false,
    });
    ({ session } = await createAgentSession({
      cwd: root, agentDir: join(root, "agent"), settingsManager, resourceLoader,
      modelRuntime, sessionManager: SessionManager.inMemory(), noTools: "all",
    }));
    const errors: string[] = [];
    await session.bindExtensions({ mode: "print", onError: (error) => errors.push(error.error) });
    // Queueing runs the real input/skill-expansion pipeline but never starts a turn.
    await session.steer("@skill:native-check inspect this");
    const queued = session.getSteeringMessages()[0];
    assert.match(queued, /<skill name="native-check"/);
    assert.match(queued, /REAL_SKILL_BODY_MARKER/);
    assert.ok(queued.endsWith("@skill:native-check inspect this"));
    assert.deepEqual(errors, []);
    assert.equal(session.messages.length, 0);
  } finally {
    session?.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
