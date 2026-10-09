# Storybook's MCP server on a Svelte project

Storybook 10.5 ships an agent surface: `@storybook/addon-mcp` exposes a Storybook's contents and test runner over MCP, and manifests describe its components for reuse. The docs front every page with "only supported for React projects" — that is true of the manifest-backed half only. Verified against `@storybook/addon-mcp` 0.7.0 on a SvelteKit project running Storybook 10.5.7.

## What actually works on Svelte

Install and point an agent at it:

```bash
npx storybook add @storybook/addon-mcp     # registers the addon in main.ts
# dev server now serves MCP at http://localhost:6006/mcp
npx mcp-add --type http --url "http://localhost:6006/mcp" --scope project
```

The endpoint is streamable HTTP and only answers a proper MCP handshake — a plain `GET /mcp` in a terminal returns nothing useful. Tools present on a Svelte project:

| Tool | Toolset | What it does |
|---|---|---|
| `get-storybook-story-instructions` | dev | Returns Storybook's own current story-writing rules — imports, play-function shape, mocking, a11y triage. Renderer-generic, so it applies to Svelte |
| `preview-stories` | dev | Preview URLs (rendered inline where the client supports MCP Apps) for named story IDs |
| `get-changed-stories` | dev | Stories new/modified/affected by local edits; needs change detection, which needs a git repository |
| `get-stories-by-component` | dev | Maps component source files to the story IDs that render them |
| `run-story-tests` | test | Runs the story tests and interprets failures, including a11y violations |

Absent on Svelte: `get-documentation`, `get-documentation-for-story`, `list-all-documentation`. They are the **docs toolset**, which reads the manifests, and manifest generation is React-only pending Vue, Angular, Web Components and Svelte support. Toolsets can be switched off individually:

```ts
addons: [{ name: '@storybook/addon-mcp', options: { toolsets: { docs: false } } }],
```

So on Svelte the server is useful for *writing, previewing and testing* stories, and not yet for *discovering* components to reuse.

## What is still React-only

- **`storybook ai setup`** — the agentic setup command (behind `STORYBOOK_FEATURE_AI_CLI=1`) generates project-specific setup instructions and refuses anything but React + Vite.
- **Manifests** (`components.json`, `docs.json`) and everything downstream: the docs toolset, publishing an MCP server through Chromatic, self-hosting with `@storybook/mcp`.
- **The official agent plugins.** `storybookjs/mcp` publishes a Claude Code plugin and a Codex plugin (`claude plugin marketplace add storybookjs/mcp@main`, then `claude plugin install storybook@storybook`) with four skills — `stories`, `storybook-init`, `storybook-setup`, `storybook-upgrade`. They delegate to `storybook ai`, so on a Svelte project `storybook-init` and `storybook-upgrade` still apply while `storybook-setup` and the `storybook ai` workflow do not.

## Agentic review

Storybook 10.5 can render an agent's own summary of its UI work as a curated set of stories. It needs the `experimentalReview` feature flag in `main.ts` plus a connected MCP server (or an ADE plugin, which enables the flag itself). Independent of renderer; a review widget appears in the sidebar when one is available.

## Change detection

`get-changed-stories` and the sidebar's new/modified filters read git. Outside a repository the dev server logs `Change detection unavailable: not a git repository` and the feature is simply off.

## Wiring an agent to it

The addon's own `initialize` response carries instructions telling a client to call `get-storybook-story-instructions` before writing stories, `preview-stories` after any visual change, and `run-story-tests` after every component or story edit. Repeating that contract in a project's `AGENTS.md` / `CLAUDE.md` is what makes it stick, naming the server as configured:

```md
When working on UI, use the `<server-name>` MCP tools before answering or acting.
- `get-storybook-story-instructions` before creating or updating stories.
- `preview-stories` after any change to how the UI looks; include the returned URLs in the reply.
- `run-story-tests` to check the work; never report completion with failing tests.
```

The property-hallucination guardrails that upstream suggests alongside this depend on `get-documentation`, so they do nothing until manifests reach Svelte.
