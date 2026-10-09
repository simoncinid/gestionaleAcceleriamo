import { app } from "./app";
import type { Env } from "./env";
import { retryPendingMetaLeads } from "./meta/ingest";

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(retryPendingMetaLeads(env));
  },
} satisfies ExportedHandler<Env>;
