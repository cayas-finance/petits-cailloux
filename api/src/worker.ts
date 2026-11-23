import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import api from './index';
import { mcpHandler } from './mcp';
import { MCP_SCOPE, authorize } from './oauth';
import { slackEvents, slackInteractions } from './slack';
import type { Bindings } from './env';

/**
 * Entry point of the Worker. The interface's static files are served by Cloudflare before
 * reaching it (see run_worker_first in wrangler.jsonc). Here:
 * - /api/*: the API, behind Cloudflare Access, used by the interface;
 * - /mcp: the MCP server, behind OAuth, used by AI clients such as Claude;
 * - /authorize: where a user allows an AI client, behind Cloudflare Access;
 * - /slack/interactions, /slack/events: the Slack app's shortcut and :rock: reaction, outside Access,
 *   checked with Slack's signature;
 * - /token, /register, /.well-known/*: OAuth endpoints, answered by the provider.
 */
const defaultHandler = {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path === '/authorize') return authorize(request, env);
    if (path === '/slack/interactions') return slackInteractions(request, env, ctx);
    if (path === '/slack/events') return slackEvents(request, env, ctx);
    return api.fetch(request, env, ctx);
  },
};

// The resource URL depends on where the Worker is served: one provider per origin.
const providers = new Map<string, OAuthProvider<Bindings>>();

function provider(origin: string) {
  let p = providers.get(origin);
  if (!p) {
    p = new OAuthProvider<Bindings>({
      apiRoute: '/mcp',
      apiHandler: mcpHandler,
      defaultHandler,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      clientIdMetadataDocumentEnabled: true,
      scopesSupported: [MCP_SCOPE],
      resourceMetadata: { resource: `${origin}/mcp` },
    });
    providers.set(origin, p);
  }
  return p;
}

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return provider(new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Bindings>;
