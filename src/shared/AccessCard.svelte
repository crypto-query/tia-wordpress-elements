<script lang="ts">
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Card from "tia-design-system/ui/card/Card.svelte";
    import type { Card as BootCard } from "./boot";
    import { priceText } from "./price";
    import PurchaseCard from "./PurchaseCard.svelte";

    type Props = {
        /** The Element's name, as in "Your plan does not include {feature}." */
        feature: string;
        card: BootCard;
        /** Called by Try again on the Unavailable card. */
        onRetry?: () => void;
    };

    let { feature, card, onRetry = () => location.reload() }: Props = $props();

    const price = $derived(card.priceHtml ? priceText(card.priceHtml) : "");
    const plan = $derived(card.source === "indicator-suite" ? "TIA Indicator Suite" : "TIA Pro");
</script>

{#if card.case === "purchase"}
    <PurchaseCard {feature} priceHtml={card.priceHtml} ctaUrl={card.ctaUrl} loginUrl={card.loginUrl} />
{:else}
    <Card class="flex flex-col items-start gap-4">
        {#if card.case === "upgrade"}
            <h3 class="font-heading text-2xl/tight font-semibold text-foreground">Upgrade to TIA Pro.</h3>
            <p class="text-md text-foreground-muted">
                Your plan does not include {feature}. TIA Pro includes Forward Returns, Predictive Cycles and Decennial Cycles.
            </p>
            <Button href={card.ctaUrl} variant="accent">
                Upgrade{price ? ` · ${price}` : ""}
            </Button>
        {:else if card.case === "trial"}
            <h3 class="font-heading text-2xl/tight font-semibold text-foreground">Forward Returns unlocks after your trial.</h3>
            <p class="text-md text-foreground-muted">It becomes available when your {plan} subscription starts.</p>
        {:else}
            <p class="text-md text-foreground-muted">This data is not available right now.</p>
            <Button variant="outline" onclick={onRetry}>Try again</Button>
        {/if}
    </Card>
{/if}
