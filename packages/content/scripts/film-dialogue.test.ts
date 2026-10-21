import { describe, expect, it } from 'vitest';
import { englishFilmDialogue, filmDialogueMatches } from './film-dialogue';

describe('film dialogue verification', () => {
  it('reads English cues across line breaks and decodes character entities', () => {
    const html = `
      <h1>Words in a headline are not captions.</h1>
      <div class="transcript-panel" data-lang="fr">
        <div class="subtitleLine">Words in another track are not English evidence.</div>
      </div>
      <div data-lang="en" class="transcript-panel active">
        <div class="clip-transcript-text">
          <div class="subtitleTime">00:00:01.000 --&gt; 00:00:02.000</div>
          <div class="subtitleLine">You mustn&#039;t be afraid</div>
          <div class="subtitleLine">to dream a little bigger darling</div>
        </div>
      </div>
      <div class="transcript-panel" data-lang="es">
        <div class="subtitleLine">Words after the English panel are not evidence.</div>
      </div>`;
    const dialogue = englishFilmDialogue(html);
    expect(dialogue).toBe("You mustn't be afraid to dream a little bigger darling");
    expect(
      filmDialogueMatches(dialogue, 'You mustn’t be afraid to dream a little bigger, darling.'),
    ).toBe(true);
    expect(filmDialogueMatches(dialogue, 'Words in a headline are not captions.')).toBe(false);
    expect(filmDialogueMatches(dialogue, 'Words in another track are not English evidence.')).toBe(
      false,
    );
    expect(filmDialogueMatches(dialogue, 'Words after the English panel are not evidence.')).toBe(
      false,
    );
  });

  it.each([
    ['missing English captions', '<div class="transcript-panel" data-lang="fr"></div>'],
    ['an incomplete panel', '<div class="transcript-panel" data-lang="en">'],
    ['an empty panel', '<div class="transcript-panel" data-lang="en"></div>'],
  ])('rejects %s', (_, html) => {
    expect(() => englishFilmDialogue(html)).toThrow();
  });

  it('allows caption punctuation and case differences', () => {
    expect(
      filmDialogueMatches('DO OR DO NOT THERE IS NO TRY', 'Do, or do not. There is no try.'),
    ).toBe(true);
    expect(filmDialogueMatches('You don t know', 'You don’t know.')).toBe(true);
  });

  it.each([
    ['You should not be afraid', 'You mustn’t be afraid.'],
    ['There is no try', 'There is not a try.'],
    ['You do not know', 'You don’t know.'],
    ['You are the one', 'You’re the one.'],
    ['The future can change', 'Change the future.'],
    ['Your head aches', 'Your head ache.'],
    ['You mustn’t be afraid', ''],
  ])('rejects altered wording: %s versus %s', (dialogue, quote) => {
    expect(filmDialogueMatches(dialogue, quote)).toBe(false);
  });
});
