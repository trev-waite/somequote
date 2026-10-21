/** Reads only English caption cues; headlines, summaries, and translated tracks are not evidence. */
export function englishFilmDialogue(html: string): string {
  const panel =
    /<div\b(?=[^>]*\bclass=["'][^"']*\btranscript-panel\b)(?=[^>]*\bdata-lang=["']en["'])[^>]*>/i.exec(
      html,
    );
  if (!panel) throw new Error('English film caption panel not found');

  const start = panel.index + panel[0].length;
  let depth = 1;
  let end: number | undefined;
  for (const tag of html.slice(start).matchAll(/<\/?div\b[^>]*>/gi)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      end = start + tag.index;
      break;
    }
  }
  if (end === undefined) throw new Error('English film caption panel is incomplete');

  const cues = [
    ...html
      .slice(start, end)
      .matchAll(/<div\b[^>]*\bclass=["'][^"']*\bsubtitleLine\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi),
  ].map((match) =>
    (match[1] ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&apos;|&#0?39;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&amp;/g, '&'),
  );
  if (cues.length === 0) throw new Error('English film caption cues not found');
  return cues.join(' ');
}

/** Speech has no written punctuation; caption comparison preserves every word and its order. */
export function filmDialogueMatches(dialogue: string, quote: string): boolean {
  const words = (text: string) =>
    text
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ') ?? '';
  const target = words(quote);
  return target.length > 0 && ` ${words(dialogue)} `.includes(` ${target} `);
}
