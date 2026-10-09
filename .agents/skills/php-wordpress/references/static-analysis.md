# Static analysis

PHPStan 2.2.8 is the default choice for WordPress; Psalm 6.16.1 and Rector 2.6.1 are alternatives with far thinner WordPress ecosystems. Levels run **0 to 10** — there is no level 11, and `max` is an alias for 10.

## Setup

```
composer require --dev phpstan/phpstan szepeviktor/phpstan-wordpress
```

`szepeviktor/phpstan-wordpress` pulls `php-stubs/wordpress-stubs` itself. Requiring the stubs directly is where the version trap sits: the extension (2.0.3) pins `php-stubs/wordpress-stubs ^6.6.2`, so Composer resolves **6.9.4** even though **7.0.0** stubs exist. WordPress 7.0-only functions — `wp_get_image_alttext()`, the connector and abilities APIs — will read as undefined until the extension widens its constraint.

```neon
# phpstan.neon
includes:
	- vendor/szepeviktor/phpstan-wordpress/extension.neon
parameters:
	level: 6
	paths:
		- src
	excludePaths:
		- src/vendor (?)
		- src/node_modules (?)
```

The `(?)` suffix is not decoration. A path in `excludePaths` that does not exist is a hard configuration error — `Path "…/node_modules" is neither a directory, nor a file path, nor a fnmatch pattern` — and PHPStan refuses to run at all. Mark anything conditional as optional.

Run it with the memory limit raised — `wordpress-stubs.php` is 5.1 MB and exhausts PHP's default 128 MB while parsing:

```
vendor/bin/phpstan analyse --memory-limit=1G
```

This only bites on a **cold result cache**, which is to say on every CI run and never on the second local run, so it reads as flaky until you know the cause. The message is `PHPStan process crashed because it reached configured PHP memory limit: 128M`. Put the flag in a Composer script so nobody rediscovers it.

## Levels, measured against WordPress code

Where each level starts costing you on ordinary plugin code:

| Level | First thing it makes you fix |
|---|---|
| 0–4 | undefined functions, obvious argument mismatches — clean on most plugins once stubs are loaded |
| 5 | argument types; still quiet on WordPress idiom |
| **6** | missing return types and `array` value types — the practical target for a plugin adopting PHPStan |
| **8** | nullable returns. `get_post()` is `WP_Post|null`, so `get_post($id)->post_title` becomes an error. This is where WordPress hurts, and the errors are real bugs |
| **9** | explicit `mixed`. `get_option()` returns `mixed`, so every `return get_option(…)` from a typed function is flagged |
| 10 | implicit `mixed` too |

Start at 6, get to 8, and treat 9 as a goal rather than a gate.

## Hooks are a hole unless you document them

`apply_filters()` returns `MixedType` — **implicit** mixed, which even level 9 lets through. The extension reads the docblock immediately above the call and, if it finds `@param` tags, uses the **first** one as the return type. Measured, all three at level 9:

```php
function a(): int {
	return apply_filters( 'x', 'a string' );   // no error — implicit mixed is invisible
}

function b(): int {
	/**
	 * Filter it.
	 *
	 * @param string $value The value.
	 */
	return apply_filters( 'y', 'a string' );   // error: should return int but returns string
}

function c(): string {
	return get_option( 'x' );                  // error: explicit mixed from the stubs
}
```

So the docblock you write for other developers is also the only thing that makes the analyser see through your own filters. Write one on every `apply_filters()` call site, ordering `@param` so the filtered value is first.

## Baselines

```
vendor/bin/phpstan analyse --memory-limit=1G --generate-baseline
```

A baseline is a migration tool for legacy code, not a suppression mechanism: generate it once, include it, and shrink it. New errors never belong in it. PHPStan 2.x prints its own guidance to this effect on every run, and it is right — prefer fixing the type over `@phpstan-ignore`, an inline `@var`, a cast, or a widened signature.

## Proving floor compatibility

Neither of the obvious tools answers "does this run on PHP 7.4?".

**PHPStan's `phpVersion`** — as a single value or a `min`/`max` range — checks *type and syntax* availability. `mixed` under `phpVersion: 70400` is flagged as an invalid type. But function availability comes from the analysing runtime's own function set, so `str_contains()` (8.0) and `array_first()` (8.5) both pass clean at `phpVersion: 70400`.

**PHPCompatibility** is worse: its stable release is **9.3.5, from December 2019**. Measured against `testVersion 7.4-`, it flags the PHP 7.0 spaceship operator at `5.6-` and reports **nothing** for `str_contains`, `array_find` or `array_first`. Only the `10.0.0-alpha2` line understands PHP 8, and it is still alpha — WPCS itself requires `^10.0.0@dev` for its own test suite.

**What works** is the PHPStan playground API, which runs real 7.2–8.5 runtimes and reports per version:

```bash
curl -s -X POST 'https://api.phpstan.org/analyse' \
  -H 'Content-Type: application/json' \
  -d '{"code":"<?php\n…","level":"10","strictRules":false,"bleedingEdge":false,"treatPhpDocTypesAsCertain":true,"saveResult":true}'
```

The response carries `versionedErrors[]`, each with a `phpVersion` integer (`80400` = 8.4) and its own `errors[]`, plus an `id` that resolves to `https://phpstan.org/r/<id>`. A snippet using `array_last()` returns `Function array_last not found` for 7.2 through 8.4 and resolves cleanly only on 8.5 — exactly the answer the local tools cannot give. `phpstan/phpstan` ships this as a skill of its own (`.claude/skills/analyse-with-phpstan`).

## Third-party plugin classes

When integrating with WooCommerce, ACF and friends, prefer their published stubs (`php-stubs/woocommerce-stubs`, `php-stubs/acf-pro-stubs`) over ignores. Only when no stub exists should you add a narrow `ignoreErrors` pattern scoped to the vendor prefix — and confirm the dependency is genuinely installed first, because "class not found" is more often a missing `composer require` than a missing stub.
