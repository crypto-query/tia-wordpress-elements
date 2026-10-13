<script lang="ts">
    import Card from "tia-design-system/ui/card/Card.svelte";

    let { feature }: { feature: string } = $props();
</script>

<Card flat padding="md" class="flex flex-col gap-1">
    <p class="font-heading text-lg font-semibold text-foreground">{feature}</p>
    <p class="text-md text-foreground-muted">Preview needs TIA Pro access</p>
</Card>
