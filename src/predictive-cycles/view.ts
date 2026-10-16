import { mount } from "svelte";
import { readBoot } from "../shared/boot";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import PredictiveCycles from "./PredictiveCycles.svelte";

for (const target of document.querySelectorAll<HTMLElement>(".wp-block-tia-elements-predictive-cycles > [data-boot]")) {
    const { attributes, card, instance } = readBoot(target.dataset.boot);
    mount(PredictiveCycles, { target, props: { attributes, card, instance } });
}

reloadStylesOnHotUpdate();
