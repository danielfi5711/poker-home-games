import { render } from 'preact';
import { App } from './app.js';
import { InstallGate } from './InstallGate.js';
import './styles.css';

render(
  <InstallGate>
    <App />
  </InstallGate>,
  document.getElementById('app')!,
);
