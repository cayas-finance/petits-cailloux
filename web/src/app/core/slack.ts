/** A section of the Slack message: a bold heading, then one bullet per line. Empty sections are left out. */
export interface SlackSection {
  heading: string;
  lines: string[];
}

/** The weekly review as a Slack message, using Slack's own formatting (*bold*, bullets). */
export function slackMessage(title: string, sections: SlackSection[]): string {
  const parts = [`*${title}*`];
  for (const s of sections.filter((x) => x.lines.length)) {
    parts.push('', `*${s.heading}*`, ...s.lines.map((l) => '• ' + l.trim().split('\n').join('\n   ')));
  }
  return parts.join('\n');
}
