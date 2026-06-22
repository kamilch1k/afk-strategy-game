import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/afk-strategy-game/" : "/",
  build: {
    target: "esnext",
  },
});
