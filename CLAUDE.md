# Petits cailloux

Outil interne de Cayas pour la méthode produit Petit Poucet. Interface et textes en **français**.

## Repères

- `web/` : Angular (composants autonomes, signals, sans zone) + Zard UI (`web/src/app/shared/components/`, code copié, modifiable). Skill : `angular-developer`.
- `api/` : Worker Cloudflare avec Hono, D1 via Drizzle. Règles métier pures dans `api/src/domain.ts`, testées dans `api/test/`. Skills : `wrangler`, `workers-best-practices`.
- Pitch : markdown édité avec OverType (`web/src/app/pitch/`), rendu avec marked + DOMPurify. Fichiers joints dans R2 (`FICHIERS`), servis par `/api/fichiers/:id` : seuls images et PDF s'affichent, le reste est téléchargé.
- Point hebdo : notes de suivi par pari et par semaine (`notes_suivi`), page `web/src/app/pages/point-hebdo.page.ts`.
- Un seul Worker sert l'interface et l'API (`wrangler.jsonc`, `run_worker_first: ["/api/*"]`).
- Les messages d'erreur de l'API sont en français, dans `{ erreur: "..." }`, et l'interface les affiche tels quels.

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

Aucun secret, identifiant de compte ou donnée réelle dans le dépôt. Les réglages Cloudflare (`ACCESS_EQUIPE`, `ACCESS_AUD`, `database_id` réel) vivent dans le tableau de bord.
