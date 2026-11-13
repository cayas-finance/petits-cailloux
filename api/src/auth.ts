import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env';

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

export const authenticate = createMiddleware<Env>(async (c, next) => {
  const domain = (c.env.ALLOWED_DOMAIN || 'cayas.fr').toLowerCase();

  // Local development only: DEV_EMAIL is set in .dev.vars, never in production.
  if (c.env.DEV_EMAIL) {
    c.set('email', c.env.DEV_EMAIL.toLowerCase());
    return next();
  }

  const token = c.req.header('cf-access-jwt-assertion');
  if (!token || !c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUD) {
    return c.json({ error: 'Accès réservé. Connectez-vous avec votre compte Cayas.' }, 401);
  }
  try {
    const { payload } = await jwtVerify(token, jwks(c.env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${c.env.ACCESS_TEAM_DOMAIN}`,
      audience: c.env.ACCESS_AUD,
    });
    const email = String(payload['email'] ?? '').toLowerCase();
    if (!email.endsWith('@' + domain)) {
      return c.json({ error: `Accès réservé aux adresses @${domain}.` }, 403);
    }
    c.set('email', email);
  } catch {
    return c.json({ error: 'Session expirée. Rechargez la page.' }, 401);
  }
  return next();
});
