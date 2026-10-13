<script lang="ts">
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Card from "tia-design-system/ui/card/Card.svelte";
    import { priceText } from "./price";

    type Props = {
        /** The Element's name, as in "{feature} is part of TIA Pro." */
        feature: string;
        /** `get_price_html()` of TIA Pro, rendered on the server. */
        priceHtml?: string;
        ctaUrl?: string;
        /** Set for logged-out visitors only. */
        loginUrl?: string;
    };

    let { feature, priceHtml, ctaUrl, loginUrl }: Props = $props();

    const price = $derived(priceHtml ? priceText(priceHtml) : "");
</script>

<Card class="flex flex-col items-start gap-4">
    <h3 class="font-heading text-2xl/tight font-semibold text-foreground">{feature} is part of TIA Pro.</h3>
    <p class="text-md text-foreground-muted">Subscribe to see {feature} for every asset.</p>
    <Button href={ctaUrl} variant="accent">
        Get TIA Pro{price ? ` · ${price}` : ""}
    </Button>
    {#if loginUrl}
        <p class="text-md text-foreground-muted">Already a member? <a href={loginUrl} class="font-semibold text-primary">Log in</a></p>
    {/if}
</Card>
