# Upstream agent resources

Better Auth publishes more agent-facing material than most libraries, all of it **outside the npm package**. `node_modules/better-auth/` contains `dist/`, `README.md` and `LICENSE.md` — no `AGENTS.md`, no bundled examples, nothing to read locally. Everything below is fetched.

## The docs MCP server

```bash
npx auth@latest mcp --claude-code     # or --cursor, --open-code, --manual
```

Endpoint: `https://mcp.better-auth.com/mcp`. It exposes documentation search, examples and setup help. This is the best default for API questions this skill does not answer — it is current, it is searchable, and it costs nothing until queried.

Not to be confused with Better Auth's **MCP plugin**, which adds MCP *provider* authentication to your own app. The server above consumes docs; the plugin issues tokens.

## `llms.txt`

`https://better-auth.com/llms.txt` is a ~22 KB index — title, path and one-line summary per page, grouped by section. Each entry resolves to real Markdown:

```
https://better-auth.com/llms.txt/docs/integrations/svelte-kit.md
https://better-auth.com/llms.txt/docs/adapters/drizzle.md
```

Note the `/llms.txt/` segment: `https://better-auth.com/docs/integrations/svelte-kit.md` **404s**. There is no `llms-full.txt` either — that URL returns 404, so there is no single-file dump to grep. Fetch the index, pick paths, fetch pages.

## The official skill pack

Lives at [`better-auth/skills`](https://github.com/better-auth/skills), separate from the library repo.

```bash
npx skills add better-auth/skills
```

Six skills and two slash commands:

| Skill | Covers |
|---|---|
| `create-auth` | scaffolding auth into an existing project: framework detection, adapter choice, route handler, providers, UI |
| `better-auth-best-practices` | server and client config, adapters, sessions, plugins, env vars |
| `email-and-password-best-practices` | verification, reset flows, password policy, hashing |
| `organization-best-practices` | multi-tenancy, members, invitations, roles, teams, RBAC |
| `two-factor-authentication-best-practices` | TOTP, OTP delivery, backup codes, trusted devices |
| `better-auth-security-best-practices` | rate limiting, secrets, CSRF, trusted origins, cookie and session hardening, token encryption, audit logging |

Commands: `/explain-error` (error code → causes, fixes, handling code) and `/providers`.

The Claude plugin marketplace entry in that repo (`auth-skills`) wires up only `create-auth` and `best-practices`; the other four are in the tree and installable, just not listed in `marketplace.json`.

### What it is good for

The plugin and feature skills — organization, 2FA, email/password, security — are the strongest part and cover ground this skill deliberately does not. Reach for them when the task is a Better Auth *feature* rather than a SvelteKit *integration*.

### Its Svelte blind spot

The pack is Next.js-shaped. Across ~2,000 lines, **Svelte is mentioned on five lines**, and two of those are wrong or misleading for a current SvelteKit app:

- Its route-handler table gives SvelteKit `svelteKitHandler(auth)`. The real signature is an object: `svelteKitHandler({ event, resolve, auth, building })`.
- Its setup workflow says to verify with `GET /api/auth/ok` returning `{ status: "ok" }`. The endpoint returns `{"ok":true}`.
- It routes every migration through `npx @better-auth/cli@latest`, which is the frozen legacy CLI — [versions.md](versions.md).
- `nextCookies()` is called out for Next.js server components; the SvelteKit equivalent, `sveltekitCookies(getRequestEvent)`, appears nowhere, and it is the one line whose absence silently breaks sign-in.

So: install the pack for feature work, and let this skill win on anything touching hooks, handlers, cookies, `event.locals`, load functions or the client. Precedence matters here — a stale `svelteKitHandler(auth)` copied from the pack fails as a type error, but the missing cookie plugin fails as a 200 that signs nobody in.

## The `sv` add-on

`sv add better-auth` is maintained by the Svelte team, not Better Auth, and is the most current statement of how the two fit together — it generates the object-form handler, the cookie plugin and the `auth` CLI script that the Better Auth docs and skill pack have not all caught up with. Reading its generated output is a good way to check a claim; [sveltekit.md](sveltekit.md) covers what it writes and the edit it needs.
