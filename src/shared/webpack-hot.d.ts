// The part of webpack's HMR API the dev style reload uses; `undefined` outside `wp-scripts start --hot`.
interface ImportMeta {
    readonly webpackHot?: {
        addStatusHandler(handler: (status: string) => void): void;
    };
}
