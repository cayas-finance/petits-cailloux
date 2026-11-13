export interface Bindings {
  DB: D1Database;
  /** Images and files attached to pitches */
  ATTACHMENTS: R2Bucket;
  /** Cloudflare Access team domain, e.g. cayas.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access application audience (AUD) tag */
  ACCESS_AUD?: string;
  /** Allowed e-mail domain, cayas.fr by default */
  ALLOWED_DOMAIN?: string;
  /** Local development only */
  DEV_EMAIL?: string;
}

export interface Env {
  Bindings: Bindings;
  Variables: { email: string };
}
