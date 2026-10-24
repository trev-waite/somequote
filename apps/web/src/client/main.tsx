import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { greetConsole } from './console-greeting';
import './styles.css';

const NotFound = lazy(() =>
  import('./not-found/NotFound').then(({ NotFound }) => ({ default: NotFound })),
);

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing #root');

greetConsole();
createRoot(container).render(
  <StrictMode>
    {window.location.pathname === '/' ? (
      <App />
    ) : (
      <Suspense>
        <NotFound />
      </Suspense>
    )}
  </StrictMode>,
);
