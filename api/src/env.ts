import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export interface Bindings {
  DB: D1Database;
  /** Images and files attached to pitches */
  ATTACHMENTS: R2Bucket;
  /** Grants, tokens and clients of the MCP server's OAuth */
  OAUTH_KV: KVNamespace;
  /** Set by the OAuth provider for the /authorize page */
  OAUTH_PROVIDER: OAuthHelpers;
  /** Cloudflare Access team domain, e.g. cayas.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access application audience (AUD) tag */
  ACCESS_AUD?: string;
  /** Allowed e-mail domain, cayas.fr by default */
  ALLOWED_DOMAIN?: string;
  /** Local development only */
  DEV_EMAIL?: string;
  /**
   * Set only by the MCP server when it calls the API in-process for a signed-in user.
   * Never a Worker variable: requests from outside can't set it.
   */
  ACTING_EMAIL?: string;
}

export interface Env {
  Bindings: Bindings;
  Variables: { email: string };
}
