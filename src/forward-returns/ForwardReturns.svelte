<script lang="ts">
    import { onMount } from "svelte";
    import Alert from "tia-design-system/ui/alert/Alert.svelte";
    import Button from "tia-design-system/ui/button/Button.svelte";
    import RadioGroup from "tia-design-system/ui/radio-group/RadioGroup.svelte";
    import Select from "tia-design-system/ui/select/Select.svelte";
    import Spinner from "tia-design-system/ui/spinner/Spinner.svelte";
    import AccessCard from "../shared/AccessCard.svelte";
    import { ApiError, type ErrorKind } from "../shared/api";
    import type { Boot } from "../shared/boot";
    import { getAssets, getForwardReturns, type Asset, type ForwardReturns, type Selection } from "./api";
    import {
        MONTH_NAMES,
        assetKey,
        cellValue,
        entryMonths,
        formatReturn,
        periodOptions,
        pickSelection,
        selectAsset,
        toneOf,
        type Tone
    } from "./transforms";

    let { boot }: { boot: Boot } = $props();

    let root = $state<HTMLDivElement>();
    let assets = $state.raw<Asset[]>([]);
    let selection = $state.raw<Selection | null>(null);
    // The table on screen; headers and rows both come from it, so a refetch never mixes old data with new headers.
    let shown = $state.raw<{ period: number; data: ForwardReturns } | null>(null);
    let request = $state.raw<AbortController | null>(null);
    let failure = $state.raw<{ kind: ErrorKind; retry: () => void } | null>(null);

    const currentAsset = $derived(assets.find((asset) => selection !== null && assetKey(asset) === assetKey(selection)));
    const years = $derived(shown?.data.periods.find(({ period }) => period === shown?.period)?.returns ?? []);
    const months = $derived(shown ? entryMonths(shown.period) : []);

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
            assets = await getAssets();
            selection = pickSelection(boot.attributes, assets);
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
        const current = selection;
        if (!current) {
            return;
        }
        request?.abort();
        const own = new AbortController();
        request = own;
        failure = null;
        try {
            const data = await getForwardReturns(current, own.signal);
            if (request === own) {
                shown = { period: current.period, data };
            }
        } catch (error) {
            if (request === own) {
                fail(error, loadData);
            }
        } finally {
            if (request === own) {
                request = null;
            }
        }
    }

    function pickAsset(key: string) {
        const asset = assets.find((candidate) => assetKey(candidate) === key);
        if (!asset || !selection || key === assetKey(selection)) {
            return;
        }
        selection = selectAsset(asset, selection.period);
        loadData();
    }

    function pickPeriod(value: string) {
        const period = Number(value);
        if (!selection || period === selection.period) {
            return;
        }
        selection = { ...selection, period };
        loadData();
    }

    onMount(() => {
        if (!boot.card) {
            loadAssets();
        }
    });
</script>

{#snippet problem({ kind, retry }: { kind: ErrorKind; retry: () => void })}
    <Alert variant="destructive">
        {#if kind === "access"}
            Your access has changed. Reload the page.
        {:else}
            <p>This data is not available right now.</p>
            <Button variant="outline" size="sm" class="mt-3" onclick={retry}>Try again</Button>
        {/if}
    </Alert>
{/snippet}

{#snippet loading()}
    <div class="flex min-h-80 items-center justify-center">
        <Spinner size="lg" tone="muted" label="Loading Forward Returns" />
    </div>
{/snippet}

<div bind:this={root}>
    {#if boot.card}
        <AccessCard feature="Forward Returns" card={boot.card} />
    {:else if !selection}
        {#if failure}
            {@render problem(failure)}
        {:else}
            {@render loading()}
        {/if}
    {:else}
        <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
            <Select
                label="Asset"
                class="sm:w-64"
                items={assets.map((asset) => ({ value: assetKey(asset), label: asset.title, group: asset.group }))}
                portalTarget={root}
                value={assetKey(selection)}
                onValueChange={pickAsset} />
            <RadioGroup
                label="Holding Period"
                orientation="horizontal"
                size="sm"
                items={currentAsset ? periodOptions(currentAsset) : []}
                value={String(selection.period)}
                onValueChange={pickPeriod} />
        </div>
        {#if failure}
            {@render problem(failure)}
        {:else if !shown}
            {@render loading()}
        {:else}
            <div class="relative" aria-busy={request ? "true" : undefined}>
                <div class={["overflow-x-auto transition-opacity duration-150", request && "opacity-50"]}>
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
                {#if request}
                    <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <Spinner size="lg" tone="muted" label="Loading Forward Returns" />
                    </div>
                {/if}
            </div>
        {/if}
    {/if}
</div>
