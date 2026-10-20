import type { fetchTodayPublication } from './api';
import { formatCountdown, useCountdown } from './countdown';
import { Desk } from './Desk';
import { Logo } from './Logo';
import { PublicationView } from './Publication';
import { usePrefersReducedMotion, useTodayPublication } from './today';

export function App({ load }: { load?: typeof fetchTodayPublication }) {
  const { state, retry } = useTodayPublication(load);
  const reducedMotion = usePrefersReducedMotion();
  const remaining = useCountdown(retry);

  return (
    <div className="page">
      <div className="scene scene-quote">
        <div className="scene-content">
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
      </div>
      <aside className="scene scene-lamp" aria-label="Desk lamp, the next quote, and sharing">
        <div className="lamp-stage">
          <Desk
            remainingMs={remaining}
            motion={reducedMotion ? 'reduced' : 'full'}
            quote={state.kind === 'ready' ? state.publication.quote : undefined}
          />
        </div>
        <p className="visually-hidden" role="timer">
          {formatCountdown(remaining)} until the next quote
        </p>
      </aside>
    </div>
  );
}
