/**
 * Pure helpers to turn a Slack thread into a short topic: no network, tested in api/test/slack.test.ts.
 */

export interface SlackMessage {
  /** Slack user id of the author; absent for some bot messages */
  user?: string;
  /** Name shown for bot messages */
  username?: string;
  text?: string;
  ts: string;
  files?: { name?: string; title?: string }[];
}

/** Slack user id → name to show */
export type Names = Record<string, string>;

const TITLE_MAX = 200;

/** Verifies a Slack request signature (v0, HMAC-SHA256), rejecting requests older than 5 minutes. */
export async function verifySlackSignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  body: string,
  nowSeconds: number,
): Promise<boolean> {
  if (!timestamp || !signature?.startsWith('v0=') || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 5 * 60) return false;
  const hex = signature.slice(3);
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  const bytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'verify',
  ]);
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`v0:${timestamp}:${body}`));
}

/** User ids mentioned in a Slack text (<@U123>) */
export function mentionedUsers(text: string): string[] {
  return [...text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]!);
}

const decodeEntities = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Slack mrkdwn → markdown: mentions, channels, links, bold and strike. */
export function slackToMarkdown(text: string, names: Names): string {
  const converted = text
    .replace(/<@([A-Z0-9]+)(?:\|([^>]*))?>/g, (_, id: string, label?: string) => `@${names[id] ?? label ?? id}`)
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, (_, name: string) => `#${name}`)
    .replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]*))?>/g, (_, name?: string) => name ?? '@groupe')
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, '@$1')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)')
    .replace(/<(mailto:[^|>]+)\|([^>]+)>/g, '[$2]($1)')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    // Slack's *bold* is markdown's **bold**; ~strike~ is ~~strike~~.
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:!?)])/gm, '$1**$2**')
    .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s.,;:!?)])/gm, '$1~~$2~~');
  return decodeEntities(converted).trim();
}

/** Same text without any markup: for a title */
function plain(text: string, names: Names): string {
  return slackToMarkdown(text, names)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Suggested name of the short topic: the first line of the thread's first message. */
export function suggestedTitle(text: string, names: Names): string {
  const firstLine = (text ?? '').split('\n').find((l) => plain(l, names)) ?? '';
  const title = plain(firstLine, names);
  if (!title) return 'Bug signalé sur Slack';
  return title.length <= TITLE_MAX ? title : title.slice(0, TITLE_MAX - 1).trimEnd() + '…';
}

export function authorName(m: SlackMessage, names: Names): string {
  return (m.user && names[m.user]) || m.username || 'Quelqu’un';
}

/** Day and time of a Slack timestamp, in Paris time: 18/11/2026 16:30 */
export function slackDate(ts: string): string {
  const d = new Date(Math.floor(Number(ts) * 1000));
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

function files(m: SlackMessage): string {
  const names = (m.files ?? []).map((f) => f.title || f.name).filter(Boolean);
  return names.length ? `\n\n_Fichiers joints dans Slack : ${names.join(', ')}_` : '';
}

const quote = (text: string) =>
  text
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');

/**
 * Problem of the short topic: the first message of the thread, a link to the thread,
 * then the replies, quoted with their author and date.
 */
export function threadPitch(messages: SlackMessage[], names: Names, permalink: string): string {
  const [root, ...replies] = messages;
  if (!root) return `[Thread Slack](${permalink})\n`;
  const lines = [
    slackToMarkdown(root.text ?? '', names) + files(root),
    '',
    `Signalé par ${authorName(root, names)} le ${slackDate(root.ts)} · [Thread Slack](${permalink})`,
  ];
  if (replies.length) {
    lines.push('', '## Échanges dans le thread');
    for (const r of replies) {
      const text = slackToMarkdown(r.text ?? '', names) + files(r);
      lines.push('', `**${authorName(r, names)}** · ${slackDate(r.ts)}`, '', quote(text || '_(message vide)_'));
    }
  }
  return lines.join('\n') + '\n';
}
