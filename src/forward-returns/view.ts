import { mount } from "svelte";
import { readBoot } from "../shared/boot";
import { reloadStylesOnHotUpdate } from "../shared/dev-styles";
import ForwardReturns from "./ForwardReturns.svelte";

for (const target of document.querySelectorAll<HTMLElement>(".wp-block-tia-elements-forward-returns > [data-boot]")) {
    mount(ForwardReturns, { target, props: { boot: readBoot(target.dataset.boot) } });
}

reloadStylesOnHotUpdate();
