// Svelte 5 HMR writes Vite's `import.meta.hot.accept(cb)`. webpack runs the new module instead, so the
// shim hands its exports to the first module's callback, whose component the importers still hold.
const SHIM = `const __svelteHot = import.meta.webpackHot && {
    accept(update) {
        const hot = import.meta.webpackHot;
        const first = hot.data?.update ?? update;
        hot.dispose((data) => { data.update = first; });
        hot.accept();
        if (hot.data?.update) first(__webpack_module__.exports);
    }
};
`;

/** @param {string} source */
export default function svelteHmrLoader(source) {
    return source.includes("import.meta.hot") ? SHIM + source.replaceAll("import.meta.hot", "__svelteHot") : source;
}
