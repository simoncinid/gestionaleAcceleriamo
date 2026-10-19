// Vercel has no Cloudflare bindings. The API routes already turn a missing
// database into a 503; these stubs only let the server bundle load.
export const env: { DB?: unknown; BUCKET?: unknown } = {};

export class WorkerEntrypoint {
  constructor(_ctx?: unknown, _env?: unknown) {}
}

export class DurableObject {
  constructor(_ctx?: unknown, _env?: unknown) {}
}

export class WorkflowEntrypoint {
  constructor(_ctx?: unknown, _env?: unknown) {}
}
