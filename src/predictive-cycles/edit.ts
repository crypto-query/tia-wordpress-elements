import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { registerBlockType, type BlockEditProps } from "@wordpress/blocks";
import { PanelBody, SelectControl } from "@wordpress/components";
import { createElement, Fragment } from "@wordpress/element";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import { readOnlyRows, useLoad, useSvelte } from "../shared/editor";
import EditorPlaceholder from "../shared/EditorPlaceholder.svelte";
import { getAssets, type Asset } from "./api";
import metadata from "./block.json";
import PredictiveCycles from "./PredictiveCycles.svelte";
import { pickSelection } from "./transforms";

type Attributes = { asset?: string; baseYear?: number };

type SetAttributes = BlockEditProps<Attributes>["setAttributes"];

const DEFAULT_YEAR = "Current year, else newest";

function assetControls(assets: Asset[], attributes: Attributes, setAttributes: SetAttributes) {
    const match = assets.find(({ id }) => id === attributes.asset);
    const shown = pickSelection(attributes, assets, new Date());
    const years = shown?.asset.base_years ?? [];
    const groups = Map.groupBy(assets, (candidate) => candidate.group);
    return [
        createElement(
            SelectControl,
            {
                key: "asset",
                label: "Asset",
                value: match?.id ?? "",
                onChange: (value: string) => {
                    const next = assets.find(({ id }) => id === value);
                    // The Base Year is kept by value when the new asset lists it, as in the view; "First asset" means the first.
                    const years = (next ?? assets[0])?.base_years ?? [];
                    const kept = attributes.baseYear !== undefined && years.includes(attributes.baseYear);
                    setAttributes({ asset: next?.id, baseYear: kept ? attributes.baseYear : undefined });
                },
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
        ),
        createElement(
            SelectControl,
            {
                key: "baseYear",
                label: "Base Year",
                value: attributes.baseYear !== undefined && years.includes(attributes.baseYear) ? String(attributes.baseYear) : "",
                onChange: (value: string) => setAttributes({ baseYear: value ? Number(value) : undefined }),
                __next40pxDefaultSize: true
            },
            createElement("option", { value: "" }, DEFAULT_YEAR),
            years.map((year) => createElement("option", { key: year, value: String(year) }, year))
        )
    ];
}

function Edit({ attributes, setAttributes }: BlockEditProps<Attributes>) {
    const { asset, baseYear } = attributes;
    const assets = useLoad(getAssets);
    const placeholder = useSvelte(EditorPlaceholder, assets.status === "denied" ? { feature: metadata.title } : null);
    const preview = useSvelte(
        PredictiveCycles,
        assets.status === "ready" ? { attributes: { asset, baseYear }, card: null, instance: null } : null
    );
    const blockProps = useBlockProps();

    const controls =
        assets.status === "ready" && assets.value?.length
            ? assetControls(assets.value, attributes, setAttributes)
            : readOnlyRows([
                  ["Asset", asset ?? "First asset"],
                  ["Base Year", baseYear === undefined ? DEFAULT_YEAR : String(baseYear)]
              ]);

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
