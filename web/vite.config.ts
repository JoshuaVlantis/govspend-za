import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps asset paths relative so the static build can be hosted anywhere.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
