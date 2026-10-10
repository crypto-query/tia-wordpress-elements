# The design system ships source, not a build

`crypto-query/tia-design-system` ships uncompiled `.svelte`, `.ts` and CSS source. It has no `dist/` build and no npm package. The plugin links it as a git submodule at `packages/tia-design-system` and a bun workspace, then compiles it with its own webpack build. The plugin build also scopes it under `.tia-design-system`; the design system itself stays unscoped. We chose this for two reasons. The scoped Tailwind build must scan the class names in the component source. The workspace also keeps one copy of `svelte` and `bits-ui` on the page.

## Considered Options

- **Prebuilt npm package with compiled CSS.** Rejected. Its CSS would be global or need a second scope pass. The plugin could not tree-shake Tailwind classes against the Blocks that use them. A second `svelte` runtime could also ship.
- **Scope step inside the design system.** Rejected. Scoping is a need of the WordPress embedding. `tia-trading-strategies` and other apps use the tokens on `:root` as they are.

## Consequences

- Inside `src/lib`, imports are relative. A `$lib` or `$app/*` import breaks every consumer that is not a SvelteKit app.
- `svelte`, `bits-ui`, `echarts`, `lucide-svelte`, `clsx` and `tailwind-merge` are peer dependencies. The consumer pins them, and it carries its own copy of the bits-ui patch.
- A design-system change reaches the plugin only through an explicit submodule bump commit.
