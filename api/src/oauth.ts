import { AuthorizationError, CimdFetchError, type ConsentDescription } from '@cloudflare/workers-oauth-provider';
import { identify } from './auth';
import type { Bindings } from './env';

/** The only scope: read the method's data and write pitches, as the signed-in user. */
export const MCP_SCOPE = 'pitch';

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * The OAuth authorization page of the MCP server. It sits behind Cloudflare Access like the
 * rest of the site: the user is already signed in with their Cayas address, and only has to
 * allow the AI client to act on their behalf.
 */
export async function authorize(request: Request, env: Bindings): Promise<Response> {
  const who = await identify(request, env);
  if ('error' in who) return page(who.error, who.status);
  const oauth = env.OAUTH_PROVIDER;

  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      consent.headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(consentPage(details, consent.handle, who.email), { headers: consent.headers });
    }
    if (request.method === 'POST') {
      const form = await request.formData();
      const handle = String(form.get('handle') ?? '');
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(request, handle, { scope: [MCP_SCOPE] });
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: who.email,
        metadata: {},
        scope: [MCP_SCOPE],
        props: { email: who.email },
      });
      approved.headers.set('Location', redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
    return page('Méthode non prise en charge.', 405);
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError) {
      return page('Cette demande de connexion a expiré ou n’est pas valide. Relancez la connexion depuis votre outil d’IA.', 400);
    }
    if (error instanceof CimdFetchError) return page('Impossible de vérifier cette application.', 400);
    throw error;
  }
}

function consentPage(details: ConsentDescription, handle: string, email: string): string {
  const name = escape(details.clientName);
  const origin = details.clientDomain
    ? `Application publiée par <strong>${escape(details.clientDomain)}</strong>.`
    : 'Cette application s’est déclarée elle-même : son nom n’est pas vérifié.';
  const local = details.redirectIsLoopback
    ? '<p class="warn">L’accès sera envoyé à une application de votre ordinateur. Continuez seulement si vous venez de lancer la connexion depuis celle-ci.</p>'
    : '';
  return layout(
    `Autoriser ${name}`,
    `<h1>Autoriser ${name} à utiliser Petits cailloux ?</h1>
<p>${origin} L’accès sera envoyé à <strong>${escape(details.redirectHost)}</strong>.</p>
${local}
<p>Elle pourra, en votre nom (${escape(email)}) :</p>
<ul>
  <li>lire les trimestres, les objectifs et les projets ;</li>
  <li>créer un pari et rédiger ou modifier un pitch.</li>
</ul>
<p>Elle ne pourra ni supprimer ni changer le statut d’un projet.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <button name="decision" value="approve">Autoriser</button>
  <button name="decision" value="deny" class="secondary">Refuser</button>
</form>`,
  );
}

function page(message: string, status: number): Response {
  return new Response(layout('Petits cailloux', `<h1>Petits cailloux</h1><p>${escape(message)}</p>`), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' },
  });
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Petits cailloux</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 34rem; margin: 3rem auto; padding: 0 1rem; color: #1c1917; }
  h1 { font-size: 1.3rem; }
  .warn { padding: .75rem; border-radius: .5rem; background: #fef3c7; }
  button { font: inherit; padding: .5rem 1rem; border-radius: .5rem; border: 1px solid #0f766e; background: #0f766e; color: white; cursor: pointer; }
  button.secondary { background: white; color: #1c1917; border-color: #d6d3d1; margin-left: .5rem; }
</style>
<body>${body}</body>
</html>`;
}
