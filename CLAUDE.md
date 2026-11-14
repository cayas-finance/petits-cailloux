# Petits cailloux

Outil interne de Cayas pour la méthode produit Petit Poucet.

## Langue

- **Code en anglais** : identifiants, fichiers, routes (API et interface), tables et colonnes, valeurs d'énumération, commentaires.
- **Ce que voit l'utilisateur en français** : textes de l'interface, messages d'erreur de l'API (`{ error: "..." }`).
- Vocabulaire : trimestre = quarter, objectif = goal, cycle = cycle, projet = project, pari = bet, misé = bet, livré = shipped, écarté = dropped, pitch prêt = ready, fichier joint = attachment, point hebdo = weekly review, note de suivi = progress note, sujet court = short topic (format `short`), demandeur = requester, info à diffuser = announcement, journal des décisions = decision log (route `log`).

## Repères

- `web/` : Angular (composants autonomes, signals, sans zone) + Zard UI (`web/src/app/shared/components/`, code copié, modifiable). Skill : `angular-developer`.
- `api/` : Worker Cloudflare avec Hono, D1 via Drizzle. Règles métier pures dans `api/src/domain.ts`, testées dans `api/test/`. Skills : `wrangler`, `workers-best-practices`.
- Pitch : markdown édité avec OverType (`web/src/app/pitch/`), rendu avec marked + DOMPurify. Fichiers joints dans R2 (`ATTACHMENTS`), servis par `/api/attachments/:id` : seuls images et PDF s'affichent, le reste est téléchargé.
- Point hebdo (`web/src/app/pages/weekly-review.page.ts`) : notes de suivi par pari et par semaine (`progress_notes`), puis sujets courts, puis infos à diffuser : un résumé automatique (notes de la semaine et décisions, tirées de `project_changes` qui date chaque changement de statut ou de format dans le cycle) et des infos ajoutées à la main (`announcements`), le tout copiable pour Slack. Un projet est un pari (`format: bet`, avec owner et pitch long) ou un sujet court (`format: short`, sans owner ni shaping, avec un demandeur ; son pitch est le problème).
- Roadmap (`web/src/app/pages/roadmap.page.ts`) : lecture seule, un trimestre à la fois, une colonne par cycle et une colonne « Prochainement ». Les projets s'ouvrent dans le panneau latéral partagé avec le point hebdo (`project-panel.component.ts`).
- Journal des décisions (`web/src/app/pages/log.page.ts`, `GET /api/log/:quarterId`) : lecture seule, un trimestre à la fois, une entrée par semaine de cycle commencée (la plus récente en haut) avec les décisions (`project_changes`), les notes de suivi et les infos à diffuser ; les décisions sans cycle sont regroupées sous « Hors cycle ».
- Un seul Worker (`api/src/worker.ts`, `wrangler.jsonc`) sert l'interface, l'API (`/api/*`, derrière Cloudflare Access) et le serveur MCP (`/mcp`, `api/src/mcp.ts`) pour rédiger des pitchs avec une IA. Le MCP est protégé par OAuth (`@cloudflare/workers-oauth-provider`, KV `OAUTH_KV`) ; la page d'autorisation `/authorize` (`api/src/oauth.ts`) reste derrière Access. Ses outils appellent l'API en interne au nom de l'utilisateur (`ACTING_EMAIL`), avec les mêmes règles et messages : pas de suppression ni de changement de statut par le MCP.
- Les messages d'erreur de l'API sont en français, dans `{ error: "..." }`, et l'interface les affiche tels quels.

## Règles de la méthode appliquées par l'outil

- Un trimestre : 1 ou 2 objectifs, 3 cycles de 4 semaines au plus.
- Un cycle commence un lundi, pendant le trimestre, sans chevaucher un autre cycle.
- Pas de mesure du temps passé.

## Avant de pousser

```bash
npm test                      # règles métier
(cd api && npx tsc --noEmit)  # types de l'API
npm run build                 # interface
```

Après un changement de `api/src/db/schema.ts` : `npm run db:generate`, puis vérifier le SQL créé dans `api/migrations/`.

## Dépôt public

Aucun secret, identifiant de compte ou donnée réelle dans le dépôt. Les réglages Cloudflare (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) vivent dans le tableau de bord ; la base D1 et le bucket R2 sont retrouvés par leur nom (pas de `database_id` dans `wrangler.jsonc`). Chaque merge sur `main` est déployé par Workers Builds (`npm run deploy`, qui applique aussi les migrations D1) : une migration doit rester compatible avec le code déjà en ligne.
