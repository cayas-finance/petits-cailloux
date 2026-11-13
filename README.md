# Petits cailloux

Outil interne de Cayas pour la méthode produit **Petit Poucet** : cap trimestriel, cycles de 4 semaines, pitchs et suivi.

Première étape livrée : **trimestres, objectifs et cycles**.

- Un trimestre porte 1 ou 2 objectifs.
- Il se découpe en 3 cycles de 4 semaines au plus. Un cycle commence un lundi, pendant le trimestre, sans chevaucher un autre cycle.

## Stack

| Partie | Choix |
| --- | --- |
| Interface | Angular (composants autonomes, signals) + [Zard UI](https://zardui.com) sur Tailwind v4, dans `web/` |
| API | Cloudflare Worker avec [Hono](https://hono.dev), dans `api/` |
| Données | Cloudflare D1 (SQLite) avec [Drizzle](https://orm.drizzle.team), migrations dans `api/migrations/` |
| Accès | Cloudflare Access + Google Workspace, réservé aux adresses `@cayas.fr` |

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

## Mettre en ligne (une fois)

1. **Base D1** : `npx wrangler d1 create petits-cailloux`, puis reporter l'identifiant affiché dans `database_id` de `wrangler.jsonc`.
2. **Stockage des fichiers (R2)** : activer R2 sur le compte (offre gratuite jusqu'à 10 Go), puis `npx wrangler r2 bucket create petits-cailloux-fichiers`.
3. **Migrations** : `npm run db:migrate:remote`.
4. **Déploiement** : `npm run deploy`. Le Worker est publié sur `petits-cailloux.<compte>.workers.dev` (ou un domaine personnalisé).
5. **Cloudflare Access** (Zero Trust → Access → Applications) :
   - ajouter Google Workspace comme fournisseur d'identité ;
   - créer une application *Self-hosted* sur le domaine du Worker ;
   - politique *Allow* avec la règle *Emails ending in* `@cayas.fr`.
6. **Variables du Worker** (Workers → petits-cailloux → Settings → Variables) :
   - `ACCESS_EQUIPE` : le domaine d'équipe, par ex. `cayas.cloudflareaccess.com` ;
   - `ACCESS_AUD` : l'*Application Audience (AUD) Tag* de l'application Access.

Le Worker vérifie la signature du jeton Access à chaque appel et refuse toute adresse hors `@cayas.fr`. Sans ces deux variables, l'API refuse tout.
