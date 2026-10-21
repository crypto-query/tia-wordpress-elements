import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { registerBlockType, type BlockEditProps } from "@wordpress/blocks";
import { PanelBody, SelectControl } from "@wordpress/components";
import { createElement, Fragment } from "@wordpress/element";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import { readOnlyRows, useLoad, useSvelte } from "../shared/editor";
import EditorPlaceholder from "../shared/EditorPlaceholder.svelte";
import { getAssets, type Asset } from "./api";
import metadata from "./block.json";
import DecennialCycles from "./DecennialCycles.svelte";

type Attributes = { asset?: string };

type SetAttributes = BlockEditProps<Attributes>["setAttributes"];

function assetControl(assets: Asset[], attributes: Attributes, setAttributes: SetAttributes) {
    const match = assets.find(({ id }) => id === attributes.asset);
    const groups = Map.groupBy(assets, (candidate) => candidate.group);
    return createElement(
        SelectControl,
        {
            label: "Asset",
            value: match?.id ?? "",
            onChange: (value: string) => setAttributes({ asset: assets.find(({ id }) => id === value)?.id }),
            __next40pxDefaultSize: true
        },
        createElement("option", { value: "" }, "First asset"),
        [...groups].map(([group, members]) =>
            createElement(
                "optgroup",
                { key: group, label: group },
                members.map((member) => createElement("option", { key: member.id, value: member.id }, member.name))
            )
        )
    );
}

function Edit({ attributes, setAttributes }: BlockEditProps<Attributes>) {
    const { asset } = attributes;
    const assets = useLoad(getAssets);
    const placeholder = useSvelte(EditorPlaceholder, assets.status === "denied" ? { feature: metadata.title } : null);
    const preview = useSvelte(DecennialCycles, assets.status === "ready" ? { attributes: { asset }, card: null, instance: null } : null);
    const blockProps = useBlockProps();

    const controls =
        assets.status === "ready" && assets.value?.length
            ? assetControl(assets.value, attributes, setAttributes)
            : readOnlyRows([["Asset", asset ?? "First asset"]]);

    return createElement(
        Fragment,
        null,
        createElement(InspectorControls, null, createElement(PanelBody, { title: "Defaults" }, controls)),
        createElement(
            "div",
            blockProps,
            createElement(
                "div",
                { key: assets.status, ref: assets.status === "denied" ? placeholder : preview, className: "tia-design-system" },
                assets.status === "loading" && createElement("div", { className: "h-90 sm:h-120" })
            )
        )
    );
}

// A JSON import widens `align` to string[]; restating it gives the BlockAlignment[] the type wants.
registerBlockType<Attributes>(
    { ...metadata, supports: { ...metadata.supports, align: ["wide", "full"] } },
    { edit: Edit, save: () => null }
);

reloadStylesOnHotUpdate();
