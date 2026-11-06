import { render } from 'preact';
import { App } from './app.js';
import { InstallGate } from './InstallGate.js';
import { UpdateGate } from './UpdateGate.js';
import './styles.css';

render(
  <InstallGate>
    <UpdateGate>
      <App />
    </UpdateGate>
  </InstallGate>,
  document.getElementById('app')!,
);
