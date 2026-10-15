// @wordpress/block-editor ships no types. The build maps it to the core `wp-block-editor` handle.
declare module "@wordpress/block-editor" {
    export function useBlockProps(props?: Record<string, unknown>): Record<string, unknown>;
    export function InspectorControls(props: { children?: unknown }): unknown;
}
