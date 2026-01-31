
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Fix: Cast window to any to access document, satisfying environment checks where standard types might be incomplete
const rootElement = (window as any).document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
