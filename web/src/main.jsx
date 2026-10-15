import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { loadConfig } from './api.js';
import './styles.css';

loadConfig().finally(() => {
  createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
});
