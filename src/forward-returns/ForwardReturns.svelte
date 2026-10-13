<script lang="ts">
    import type { Boot } from "../shared/boot";
    import PurchaseCard from "../shared/PurchaseCard.svelte";

    let { boot }: { boot: Boot } = $props();
</script>

{#if boot.card?.case === "purchase"}
    <PurchaseCard feature="Forward Returns" priceHtml={boot.card.priceHtml} ctaUrl={boot.card.ctaUrl} loginUrl={boot.card.loginUrl} />
{/if}
