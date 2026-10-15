import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { registerBlockType, type BlockEditProps } from "@wordpress/blocks";
import { PanelBody, RadioControl, SelectControl } from "@wordpress/components";
import { createElement, Fragment } from "@wordpress/element";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import { readOnlyRows, useLoad, useSvelte } from "../shared/editor";
import EditorPlaceholder from "../shared/EditorPlaceholder.svelte";
import { getAssets, type Asset } from "./api";
import metadata from "./block.json";
import ForwardReturns from "./ForwardReturns.svelte";
import { HOLDING_PERIODS, assetKey, periodOptions, pickSelection, selectAsset } from "./transforms";

type Attributes = { base?: string; quote?: string; period?: number };

type SetAttributes = BlockEditProps<Attributes>["setAttributes"];

function assetControls(assets: Asset[], attributes: Attributes, setAttributes: SetAttributes) {
    const match = assets.find((asset) => asset.base === attributes.base && asset.quote === attributes.quote);
    const shown = pickSelection(attributes, assets);
    const asset = assets.find((candidate) => shown && assetKey(candidate) === assetKey(shown));
    const groups = Map.groupBy(assets, (candidate) => candidate.group);
    return [
        createElement(
            SelectControl,
            {
                key: "asset",
                label: "Asset",
                value: match ? assetKey(match) : "",
                onChange: (value: string) => {
                    const next = assets.find((candidate) => assetKey(candidate) === value);
                    setAttributes(
                        (next && selectAsset(next, attributes.period)) ?? { base: undefined, quote: undefined, period: undefined }
                    );
                },
                __next40pxDefaultSize: true
            },
            createElement("option", { value: "" }, "First asset"),
            [...groups].map(([group, members]) =>
                createElement(
                    "optgroup",
                    { key: group, label: group },
                    members.map((member) => createElement("option", { key: assetKey(member), value: assetKey(member) }, member.title))
                )
            )
        ),
        asset &&
            shown &&
            createElement(RadioControl, {
                key: "period",
                label: "Holding Period",
                options: periodOptions(asset),
                selected: String(shown.period),
                // The view reads `period` only beside a `base/quote` it knows, so pin the shown asset with it.
                onChange: (value: string) => setAttributes({ base: shown.base, quote: shown.quote, period: Number(value) })
            })
    ];
}

function Edit({ attributes, setAttributes }: BlockEditProps<Attributes>) {
    const { base, quote, period } = attributes;
    const assets = useLoad(getAssets);
    const placeholder = useSvelte(EditorPlaceholder, assets.status === "denied" ? { feature: metadata.title } : null);
    const preview = useSvelte(
        ForwardReturns,
        assets.status === "ready" ? { attributes: { base, quote, period }, card: null, instance: null } : null
    );
    const blockProps = useBlockProps();

    const controls =
        assets.status === "ready" && assets.value?.length
            ? assetControls(assets.value, attributes, setAttributes)
            : readOnlyRows([
                  ["Asset", base && quote ? `${base}/${quote}` : "First asset"],
                  ["Holding Period", period === undefined ? "Smallest" : (HOLDING_PERIODS.get(period) ?? String(period))]
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
                assets.status === "loading" && createElement("div", { className: "min-h-80" })
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
