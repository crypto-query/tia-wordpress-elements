import { existsSync, realpathSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Worktrees symlink `node_modules` to the main checkout; without its real path here, Vite
// refuses to serve files from it.
const linkedNodeModules = existsSync("node_modules") ? realpathSync("node_modules") : null;

export default defineConfig({
    plugins: [tailwindcss(), svelte()],
    server: {
        fs: {
            allow: linkedNodeModules ? [process.cwd(), linkedNodeModules] : [process.cwd()]
        }
    }
});
