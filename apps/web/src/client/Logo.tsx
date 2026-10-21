const FACES: readonly (readonly [opacity: number, path: string])[] = [
  [0.22, 'M10.4 12L6.9 12L0 16L3.5 16Z'],
  [0.5, 'M24.2 42L24.2 22L17.3 26L17.3 46Z'],
  [0.5, 'M24.2 22L27.7 12L20.8 16L17.3 26Z'],
  [0.22, 'M27.7 4L20.8 0L13.9 4L20.8 8Z'],
  [0.5, 'M27.7 12L27.7 4L20.8 8L20.8 16Z'],
  [1, 'M0 36L17.3 46L17.3 26L20.8 16L20.8 8L13.9 4L3.5 16L0 16Z'],
  [0.22, 'M37.2 27.5L33.8 27.5L26.8 31.5L30.3 31.5Z'],
  [0.5, 'M51.1 57.5L51.1 37.5L44.2 41.5L44.2 61.5Z'],
  [0.5, 'M51.1 37.5L54.6 27.5L47.6 31.5L44.2 41.5Z'],
  [0.5, 'M54.6 27.5L54.6 19.5L47.6 23.5L47.6 31.5Z'],
  [0.22, 'M54.6 19.5L47.6 15.5L40.7 19.5L47.6 23.5Z'],
  [1, 'M26.8 51.5L44.2 61.5L44.2 41.5L47.6 31.5L47.6 23.5L40.7 19.5L30.3 31.5L26.8 31.5Z'],
];

export function Logo({ title = 'SomeQuote' }: { title?: string }) {
  return (
    <svg className="logo" viewBox="0 0 54.6 61.5" role="img" aria-label={title}>
      {FACES.map(([opacity, path]) => (
        <path key={path} d={path} fill="currentColor" fillOpacity={opacity} />
      ))}
    </svg>
  );
}
