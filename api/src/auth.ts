import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env';

// Cloudflare Access protège le site devant le Worker. Le Worker vérifie
// quand même le jeton signé qu'Access ajoute à chaque requête, pour ne
// jamais faire confiance à un en-tête qu'on pourrait forger.
const jwksParEquipe = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(equipe: string) {
  let j = jwksParEquipe.get(equipe);
  if (!j) {
    j = createRemoteJWKSet(new URL(`https://${equipe}/cdn-cgi/access/certs`));
    jwksParEquipe.set(equipe, j);
  }
  return j;
}

export const authentifier = createMiddleware<Env>(async (c, next) => {
  const domaine = (c.env.DOMAINE_AUTORISE || 'cayas.fr').toLowerCase();

  // Développement local uniquement : DEV_EMAIL est défini dans .dev.vars, jamais en production.
  if (c.env.DEV_EMAIL) {
    c.set('email', c.env.DEV_EMAIL.toLowerCase());
    return next();
  }

  const jeton = c.req.header('cf-access-jwt-assertion');
  if (!jeton || !c.env.ACCESS_EQUIPE || !c.env.ACCESS_AUD) {
    return c.json({ erreur: 'Accès réservé. Connectez-vous avec votre compte Cayas.' }, 401);
  }
  try {
    const { payload } = await jwtVerify(jeton, jwks(c.env.ACCESS_EQUIPE), {
      issuer: `https://${c.env.ACCESS_EQUIPE}`,
      audience: c.env.ACCESS_AUD,
    });
    const email = String(payload['email'] ?? '').toLowerCase();
    if (!email.endsWith('@' + domaine)) {
      return c.json({ erreur: `Accès réservé aux adresses @${domaine}.` }, 403);
    }
    c.set('email', email);
  } catch {
    return c.json({ erreur: 'Session expirée. Rechargez la page.' }, 401);
  }
  return next();
});
