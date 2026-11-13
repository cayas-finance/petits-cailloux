/** Announcements of a week as a Slack message: a bold title, then one bullet per announcement. */
export function announcementsForSlack(title: string, items: { text: string }[]): string {
  const bullets = items.map((a) => '• ' + a.text.trim().split('\n').join('\n   '));
  return [`*${title}*`, ...bullets].join('\n');
}
