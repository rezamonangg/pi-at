import assert from "node:assert/strict";
import test from "node:test";
import { expandMentions, resolveMention, type MentionTarget } from "../src/resolver.ts";

const targets: MentionTarget[] = [
  { name: "oracle", type: "agent" },
  { name: "worker", type: "agent" },
  { name: "reviewer", type: "agent" },
  { name: "go-review", type: "skill", filePath: "/skills/go-review/SKILL.md" },
  { name: "diagram", type: "skill", filePath: "/skills/diagram/SKILL.md" },
];

test("short and explicit mentions resolve only within the requested namespace", () => {
  for (const [mention, type, name] of [
    ["@oracle", "agent", "oracle"],
    ["@agent:oracle", "agent", "oracle"],
    ["@skill:go-review", "skill", "go-review"],
    ["@go-review", "skill", "go-review"],
  ]) {
    const result = resolveMention(mention, targets);
    assert.equal(result.status, "resolved");
    if (result.status === "resolved") assert.deepEqual([result.target.type, result.target.name], [type, name]);
  }
  assert.equal(resolveMention("@skill:oracle", targets).status, "unknown");
  assert.equal(resolveMention("@does-not-exist", targets).status, "unknown");
  assert.equal(resolveMention("@oracle trailing text", targets).status, "unknown");
});

test("namespace collisions require explicit syntax", () => {
  const collision: MentionTarget[] = [...targets, { name: "reviewer", type: "skill" }];
  const result = resolveMention("@reviewer", collision);
  assert.equal(result.status, "ambiguous");
  if (result.status === "ambiguous") assert.equal(result.candidates.length, 2);
  for (const type of ["agent", "skill"] as const) {
    const explicit = resolveMention(`@${type}:reviewer`, collision);
    assert.equal(explicit.status, "resolved");
    if (explicit.status === "resolved") assert.equal(explicit.target.type, type);
  }
});

test("expansion preserves task clauses and delegation order, including repetitions", () => {
  const text = "@oracle propose the solution, @worker implement it, @oracle refine it, then @reviewer review it";
  const result = expandMentions(text, targets);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.text.endsWith(text));
  assert.ok(result.text.includes('"oracle" -> "worker" -> "oracle" -> "reviewer"'));
  assert.match(result.text, /explicitly requests delegation/);
  assert.match(result.text, /existing pi-subagents tool/);
  assert.match(result.text, /wait for each result/);
});

test("unknown and ambiguous mentions remain visible and prevent guessed execution", () => {
  for (const [text, catalog, warning] of [
    ["@foobar inspect this", targets, "Unknown Pi mention: @foobar"],
    ["@oracle then @reviewer", [...targets, { name: "reviewer", type: "skill" }], "Ambiguous Pi mention: @reviewer"],
  ] as [string, MentionTarget[], string][]) {
    const result = expandMentions(text, catalog);
    assert.ok(result.text.endsWith(text));
    assert.ok(result.warnings[0].startsWith(warning));
    assert.match(result.text, /clarify before executing/);
    assert.doesNotMatch(result.text, /explicitly requests delegation/);
  }
});

test("skills use native expansion once and reference real files for additional skills", () => {
  const text = "@go-review inspect this with @worker and @skill:diagram; @go-review again";
  const result = expandMentions(text, targets);
  assert.ok(result.text.startsWith("/skill:go-review "));
  assert.ok(result.text.endsWith(text));
  assert.ok(result.text.includes('reading "/skills/diagram/SKILL.md"'));
  assert.equal(result.text.match(/Apply the "go-review"/g)?.length, 1);
  assert.match(result.text, /existing pi-subagents tool/);
  assert.deepEqual(expandMentions("email foo@example.com", targets), { text: "email foo@example.com", warnings: [] });
});
