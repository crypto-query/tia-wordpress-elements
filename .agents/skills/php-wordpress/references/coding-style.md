# Coding style

Two mutually exclusive standards. Decide by destination, not by taste.

| | PER Coding Style 3.0 | WordPress Coding Standards |
|---|---|---|
| Applies to | libraries, CLI tools, framework code, anything Composer-autoloaded and standalone | anything shipping into `wp-content` — plugins, themes, mu-plugins |
| Indentation | 4 spaces | real tabs |
| Arrays | `['a' => 1]` | `array( 'a' => 1 )` |
| Parentheses | `if ($x)` | `if ( $x )` |
| Comparisons | `$x === 1` | Yoda: `1 === $x` |
| Class/method brace | next line | same line |
| Control brace | same line | same line |
| Enforcer | PHP-CS-Fixer `@PER-CS3.0` | PHPCS + WPCS `--standard=WordPress` |

PER-CS 3.0 (released 2025-07-14, still current) supersedes PSR-12 and adds rules for enums, property hooks, attributes and compound type declarations. PHP-CS-Fixer's `@PER-CS` alias tracks the newest revision; pin `@PER-CS3.0` if you want a stable ruleset.

## WPCS ruleset composition

WPCS 3.4.1 ships 58 sniffs and four ruleset names. The names are not nested the way they read:

| Ruleset | What it adds |
|---|---|
| `WordPress-Core` | formatting, naming, Yoda, i18n, `DB.PreparedSQL`, `DB.PreparedSQLPlaceholders`, `PHP.DontExtract`, `PHP.NoSilencedErrors` |
| `WordPress-Docs` | docblock rules only |
| `WordPress-Extra` | Core + `Security.EscapeOutput`, `Security.NonceVerification`, `Security.SafeRedirect`, `WP.Capabilities`, `NamingConventions.PrefixAllGlobals`, deprecated-API checks |
| `WordPress` | Core + Docs + Extra **plus every sniff in the package**, because the ruleset declares a `namespace` and PHPCS auto-includes the sniff directory |

Five sniffs live in no ruleset XML and are only reachable through `WordPress`: `Security.ValidatedSanitizedInput`, `DB.DirectDatabaseQuery`, `DB.SlowDBQuery`, `Utils.I18nTextDomainFixer`, and the full `WP.I18n` (Extra references only two of its error codes). Measured on a file that reads `$_POST['id']` without sanitizing: `WordPress-Extra` reports the missing nonce and the unescaped echo but says nothing about the unsanitized input; `WordPress` reports `InputNotValidated`, `MissingUnslash` and `InputNotSanitized`. Use `WordPress`.

## phpcs.xml.dist

Verified to run under PHPCS 3.13.6 + WPCS 3.4.1:

```xml
<?xml version="1.0"?>
<ruleset name="Project" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	xsi:noNamespaceSchemaLocation="https://schema.phpcodesniffer.com/phpcs.xsd">

	<file>src</file>
	<exclude-pattern>*/vendor/*</exclude-pattern>
	<exclude-pattern>*/node_modules/*</exclude-pattern>

	<arg name="basepath" value="."/>
	<arg name="parallel" value="8"/>
	<arg name="extensions" value="php"/>
	<arg value="ps"/><!-- progress + sniff names -->

	<config name="minimum_wp_version" value="7.0"/>

	<rule ref="WordPress"/>

	<rule ref="WordPress.WP.I18n">
		<properties>
			<property name="text_domain" type="array">
				<element value="my-plugin"/>
			</property>
		</properties>
	</rule>

	<rule ref="WordPress.NamingConventions.PrefixAllGlobals">
		<properties>
			<property name="prefixes" type="array">
				<element value="my_plugin"/>
			</property>
		</properties>
	</rule>

	<!-- Per-sniff exclusions work and are the right tool for custom-table code. -->
	<rule ref="WordPress.DB.DirectDatabaseQuery">
		<exclude-pattern>*/src/Repository/*</exclude-pattern>
	</rule>
</ruleset>
```

`minimum_wp_version` drives the deprecation and capability sniffs — set it to the plugin's real floor, not the current release. `text_domain` and `prefixes` are not optional in practice: without them `WP.I18n` and `PrefixAllGlobals` produce noise on every string and every global.

Under `--standard=WordPress`, every `$wpdb->` call raises `DirectDatabaseQuery.DirectQuery` and `NoCaching` as warnings. That is by design — it is a prompt to justify the query, not a bug — so scope it out per directory rather than globally, and keep the warning wherever a query could have been a `WP_Query`.

## .php-cs-fixer.dist.php

Verified to parse PHP 8.5 syntax (pipe operator, property hooks, `new X()->m()`) under PHP-CS-Fixer 3.95.18:

```php
<?php

declare(strict_types=1);

$finder = PhpCsFixer\Finder::create()
    ->in(__DIR__ . '/src')
    ->name('*.php');

return (new PhpCsFixer\Config())
    ->setRiskyAllowed(true)
    ->setRules([
        '@PER-CS3.0' => true,
        '@PER-CS3.0:risky' => true,
        'declare_strict_types' => true,
    ])
    ->setFinder($finder);
```

`@PER-CS3.0` writes `fn(` with no space after the keyword — the one place where a common house style (`fn (`) disagrees with the standard.

## The PHPCS 4 pin

PHP_CodeSniffer 4.0.4 is current and installs cleanly alone, but WPCS 3.4.1 requires `squizlabs/php_codesniffer ^3.13.5` and Composer refuses the pair. Any WordPress project stays on PHPCS 3.x until WPCS ships 4 support. `squizlabs/php_codesniffer` remains the package to require; `phpcsstandards/php_codesniffer` is marked abandoned in favour of it.

Two live advisories in this stack, both patched:

- **CVE-2026-67434** — OS command injection in PHP_CodeSniffer `<3.13.6` and `4.0.0–4.0.1`. Reachable by scanning untrusted code, which is exactly what CI does to pull requests.
- **CVE-2026-45293** — arbitrary code execution in WPCS `0.14.1–3.4.0` via the `WordPress.WP.EnqueuedResourceParameters` sniff, so the `WordPress` and `WordPress-Extra` rulesets. Fixed in 3.4.1.

Run `composer audit` after any change to the lint stack.
