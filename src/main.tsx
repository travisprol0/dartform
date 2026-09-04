import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installCloudflareWebAnalytics } from './cloudflareWebAnalytics';
import './index.css';

installCloudflareWebAnalytics(import.meta.env.VITE_CLOUDFLARE_BEACON_TOKEN);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
