export type Env = {
  DB: D1Database;
  ASSETS?: Fetcher;
  META_APP_SECRET: string;
  META_VERIFY_TOKEN: string;
  META_PAGE_TOKEN: string;
  META_GRAPH_VERSION: string;
};

export type SessionUser = { id: string; username: string; name: string };

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
