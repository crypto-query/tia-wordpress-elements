// Moves every rule under the Block root: no global rule, no `@layer`, no `@property`. Base rules get one
// root class, utilities two, so utilities (0,3,0) beat base rules and both beat the theme's element rules.

const ROOT = ".tia-design-system";
const WHERE_ROOT = ":where(.tia-design-system)";
const DARK = /(?<!\.tia-design-system)\.dark(?![\w\\-])/g;

/** @param {string} selector */
function scopeSelector(selector) {
    const s = selector.trim();
    if (s === WHERE_ROOT) return ROOT;
    // Preflight, nested under `:where(root)`: one root class.
    if (s.startsWith(`${WHERE_ROOT} `)) return `${ROOT} ${s.slice(WHERE_ROOT.length).trim()}`;
    // Utilities Tailwind writes as `:where(& > …)`; nesting put the root inside the `:where()`, at 0,0,0.
    if (s.startsWith(":where(.tia-design-system ") && s.endsWith(")")) {
        return `${ROOT}${ROOT} :where(${s.slice(":where(.tia-design-system ".length, -1).trim()})`;
    }
    // Utilities.
    if (s.startsWith(`${ROOT} `)) return `${ROOT}${s}`;
    // The root itself, its tokens, its dark variant.
    if (s.startsWith(ROOT)) return s;
    // Global base rules: the design-system base layer and the @tailwindcss/forms base.
    return `${ROOT} ${s}`;
}

/** @param {import("postcss").Node} node */
function insideRuleOrKeyframes(node) {
    for (let p = node.parent; p && p.type !== "root"; p = p.parent) {
        if (p.type === "rule") return true;
        if (p.type === "atrule" && /keyframes$/.test(/** @type {import("postcss").AtRule} */ (p).name)) return true;
    }
    return false;
}

/** @param {import("postcss").Node} node */
function insidePropertiesLayer(node) {
    for (let p = node.parent; p && p.type !== "root"; p = p.parent) {
        if (p.type === "atrule" && /** @type {import("postcss").AtRule} */ (p).name === "layer") {
            return /** @type {import("postcss").AtRule} */ (p).params === "properties";
        }
    }
    return false;
}

/** @returns {import("postcss").Plugin} */
export default function scope() {
    return {
        postcssPlugin: "tia-elements-scope",
        Once(root) {
            root.walkRules((rule) => {
                if (insideRuleOrKeyframes(rule) || insidePropertiesLayer(rule)) return;
                if (rule.selectors.every((s) => s === ":root" || s === ":host")) {
                    rule.selector = ROOT;
                    return;
                }
                rule.selectors = rule.selectors.map((s) => scopeSelector(s.replace(DARK, `${ROOT}.dark`)));
            });

            root.walkAtRules("layer", (layer) => {
                if (!layer.nodes) {
                    layer.remove();
                    return;
                }
                // Tailwind's fallback for browsers without @property, applied always in place of the
                // page-wide registrations, and scoped to the root, its descendants and their pseudo-elements.
                if (layer.params === "properties") {
                    layer.walkAtRules("supports", (supports) => {
                        supports.replaceWith(supports.nodes ?? []);
                    });
                    layer.walkRules((rule) => {
                        rule.selectors = [ROOT, `${ROOT} *`].flatMap((s) => [s, `${s}::before`, `${s}::after`, `${s}::backdrop`]);
                    });
                }
                layer.replaceWith(layer.nodes);
            });

            root.walkAtRules("property", (property) => {
                property.remove();
            });
        }
    };
}

scope.postcss = true;
