// Applies the reader's color scheme before the first paint, so neither the page nor Safari's
// toolbars flash the wrong color. Keep in sync with src/client/color-scheme.ts and --paper.
(() => {
  let saved = null;
  try {
    saved = localStorage.getItem('somequote.color-scheme');
  } catch {
    // Storage is optional; use the system color scheme.
  }
  const scheme =
    saved === 'light' || saved === 'dark'
      ? saved
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.colorScheme = scheme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = scheme === 'dark' ? '#000000' : '#ffffff';
  const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (statusBar) statusBar.content = scheme === 'dark' ? 'black-translucent' : 'default';
})();
