/** Worker bindings: generated Env (wrangler types) plus secrets set with `wrangler secret put`. */
export type Bindings = Env & {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export type AppEnv = { Bindings: Bindings };
