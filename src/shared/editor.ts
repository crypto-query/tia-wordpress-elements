import { createElement, useEffect, useRef, useState } from "@wordpress/element";
import { mount, unmount, type Component } from "svelte";
import { ApiError } from "./api";

/** Mounts `component` into the returned ref's element while `props` is set; a change in `props` (by JSON) remounts it. */
export function useSvelte<P extends Record<string, unknown>>(component: Component<P>, props: P | null) {
    const root = useRef<HTMLDivElement>(null);
    const key = JSON.stringify(props);
    useEffect(() => {
        if (!root.current || !props) return;
        const view = mount(component, { target: root.current, props });
        return () => {
            void unmount(view);
        };
        // `key` stands in for `props`, which is a new object on every render.
    }, [component, key]);
    return root;
}

/** `denied` on an access error; `ready` with `null` on any other, so the view shows its own error. */
export type Load<T> = { status: "loading" } | { status: "denied" } | { status: "ready"; value: T | null };

/** Runs a memoized load once through the editor's apiFetch, which already has the nonce and the REST root. */
export function useLoad<T>(load: (args: void, signal: AbortSignal) => Promise<T>): Load<T> {
    const [state, setState] = useState<Load<T>>({ status: "loading" });
    useEffect(() => {
        const controller = new AbortController();
        load(undefined, controller.signal).then(
            (value) => controller.signal.aborted || setState({ status: "ready", value }),
            (error: unknown) =>
                controller.signal.aborted ||
                setState(error instanceof ApiError && error.kind === "access" ? { status: "denied" } : { status: "ready", value: null })
        );
        return () => controller.abort();
    }, [load]);
    return state;
}

/** Read-only inspector rows, one "Label: value" line each. */
export const readOnlyRows = (rows: [label: string, value: string][]) =>
    rows.map(([label, value]) => createElement("p", { key: label }, `${label}: ${value}`));
