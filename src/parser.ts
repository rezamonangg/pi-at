export type Mention = {
  raw: string;
  name: string;
  type?: "agent" | "skill";
  start: number;
  end: number;
};

// Boundaries deliberately exclude emails, URLs, and native @file/path.ts references.
// Explicit agent namespaces also accept pi-subagents' package/name identities.
export function parseMentions(text: string): Mention[] {
  const pattern = /(?:^|[\s([{"'`])(@(?:(agent|skill):)?([A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)?))(?=$|[\s,;!?)}\]"'`]|\.(?![\w./-]))/g;
  return Array.from(text.matchAll(pattern), (match) => {
    const raw = match[1];
    const start = match.index + match[0].length - raw.length;
    return {
      raw,
      name: match[3],
      type: match[2] as Mention["type"],
      start,
      end: start + raw.length,
    };
  }).filter((mention) => !mention.name.includes("/") || mention.type === "agent");
}
