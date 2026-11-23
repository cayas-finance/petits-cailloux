import api from './index';
import type { Bindings } from './env';
import { MAX_PITCH_LENGTH } from './domain';
import {
  type Names,
  type SlackMessage,
  authorName,
  mentionedUsers,
  suggestedTitle,
  threadPitch,
  verifySlackSignature,
} from './slack-thread';

/** callback_id of the message shortcut and of its modal, set in the Slack app (see README) */
const CALLBACK_ID = 'create_short_topic';
/** Most messages read from a thread */
const MAX_MESSAGES = 500;

type Metadata = { channel: string; threadTs: string };

/**
 * Slack interactions (/slack/interactions), outside Cloudflare Access: every request is
 * checked with the Slack app's signing secret.
 *
 * The « Créer un sujet court » message shortcut opens a modal with the suggested name;
 * on submit, the thread is read and the short topic is created through the API, in the
 * name of the Cayas user who used the shortcut, with the same rules and messages.
 * The answer (link or error) is posted in the thread or to that user only.
 */
export async function slackInteractions(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') return new Response('Méthode non autorisée.', { status: 405 });
  if (!env.SLACK_SIGNING_SECRET || !env.SLACK_BOT_TOKEN) return new Response('Slack n’est pas configuré.', { status: 503 });

  const body = await request.text();
  const valid = await verifySlackSignature(
    env.SLACK_SIGNING_SECRET,
    request.headers.get('x-slack-request-timestamp'),
    request.headers.get('x-slack-signature'),
    body,
    Math.floor(Date.now() / 1000),
  );
  if (!valid) return new Response('Signature Slack invalide.', { status: 401 });

  const payload = JSON.parse(new URLSearchParams(body).get('payload') ?? '{}');
  const slack = slackClient(env.SLACK_BOT_TOKEN);

  if (payload.type === 'message_action' && payload.callback_id === CALLBACK_ID) {
    const message: SlackMessage & { thread_ts?: string } = payload.message;
    const metadata: Metadata = { channel: payload.channel.id, threadTs: message.thread_ts ?? message.ts };
    // The thread's first message gives the name, even when the shortcut is used on a reply.
    // Reading it also checks that the app can read the channel.
    let first: SlackMessage;
    try {
      const r = await slack('conversations.replies', { channel: metadata.channel, ts: metadata.threadTs, limit: 1 });
      first = r.messages?.[0] ?? message;
    } catch (err) {
      console.error(err);
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: 'Petits cailloux ne peut pas lire ce channel : ajoutez-y l’app (/invite @Petits cailloux), puis réessayez.',
        }),
      });
      return new Response(null, { status: 200 });
    }
    const names = await userNames(slack, mentionedUsers(first.text ?? ''));
    // The trigger_id is valid for 3 seconds: the modal opens right away.
    await slack('views.open', { trigger_id: payload.trigger_id, view: modal(suggestedTitle(first.text ?? '', names), metadata) });
    return new Response(null, { status: 200 });
  }

  if (payload.type === 'view_submission' && payload.view?.callback_id === CALLBACK_ID) {
    const metadata: Metadata = JSON.parse(payload.view.private_metadata);
    const name = String(payload.view.state.values.name.name.value ?? '').trim();
    if (!name) return Response.json({ response_action: 'errors', errors: { name: 'Le nom est obligatoire.' } });
    const origin = new URL(request.url).origin;
    // Slack waits 3 seconds at most: the modal closes now, the answer comes in the thread.
    ctx.waitUntil(
      createShortTopic({ slack, env, ctx, origin, userId: payload.user.id, name, ...metadata }).catch((err) => {
        console.error(err);
        return slack('chat.postEphemeral', {
          channel: metadata.channel,
          thread_ts: metadata.threadTs,
          user: payload.user.id,
          text: 'Le sujet court n’a pas pu être créé : erreur inattendue. Réessayez dans un instant.',
        }).catch(() => {});
      }),
    );
    return new Response(null, { status: 200 });
  }

  return new Response(null, { status: 200 });
}

