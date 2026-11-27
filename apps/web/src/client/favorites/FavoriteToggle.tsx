import { type CSSProperties, useState } from 'react';
import type { PublicationDto } from '../../shared/api-contract';
import { favoritesSaved, includes, toggleFavorite, useFavorites } from './favorites';
import { Heart } from './Heart';

interface FavoriteToggleProps {
  readonly publication: PublicationDto;
  readonly style: CSSProperties | undefined;
}

export function FavoriteToggle({ publication, style }: FavoriteToggleProps) {
  const favorite = includes(useFavorites(), publication.quote.id);
  const [touched, setTouched] = useState(false);

  return (
    <>
      <button
        type="button"
        className="favorite-toggle"
        style={style}
        aria-pressed={favorite}
        aria-label="Favorite"
        onClick={() => {
          setTouched(true);
          toggleFavorite(publication);
        }}
      >
        <svg
          className="favorite-toggle-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <Heart clipId="favorite-toggle-heart" />
        </svg>
      </button>
      <p className="visually-hidden" role="status">
        {touched
          ? favorite
            ? favoritesSaved()
              ? 'Added to favorites, kept in the card box on the desk.'
              : 'Added to favorites for this visit only; this browser isn’t saving them.'
            : favoritesSaved()
              ? 'Removed from favorites.'
              : 'Removed from favorites for this visit only; this browser isn’t saving them.'
          : ''}
      </p>
    </>
  );
}
