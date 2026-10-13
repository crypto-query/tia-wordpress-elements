const STYLE_LINK = "link#tia-elements-design-system-css";

/**
 * Dev only (`wp-scripts start --hot`). webpack swaps CSS only for chunks the page loaded itself; the
 * shared stylesheet is a WordPress `<link>`, also inside the editor iframe, so reload it after each update.
 */
export function reloadStylesOnHotUpdate(): void {
    import.meta.webpackHot?.addStatusHandler((status) => {
        if (status !== "idle") return;
        const frames = document.querySelectorAll<HTMLIFrameElement>("iframe[name='editor-canvas']");
        for (const doc of [document, ...Array.from(frames, (frame) => frame.contentDocument)]) {
            for (const link of doc?.querySelectorAll<HTMLLinkElement>(STYLE_LINK) ?? []) {
                const url = new URL(link.href);
                url.searchParams.set("hot", String(Date.now()));
                link.href = url.href;
            }
        }
    });
}
