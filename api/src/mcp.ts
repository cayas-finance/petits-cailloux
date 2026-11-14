import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import api from './index';
import type { Bindings } from './env';

const INSTRUCTIONS = `Petits cailloux est l'outil de Cayas pour la méthode produit « Petit Poucet » : un cap par trimestre (ses objectifs : O1, O2…), des cycles de 4 semaines, et des paris décrits par un pitch.

Pour aider à rédiger un pitch :
1. Lis le modèle du guide (get_pitch_template) et les objectifs du trimestre (list_quarters).
2. Regarde si le sujet existe déjà (list_projects, puis get_project pour lire son pitch).
3. Pose des questions sur le problème vécu avant de proposer une solution. L'appétit va de 1 à 4 semaines. Pas d'estimation en jours.
4. Fais valider le texte par l'utilisateur, puis enregistre-le : create_bet pour un nouveau pari, update_pitch pour un projet existant.

Écris en français, en markdown, en suivant les sections du modèle.`;

type Props = { email: string };

/**
 * The MCP server, behind OAuth: each request carries the Cayas user who authorized the client.
 * Tools call the API in-process as that user, so they get the same validation, French error
 * messages and change history as the interface.
 */
export const mcpHandler = {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    const { email } = (ctx as ExecutionContext & { props: Props }).props;
    const server = buildServer(request.url, { ...env, ACTING_EMAIL: email }, ctx);
    // Stateless: a new server and transport per request, nothing kept between calls.
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

function buildServer(url: string, env: Bindings, ctx: ExecutionContext) {
  const origin = new URL(url).origin;

  /** Calls the API as the signed-in user; an API error becomes a tool error with its French message. */
  async function call(method: string, path: string, body?: unknown): Promise<CallToolResult & { data?: unknown }> {
    const res = await api.fetch(
      new Request(`${origin}/api${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      ctx,
    );
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) {
      const message = (data as { error?: string } | null)?.error ?? `Erreur ${res.status}.`;
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], data };
  }

  /** The API answer, reshaped for the AI: text as is, anything else as JSON. */
  function result(r: CallToolResult & { data?: unknown }, shape?: (data: any) => unknown): CallToolResult {
    if (r.isError || !shape) return { isError: r.isError, content: r.content };
    const shaped = shape(r.data);
    return { content: [{ type: 'text', text: typeof shaped === 'string' ? shaped : JSON.stringify(shaped, null, 2) }] };
  }

  const server = new McpServer({ name: 'petits-cailloux', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'list_quarters',
    {
      title: 'Trimestres et objectifs',
      description: 'Liste les trimestres, avec leurs objectifs (O1, O2…) et leurs cycles.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      result(await call('GET', '/quarters'), (qs: any[]) =>
        qs.map((q) => ({
          id: q.id,
          label: `T${q.number} ${q.year}`,
          startsOn: q.startsOn,
          endsOn: q.endsOn,
          goals: q.goals.map((g: any, i: number) => ({ id: g.id, label: `O${i + 1}`, title: g.title, description: g.description })),
          cycles: q.cycles.map((c: any) => ({ id: c.id, number: c.number, startsOn: c.startsOn, endsOn: c.endsOn })),
        })),
      ),
  );

  server.registerTool(
    'list_projects',
    {
      title: 'Projets',
      description:
        'Liste les projets sans leur pitch : paris (format bet) et sujets courts (format short). Statuts : received (reçu), shaping (en shaping), ready (pitch prêt), waiting (en attente), bet (misé), shipped (livré), dropped (écarté).',
      inputSchema: {
        format: z.enum(['bet', 'short']).optional().describe('Filtrer sur un format'),
        status: z.enum(['received', 'shaping', 'ready', 'waiting', 'bet', 'shipped', 'dropped']).optional().describe('Filtrer sur un statut'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ format, status }) =>
      result(await call('GET', '/projects'), (ps: any[]) =>
        ps
          .filter((p) => (!format || p.format === format) && (!status || p.status === status))
          .map((p) => ({
            id: p.id,
            name: p.name,
            format: p.format,
            status: p.status,
            owner: p.owner,
            requester: p.requester || undefined,
            goalIds: p.goalIds,
            cycle: p.cycle ? { id: p.cycle.id, quarterId: p.cycle.quarterId, number: p.cycle.number } : null,
            updatedAt: p.updatedAt,
          })),
      ),
  );

  server.registerTool(
    'get_project',
    {
      title: 'Lire un projet',
      description: 'Un projet avec son pitch complet (markdown). Pour un sujet court, le pitch décrit le problème.',
      inputSchema: { id: z.string().describe('Identifiant du projet') },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => result(await call('GET', `/projects/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'get_pitch_template',
    {
      title: 'Modèle de pitch',
      description: 'Le modèle de pitch du guide de la méthode, en markdown : les sections à remplir.',
      annotations: { readOnlyHint: true },
    },
    async () => result(await call('GET', '/pitch/template'), (d: { pitch: string }) => d.pitch),
  );

  server.registerTool(
    'create_bet',
    {
      title: 'Créer un pari',
      description:
        'Crée un pari avec son pitch, une fois le texte validé par l’utilisateur. Le pari n’est misé sur aucun cycle : cette décision se prend en réunion.',
      inputSchema: {
        name: z.string().describe('Titre court du pari'),
        pitch: z.string().describe('Pitch complet en markdown, selon le modèle'),
        status: z
          .enum(['received', 'shaping', 'ready'])
          .default('shaping')
          .describe('shaping tant que le pitch est en cours, ready quand il est prêt pour la betting table'),
        goalIds: z.array(z.string()).default([]).describe('Objectifs du trimestre que le pari sert (voir list_quarters)'),
        owner: z.string().optional().describe('Adresse @cayas.fr de l’owner ; par défaut, l’utilisateur connecté'),
      },
    },
    async (input) =>
      result(await call('POST', '/projects', { ...input, format: 'bet', cycleId: null }), (p: any) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        owner: p.owner,
        message: 'Pari créé.',
      })),
  );

  server.registerTool(
    'update_pitch',
    {
      title: 'Modifier un pitch',
      description:
        'Remplace tout le pitch d’un projet existant. Lis-le d’abord avec get_project, et fais valider le nouveau texte par l’utilisateur.',
      inputSchema: {
        id: z.string().describe('Identifiant du projet'),
        pitch: z.string().describe('Nouveau pitch complet, en markdown'),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ id, pitch }) =>
      result(await call('PUT', `/projects/${encodeURIComponent(id)}/pitch`, { pitch }), (p: any) => ({
        id: p.id,
        name: p.name,
        message: 'Pitch enregistré.',
      })),
  );

  return server;
}
