# Petits cailloux

Outil interne de Cayas pour la méthode produit **Petit Poucet** : cap trimestriel, cycles de 4 semaines, pitchs et suivi.

- **Roadmap** : le trimestre, ses objectifs, les paris de chaque cycle et ce qui arrive ensuite.
- **Point hebdo** : notes de suivi des paris, décisions sur les sujets courts, infos à diffuser copiables pour Slack.
- **Journal** : chaque point hebdo passé, avec ses décisions datées et signées.
- **Projets** : paris (avec pitch) et sujets courts, filtre des candidats à la betting table.
- **Serveur MCP** : rédiger un pitch avec une IA (Claude, etc.), qui lit les objectifs et les projets et enregistre le pitch.
- **Trimestres et cycles** : 1 ou 2 objectifs, 3 cycles de 4 semaines au plus. Un cycle commence un lundi, pendant le trimestre, sans chevaucher un autre cycle.

## Stack

| Partie | Choix |
| --- | --- |
| Interface | Angular (composants autonomes, signals) + [Zard UI](https://zardui.com) sur Tailwind v4, dans `web/` |
| API | Cloudflare Worker avec [Hono](https://hono.dev), dans `api/` |
| Données | Cloudflare D1 (SQLite) avec [Drizzle](https://orm.drizzle.team), migrations dans `api/migrations/` |
| Accès | Cloudflare Access, réservé aux adresses `@cayas.fr` |
| IA | Serveur MCP sur `/mcp` ([SDK MCP](https://github.com/modelcontextprotocol/typescript-sdk)), OAuth avec [workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider) |

Un seul Worker sert l'interface (fichiers statiques) et l'API (`/api/*`). Voir `wrangler.jsonc`.

> Ce dépôt est public : aucun secret, aucune donnée. Les identifiants Cloudflare se règlent dans le tableau de bord.

## Développer en local

Node 22.22.3+, 24.15+ ou 26 (exigence d'Angular). La version est épinglée pour Volta (`package.json`) et nvm (`.nvmrc`) : elle s'installe d'elle-même.

```bash
npm ci
cp .dev.vars.example .dev.vars        # DEV_EMAIL : se faire passer pour un utilisateur, en local seulement
npm start                             # migrations locales, build, puis http://localhost:8787
```

Pour travailler l'interface avec rechargement à chaud : `npx wrangler dev` dans un terminal, `npm run dev:web` dans un autre (http://localhost:4200, l'API est relayée vers le port 8787).

Tests des règles métier : `npm test`.

Modifier le schéma : éditer `api/src/db/schema.ts`, puis `npm run db:generate`.

Ajouter un composant Zard : `cd web && npx zard-cli@latest add <composant>`. Les composants sont copiés dans `web/src/app/shared/components/` et peuvent être modifiés.

## Mettre en ligne

Tout se fait dans le tableau de bord Cloudflare, sans ligne de commande. Ensuite, chaque merge sur `main` déploie tout seul : build, migrations D1, puis publication du Worker.

### 1. Base de données et stockage (une fois)

1. **D1** (Storage & databases → D1 → Create database) : nom `petits-cailloux`.
2. **R2** (Storage & databases → R2) : activer R2 (offre gratuite jusqu'à 10 Go), puis créer le bucket `petits-cailloux-attachments`.

Le Worker retrouve la base et le bucket par leur nom : aucun identifiant de compte dans le dépôt.

### 2. Déploiement automatique (une fois)

Workers & Pages → Create → **Import a repository** → `cayas-finance/petits-cailloux`, branche `main` :

| Réglage | Valeur |
| --- | --- |
| Nom du projet | `petits-cailloux` (doit être identique au `name` de `wrangler.jsonc`) |
| Build command | *(vide)* |
| Deploy command | `npm run deploy` |

`npm run deploy` construit l'interface, applique les migrations D1 en attente, puis publie le Worker sur `petits-cailloux.<compte>.workers.dev`.

Si l'étape des migrations échoue faute de droits, ajouter la permission *D1 : Edit* au jeton de build (Worker → Settings → Builds → API token).

### 3. Accès réservé à Cayas (une fois)

1. Worker → Settings → Domains & Routes → `workers.dev` → **Enable Cloudflare Access**. Cloudflare crée l'application Access et affiche :
   - le domaine d'équipe, par ex. `cayas.cloudflareaccess.com` ;
   - l'*Application Audience (AUD) Tag*.
2. Zero Trust → Access → Applications → l'application créée → politique *Allow* avec la règle **Emails ending in** `@cayas.fr` (à la place de la règle par défaut).
3. Worker → Settings → Variables and Secrets, ajouter en texte :
   - `ACCESS_TEAM_DOMAIN` : le domaine d'équipe ;
   - `ACCESS_AUD` : l'AUD Tag.

`keep_vars` (dans `wrangler.jsonc`) empêche les déploiements suivants d'effacer ces deux variables.

Par défaut, on se connecte avec un code reçu par mail (*One-time PIN*). Pour se connecter avec son compte Google Cayas :
1. créer un client OAuth dans Google Cloud, avec l'URI de redirection `https://<domaine d'équipe>/cdn-cgi/access/callback` ;
2. l'ajouter dans Zero Trust → Settings → Authentication → Login methods → **Google Workspace**.

Le Worker vérifie la signature du jeton Access à chaque appel et refuse toute adresse hors `@cayas.fr`. Sans les deux variables, l'API refuse tout.

### 4. Brancher une IA (serveur MCP, une fois)

Le serveur MCP est sur `https://<adresse de l'outil>/mcp`. Un outil d'IA ne sait pas passer l'écran de Cloudflare Access : il se connecte par OAuth, et chacun autorise l'accès une fois depuis son navigateur, avec son adresse `@cayas.fr`. La page d'autorisation (`/authorize`) reste derrière Access.

**Exception Access** (Zero Trust → Contrôles Access → Applications → Ajouter une application → *Self-hosted*) :

- nom : `petits-cailloux MCP` ;
- destinations, toutes sur le domaine de l'outil : chemins `mcp`, `token`, `register` et `.well-known/*` ;
- politique : action **Bypass** (Contourner), règle *Inclure → Everyone*.

Ces chemins ne donnent rien sans jeton OAuth : le Worker vérifie chaque appel, et les jetons ne s'obtiennent qu'après connexion Access et autorisation.

**Dans Claude** : Paramètres → Connecteurs → *Ajouter un connecteur personnalisé*, URL `https://<adresse de l'outil>/mcp`. Dans Claude Code : `claude mcp add --transport http petits-cailloux https://<adresse de l'outil>/mcp`.

L'IA peut lire les trimestres, les objectifs et les projets, créer un pari et rédiger un pitch. Elle ne peut ni supprimer ni changer un statut. Chaque modification porte l'adresse de la personne qui l'a autorisée.

### Déployer à la main (dépannage)

```bash
npx wrangler login
npm run deploy
```
