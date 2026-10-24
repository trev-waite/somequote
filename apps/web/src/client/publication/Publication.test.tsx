import { afterEach, describe, expect, it } from 'vitest';
import { PublicationDto } from '../../shared/api-contract';
import { render } from '../test-render';
import { PublicationView } from './Publication';

const emerson = PublicationDto.parse({
  date: '2026-10-18',
  quote: {
    category: 'general',
    id: 'emerson-best-day-in-the-year',
    text: 'Write it on your heart that every day is the best day in the year.',
    author: 'Ralph Waldo Emerson',
    source: 'Works and Days',
  },
});

const shakespeare = PublicationDto.parse({
  date: '2026-10-19',
  quote: {
    category: 'general',
    id: 'shakespeare-love-all',
    text: 'Love all, trust a few,\nDo wrong to none.',
    author: 'William Shakespeare',
    source: 'All’s Well That Ends Well',
  },
});

const psalm = PublicationDto.parse({
  date: '2026-10-20',
  quote: {
    category: 'bible',
    id: 'web-psalm-23-1',
    text: 'Yahweh is my shepherd; I shall lack nothing.',
    reference: 'Psalm 23:1',
    translation: 'World English Bible',
  },
});

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function show(publication: PublicationDto, motion: 'full' | 'reduced' = 'full') {
  const view = render(<PublicationView publication={publication} motion={motion} />);
  cleanup = view.unmount;
  const words = [...view.container.querySelectorAll<HTMLElement>('.word')];
  const attribution = view.container.querySelector<HTMLElement>('figcaption');
  if (!attribution) throw new Error('missing attribution');
  return { ...view, words, attribution };
}

const ms = (value: string) => Number.parseFloat(value);

describe('PublicationView', () => {
  it('shows the quote with quotation marks and attribution, without a date', () => {
    const { container } = show(emerson);

    expect(container.querySelector('time')).toBeNull();
    expect(container.textContent).not.toContain('October');
    expect(container.querySelector('figcaption')?.textContent).toBe(
      'Ralph Waldo EmersonWorks and Days',
    );
  });

  it('cites a scripture reference and translation instead of an author', () => {
    const { attribution } = show(psalm);

    expect(attribution.querySelector('.attribution-primary')?.textContent).toBe('Psalm 23:1');
    expect(attribution.querySelector('.attribution-secondary')?.textContent).toBe(
      'World English Bible',
    );
  });

  it.each([
    [emerson, 'Ralph Waldo Emerson', 'Ralph_Waldo_Emerson'],
    [psalm, 'Psalm 23:1', 'Psalms'],
  ])('links the attribution to its Grokipedia entry', (publication, label, page) => {
    const { attribution } = show(publication);
    const link = attribution.querySelector('a');

    expect(link?.textContent).toBe(label);
    expect(link?.getAttribute('href')).toBe(`https://grokipedia.com/page/${page}`);
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(attribution.querySelector('.attribution-secondary')?.tagName).toBe('SPAN');
  });

  it('keeps an unfamiliar attribution readable without inventing a link', () => {
    const { attribution } = show({
      ...emerson,
      quote: { ...emerson.quote, category: 'general', author: 'Unknown Author', source: 'Example' },
    });

    expect(attribution.querySelector('.attribution-primary')?.textContent).toBe('Unknown Author');
    expect(attribution.querySelector('a')).toBeNull();
  });

  it('gives assistive technology the whole quote once, as plain text', () => {
    const { container } = show(emerson);
    const quote = container.querySelector('blockquote');
    const animated = quote?.querySelector('[aria-hidden="true"]');

    expect(quote?.querySelector('.visually-hidden')?.textContent).toBe(`“${emerson.quote.text}”`);
    expect(animated?.querySelectorAll('.word')).toHaveLength(15);
  });

  it('keeps every space, punctuation mark, and line break of the original text', () => {
    const { container } = show(shakespeare);
    const animated = container.querySelector<HTMLElement>('blockquote [aria-hidden="true"]');
    const rebuilt = [...(animated?.childNodes ?? [])]
      .map((node) => (node.nodeName === 'BR' ? '\n' : node.textContent))
      .join('');

    expect(rebuilt).toBe(`“${shakespeare.quote.text}”`);
  });

  it('reveals words in order and blurs in the attribution on the next stagger', () => {
    const { words, attribution } = show(emerson);

    expect(words.map((word) => word.style.animationName)).toEqual(words.map(() => 'word-rise'));
    expect(words.map((word) => ms(word.style.animationDelay))).toEqual(
      words.map((_, index) => index * 80),
    );
    expect(words.every((word) => ms(word.style.animationDuration) === 650)).toBe(true);

    const lastWord = words.at(-1);
    if (!lastWord) throw new Error('no words');
    expect(attribution.style.animationName).toBe('blur-in');
    expect(ms(attribution.style.animationDelay)).toBe(ms(lastWord.style.animationDelay) + 80);
    expect(attribution.style.animationDuration).toBe(lastWord.style.animationDuration);
    expect(attribution.querySelectorAll('.word')).toHaveLength(0);
  });

  it('does not move or stagger anything when motion is reduced', () => {
    const { container, words, attribution } = show(emerson, 'reduced');
    const quote = container.querySelector<HTMLElement>('blockquote');

    expect(words.every((word) => word.style.animationName === '')).toBe(true);
    expect(quote?.style.animationName).toBe('fade-in');
    expect(ms(attribution.style.animationDelay)).toBe(0);
    expect(attribution.style.animationName).toBe('fade-in');
  });

  it('does not restart the reveal when the page re-renders with the same quote', () => {
    const { words, attribution, rerender, container } = show(emerson);
    const before = words.map((word) => word.style.cssText);
    const attributionBefore = attribution.style.cssText;

    rerender(
      <PublicationView publication={{ ...emerson, quote: { ...emerson.quote } }} motion="full" />,
    );

    const after = [...container.querySelectorAll<HTMLElement>('.word')];
    expect(after).toHaveLength(words.length);
    after.forEach((word, index) => {
      expect(word).toBe(words[index]);
      expect(word.style.cssText).toBe(before[index]);
    });
    expect(container.querySelector('figcaption')).toBe(attribution);
    expect(attribution.style.cssText).toBe(attributionBefore);
  });
});
