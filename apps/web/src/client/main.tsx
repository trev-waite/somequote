import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { greetConsole } from './console-greeting';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing #root');

greetConsole();
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
