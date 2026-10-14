<script lang="ts">
    import AccessCard from "../shared/AccessCard.svelte";
    import type { Boot } from "../shared/boot";

    let { boot }: { boot: Boot } = $props();
</script>

{#if boot.card}
    <AccessCard feature="Forward Returns" card={boot.card} />
{/if}
