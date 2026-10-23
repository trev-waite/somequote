// Requests today's quote while the app bundle downloads; src/client/data/api.ts takes the response.
// A fetch preload would request it twice in WebKit, which never reuses one for fetch().
window.todayResponse = fetch('/api/quote/today', { headers: { Accept: 'application/json' } }).catch(
  () => undefined,
);
