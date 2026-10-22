/** The screen height below the admin bar, less a 20px margin above and below the card. `svh`: the address bar does not resize it. */
export const SCREEN = "100svh - var(--wp-admin--admin-bar--height, 0px) - 40px";

/** A card's height without the box that fills it: header, padding and the like. */
export class Chrome {
    height = $state(0);
    readonly #card: () => HTMLElement | undefined;

    constructor(card: () => HTMLElement | undefined) {
        this.#card = card;
    }

    /** Attach to the box. Reads both heights in one step: measured apart, the chrome and the box chase each other. */
    measure = (box: HTMLElement) => {
        const observer = new ResizeObserver(() => {
            this.height = (this.#card()?.offsetHeight ?? 0) - box.offsetHeight;
        });
        observer.observe(box);
        const card = this.#card();
        if (card) {
            observer.observe(card);
        }
        return () => observer.disconnect();
    };
}

/**
 * The box height that fills the screen below the chrome, but at most square, so an upright phone gets no tall strip.
 * On a sideways phone the floor wins and the box alone fits. `100cqw` needs the card to be a size container.
 */
export const fitHeight = (chrome: number) => `height: max(min(22.5rem, ${SCREEN}), min(${SCREEN} - ${chrome}px, 100cqw))`;
