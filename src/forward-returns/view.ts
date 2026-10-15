import { mount } from "svelte";
import { readBoot } from "../shared/boot";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import ForwardReturns from "./ForwardReturns.svelte";

for (const target of document.querySelectorAll<HTMLElement>(".wp-block-tia-elements-forward-returns > [data-boot]")) {
    const { attributes, card, instance } = readBoot(target.dataset.boot);
    mount(ForwardReturns, { target, props: { attributes, card, instance } });
}

reloadStylesOnHotUpdate();
