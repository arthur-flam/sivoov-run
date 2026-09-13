/** Worker bindings: generated Env (wrangler types) plus optional vars/secrets. */
export type Bindings = Env & {
  EMAIL_FROM?: string;
  /** Fixed sign-in code accepted for test accounts only (local and preview). See docs/ACCESS.md. */
  TEST_CODE?: string;
  /** Mapbox public token (pk.) for the Static Images API, `wrangler secret put MAPBOX_TOKEN`. */
  MAPBOX_TOKEN?: string;
};

export type AppEnv = { Bindings: Bindings };
