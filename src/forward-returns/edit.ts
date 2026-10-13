import { useBlockProps } from "@wordpress/block-editor";
import { registerBlockType } from "@wordpress/blocks";
import { createElement, useEffect, useRef } from "@wordpress/element";
import { mount, unmount } from "svelte";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import EditorPlaceholder from "../shared/EditorPlaceholder.svelte";
import metadata from "./block.json";

function Edit() {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!root.current) return;
        const view = mount(EditorPlaceholder, { target: root.current, props: { feature: metadata.title } });
        return () => {
            void unmount(view);
        };
    }, []);
    return createElement("div", useBlockProps(), createElement("div", { ref: root, className: "tia-design-system" }));
}

registerBlockType(metadata, { edit: Edit, save: () => null });

reloadStylesOnHotUpdate();
