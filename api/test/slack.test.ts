import { describe, expect, it } from 'vitest';
import { slackToMarkdown, suggestedTitle, threadPitch, verifySlackSignature } from '../src/slack-thread';

async function sign(secret: string, ts: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${ts}:${body}`)));
  return 'v0=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Slack signature', () => {
  const secret = 'test-secret';
  const body = 'payload=%7B%7D';
  it('accepts a signed, recent request', async () => {
    const sig = await sign(secret, '1000', body);
    expect(await verifySlackSignature(secret, '1000', sig, body, 1100)).toBe(true);
  });
  it('rejects another body or secret', async () => {
    const sig = await sign(secret, '1000', body);
    expect(await verifySlackSignature(secret, '1000', sig, body + 'x', 1100)).toBe(false);
    expect(await verifySlackSignature('other', '1000', sig, body, 1100)).toBe(false);
  });
  it('rejects an old request (replay)', async () => {
    const sig = await sign(secret, '1000', body);
    expect(await verifySlackSignature(secret, '1000', sig, body, 1000 + 6 * 60)).toBe(false);
  });
  it('rejects missing headers', async () => {
    expect(await verifySlackSignature(secret, null, null, body, 1000)).toBe(false);
    expect(await verifySlackSignature(secret, '1000', 'v0=zz', body, 1000)).toBe(false);
  });
});

describe('Slack text', () => {
  const names = { U1: 'Alice Martin' };
  it('converts mentions, channels, links and bold', () => {
    expect(slackToMarkdown('<@U1> voit *une erreur* sur <https://x.fr/a|la page> dans <#C1|bug> &amp; <!here>', names)).toBe(
      '@Alice Martin voit **une erreur** sur [la page](https://x.fr/a) dans #bug & @here',
    );
  });
  it('keeps unknown users and bare links', () => {
    expect(slackToMarkdown('<@U9> <https://x.fr>', names)).toBe('@U9 https://x.fr');
  });
  it('suggests the first non-empty line as title, without markup', () => {
    expect(suggestedTitle('\n*Export PDF* cassé pour <@U1>\nDétails…', names)).toBe('Export PDF cassé pour @Alice Martin');
    expect(suggestedTitle('', names)).toBe('Bug signalé sur Slack');
    expect(suggestedTitle('a'.repeat(300), names)).toHaveLength(200);
  });
});

describe('thread pitch', () => {
  it('writes the first message, the link, then the quoted replies', () => {
    const pitch = threadPitch(
      [
        { user: 'U1', text: 'L’export plante', ts: '1795015800.000100', files: [{ name: 'capture.png' }] },
        { user: 'U2', text: 'Je regarde\nça vient du PDF', ts: '1795019400.000200' },
      ],
      { U1: 'Alice', U2: 'Bob' },
      'https://cayas.slack.com/archives/C1/p1',
    );
    expect(pitch).toBe(`L’export plante

_Fichiers joints dans Slack : capture.png_

Signalé par Alice le 18/11/2026 16:30 · [Thread Slack](https://cayas.slack.com/archives/C1/p1)

## Échanges dans le thread

**Bob** · 18/11/2026 17:30

> Je regarde
> ça vient du PDF
`);
  });
});
