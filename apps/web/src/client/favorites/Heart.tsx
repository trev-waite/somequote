const HEART_PATH =
  'M12 20C5.6 15.6 3.5 12.4 3.5 9.3 3.5 6.8 5.4 5 7.6 5c1.8 0 3.3 1 4.4 2.6C13.1 6 14.6 5 16.4 5c2.2 0 4.1 1.8 4.1 4.3 0 3.1-2.1 6.3-8.5 10.7Z';

/**
 * A heart in a 24 by 24 box whose red fill rises from its point, shared by the quote's toggle and
 * the card box's label. `clipId` must be unique in the document.
 */
export function Heart({ clipId }: { readonly clipId: string }) {
  return (
    <>
      <clipPath id={clipId}>
        <path d={HEART_PATH} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect className="heart-fill" x="3" y="4.5" width="18" height="16" />
      </g>
      <path className="heart-outline" d={HEART_PATH} />
    </>
  );
}
