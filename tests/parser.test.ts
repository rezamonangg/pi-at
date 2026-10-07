import assert from "node:assert/strict";
import test from "node:test";
import { parseMentions } from "../src/parser.ts";

test("mentions retain namespaces, source offsets, and textual order", () => {
  for (const [text, expected] of [
    ["@oracle inspect this", ["@oracle"]],
    ["@agent:oracle inspect this", ["@agent:oracle"]],
    ["Inspect with @reviewer.", ["@reviewer"]],
    ["Ask @oracle then @worker then @reviewer", ["@oracle", "@worker", "@reviewer"]],
    ["@oracle produce a plan.\nThen @worker implement it.\nFinally @reviewer inspect.", ["@oracle", "@worker", "@reviewer"]],
    ["@skill:go-review inspect this", ["@skill:go-review"]],
    ["Use (@oracle) and '@skill:diagram'.", ["@oracle", "@skill:diagram"]],
    ["@agent:my-package/reviewer", ["@agent:my-package/reviewer"]],
  ] as const) {
    const mentions = parseMentions(text);
    assert.deepEqual(mentions.map((mention) => mention.raw), expected, text);
    for (const mention of mentions) assert.equal(text.slice(mention.start, mention.end), mention.raw);
  }
  assert.equal(parseMentions("@agent:oracle")[0].type, "agent");
  assert.equal(parseMentions("@skill:go-review")[0].type, "skill");
});

test("emails, URLs, and native file references do not produce partial mentions", () => {
  for (const text of [
    "foo@example.com", "hello@example.com", "https://example.com/@user",
    "https://example.com/@agent:oracle", "x@oracle", "@foo@example.com",
    "@src/index.ts", "@README.md", "@src/file", "@./src/file.ts", "@/tmp/file.ts",
    "@agent:", "@skill:", "@other:oracle", "@agent:pkg/name/extra",
  ]) assert.deepEqual(parseMentions(text), [], text);
});
