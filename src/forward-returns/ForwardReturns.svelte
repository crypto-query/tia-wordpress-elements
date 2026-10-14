<script lang="ts">
    import { onMount } from "svelte";
    import Alert from "tia-design-system/ui/alert/Alert.svelte";
    import Button from "tia-design-system/ui/button/Button.svelte";
    import Spinner from "tia-design-system/ui/spinner/Spinner.svelte";
    import AccessCard from "../shared/AccessCard.svelte";
    import { ApiError, type ErrorKind } from "../shared/api";
    import type { Boot } from "../shared/boot";
    import { getAssets, getForwardReturns, type ForwardReturns, type Selection } from "./api";
    import { MONTH_NAMES, cellValue, entryMonths, formatReturn, pickSelection, toneOf, type Tone } from "./transforms";

    let { boot }: { boot: Boot } = $props();

    let selection = $state.raw<Selection | null>(null);
    let data = $state.raw<ForwardReturns | null>(null);
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);

    const years = $derived(data?.periods.find(({ period }) => period === selection?.period)?.returns ?? []);
    const months = $derived(selection ? entryMonths(selection.period) : []);

    const tones: Record<Tone, string> = {
        positive: "bg-success-light text-success-strong",
        negative: "bg-error-light text-error-strong",
        zero: "bg-muted text-foreground-muted",
        none: ""
    };

    function fail(error: unknown, retry: () => void) {
        failure = { kind: error instanceof ApiError ? error.kind : "unavailable", retry };
    }

    async function loadAssets() {
        failure = null;
        try {
            selection = pickSelection(boot.attributes, await getAssets());
        } catch (error) {
            fail(error, loadAssets);
            return;
        }
        if (selection) {
            await loadData();
        } else {
            failure = { kind: "unavailable", retry: loadAssets };
        }
    }

    async function loadData() {
        if (!selection) {
            return;
        }
        failure = null;
        try {
            data = await getForwardReturns(selection);
        } catch (error) {
            fail(error, loadData);
        }
    }

    onMount(() => {
        if (!boot.card) {
            loadAssets();
        }
    });
</script>

{#if boot.card}
    <AccessCard feature="Forward Returns" card={boot.card} />
{:else if failure}
    <Alert variant="destructive">
        {#if failure.kind === "access"}
            Your access has changed. Reload the page.
        {:else}
            <p>This data is not available right now.</p>
            <Button variant="outline" size="sm" class="mt-3" onclick={failure.retry}>Try again</Button>
        {/if}
    </Alert>
{:else if !data}
    <div class="flex min-h-80 items-center justify-center">
        <Spinner size="lg" tone="muted" label="Loading Forward Returns" />
    </div>
{:else}
    <div class="overflow-x-auto">
        <table class="border-collapse text-right tabular-nums">
            <thead>
                <tr>
                    <th scope="col" class="sticky left-0 bg-background px-3 py-2 text-left font-semibold">Year</th>
                    {#each months as month (month)}
                        <th scope="col" class="px-3 py-2 font-semibold">{MONTH_NAMES[month - 1]}</th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each years as row (row.year)}
                    <tr class="border-t border-border-muted">
                        <th scope="row" class="sticky left-0 bg-background px-3 py-1 text-left font-semibold">{row.year}</th>
                        {#each months as month (month)}
                            {const value = cellValue(row, month)}
                            <td class="p-1">
                                <span class={["block min-w-20 rounded-md px-2 py-1.5 whitespace-nowrap", tones[toneOf(value)]]}>
                                    {formatReturn(value)}
                                </span>
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
