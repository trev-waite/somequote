import type { fetchTodayPublication } from './data/api';
import { usePrefersReducedMotion, useTodayPublication } from './data/today';
import { DeferredDesk } from './desk/DeferredDesk';
import { Logo } from './Logo';
import { formatCountdown, useCountdown } from './publication/countdown';
import { PublicationView } from './publication/Publication';

export function App({ load }: { load?: typeof fetchTodayPublication }) {
  const { state, retry, rollOver } = useTodayPublication(load);
  const reducedMotion = usePrefersReducedMotion();
  const remaining = useCountdown(rollOver);

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
                key={state.publication.date}
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
        <DeferredDesk
          ready={state.kind !== 'loading'}
          remainingMs={remaining}
          motion={reducedMotion ? 'reduced' : 'full'}
          quote={state.kind === 'ready' ? state.publication.quote : undefined}
        />
        <p className="visually-hidden" role="timer">
          {formatCountdown(remaining)} until the next quote
        </p>
      </aside>
    </div>
  );
}
