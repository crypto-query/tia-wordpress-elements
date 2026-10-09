# Versions

## Where the lines are

Measured on npm, 15 August 2026:

| Tag | Version |
|---|---|
| `latest` | **1.6.29** |
| `rc` | **1.7.0-rc.6** |
| `beta` | 1.7.0-beta.10 |
| `canary` | 1.0.0-canary.14 — stale, ignore it |

`npm install better-auth` gives you 1.6.x, and the documentation site describes 1.6 as well, so unlike some libraries there is no doc/package mismatch to navigate by default. The `auth` CLI ships the same version numbers.

```bash
node -p "require('./node_modules/better-auth/package.json').version"
npx auth@latest info      # resolved config, adapter and versions in one shot
```

## 1.7 barely touches SvelteKit

The `better-auth/svelte-kit` module — `svelteKitHandler`, `sveltekitCookies`, `toSvelteKitHandler`, `isAuthPath` — is **byte-identical between 1.6.29 and 1.7.0-rc.6**. Upgrading is a schema and plugin exercise, not an integration one.

The one client-side addition that matters here is **`hydrateSession`**, added to every framework client including Svelte. It seeds a server-rendered session into the store to close **the flash**; [client.md](client.md) has its narrow semantics.

Export changes: the RC drops `./plugins/oidc-provider`, `./plugins/mcp/client` and `./plugins/mcp/client/adapters`, and adds `./cookies/utils` (56 subpath exports → 54).

## 1.7 breaking changes

Schema-level, and they land on the `account` table:

- **`Account.accountId` → `Account.providerAccountId`, and `Account.issuer` becomes required.** Accounts are scoped by issuer. Credential accounts use `local:credential` with the user's `id` as the provider identity. Provider identity now comes from the raw verified profile — `sub` for OIDC discovery, `id` for plain OAuth, or a declared `accountSubject` — instead of Better Auth choosing at runtime.
- **`experimental: { joins: true }` moved to `advanced: { database: { joins: true } }`.** Adapters that support native joins use them; ones that cannot fall back to extra queries. Drizzle and Prisma users need the relations in their schema, so regenerate.
- **MCP shipped as its own package**, `@better-auth/mcp`, built on the OAuth provider. `withMcpAuth` → `requireMcpAuth`, `createMcpAuthClient` → `createMcpResourceClient`, the `jwt()` plugin is now required, and `oauthApplication` became `oauthClient` with new `oauthRefreshToken` and `oauthClientAssertion` tables.
- **`deviceCodeGrant()` → `oauthDeviceAuthorization()`**, used alongside `oauthProvider()` or `mcp()`. Pending device codes cannot be exchanged across the upgrade — let them expire first.
- **Microsoft / `microsoftEntraId` accounts key on the `oid` claim, not `sub`.** Existing rows must be migrated before upgrading or their tokens are rejected.
- **Device and user code columns must be bounded strings (≤191 chars) on MySQL and SQL Server.**
- **Expo's `getCookie()` returns a Promise.**
- OIDC protocol claims (`iss`, `sub`, `aud`, `exp`, `nonce`, `auth_time`, `acr`, `amr`, `azp`) can no longer be overridden by custom ID-token claims — namespace your own.

Upgrading any of the above is a schema migration: regenerate with `npx auth generate` and apply with your ORM's tool.

## The CLI rename

The CLI lives in the **`auth`** package, tracking library versions exactly. **`@better-auth/cli` is frozen at 1.4.21, last published April 2026.**

The documentation and the official skill pack both still instruct `npx @better-auth/cli@latest migrate`; upstream's own 1.7 notes say `npx auth migrate`. Treat any `@better-auth/cli` invocation you meet in generated code or a snippet as stale.

## What `sv` pins

`sv` 0.17.0's `better-auth` add-on installs `better-auth` and `auth` at `^1.6.23`, both into **devDependencies**. Move them to `dependencies` before deploying anywhere that installs production dependencies only.

The same `sv` release places SvelteKit configuration in `vite.config.ts` rather than a `svelte.config.js`, which is where the `experimental.remoteFunctions` flag goes if you want remote functions.

## Checking a claim against the installed copy

The package ships no agent documentation, but it does ship full `.d.mts` files, and those are the fastest authority for an option's exact shape:

```bash
grep -n -B12 "cookieCache" node_modules/@better-auth/core/dist/types/init-options.d.mts
```

`@better-auth/core` holds the options types; `better-auth/dist/integrations/svelte-kit.d.mts` holds the SvelteKit surface, which is small enough to read end to end in under a minute.
