import { app } from "./app";
import { giro } from "./cron";
import type { Env } from "./env";

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(giro(env, event.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
