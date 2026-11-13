# Petits cailloux

Outil interne de Cayas pour la méthode produit Petit Poucet.

## Langue

- **Code en anglais** : identifiants, fichiers, routes (API et interface), tables et colonnes, valeurs d'énumération, commentaires.
- **Ce que voit l'utilisateur en français** : textes de l'interface, messages d'erreur de l'API (`{ error: "..." }`).
- Vocabulaire : trimestre = quarter, objectif = goal, cycle = cycle, projet = project, pari = bet, misé = bet, livré = shipped, écarté = dropped, pitch prêt = ready, fichier joint = attachment, point hebdo = weekly review, note de suivi = progress note, sujet court = short topic (format `short`), demandeur = requester.

## Repères

- `web/` : Angular (composants autonomes, signals, sans zone) + Zard UI (`web/src/app/shared/components/`, code copié, modifiable). Skill : `angular-developer`.
- `api/` : Worker Cloudflare avec Hono, D1 via Drizzle. Règles métier pures dans `api/src/domain.ts`, testées dans `api/test/`. Skills : `wrangler`, `workers-best-practices`.
- Pitch : markdown édité avec OverType (`web/src/app/pitch/`), rendu avec marked + DOMPurify. Fichiers joints dans R2 (`ATTACHMENTS`), servis par `/api/attachments/:id` : seuls images et PDF s'affichent, le reste est téléchargé.
- Point hebdo (`web/src/app/pages/weekly-review.page.ts`) : notes de suivi par pari et par semaine (`progress_notes`), puis sujets courts. Un projet est un pari (`format: bet`, avec owner et pitch long) ou un sujet court (`format: short`, sans owner ni shaping, avec un demandeur ; son pitch est le problème).
- Un seul Worker sert l'interface et l'API (`wrangler.jsonc`, `run_worker_first: ["/api/*"]`).
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

Aucun secret, identifiant de compte ou donnée réelle dans le dépôt. Les réglages Cloudflare (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `database_id` réel) vivent dans le tableau de bord.
