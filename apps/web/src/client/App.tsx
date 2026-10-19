import type { fetchTodayPublication } from './api';
import { Logo } from './Logo';
import { PublicationView } from './Publication';
import { usePrefersReducedMotion, useTodayPublication } from './today';

export function App({ load }: { load?: typeof fetchTodayPublication }) {
  const { state, retry } = useTodayPublication(load);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="brand">
          <Logo />
        </h1>
      </header>
      <main className="page-main" aria-busy={state.kind === 'loading'}>
        {state.kind === 'ready' && (
          <PublicationView
            publication={state.publication}
            motion={reducedMotion ? 'reduced' : 'full'}
          />
        )}
        {state.kind === 'failed' && (
          <div className="status" role="alert">
            <p>Today’s quote couldn’t be loaded.</p>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </div>
        )}
      </main>
      <div className="page-footer" aria-hidden="true" />
    </div>
  );
}
