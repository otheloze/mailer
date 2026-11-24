const { app, BrowserWindow, Menu, shell, dialog, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { autoUpdater } = require("electron-updater");
const { APP_URL, START_URL, APP_HOSTS, PAYMENT_HOSTS, ALLOW_HTTP } = require("./config");

const PARTITION = "persist:mymailmarket";
let mainWindow = null;
let lastGoodUrl = START_URL;

function hostMatches(hostname, list) {
  return list.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function parse(url) {
  try { return new URL(url); } catch { return null; }
}

function isAppUrl(url) {
  const parsed = parse(url);
  const secure = parsed?.protocol === "https:" || (ALLOW_HTTP && parsed?.protocol === "http:");
  return !!parsed && secure && hostMatches(parsed.hostname, APP_HOSTS);
}

function isPaymentUrl(url) {
  const parsed = parse(url);
  return !!parsed && parsed.protocol === "https:" && hostMatches(parsed.hostname, PAYMENT_HOSTS);
}

// While the window is on a checkout page, card checks (3-D Secure) can hop to a
// bank's own site, so any https page is allowed until it returns to the app.
function allowedInWindow(targetUrl, currentUrl) {
  if (isAppUrl(targetUrl) || isPaymentUrl(targetUrl)) return true;
  const target = parse(targetUrl);
  return !!target && target.protocol === "https:" && isPaymentUrl(currentUrl);
}

function openExternally(url) {
  const parsed = parse(url);
  if (parsed && ["https:", "http:", "mailto:"].includes(parsed.protocol)) void shell.openExternal(url);
}

// --- Window state ---------------------------------------------------------
const statePath = () => path.join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(statePath(), "utf8")); } catch { return { width: 1320, height: 860 }; }
}

function saveWindowState(win) {
  try {
    const bounds = win.getNormalBounds();
    fs.writeFileSync(statePath(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
  } catch { /* not critical */ }
}

// --- Window -----------------------------------------------------------------
function createWindow() {
  const state = loadWindowState();
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    title: "MYMAILMARKET",
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#f7f8fb",
    show: false,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (state.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("close", () => saveWindowState(win));

  const { webContents } = win;

  webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return; // the bundled offline page
    if (!allowedInWindow(url, webContents.getURL())) {
      event.preventDefault();
      openExternally(url);
    }
  });

  webContents.on("will-redirect", (event, url) => {
    if (!allowedInWindow(url, webContents.getURL())) {
      event.preventDefault();
      openExternally(url);
    }
  });

  // Popups: payment popups (PayPal) stay in-app as child windows; the rest go to the browser.
  webContents.setWindowOpenHandler(({ url }) => {
    if (isPaymentUrl(url) || isAppUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          parent: win,
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    openExternally(url);
    return { action: "deny" };
  });

  webContents.on("did-navigate", (_event, url) => {
    if (isAppUrl(url)) lastGoodUrl = url;
  });

  webContents.on("did-fail-load", (_event, errorCode, _description, validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED (a navigation was replaced), not a real failure.
    if (!isMainFrame || errorCode === -3) return;
    if (validatedURL && isAppUrl(validatedURL)) lastGoodUrl = validatedURL;
    void win.loadFile(path.join(__dirname, "offline.html"), { query: { retry: lastGoodUrl } });
  });

  void win.loadURL(START_URL);
  return win;
}

// --- Menu -------------------------------------------------------------------
function buildMenu() {
  const go = (url) => mainWindow && void mainWindow.loadURL(url);
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Workspace", accelerator: "CmdOrCtrl+Shift+H", click: () => go(START_URL) },
        { label: "New campaign", accelerator: "CmdOrCtrl+N", click: () => go(`${APP_URL}/campaigns/new`) },
        { type: "separator" },
        { label: "Open in browser", click: () => mainWindow && openExternally(isAppUrl(mainWindow.webContents.getURL()) ? mainWindow.webContents.getURL() : APP_URL) },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Back", accelerator: "Alt+Left", click: () => mainWindow?.webContents.navigationHistory.canGoBack() && mainWindow.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: "Alt+Right", click: () => mainWindow?.webContents.navigationHistory.canGoForward() && mainWindow.webContents.navigationHistory.goForward() },
        { role: "reload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Support", click: () => go(`${APP_URL}/contact`) },
        { label: "Privacy policy", click: () => go(`${APP_URL}/privacy`) },
        { label: "Check for updates", click: () => checkForUpdates(true) },
        { label: `About MYMAILMARKET ${app.getVersion()}`, click: () => dialog.showMessageBox({ type: "info", title: "MYMAILMARKET", message: `MYMAILMARKET Desktop ${app.getVersion()}`, detail: APP_URL }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Updates ----------------------------------------------------------------
function checkForUpdates(manual) {
  if (!app.isPackaged) {
    if (manual) void dialog.showMessageBox({ message: "Updates are only checked in the installed app." });
    return;
  }
  if (manual) {
    autoUpdater.once("update-not-available", () => void dialog.showMessageBox({ message: "You have the latest version." }));
    autoUpdater.once("error", (error) => void dialog.showMessageBox({ type: "warning", message: "Could not check for updates.", detail: String(error?.message ?? error) }));
  }
  autoUpdater.checkForUpdatesAndNotify().catch(() => { /* offline or no release yet */ });
}

// --- App lifecycle ----------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Lets the website recognise the app and switch on desktop-only features.
  app.userAgentFallback = `${app.userAgentFallback} MYMAILMARKETDesktop/${app.getVersion()}`;

  app.whenReady().then(() => {
    // The site never needs camera, mic, location or notifications from the desktop shell.
    session.fromPartition(PARTITION).setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === "clipboard-sanitized-write" || permission === "fullscreen");
    });
    buildMenu();
    mainWindow = createWindow();
    mainWindow.on("closed", () => { mainWindow = null; });
    checkForUpdates(false);
  });

  app.on("window-all-closed", () => app.quit());
}
