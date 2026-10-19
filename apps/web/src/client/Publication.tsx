import { type CSSProperties, useMemo } from 'react';
import type { PublicationDto, QuoteDto } from '../shared/api-contract';
import { type Motion, planReveal, type Timing, tokenize } from './reveal';

export function attributionOf(quote: QuoteDto): { primary: string; secondary: string } {
  switch (quote.category) {
    case 'general':
      return { primary: quote.author, secondary: quote.source };
    case 'bible':
      return { primary: quote.reference, secondary: quote.translation };
  }
}

/** Shorter quotes are set larger; the thresholds keep most quotes to two to five lines. */
export function lengthClass(text: string): 'short' | 'medium' | 'long' {
  if (text.length <= 80) return 'short';
  if (text.length <= 170) return 'medium';
  return 'long';
}

function animation(name: 'word-rise' | 'fade-in', { delayMs, durationMs }: Timing): CSSProperties {
  return {
    animationName: name,
    animationDelay: `${delayMs}ms`,
    animationDuration: `${durationMs}ms`,
  };
}

interface PublicationViewProps {
  readonly publication: PublicationDto;
  readonly motion: Motion;
}

export function PublicationView({ publication, motion }: PublicationViewProps) {
  const { quote } = publication;
  const displayText = `“${quote.text}”`;
  const tokens = useMemo(() => tokenize(displayText), [displayText]);
  const wordCount = tokens.filter((token) => token.kind === 'word').length;
  const plan = useMemo(() => planReveal(wordCount, motion), [wordCount, motion]);
  const { primary, secondary } = attributionOf(quote);

  const fade = plan.kind === 'fade' ? animation('fade-in', plan.fade) : undefined;
  const attributionStyle = plan.kind === 'cascade' ? animation('fade-in', plan.attribution) : fade;

  return (
    <article className="publication" data-motion={plan.kind}>
      <figure className="publication-figure">
        <blockquote className="quote" data-length={lengthClass(quote.text)} style={fade}>
          <p>
            <span className="visually-hidden">{displayText}</span>
            <span aria-hidden="true">
              {tokens.map((token, position) => {
                const key = `${token.kind}-${position}`;
                if (token.kind === 'space') return ' ';
                if (token.kind === 'line-break') return <br key={key} />;
                const timing = plan.kind === 'cascade' ? plan.words[token.index] : undefined;
                return (
                  <span
                    key={key}
                    className="word"
                    style={timing ? animation('word-rise', timing) : undefined}
                  >
                    {token.text}
                  </span>
                );
              })}
            </span>
          </p>
        </blockquote>
        <figcaption className="attribution" style={attributionStyle}>
          <span className="attribution-primary">{primary}</span>
          <span className="attribution-secondary">{secondary}</span>
        </figcaption>
      </figure>
    </article>
  );
}
