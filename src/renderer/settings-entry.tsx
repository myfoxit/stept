import './styles/globals.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import SettingsWindow from './components/SettingsWindow';

const container = document.getElementById('settings-root');
if (container) {
  const root = createRoot(container);
  root.render(<SettingsWindow />);
}
