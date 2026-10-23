import type { HistoryPage, Publication } from '@somequote/domain';
import type { HistoryDto, PublicationDto } from '../../shared/api-contract';

export function toPublicationDto({ date, quote }: Publication): PublicationDto {
  switch (quote.category) {
    case 'general':
      return {
        date,
        quote: {
          category: quote.category,
          id: quote.id,
          text: quote.text,
          author: quote.author,
          source: quote.source,
        },
      };
    case 'bible':
      return {
        date,
        quote: {
          category: quote.category,
          id: quote.id,
          text: quote.text,
          reference: quote.reference,
          translation: quote.translation,
        },
      };
  }
}

export function toHistoryDto({ publications, nextBefore }: HistoryPage): HistoryDto {
  return { items: publications.map(toPublicationDto), nextBefore };
}
