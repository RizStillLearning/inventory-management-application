import {
  app,
  BaseWindow,
  Menu,
  nativeTheme,
  net,
  protocol,
  shell,
  WebContentsView,
  type BaseWindowConstructorOptions,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Set by scripts/electron-dev.js so the window loads the Vite dev server (with hot reload).
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

// The built app is served from app://stockroom/ instead of file://, so the page has its own
// origin and can only read files inside dist/. The hash router means every route is "/".
const SCHEME = 'app';
const appUrl = devServerUrl ?? `${SCHEME}://stockroom/`;
const distDir = path.join(import.meta.dirname, '../dist');
const indexHtml = path.join(distDir, 'index.html');

// The page only talks to Supabase, whose URL is baked in at build time, so any https/wss host is
// allowed. Scripts can only come from the app itself.
const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: wss:",
  "base-uri 'none'",
].join('; ');

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function serveDist() {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const file = path.join(distDir, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    const relative = path.relative(distDir, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });

    const response = await net.fetch(pathToFileURL(file).toString());
    if (file !== indexHtml) return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(response.body, { status: response.status, headers });
  });
}

/** Opens web and email links in the user's browser or mail app. Other schemes are ignored. */
function openExternal(url: string) {
  if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
}

const TITLE_BAR_HEIGHT = 36; // electron/titlebar.html stretches to fill it

// The window is frameless and draws its own title bar, so minimize, maximize and close are always
// there. Native title bars follow the desktop's button layout, and GNOME's default is close only.
// macOS keeps its traffic-light buttons, drawn over the left end of the title bar.
const frameOptions: BaseWindowConstructorOptions =
  process.platform === 'darwin' ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 12 } } : { frame: false };

function createWindow() {
  const pageColor = nativeTheme.shouldUseDarkColors ? '#0d0d0d' : '#f6f6f3'; // --page in styles.css
  const win = new BaseWindow({
    title: 'Stockroom',
    width: 1280,
    height: 820,
    minWidth: 400,
    minHeight: 500,
    backgroundColor: pageColor,
    icon: path.join(import.meta.dirname, '../build/icon.png'),
    ...frameOptions,
  });

  // The title bar is a page of its own rather than part of the app. The app's dialogs use
  // showModal(), which makes the rest of their page inert, so buttons drawn inside the app
  // would stop working whenever a dialog or the product drawer is open.
  // Both pages get Electron's defaults: sandboxed, context-isolated, no Node.js.
  const titleBar = new WebContentsView({
    webPreferences: { preload: path.join(import.meta.dirname, 'titlebar-preload.cjs') },
  });
  const content = new WebContentsView();
  content.setBackgroundColor(pageColor);
  win.contentView.addChildView(content);
  win.contentView.addChildView(titleBar);

  const layout = () => {
    const { width, height } = win.getContentBounds();
    const bar = win.isFullScreen() ? 0 : TITLE_BAR_HEIGHT;
    titleBar.setBounds({ x: 0, y: 0, width, height: bar });
    content.setBounds({ x: 0, y: bar, width, height: height - bar });
  };
  layout();
  win.contentView.on('bounds-changed', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);

  titleBar.webContents.ipc.on('window-control', (_event, action: unknown) => {
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
    if (action === 'close') win.close();
  });
  const sendState = () => titleBar.webContents.send('window-state', { maximized: win.isMaximized(), focused: win.isFocused() });
  titleBar.webContents.on('did-finish-load', sendState);
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('blur', sendState);
  win.on('focus', () => {
    sendState();
    content.webContents.focus();
  });
  // Like a native title bar, it takes clicks but never keyboard focus.
  titleBar.webContents.on('focus', () => content.webContents.focus());
  titleBar.webContents.on('will-navigate', (event) => event.preventDefault());
  titleBar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // The window only ever shows the app. Links elsewhere (a supplier's mailto:, a new tab) go to the OS.
  content.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  content.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(appUrl)) return;
    event.preventDefault();
    openExternal(url);
  });

  // Unlike BrowserWindow, BaseWindow leaves its views' pages running after it closes.
  win.on('closed', () => {
    titleBar.webContents.close();
    content.webContents.close();
  });

  void titleBar.webContents.loadFile(path.join(import.meta.dirname, '../electron/titlebar.html'));
  void content.webContents.loadURL(appUrl);
}

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as const] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One running copy: opening the app again focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BaseWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  void app.whenReady().then(() => {
    if (!devServerUrl) serveDist();
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BaseWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
