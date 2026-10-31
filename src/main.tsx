import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

window.gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  originalConsoleError.apply(console, args);
  const msg = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
  if (
    msg.includes('OverQuotaMapError') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('You have exceeded your request quota') ||
    (msg.includes('429') && msg.toLowerCase().includes('maps'))
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

createRoot(document.getElementById('root')!).render(<App />);