function modal(name: string, metadata: Metadata) {
  return {
    type: 'modal',
    callback_id: CALLBACK_ID,
    private_metadata: JSON.stringify(metadata),
    title: { type: 'plain_text', text: 'Sujet court' },
    submit: { type: 'plain_text', text: 'Créer' },
    close: { type: 'plain_text', text: 'Annuler' },
    blocks: [
      {
        type: 'input',
        block_id: 'name',
        label: { type: 'plain_text', text: 'Nom du sujet court' },
        element: { type: 'plain_text_input', action_id: 'name', initial_value: name, max_length: 200 },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Le problème reprend tout le thread, avec son lien. Le demandeur est l’auteur du premier message.',
          },
        ],
      },
    ],
  };
}

async function createShortTopic(o: {
  slack: Slack;
  env: Bindings;
  ctx: ExecutionContext;
  origin: string;
  userId: string;
  name: string;
  channel: string;
  threadTs: string;
}) {
  const { slack, channel, threadTs, userId } = o;
  const tell = (text: string) => slack('chat.postEphemeral', { channel, thread_ts: threadTs, user: userId, text });

  // The person who used the shortcut, by their Cayas address
  const who = await slack('users.info', { user: userId });
  const email = String(who.user?.profile?.email ?? '').toLowerCase();
  const domain = (o.env.ALLOWED_DOMAIN || 'cayas.fr').toLowerCase();
  if (!email.endsWith('@' + domain)) return tell(`Réservé aux adresses @${domain}.`);

  const call = (method: string, path: string, body?: unknown) =>
    api.fetch(
      new Request(`${o.origin}/api${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { ...o.env, ACTING_EMAIL: email },
      o.ctx,
    );
  const link = (p: { id: string; name: string }) => `<${o.origin}/projects/${p.id}|${p.name.replace(/[<>|]/g, ' ')}>`;

  const { permalink } = await slack('chat.getPermalink', { channel, message_ts: threadTs });

  // A thread gives one project: its link is in the pitch.
  const all = (await (await call('GET', '/projects')).json()) as { id: string; name: string; pitch: string }[];
  const existing = all.find((p) => p.pitch.includes(`(${permalink})`));
  if (existing) return tell(`Ce thread est déjà dans Petits cailloux : ${link(existing)}`);

  const messages = await thread(slack, channel, threadTs);
  const names = await userNames(slack, [
    ...messages.flatMap((m) => [...(m.user ? [m.user] : []), ...mentionedUsers(m.text ?? '')]),
  ]);
  let pitch = threadPitch(messages, names, permalink);
  if (pitch.length > MAX_PITCH_LENGTH) pitch = pitch.slice(0, MAX_PITCH_LENGTH - 100) + `\n\n… [suite dans Slack](${permalink})\n`;

  const res = await call('POST', '/projects', {
    name: o.name,
    format: 'short',
    requester: messages[0] ? authorName(messages[0], names) : names[userId] ?? email,
    status: 'received',
    pitch,
  });
  const data = (await res.json()) as { id: string; name: string } & { error?: string };
  if (!res.ok) return tell(`Le sujet court n’a pas pu être créé : ${data.error ?? `erreur ${res.status}.`}`);

  await slack('chat.postMessage', {
    channel,
    thread_ts: threadTs,
    text: `Sujet court créé dans Petits cailloux par <@${userId}> : ${link(data)}`,
    unfurl_links: false,
  });
}

/** Every message of the thread, the first one first */
async function thread(slack: Slack, channel: string, ts: string): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;
  do {
    const r = await slack('conversations.replies', { channel, ts, limit: 200, ...(cursor ? { cursor } : {}) });
    messages.push(...(r.messages ?? []));
    cursor = r.response_metadata?.next_cursor || undefined;
  } while (cursor && messages.length < MAX_MESSAGES);
  return messages;
}

/** Names shown for Slack users: display name, else real name */
async function userNames(slack: Slack, ids: string[]): Promise<Names> {
  const names: Names = {};
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      try {
        const r = await slack('users.info', { user: id });
        const p = r.user?.profile ?? {};
        const name = p.real_name || p.display_name || r.user?.real_name || r.user?.name;
        if (name) names[id] = name;
      } catch {
        // An unknown user keeps its id.
      }
    }),
  );
  return names;
}

type Slack = (method: string, args: Record<string, unknown>) => Promise<any>;

/** Calls the Slack Web API with the bot token; throws on a Slack error. */
function slackClient(token: string): Slack {
  return async (method, args) => {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(args)) form.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(`Slack ${method}: ${data.error ?? res.status}`);
    return data;
  };
}
