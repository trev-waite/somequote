import { type ComponentProps, useEffect, useRef, useState } from 'react';
import type { Desk } from './Desk';

type DeskState =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'ready'; readonly component: typeof Desk }
  | { readonly kind: 'failed' };

export function DeferredDesk({
  ready,
  ...props
}: ComponentProps<typeof Desk> & { readonly ready: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<DeskState>({ kind: 'waiting' });

  useEffect(() => {
    if (state.kind !== 'waiting') return;
    let active = true;
    let started = false;
    let frame = 0;
    const load = () => {
      if (started) return;
      started = true;
      import('./Desk').then(
        ({ Desk }) => active && setState({ kind: 'ready', component: Desk }),
        () => active && setState({ kind: 'failed' }),
      );
    };
    // Give the quote a paint before loading and rendering the offscreen SVG.
    if (ready)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(load);
      });
    const scene = stage.current?.parentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio > 0)) load();
      },
      { threshold: 0.01 },
    );
    if (scene) observer.observe(scene);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ready, state.kind]);

  return (
    <div ref={stage} className="lamp-stage">
      {state.kind === 'ready' && <state.component {...props} />}
      {state.kind === 'waiting' && (
        <p className="status" role="status">
          Loading desk…
        </p>
      )}
      {state.kind === 'failed' && (
        <div className="status" role="alert">
          <p>The desk couldn’t be loaded.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
