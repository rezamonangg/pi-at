# pi-at

Agent and skill `@` mentions for Pi. A small input router, not another agent runtime.

## Run

Requires Pi **1.0.4+** (`@earendil-works/pi-coding-agent`), Node **22.18+**, and your existing `pi-subagents` installation for agent mentions. Discovery adapter tested against **pi-subagents 0.76.1**.

From this repository:

```sh
pi -e ./src/index.ts
```

Install as a local Pi package (absolute path recommended):

```sh
pi install /absolute/path/to/pi-at
```

Pi reads `pi.extensions` from `package.json`; no build needed. Restart Pi or run `/reload` after installing. When published, the same manifest supports `pi install npm:pi-at`; this repository does not claim that name has been published.

## Usage

```text
@oracle review my database architecture
@worker implement this function
@reviewer review my current diff
@oracle propose the solution, @worker implement it, then @reviewer review it
Use @oracle first, then pass the recommendation to @worker.
@go-review inspect this worker pool
@agent:oracle review this architecture
@skill:go-review inspect this code
```

Skill examples require those skills to be installed; no agent or skill names are hardcoded.

Mentions work at the start, after whitespace, or inside opening brackets/quotes. Names use letters, digits, underscores, and hyphens. Package agents can use `@agent:package/name`. Email addresses, URL paths, and native `@src/index.ts` file references are not mentions. Literal `@name` in quoted examples or code is still a mention: this MVP is not a Markdown parser.

`@reviewer` resolves only if its name exists in exactly one namespace. If an agent and skill share that name, use `@agent:reviewer` or `@skill:reviewer`. Unknown mentions remain in the original request and produce `Unknown Pi mention: @foobar`. Ambiguous/unknown requests instruct the model to ask for clarification **before executing anything**.

## Autocomplete

In Pi's terminal editor, type `@` or a prefix such as `@ora`; select with the normal autocomplete controls. Rows show `agent`/`skill` and descriptions. Colliding names insert explicit namespaces. Explicit prefixes (`@agent:`, `@skill:`) filter their namespace.

Uses public `ctx.ui.addAutocompleteProvider()`, following Pi's official `github-issue-autocomplete.ts` example. No custom editor or core patch. Tokens with no mention matches fall back to existing file completion. Mention suggestions take priority when names match; type a file path (`@./oracle`) to disambiguate a same-named file. RPC/print/JSON input routing works without terminal autocomplete.

## How it works

```text
user input -> input hook -> parse -> discover/resolve -> prompt expansion
           -> normal Pi model -> existing pi-subagents / Pi skills
```

- **Hook:** `pi.on("input")` returns `transform`, preserving attachments and the original request verbatim. Extension-injected messages and `!` bash commands bypass routing.
- **Agents:** the registered `/subagents` command's `sourceInfo.path` locates the **loaded** package. `src/agents/agents.js` supplies `discoverAgents(cwd, "both", provider)` and diagnostic handling. This reuses built-ins, user/project files, package definitions, settings overrides, exclusions, disabled-agent filtering, and precedence. No separate config or directory scanner.
- **Skills:** `pi.getCommands()` entries with `source === "skill"` provide Pi's already-loaded catalog and real file paths: global/project locations, `.agents/skills`, package resources, CLI paths, exclusions, and collision handling remain Pi's responsibility.
- **Expansion:** agent mentions become explicit delegation instructions in textual order. Sequential instructions require waiting for results and passing relevant output forward, unless the user requests parallel work. Repeated agent mentions remain repeated requests. The extension never starts child sessions, calls an LLM, or invokes a runner itself.
- **Skill loading:** the first unique skill becomes a leading `/skill:name` command, which Pi expands **after** the input hook with its own loader. Other skills reference their actual files and instruct the model to read/apply them, including relative resources. Skill bodies are never copied or cached by pi-at.

## Limits and compatibility

Pi has no public extension-context method to activate several skills at once. The native command expands one leading skill; loading additional referenced skills remains model-driven.

`pi-subagents/agents` exports registration, not catalog discovery. Agent discovery therefore uses a **version-sensitive internal compatibility adapter**, isolated in `src/agents.ts`; this is not a claimed public API. Missing or incompatible modules emit a warning and leave mentions unresolved rather than risking a missed agent/skill collision. Without pi-subagents loaded, skill mentions still work. Check this file first when upgrading pi-subagents. Live runtime-registered agents/aliases and child capability restrictions are not mirrored by this adapter; the existing subagent tool's capability listing and preflight remain authoritative. Agents may be discoverable but unavailable to execute.

Routing establishes explicit user authorization and instructions, **not a mechanical execution guarantee**. The model still calls pi-subagents and must obey its safety/availability rules. If it fails to delegate, pi-at has not spawned a fallback process. Textual order is preserved; pi-at does not infer task dependencies or implement a workflow engine.

## Development

```sh
npm install
npm run check
npm pack --dry-run
```

Tests use Node's built-in runner, no framework. Parser/resolver tests cover namespaces, order, email/URL boundaries, collisions, unknown mentions, prompt preservation, and skill expansion. Autocomplete and input-hook tests cover editor insertion, native completion fallback, real-source discovery wiring, RPC/user input, attachments, and incompatible-catalog failure. An offline SDK test loads the actual TypeScript extension and verifies Pi's native skill expansion, even with skill slash-command UI disabled. It queues input without starting a model turn.

Start with `src/index.ts` for the event flow, `src/resolver.ts` for prompt instructions, `src/agents.ts` for subagents compatibility, `src/skills.ts` for Pi's skill catalog, and `src/autocomplete.ts` for editor behavior. No new runtime abstractions.

### Local references inspected

- Pi 1.0.4: `docs/extensions.md`, `docs/skills.md`, `docs/packages.md`, `docs/tui.md`, and exported extension types.
- Official examples: `examples/extensions/input-transform.ts`, `examples/extensions/github-issue-autocomplete.ts`.
- pi-subagents 0.76.1: `src/api/agents.js`, `src/agents/agents.js`, `src/agents/agent-management.js`.

Run `pi -e ./src/index.ts`, then try `@oracle review this architecture`.
