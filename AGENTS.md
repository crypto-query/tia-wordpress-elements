# AGENTS.md

## Project bootstrap

- **Runtime / package manager**: `bun`. Don't reach for `npm`, `pnpm`, or `yarn`.
- **Verification loop** — after each implementation slice, repeat until clean:
  1. Run `bun run lint` and `bun run check`. Manually fix every reported issue.
  2. Run `bun run lint:fix` to let tooling resolve remaining formatting/lint issues.
  3. Re-run `bun run lint` and `bun run check` to confirm zero errors and zero warnings.
  4. Run `bun run test` once the loop is clean. A slice is not done while it fails.
- **The browser pass** — a slice that touched a component or a route is done once it has been **seen rendered in a real browser, in both themes**. Every variant, size and state on its playground route, plus every route the change reaches. Lint, `check` and the test suite read markup and computed values; none of them can see that a control draws at half size, clips its own content, overflows its container, or disappears against the dark canvas. This holds for a new component and for an edit to an existing one alike. The `tia-design-system` skill carries the how — which server to run, the browser mode (headless unless explicitly asked otherwise), and the defect classes only a browser catches.
- **Worktrees live at `.agents/worktrees/<branch>`**, gitignored, so they stay inside the project instead of scattering beside it. A new one holds only tracked files, so create and prepare it in one go — without `.env.local` and `node_modules` the server suite fails on absent config:
  ```bash
  B=my-branch; git worktree add .agents/worktrees/$B -b $B && cp .env .env.local .agents/worktrees/$B/ && (cd .agents/worktrees/$B && bun install)
  ```
  `.env` and `.env.local` are the gitignored files the app needs today; if `.gitignore` gains another, copy it too. Give every later command an explicit `cd` into it — the shell's cwd stays in the main checkout. `git worktree remove` once the branch merges.
- **Dev server**: assume it is already running. Check `package.json` (`scripts.dev`) for its port. Never start, restart, or manage it — the browser pass runs its own server on its own port instead.

## Operating rules

- **Work autonomously.** Analyze, decide, execute. Interrupt only for genuine blockers (missing credentials, unreachable infrastructure, ambiguity that changes effort by >2×).
- **Commit in a worktree; ask outside one.** Work landing in a linked git worktree is committed as it goes — that is where the issue tracker's closure SHA comes from. In the main checkout, commit only when the user explicitly asks.
- **Publishing stays with the user.** Commits are local: `git push`, a pull request or a shared branch happens only when the user asks for it by name.
- **No file deletion without confirmation.** Never delete source files, components, routes, or playground routes unsolicited.
- **No new dependencies without approval.** Prefer existing deps, local utilities, and established patterns.
- **No new design tokens without need.** `src/app.css` is the single token layer. When a design asks for a value sitting between two steps of an existing scale, snap to the nearer step — don't add the in-between step. A new token is justified only by a concept the scale has nothing close to, and then it must be defined in both themes.
- **A green gate means fixed code, not silenced tools.** When `check` or `lint` goes red, fix the cause; `@ts-expect-error`, `eslint-disable`, `any` and `!` hide the defect instead. Report it as a blocker when the real fix is out of reach.
- **Pre-existing failures.** Differentiate regressions you introduced from pre-existing errors. Do not fix unrelated failures; report them with the exact failing commands and note they are pre-existing. **Exception: dependency updates** — see below.
- **Dependency updates.** When updating packages, fix *every* error the new versions surface, including pre-existing defects a stricter tool newly detects. The "pre-existing failures" rule does not apply: a bump that leaves the gate red is not done. Take each package as far as its latest version allows, and stop only where the bump would break configuration or leave it stale — a removed config option, a pinned contract that no longer type-checks, or a callback whose contract silently grew. Report every version deliberately held back, with the exact reason and what adopting it would cost.
- **Escape hatch.** At most 3 full fix cycles per root-cause cluster. Before cycle 2, state a brief hypothesis for the failure. If unresolved after cycle 3, stop, summarize attempts with evidence, and ask for guidance.

## Conflict precedence

When guidelines conflict, resolve in this order:

1. User request and task constraints
2. Explicit safety and correctness rules (security, accessibility, SSR, shared-component safety)
3. Loaded skill guidance
4. Relevant local patterns from existing code
5. General knowledge

## Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**Comments are rare, short, and self-contained.** The default is no comment: the code
already says what it does. A comment earns its line only for what the code cannot show — a
non-obvious decision, a trap, the reason a simpler approach fails — and says it in one or
two lines. Self-contained means the reasoning lives in the comment's own words: never a
reference to an issue, slice, spec section, ADR, or any other project document, tracked or
gitignored — such pointers read as precision but resolve to nothing once the document moves
or the reader lacks it. If the reasoning will not fit in two lines, the comment is carrying
the wrong half of it. The same holds for `describe`/`it` names and commit messages.

## Surgical changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## Goal-driven execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Project conventions

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` in this repo (gitignored, local-only). When work finishes, close the issue out explicitly — tick its acceptance criteria, set `Status: done`, and append a `## Comments` closure entry with the commit SHA; workflow-skill progress state does not sync back on its own. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used with their default names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Svelte and SvelteKit

- **Skills before code.** The `svelte-sveltekit` skill is the decision layer for any `.svelte` / `.svelte.ts` code or SvelteKit config; the `sveltekit-architecture` skill owns server-side placement — read it before deciding where logic belongs under `$lib/server` or extracting it out of a fat route, load function or remote function. A new module under `$lib/server` copies the file and visibility template in `docs/adr/0019-module-public-surface.md`: four public names and an `internal/` ring for the rest.
- **Exact API details** come from the Svelte MCP server: `list-sections` first, then `get-documentation` for every section relevant to the task.
- **Autofixer until clean.** Run `svelte-autofixer` on every Svelte component you write or edit, repeating until it returns no issues or suggestions.

## Browser automation

- **Use `playwright-cli`** for anything scripted or repeatable — driving this app, e2e work, capturing artifacts.
- **`find` before `snapshot`.** A full snapshot of a real page costs thousands of tokens; `playwright-cli find "text"` returns just the matching nodes with their refs. Use `--depth=N` when you do need the tree, `--raw` when piping into other tools.
