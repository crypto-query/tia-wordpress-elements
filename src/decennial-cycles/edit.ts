import { useBlockProps } from "@wordpress/block-editor";
import { registerBlockType, type BlockEditProps } from "@wordpress/blocks";
import { createElement } from "@wordpress/element";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import { useLoad, useSvelte } from "../shared/editor";
import EditorPlaceholder from "../shared/EditorPlaceholder.svelte";
import { getAssets } from "./api";
import metadata from "./block.json";
import DecennialCycles from "./DecennialCycles.svelte";

type Attributes = { asset?: string };

function Edit({ attributes }: BlockEditProps<Attributes>) {
    const { asset } = attributes;
    const assets = useLoad(getAssets);
    const placeholder = useSvelte(EditorPlaceholder, assets.status === "denied" ? { feature: metadata.title } : null);
    const preview = useSvelte(DecennialCycles, assets.status === "ready" ? { attributes: { asset }, card: null, instance: null } : null);

    return createElement(
        "div",
        useBlockProps(),
        createElement(
            "div",
            { key: assets.status, ref: assets.status === "denied" ? placeholder : preview, className: "tia-design-system" },
            assets.status === "loading" && createElement("div", { className: "h-90 sm:h-120" })
        )
    );
}

// A JSON import widens `align` to string[]; restating it gives the BlockAlignment[] the type wants.
registerBlockType<Attributes>(
    { ...metadata, supports: { ...metadata.supports, align: ["wide", "full"] } },
    { edit: Edit, save: () => null }
);

reloadStylesOnHotUpdate();
