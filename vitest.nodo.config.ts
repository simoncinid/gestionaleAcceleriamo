import { defineConfig } from "vitest/config";

// Prove che hanno bisogno del computer vero (file fuori dal repo): girano in Node, non nel runtime del Worker.
export default defineConfig({ test: { include: ["tests-nodo/**/*.test.ts"], environment: "node" } });
