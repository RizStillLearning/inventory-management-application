// Runs in the title bar page (electron/titlebar.html), which has no scripts of its own. It sends
// button clicks to the main process over this page's own IPC channel, so it can only ever
// control the window it belongs to, and nothing is exposed to the page.
import { ipcRenderer } from 'electron';

interface WindowState {
  maximized: boolean;
  focused: boolean;
}

window.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  root.dataset.platform = process.platform;

  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
    button.addEventListener('click', () => ipcRenderer.send('window-control', button.dataset.action));
  }

  const maximize = document.querySelector<HTMLButtonElement>('[data-action="maximize"]')!;
  ipcRenderer.on('window-state', (_event, state: WindowState) => {
    root.classList.toggle('is-maximized', state.maximized);
    root.classList.toggle('is-blurred', !state.focused);
    const label = state.maximized ? 'Restore' : 'Maximize';
    maximize.title = label;
    maximize.setAttribute('aria-label', label);
  });
});
