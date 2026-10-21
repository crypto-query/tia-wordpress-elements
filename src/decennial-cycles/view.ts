import { mount } from "svelte";
import { readBoot } from "../shared/boot";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import DecennialCycles from "./DecennialCycles.svelte";

for (const target of document.querySelectorAll<HTMLElement>(".wp-block-tia-elements-decennial-cycles > [data-boot]")) {
    const { attributes, card, instance } = readBoot(target.dataset.boot);
    mount(DecennialCycles, { target, props: { attributes, card, instance } });
}

reloadStylesOnHotUpdate();
