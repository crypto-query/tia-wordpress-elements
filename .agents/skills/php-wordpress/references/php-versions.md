# PHP versions and the floor

PHP 8.4 and 8.5 are in active support; 8.2 and 8.3 are security-only (8.2 ends 2026-12-31). 8.5 shipped 2025-11-20 and is the newest branch.

WordPress 7.0's floor is **PHP 7.4**, so a plugin published to WordPress.org may only use 7.4 syntax unless its header raises `Requires PHP`. Raising the header is a real decision — it silently blocks installation and auto-update on older hosts — but it is the honest alternative to writing 7.4 code in 2026. Decide it once, put it in the plugin header, and then use everything that version gives you.

## The ladder

Everything at or below the declared `Requires PHP` is available; everything above it is a fatal on someone's host.

| Version | What it unlocks |
|---|---|
| **7.4** *(WP floor)* | typed properties, arrow functions `fn() =>`, `??=`, spread in array literals, numeric literal separators, covariant returns |
| **8.0** | union types, named arguments, attributes, constructor property promotion, `match`, nullsafe `?->`, `mixed`, `static` return, throw expressions, non-capturing `catch`, `str_contains` / `str_starts_with` / `str_ends_with` |
| **8.1** | enums, `readonly` properties, first-class callables `f(...)`, `never`, pure intersection types, `new` in initializers, `array_is_list()`, final class constants, fibers |
| **8.2** | `readonly` classes, DNF types `(A&B)|C`, standalone `true` / `false` / `null` types, constants in traits; dynamic properties deprecated |
| **8.3** | typed class constants, `#[\Override]`, dynamic class-constant fetch, `json_validate()`, readonly reinitialisation during `__clone` |
| **8.4** | property hooks, asymmetric visibility `public private(set)`, `#[\Deprecated]`, `new Foo()->bar()` without parentheses, lazy objects, `array_find` / `array_find_key` / `array_any` / `array_all`, BCMath `Number` object, `Dom\HTMLDocument`, `RoundingMode` enum, `mb_trim` family |
| **8.5** | pipe operator `\|>`, `clone with`, `#[\NoDiscard]`, closures and first-class callables in constant expressions, `array_first()` / `array_last()`, the `Uri` extension, `get_error_handler()`, `Closure::getCurrent()`, `final` on promoted constructor parameters, asymmetric visibility on static properties, attributes on constants, backtraces on fatal errors |

## Verified traps

Each of these was run on PHP 8.5.9.

**Arrow functions are rejected in constant expressions.** The 8.5 feature is real but narrower than the headline:

```php
final class R {
    public const \Closure OK  = strtolower(...);                              // ✅
    public const \Closure OK2 = static function (string $s): string { … };     // ✅
    public const \Closure NO  = static fn (string $s): string => strtolower($s); // ❌ fatal
}
```

`static fn` fails with `Constant expression contains invalid operations` — an arrow function captures its enclosing scope by value, which is not constant. The same applies to default parameter values and attribute arguments.

**`clone with` on a readonly property only works inside the class.**

```php
final class Config
{
    public function __construct(public readonly string $env = 'dev') {}

    public function withEnv(string $env): static
    {
        return clone($this, ['env' => $env]);   // ✅
    }
}

$prod = clone($config, ['env' => 'prod']);       // ❌ Cannot modify protected(set)
                                                 //    readonly property … from global scope
```

Readonly properties are `protected(set)` by default, so the `with`-er has to be a method on the class. This is the whole point of the feature and the part the release notes gloss over.

**`#[\NoDiscard]` warns at runtime, not compile time.** Calling the function and dropping the result emits `Warning: The return value of function … should either be used or intentionally ignored by casting it as (void)`. `(void) f();` silences it. Useful on `sanitize_*`-style helpers where dropping the return is always a bug.

**Property hooks and asymmetric visibility compose.** `public private(set) int $cents` plus a `get =>` hook on a separate property both work, and `new Money('EUR', 500)->formatted` chains without parentheses — all 8.4, all fine on 8.5.

## Deprecations that bite

Verified firing under `error_reporting=E_ALL` on 8.5.9:

- **Implicit nullable parameters** (8.4): `function f(string $x = null)` → write `?string $x = null`. This is endemic in older WordPress plugin code and fires at declaration, so it floods the log on load.
- **Non-canonical casts** (8.5): `(boolean)`, `(integer)`, `(double)`, `(binary)` → `(bool)`, `(int)`, `(float)`, `(string)`.
- **`case` terminated with a semicolon** (8.5): `case 1; break;` → `case 1:`.
- **`null` as an array offset** (8.5): `$a[null] = 1` → use `''`.
- **Backtick operator** (8.5), the `shell_exec()` alias.
- **`__sleep()` / `__wakeup()`** soft-deprecated in favour of `__serialize()` / `__unserialize()`.
- Dynamic properties (8.2) — add `#[\AllowDynamicProperties]` or, better, declare them.

WPCS catches two of these and not the others: `Generic.PHP.BacktickOperator` forbids backticks, and `WordPress.PHP.TypeCasts` normalises `(double)` and `(real)` to `(float)` and forbids `(unset)` and `(binary)` — but it registers only those three token types, so `(boolean)` and `(integer)` pass clean through a full `--standard=WordPress` run. Run the code under `E_ALL` on 8.5 to find them.

## Choosing a version to target

`php-stubs/wordpress-stubs` tracks WordPress, not PHP; the analysis PHP version is a separate setting. See [static-analysis.md](static-analysis.md) for why neither PHPStan's `phpVersion` nor PHPCompatibility will tell you a function is unavailable at the floor, and what does.
