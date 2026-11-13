export interface Bindings {
  DB: D1Database;
  /** Domaine de l'équipe Cloudflare Access, ex. cayas.cloudflareaccess.com */
  ACCESS_EQUIPE?: string;
  /** Identifiant (AUD) de l'application Access */
  ACCESS_AUD?: string;
  /** Domaine e-mail autorisé, cayas.fr par défaut */
  DOMAINE_AUTORISE?: string;
  /** Développement local uniquement */
  DEV_EMAIL?: string;
}

export interface Env {
  Bindings: Bindings;
  Variables: { email: string };
}
