/**
 * Warband — React entry point. Mounts <App/>. StrictMode is intentionally NOT
 * used: the game loop creates a PixiJS Application and a WebRTC room inside an
 * effect, and StrictMode's dev double-invoke would spin up (and tear down) a
 * throwaway renderer/room. Production is unaffected either way.
 */
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { registerSW } from './pwa/registerSW';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(<App />);

registerSW();
