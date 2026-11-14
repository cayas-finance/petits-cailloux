import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Bindings, Env } from './env';

// Cloudflare Access protects the site in front of the Worker. The Worker still
// verifies the signed token Access adds to every request, so it never trusts a
// header that could be forged.
const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksByTeam.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, set);
  }
  return set;
}

export type Identity = { email: string } | { error: string; status: 401 | 403 };

/** The signed-in Cayas user of a browser request, from its Cloudflare Access token. */
export async function identify(request: Request, env: Bindings): Promise<Identity> {
  const domain = (env.ALLOWED_DOMAIN || 'cayas.fr').toLowerCase();

  // The MCP server, for a user it has already authenticated (see env.ts).
  if (env.ACTING_EMAIL) return { email: env.ACTING_EMAIL.toLowerCase() };
  // Local development only: DEV_EMAIL is set in .dev.vars, never in production.
  if (env.DEV_EMAIL) return { email: env.DEV_EMAIL.toLowerCase() };

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { error: 'Accès réservé. Connectez-vous avec votre compte Cayas.', status: 401 };
  }
  try {
    const { payload } = await jwtVerify(token, jwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    const email = String(payload['email'] ?? '').toLowerCase();
    if (!email.endsWith('@' + domain)) return { error: `Accès réservé aux adresses @${domain}.`, status: 403 };
    return { email };
  } catch {
    return { error: 'Session expirée. Rechargez la page.', status: 401 };
  }
}

export const authenticate = createMiddleware<Env>(async (c, next) => {
  const who = await identify(c.req.raw, c.env);
  if ('error' in who) return c.json({ error: who.error }, who.status);
  c.set('email', who.email);
  return next();
});
