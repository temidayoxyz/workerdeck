import '@fontsource-variable/archivo';
import '@fontsource-variable/public-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app';
import { initializeTheme } from './lib/theme';
import './styles.css';
import './design-system.css';

initializeTheme();

const root = document.getElementById('root');
if (!root) throw new Error('WorkerDeck could not find the application root.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
