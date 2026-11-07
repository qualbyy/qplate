/* ============================================================
   shell.js — менеджер окон и дока
   Собирает окна из DATA.windows, не требует сборки.
   ============================================================ */

(function () {
  "use strict";

  const desktop = document.getElementById("desktop");
  const dock = document.getElementById("dock");

  if (!window.DATA || !Array.isArray(window.DATA.windows)) {
    desktop.innerHTML = '<p style="padding:24px;color:#7a7164;font-family:monospace;">не загрузился data.js — проверь, что он лежит рядом с index.html.</p>';
    return;
  }

  const DATA = window.DATA;
  const renderers = window.APP_RENDERERS || {};
  const settingsKey = "desktop-settings-v1";
  const themeKey = "desktop-accent-v1";
  const positionKey = "desktop-window-positions-v1";
  const stateKey = "desktop-window-state-v1";
  const wallpaperKey = "desktop-wallpaper-v1";

  const windows = new Map();
  const configs = new Map();
  const dockButtons = new Map();
  const lifecycles = new Map();
  const closeTimers = new Map();
  const state = {};

  let highestZ = 10;
  let lastFocused = null;
  let dragState = null;
  let settingsState = {};
  const themeState = { accent: "", color: "" };

  const isMobile = () => window.innerWidth <= 768;
  const motionOff = () => document.body.classList.contains("no-motion");

  /* ---------- Настройки ---------- */

  function loadSettings() {
    const result = {};

    (DATA.settings || []).forEach(function (item) {
      result[item.id] = item.value;
    });

    try {
      const saved = JSON.parse(localStorage.getItem(settingsKey) || "null");
      if (saved && typeof saved === "object") {
        Object.keys(result).forEach(function (key) {
          const item = (DATA.settings || []).filter(function (setting) {
            return setting.id === key;
          })[0];

          if (item && item.type === "number") {
            if (saved[key] !== undefined && saved[key] !== "") {
              const value = Number(saved[key]);
              if (Number.isFinite(value)) result[key] = clampNumber(item, value);
            }
            return;
          }

          if (saved[key] !== undefined && typeof saved[key] === typeof result[key]) {
            result[key] = saved[key];
          }
        });
      }
    } catch (err) {
      /* localStorage может быть запрещён — работаем без сохранения */
    }

    return result;
  }

  function clampNumber(item, value) {
    const number = Number(value);
    const fallback = Number(item.value);
    const base = Number.isFinite(number) ? number : (Number.isFinite(fallback) ? fallback : 0);
    const min = Number.isFinite(Number(item.min)) ? Number(item.min) : -Infinity;
    const max = Number.isFinite(Number(item.max)) ? Number(item.max) : Infinity;
    return Math.min(max, Math.max(min, Math.round(base)));
  }

  /* ---------- Главное окно сайта ---------- */

  function pinnedConfig() {
    return (DATA.windows || []).filter(function (cfg) {
      return cfg.pinned === true;
    })[0] || null;
  }

  function hasEditorWindow() {
    return (DATA.windows || []).some(function (cfg) {
      return cfg.type === "editor";
    });
  }

  function isKiosk() {
    return !!pinnedConfig() && !hasEditorWindow();
  }

  function dockInsets() {
    const ins = { top: 10, right: 10, bottom: 10, left: 10 };
    if (isKiosk()) {
      ins.top = ins.right = ins.bottom = ins.left = 0;
      return ins;
    }
    if (isMobile()) {
      ins.bottom = 92;
      return ins;
    }
    const side = settingsState.dockplace || "right";
    const dockEl = document.getElementById("dock");
    const attached = (settingsState.dockmode || "float") === "iphone";
    const gap = attached ? 20 : 12;
    const size = side === "left" || side === "right"
      ? (dockEl ? dockEl.offsetWidth : 60)
      : (dockEl ? dockEl.offsetHeight : 60);
    ins[side] = size + gap;
    return ins;
  }

  function hyprOn() {
    return !isMobile() && !isKiosk() && (settingsState.style || "desktop") === "hypr";
  }

  function layoutHypr() {
    if (!hyprOn()) return;

    const open = [];
    windows.forEach(function (win, id) {
      if (state[id]) open.push(win);
    });
    if (!open.length) return;

    const ins = dockInsets();
    const gap = 10;
    const count = open.length;
    const usable = window.innerWidth - ins.left - ins.right - gap * (count + 1);
    const colW = Math.max(220, Math.floor(usable / count));
    const colH = Math.max(200, window.innerHeight - ins.top - ins.bottom - gap * 2);

    open.forEach(function (win, index) {
      win.style.left = (ins.left + gap + index * (colW + gap)) + "px";
      win.style.top = (ins.top + gap) + "px";
      win.style.width = colW + "px";
      win.style.height = colH + "px";
    });
  }

  function saveSettings() {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settingsState));
    } catch (err) {
      /* молча живём дальше */
    }
  }

  /* ---------- Ключевой цвет ---------- */

  function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "");
    const full = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /* Смешивает цвет с белым: 0 — цвет, 1 — белый. */
  function tint(rgb, amount) {
    const mix = Math.max(0, Math.min(1, amount));
    return "rgb(" + [rgb.r, rgb.g, rgb.b].map(function (v) {
      return Math.round(v + (255 - v) * mix);
    }).join(" ") + ")";
  }

  /* Смешивает цвет с белым и добавляет прозрачность. */
  function tintAlpha(rgb, amount, alpha) {
    const mix = Math.max(0, Math.min(1, amount));
    const channels = [rgb.r, rgb.g, rgb.b].map(function (v) {
      return Math.round(v + (255 - v) * mix);
    });
    return "rgba(" + channels.join(", ") + ", " + alpha + ")";
  }

  /* Смешивает цвет с чёрным: 0 — цвет, 1 — чёрный. */
  function shade(rgb, amount) {
    const mix = Math.max(0, Math.min(1, amount));
    return "rgb(" + [rgb.r, rgb.g, rgb.b].map(function (v) {
      return Math.round(v * (1 - mix));
    }).join(" ") + ")";
  }

  /* Затемняет цвет и добавляет прозрачность. */
  function shadeAlpha(rgb, amount, alpha) {
    const mix = Math.max(0, Math.min(1, amount));
    const channels = [rgb.r, rgb.g, rgb.b].map(function (v) {
      return Math.round(v * (1 - mix));
    });
    return "rgba(" + channels.join(", ") + ", " + alpha + ")";
  }

  /* Читаемый цвет текста на ключевом цвете. */
  function onAccent(rgb) {
    const light = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    return light > 170 ? "#1a1714" : "#ffffff";
  }

  function themeColor(value) {
    const theme = DATA.theme || {};
    const preset = (theme.presets || []).filter(function (item) {
      return item.id === value;
    })[0];

    if (!value) {
      let savedColor = "";
      try {
        savedColor = localStorage.getItem(themeKey) || "";
      } catch (err) {
        savedColor = "";
      }

      if (/^#[0-9a-f]{6}$/i.test(savedColor)) {
        themeState.accent = "";
        themeState.color = savedColor;
        return savedColor;
      }

      themeState.accent = theme.accent || (theme.presets && theme.presets[0] && theme.presets[0].id) || "sand";
      return themeColor(themeState.accent);
    }

    if (preset) {
      themeState.color = preset.color;
      return preset.color;
    }

    if (/^#[0-9a-f]{6}$/i.test(String(value || ""))) {
      themeState.color = value;
      return value;
    }

    const saved = localStorage.getItem(themeKey);
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
      themeState.accent = saved;
      themeState.color = saved;
      return saved;
    }

    const first = (theme.presets || [])[0];
    themeState.accent = first ? first.id : "sand";
    themeState.color = first ? first.color : "#a07844";
    return themeState.color;
  }

  const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function isDark() {
    const mode = settingsState.theme || "light";
    if (mode === "dark") return true;
    if (mode === "auto") return !!(darkQuery && darkQuery.matches);
    return false;
  }

  function applyTheme() {
    const rgb = hexToRgb(themeState.color);
    const root = document.documentElement.style;
    const dark = isDark();
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    const delta = max - min;
    let accentHue = 0;
    if (delta) {
      accentHue = max === rgb.r ? ((rgb.g - rgb.b) / delta) % 6 : max === rgb.g ? (rgb.b - rgb.r) / delta + 2 : (rgb.r - rgb.g) / delta + 4;
      accentHue *= 60;
      if (accentHue < 0) accentHue += 360;
    }
    root.setProperty("--accent-hue", String(accentHue));

    root.setProperty("--accent", themeState.color);
    root.setProperty("--accent-deep", tint(rgb, 0.2));
    root.setProperty("--sand-accent", themeState.color);
    root.setProperty("--accent-rgb", rgb.r + ", " + rgb.g + ", " + rgb.b);
    root.setProperty("--accent-dark", shade(rgb, 0.32));
    root.setProperty("--on-accent", onAccent(rgb));
    root.setProperty("--photo-overlay", shadeAlpha(rgb, 0.55, 0.82));

    if (dark) {
      root.setProperty("--bg", shade(rgb, 0.84));
      root.setProperty("--term-bg", shade(rgb, 0.9));
      root.setProperty("--header-bg", shade(rgb, 0.74));
      root.setProperty("--border", shade(rgb, 0.62));
      root.setProperty("--border-dark", shade(rgb, 0.48));
      root.setProperty("--text", tint(rgb, 0.88));
      root.setProperty("--text-dim", tint(rgb, 0.62));
      root.setProperty("--ink", tint(rgb, 0.9));
      root.setProperty("--sand-dark", tint(rgb, 0.42));
      root.setProperty("--sand-badge", shade(rgb, 0.7));
      root.setProperty("--prompt-user", tint(rgb, 0.5));
      root.setProperty("--prompt-path", tint(rgb, 0.62));
      root.setProperty("--dock-bg", shadeAlpha(rgb, 0.68, 0.9));
      root.setProperty("--dock-hover-bg", shade(rgb, 0.86));
      root.setProperty("--surface-soft", shade(rgb, 0.78));
      root.setProperty("--surface-inset", shade(rgb, 0.82));
      root.setProperty("--surface-deep", shade(rgb, 0.72));
      root.setProperty("--surface-mute", shade(rgb, 0.68));
      root.setProperty("--surface-paper", shade(rgb, 0.76));
      root.setProperty("--hover-strong", shade(rgb, 0.6));
    } else {
      root.setProperty("--bg", tint(rgb, 0.93));
      root.setProperty("--term-bg", tint(rgb, 0.965));
      root.setProperty("--header-bg", tint(rgb, 0.87));
      root.setProperty("--border", tint(rgb, 0.78));
      root.setProperty("--border-dark", tint(rgb, 0.66));
      root.setProperty("--text", "#141210");
      root.setProperty("--text-dim", "#3b352d");
      root.setProperty("--ink", "#141210");
      root.setProperty("--sand-dark", shade(rgb, 0.2));
      root.setProperty("--sand-badge", tint(rgb, 0.88));
      root.setProperty("--prompt-user", tint(rgb, 0.38));
      root.setProperty("--prompt-path", tint(rgb, 0.55));
      root.setProperty("--dock-bg", tintAlpha(rgb, 0.87, 0.88));
      root.setProperty("--dock-hover-bg", tint(rgb, 0.985));
      root.setProperty("--surface-soft", tint(rgb, 0.96));
      root.setProperty("--surface-inset", tint(rgb, 0.975));
      root.setProperty("--surface-deep", tint(rgb, 0.94));
      root.setProperty("--surface-mute", tint(rgb, 0.9));
      root.setProperty("--surface-paper", tint(rgb, 0.985));
      root.setProperty("--hover-strong", tint(rgb, 0.865));
    }

    document.body.classList.toggle("theme-dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute("content", dark ? "dark" : "light");

    try {
      localStorage.setItem(themeKey, themeState.color);
    } catch (err) {
      /* ничего */
    }
  }

  /* ---------- Обои ---------- */

  function applyWallpaper() {
    const wall = settingsState.wallpaper || "none";
    let image = "";

    try {
      image = localStorage.getItem(wallpaperKey) || "";
    } catch (err) {
      image = "";
    }

    document.body.dataset.wallpaper = wall;
    document.documentElement.style.setProperty("--wallpaper-image", image ? "url(" + image + ")" : "none");
    document.body.classList.toggle("has-wallpaper", wall === "custom" && !!image);
  }

  /* ---------- Часы ---------- */

  const clockPosKey = "desktop-clock-pos-v1";
  let clockTimer = null;

  function loadClockPos() {
    try {
      return JSON.parse(localStorage.getItem(clockPosKey) || "null") || null;
    } catch (err) {
      return null;
    }
  }

  function applyClockPos() {
    const clock = document.querySelector(".desktop-clock");
    if (!clock) return;

    const custom = settingsState.clockpos === "custom";
    clock.style.cursor = custom ? "grab" : "";
    clock.style.pointerEvents = custom ? "auto" : "";

    const ownSize = settingsState.clocksize === "custom";
    const size = Math.min(200, Math.max(10, parseInt(settingsState.clockfont, 10) || 34));
    const timeEl = clock.querySelector(".clock-time");
    const dateEl = clock.querySelector(".clock-date");

    if (timeEl) timeEl.style.fontSize = ownSize ? size + "px" : "";
    if (dateEl) dateEl.style.fontSize = ownSize ? Math.max(9, Math.round(size * 0.45)) + "px" : "";

    if (!custom) {
      clock.style.left = "";
      clock.style.top = "";
      return;
    }

    const saved = loadClockPos() || { left: 18, top: 14 };
    clock.style.left = saved.left + "px";
    clock.style.top = saved.top + "px";
  }

  function startClockDrag(e) {
    if (settingsState.clockpos !== "custom") return;

    const clock = e.currentTarget;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = clock.getBoundingClientRect();

    function move(ev) {
      const maxLeft = Math.max(4, window.innerWidth - clock.offsetWidth - 4);
      const maxTop = Math.max(4, window.innerHeight - clock.offsetHeight - 4);
      const left = Math.min(Math.max(4, rect.left + ev.clientX - startX), maxLeft);
      const top = Math.min(Math.max(4, rect.top + ev.clientY - startY), maxTop);

      clock.style.left = Math.round(left) + "px";
      clock.style.top = Math.round(top) + "px";
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);

      try {
        localStorage.setItem(clockPosKey, JSON.stringify({
          left: parseInt(clock.style.left, 10) || 18,
          top: parseInt(clock.style.top, 10) || 14
        }));
      } catch (err) {
        /* ничего */
      }
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function buildClock() {
    if (document.querySelector(".desktop-clock")) return;

    const clock = document.createElement("div");
    clock.className = "desktop-clock";
    clock.setAttribute("aria-hidden", "true");
    clock.innerHTML = '<span class="clock-time"></span><span class="clock-date"></span>';
    clock.addEventListener("pointerdown", startClockDrag);
    document.body.appendChild(clock);

    function paint() {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const date = now.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

      clock.querySelector(".clock-time").textContent = hours + ":" + minutes;
      clock.querySelector(".clock-date").textContent = date;
    }

    paint();
    applyClockPos();
    clockTimer = window.setInterval(paint, 15000);
  }

  /* ---------- Позиции окон ---------- */

  function loadPositions() {
    try {
      return JSON.parse(localStorage.getItem(positionKey) || "{}") || {};
    } catch (err) {
      return {};
    }
  }

  function savePosition(id) {
    if (!settingsState.positions || isMobile()) return;

    const win = windows.get(id);
    if (!win) return;

    if (win.classList.contains("is-maximized")) return;

    const all = loadPositions();
    all[id] = {
      left: parseInt(win.style.left, 10) || 10,
      top: parseInt(win.style.top, 10) || 10
    };

    if (win.dataset.sized) {
      all[id].width = parseInt(win.style.width, 10) || 0;
      all[id].height = parseInt(win.style.height, 10) || 0;
    }

    try {
      localStorage.setItem(positionKey, JSON.stringify(all));
    } catch (err) {
      /* ничего */
    }
  }

  function clearPositions() {
    try {
      localStorage.removeItem(positionKey);
      localStorage.removeItem(stateKey);
    } catch (err) {
      /* ничего */
    }
  }

  function saveOpenState() {
    if (!settingsState.positions || isMobile()) return;

    const ids = DATA.windows.filter(function (cfg) {
      return state[cfg.id];
    }).map(function (cfg) {
      return cfg.id;
    });

    try {
      localStorage.setItem(stateKey, JSON.stringify(ids));
    } catch (err) {
      /* ничего */
    }
  }

  function loadOpenState() {
    if (!settingsState.positions || isMobile()) return null;

    try {
      const saved = JSON.parse(localStorage.getItem(stateKey) || "null");
      return Array.isArray(saved) ? saved : null;
    } catch (err) {
      return null;
    }
  }

  function restorePosition(id) {
    if (!settingsState.positions || isMobile()) return false;

    const saved = loadPositions()[id];
    const win = windows.get(id);
    if (!saved || !win) return false;

    const ins = dockInsets();
    const maxLeft = Math.max(ins.left, window.innerWidth - win.offsetWidth - ins.right);
    const maxTop = Math.max(ins.top, window.innerHeight - win.offsetHeight - ins.bottom);

    win.style.left = Math.min(Math.max(ins.left, saved.left || ins.left), maxLeft) + "px";
    win.style.top = Math.min(Math.max(ins.top, saved.top || ins.top), maxTop) + "px";

    if (saved.width && saved.height) {
      win.style.width = Math.max(280, saved.width) + "px";
      win.style.height = Math.max(180, saved.height) + "px";
      win.dataset.sized = "1";
    }

    win.dataset.positioned = "1";
    return true;
  }

  function applySettings() {
    document.body.classList.toggle("no-motion", settingsState.motion === false);
    document.body.classList.toggle("no-tooltips", settingsState.tooltips === false);
    document.body.classList.toggle("big-text", settingsState.bigtext === true);
    document.body.classList.toggle("no-clock", settingsState.clock === false);
    document.body.classList.toggle("no-hints", settingsState.hints === false);
    document.body.classList.toggle("is-kiosk", isKiosk());

    document.body.dataset.style = settingsState.style || "desktop";
    document.body.dataset.dockmode = settingsState.dockmode || "float";
    document.body.dataset.dockplace = settingsState.dockplace || "right";
    document.documentElement.style.setProperty("--dock-size", clampNumber({ min: 28, max: 64, value: 44 }, settingsState.docksize) + "px");
    document.documentElement.style.setProperty("--hint-size", clampNumber({ min: 8, max: 16, value: 10 }, settingsState.hintsize) + "px");

    ["tl", "tc", "tr", "bl", "bc", "br", "center", "custom"].forEach(function (pos) {
      document.body.classList.toggle("clock-pos-" + pos, (settingsState.clockpos || "tr") === pos);
    });

    ["s", "m", "l", "xl", "custom"].forEach(function (size) {
      document.body.classList.toggle("clock-size-" + size, (settingsState.clocksize || "m") === size);
    });

    applyClockPos();
    applyWallpaper();
    layoutHypr();
  }

  function applySetting(id, value) {
    if (id === "accent") {
      const next = typeof value === "string" ? value : "";
      const theme = DATA.theme || {};
      const locked = Array.isArray(theme.locked) ? theme.locked : [];
      const custom = next.charAt(0) === "#";
      if ((custom && theme.lockedCustom) || (!custom && locked.indexOf(next) >= 0)) return;
      themeColor(next);
      applyTheme();
      return;
    }

    const item = (DATA.settings || []).filter(function (setting) {
      return setting.id === id;
    })[0];

    if (item && Array.isArray(item.locked) && item.locked.indexOf(String(value)) >= 0) return;

    if (item && item.type === "number") {
      settingsState[id] = clampNumber(item, value);
    } else {
      const isToggle = !item || item.type === "toggle" || item.type === undefined;
      settingsState[id] = isToggle ? !!value : String(value);
    }

    applySettings();
    saveSettings();

    if (id === "theme") applyTheme();
    if (id === "positions" && settingsState.positions === false) clearPositions();
    if ((id === "dockmode" || id === "docksize" || id === "dockplace") && windows.size) clampOpenWindows();
    if (id === "style" && windows.has("settings")) window.WindowManager.refresh("settings");
  }

  /* ---------- Сборка окна ---------- */

  function paintWindow(cfg) {
    const win = windows.get(cfg.id);
    if (!win) return;

    win.querySelector(".window-title").textContent = cfg.title;
    win.setAttribute("aria-label", cfg.title);

    const cfgSize = (cfg.width || 620) + "x" + (cfg.height || 0);

    if (win.dataset.cfgSize !== cfgSize) {
      win.dataset.cfgSize = cfgSize;
      delete win.dataset.sized;
    }

    if (!win.dataset.sized) {
      win.style.width = (cfg.width || 620) + "px";
      if (cfg.height) win.style.height = cfg.height + "px";
      else win.style.removeProperty("height");
    }

    const body = win.querySelector(".window-body");
    body.innerHTML = "";

    const renderer = renderers[cfg.type] || renderers.__fallback;

    if (renderer && typeof renderer.render === "function") {
      const lifecycle = renderer.render(body, cfg, ctx);
      lifecycles.set(cfg.id, lifecycle || {});
    } else {
      body.innerHTML = '<p class="empty-note">для этого окна пока нет отрисовщика.</p>';
      lifecycles.set(cfg.id, {});
    }

    if (state[cfg.id]) {
      const lifecycle = lifecycles.get(cfg.id);
      if (lifecycle && typeof lifecycle.onOpen === "function") lifecycle.onOpen();
    }
  }

  function buildWindow(cfg) {
    const win = document.createElement("section");
    win.className = "window";
    win.id = "win-" + cfg.id;
    win.dataset.app = cfg.id;
    if (isKiosk() && cfg.pinned === true) win.classList.add("is-kiosk");
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", cfg.title);
    win.style.width = (cfg.width || 620) + "px";

    if (!cfg.open) {
      win.classList.add("is-minimized");
      win.setAttribute("aria-hidden", "true");
    }

    win.innerHTML = [
      '<header class="window-header">',
      '  <div class="window-controls">',
      '    <button type="button" class="win-btn btn-close" aria-label="закрыть" title="закрыть"></button>',
      '    <button type="button" class="win-btn btn-min" aria-label="свернуть" title="свернуть"></button>',
      '    <button type="button" class="win-btn btn-max" aria-label="развернуть" title="развернуть"></button>',
      '  </div>',
      '  <h2 class="window-title"></h2>',
      '  <div class="window-spacer" aria-hidden="true"></div>',
      '</header>',
      '<div class="window-body"></div>',
      '<div class="win-grip win-grip-n" data-dir="n"></div>',
      '<div class="win-grip win-grip-s" data-dir="s"></div>',
      '<div class="win-grip win-grip-w" data-dir="w"></div>',
      '<div class="win-grip win-grip-e" data-dir="e"></div>',
      '<div class="win-grip win-grip-nw" data-dir="nw"></div>',
      '<div class="win-grip win-grip-ne" data-dir="ne"></div>',
      '<div class="win-grip win-grip-sw" data-dir="sw"></div>',
      '<div class="win-grip win-grip-se" data-dir="se"></div>'
    ].join("");

    win.querySelector(".window-title").textContent = cfg.title;

    win.querySelector(".btn-close").addEventListener("click", function (e) {
      e.stopPropagation();
      closeWindow(cfg.id);
    });

    win.querySelector(".btn-min").addEventListener("click", function (e) {
      e.stopPropagation();
      minimizeWindow(cfg.id);
    });

    win.querySelector(".btn-max").addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMaximize(cfg.id);
    });

    win.querySelectorAll(".win-grip").forEach(function (grip) {
      grip.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        startResize(e, cfg.id, grip.dataset.dir);
      });
    });

    const header = win.querySelector(".window-header");

    header.addEventListener("pointerdown", function (e) {
      startDrag(e, cfg.id);
    });

    header.addEventListener("dblclick", function (e) {
      if (e.target.closest("button")) return;
      toggleMaximize(cfg.id);
    });

    win.addEventListener("pointerdown", function () {
      focusWindow(cfg.id);
    });

    desktop.appendChild(win);
    windows.set(cfg.id, win);
    configs.set(cfg.id, cfg);
    state[cfg.id] = false;
    paintWindow(cfg);

    return win;
  }

  /* ---------- Док ---------- */

  let dockTip = null;

  function showDockTip(btn) {
    if (isMobile() || isKiosk() || settingsState.tooltips === false) return;

    if (!dockTip) {
      dockTip = document.createElement("div");
      dockTip.className = "dock-tooltip-float";
      document.body.appendChild(dockTip);
    }

    dockTip.textContent = btn.getAttribute("aria-label") || "";
    dockTip.classList.add("show");

    const side = settingsState.dockplace || "right";
    const gap = 10;
    const r = btn.getBoundingClientRect();
    const w = dockTip.offsetWidth;
    const h = dockTip.offsetHeight;
    let left = 0;
    let top = 0;

    if (side === "left") {
      left = r.right + gap;
      top = r.top + r.height / 2 - h / 2;
    } else if (side === "top") {
      left = r.left + r.width / 2 - w / 2;
      top = r.bottom + gap;
    } else if (side === "bottom") {
      left = r.left + r.width / 2 - w / 2;
      top = r.top - gap - h;
    } else {
      left = r.left - gap - w;
      top = r.top + r.height / 2 - h / 2;
    }

    left = Math.max(4, Math.min(window.innerWidth - w - 4, left));
    top = Math.max(4, Math.min(window.innerHeight - h - 4, top));
    dockTip.style.left = Math.round(left) + "px";
    dockTip.style.top = Math.round(top) + "px";
  }

  function hideDockTip() {
    if (dockTip) dockTip.classList.remove("show");
  }

  function createDockButton(cfg) {
    const old = dockButtons.get(cfg.id);
    if (old) old.remove();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dock-app";
    btn.id = "dock-" + cfg.id;
    btn.setAttribute("aria-label", cfg.label);
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-controls", "win-" + cfg.id);
    btn.innerHTML = [
      '<span class="dock-app-icon" aria-hidden="true"></span>',
      '<span class="dock-app-dot" aria-hidden="true"></span>'
    ].join("");

    const icon = btn.querySelector(".dock-app-icon");
    icon.innerHTML = (DATA.icons || {})[cfg.iconKey] || "";

    btn.addEventListener("pointerenter", function () { showDockTip(btn); });
    btn.addEventListener("focus", function () { showDockTip(btn); });
    btn.addEventListener("pointerleave", hideDockTip);
    btn.addEventListener("blur", hideDockTip);

    btn.addEventListener("click", function () {
      hideDockTip();
      toggleWindow(cfg.id);
    });

    if (state[cfg.id]) {
      btn.classList.add("open");
      btn.setAttribute("aria-pressed", "true");
    }

    dock.appendChild(btn);
    dockButtons.set(cfg.id, btn);
  }

  function buildDock() {
    DATA.windows.forEach(createDockButton);
  }

  function removeWindow(id) {
    const win = windows.get(id);
    const btn = dockButtons.get(id);
    const life = lifecycles.get(id);

    if (life && typeof life.onDestroy === "function") life.onDestroy();

    clearTimeout(closeTimers.get(id));
    closeTimers.delete(id);
    lifecycles.delete(id);
    windows.delete(id);
    configs.delete(id);
    dockButtons.delete(id);
    delete state[id];

    if (win) win.remove();
    if (btn) btn.remove();

    const all = loadPositions();
    if (all[id]) {
      delete all[id];
      try {
        localStorage.setItem(positionKey, JSON.stringify(all));
      } catch (err) {
        /* ничего */
      }
    }
  }

  function sync() {
    const wanted = {};

    DATA.windows.forEach(function (cfg) {
      wanted[cfg.id] = true;
    });

    Array.from(windows.keys()).forEach(function (id) {
      if (!wanted[id]) removeWindow(id);
    });

    DATA.windows.forEach(function (cfg) {
      if (windows.has(cfg.id)) {
        configs.set(cfg.id, cfg);
        paintWindow(cfg);
      } else {
        buildWindow(cfg);
      }
      createDockButton(cfg);
    });

    document.body.classList.toggle("is-kiosk", isKiosk());
    buildHotkeyHints();
    layoutHypr();
  }

  function updateDock(id, open) {
    const btn = dockButtons.get(id);
    if (!btn) return;
    btn.classList.toggle("open", open);
    btn.setAttribute("aria-pressed", open ? "true" : "false");
  }

  /* ---------- Открытие, закрытие, фокус ---------- */

  function openWindow(id) {
    const win = windows.get(id);
    if (!win) return;

    if (isMobile()) {
      DATA.windows.forEach(function (other) {
        if (other.id !== id && state[other.id]) hideInstant(other.id);
      });
    }

    clearTimeout(closeTimers.get(id));
    closeTimers.delete(id);

    state[id] = true;
    win.classList.remove("is-minimized", "is-closing");
    win.removeAttribute("aria-hidden");
    updateDock(id, true);

    if (!win.dataset.positioned) {
      if (!restorePosition(id)) positionNew(id);
      win.dataset.positioned = "1";
    }

    saveOpenState();
    focusWindow(id);
    layoutHypr();

    const lifecycle = lifecycles.get(id);
    if (lifecycle && typeof lifecycle.onOpen === "function") lifecycle.onOpen();
  }

  function hideInstant(id) {
    if (!state[id]) return;

    const win = windows.get(id);
    state[id] = false;

    clearTimeout(closeTimers.get(id));
    closeTimers.delete(id);

    win.classList.remove("is-closing");
    win.classList.add("is-minimized");
    win.setAttribute("aria-hidden", "true");
    updateDock(id, false);
    saveOpenState();
    layoutHypr();

    const lifecycle = lifecycles.get(id);
    if (lifecycle && typeof lifecycle.onHide === "function") lifecycle.onHide();
  }

  function minimizeWindow(id) {
    if (isKiosk() && pinnedConfig().id === id) return;
    hideInstant(id);
  }

  function closeWindow(id) {
    if (isKiosk() && pinnedConfig().id === id) return;
    if (!state[id]) return;

    const win = windows.get(id);
    state[id] = false;
    updateDock(id, false);
    saveOpenState();
    win.classList.remove("is-minimized");
    win.classList.add("is-closing");

    const lifecycle = lifecycles.get(id);
    if (lifecycle && typeof lifecycle.onHide === "function") lifecycle.onHide();

    layoutHypr();
    clearTimeout(closeTimers.get(id));

    const delay = motionOff() ? 0 : 380;
    const timer = window.setTimeout(function () {
      win.classList.remove("is-closing");
      win.classList.add("is-minimized");
      win.setAttribute("aria-hidden", "true");
      closeTimers.delete(id);
    }, delay);

    closeTimers.set(id, timer);
  }

  function toggleWindow(id) {
    if (isKiosk() && pinnedConfig().id === id) {
      openWindow(id);
      return;
    }

    if (state[id]) {
      minimizeWindow(id);
    } else {
      openWindow(id);
    }
  }

  function focusWindow(id) {
    const win = windows.get(id);
    if (!win) return;

    highestZ += 2;
    win.style.zIndex = String(highestZ);

    windows.forEach(function (other) {
      other.classList.remove("is-focused");
    });

    win.classList.add("is-focused");
    lastFocused = id;
  }

  /* ---------- Позиция ---------- */

  function centerWindow(id) {
    const win = windows.get(id);
    if (!win || isMobile()) return;

    const w = win.offsetWidth || parseInt(win.style.width, 10) || 600;
    const h = win.offsetHeight || 360;

    const left = Math.max(10, Math.round((window.innerWidth - w) / 2));
    const top = Math.max(10, Math.round((window.innerHeight - h) / 2));

    win.style.left = left + "px";
    win.style.top = top + "px";
  }

  const maxSaved = new Map();
  const MIN_WIDTH = 300;
  const MIN_HEIGHT = 200;

  function startResize(e, id, dir) {
    if (hyprOn()) return;
    if (isMobile()) return;

    const win = windows.get(id);
    if (!win || win.classList.contains("is-maximized") || win.classList.contains("is-kiosk")) return;

    e.preventDefault();
    focusWindow(id);

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = win.offsetLeft;
    const startTop = win.offsetTop;
    const startWidth = win.offsetWidth;
    const startHeight = win.offsetHeight;

    function move(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let left = startLeft;
      let top = startTop;
      let width = startWidth;
      let height = startHeight;

      if (dir.indexOf("e") >= 0) width = Math.max(MIN_WIDTH, startWidth + dx);
      if (dir.indexOf("s") >= 0) height = Math.max(MIN_HEIGHT, startHeight + dy);

      if (dir.indexOf("w") >= 0) {
        width = Math.max(MIN_WIDTH, startWidth - dx);
        left = startLeft + (startWidth - width);
      }

      if (dir.indexOf("n") >= 0) {
        height = Math.max(MIN_HEIGHT, startHeight - dy);
        top = startTop + (startHeight - height);
      }

      const ins = dockInsets();
      const bottomLimit = window.innerHeight - ins.bottom;
      const rightLimit = window.innerWidth - ins.right;
      if (top + height > bottomLimit) height = Math.max(MIN_HEIGHT, bottomLimit - top);
      if (left + width > rightLimit) width = Math.max(MIN_WIDTH, rightLimit - left);

      win.style.left = Math.round(left) + "px";
      win.style.top = Math.round(top) + "px";
      win.style.width = Math.round(width) + "px";
      win.style.height = Math.round(height) + "px";
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      win.dataset.sized = "1";
      savePosition(id);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function toggleMaximize(id) {
    if (hyprOn()) return;
    const win = windows.get(id);
    if (!win || isMobile() || win.classList.contains("is-kiosk")) return;

    if (win.classList.contains("is-maximized")) {
      win.classList.remove("is-maximized");

      const saved = maxSaved.get(id);
      if (saved) {
        win.style.left = saved.left;
        win.style.top = saved.top;
        win.style.width = saved.width;
        win.style.height = saved.height;
      }

      win.querySelector(".btn-max").setAttribute("title", "развернуть");
      win.querySelector(".btn-max").setAttribute("aria-label", "развернуть");
      savePosition(id);
      return;
    }

    maxSaved.set(id, {
      left: win.style.left,
      top: win.style.top,
      width: win.style.width,
      height: win.style.height
    });

    win.dataset.sized = "1";
    win.classList.add("is-maximized");
    win.querySelector(".btn-max").setAttribute("title", "вернуть размер");
    win.querySelector(".btn-max").setAttribute("aria-label", "вернуть размер");
    focusWindow(id);
  }

  function centerAndMark(id) {
    centerWindow(id);
    const win = windows.get(id);
    if (win) {
      win.dataset.positioned = "1";
      savePosition(id);
    }
  }

  function positionNew(id) {
    if (isMobile()) return;

    const win = windows.get(id);
    if (!win) return;

    centerWindow(id);

    let left = parseInt(win.style.left, 10) || 10;
    let top = parseInt(win.style.top, 10) || 10;

    const others = Array.prototype.slice.call(
      desktop.querySelectorAll(".window:not(.is-minimized)")
    ).filter(function (other) {
      return other !== win && !other.classList.contains("is-closing");
    });

    let tries = 0;
    while (tries < 6 && others.some(function (other) {
      return Math.abs(other.offsetLeft - left) < 24 && Math.abs(other.offsetTop - top) < 24;
    })) {
      left += 26;
      top += 26;
      tries += 1;
    }

    const ins = dockInsets();
    const maxLeft = Math.max(ins.left, window.innerWidth - win.offsetWidth - ins.right);
    const maxTop = Math.max(ins.top, window.innerHeight - win.offsetHeight - ins.bottom);

    win.style.left = Math.min(Math.max(ins.left, left), maxLeft) + "px";
    win.style.top = Math.min(top, maxTop) + "px";
  }

  function clampOpenWindows() {
    if (isMobile()) return;

    desktop.querySelectorAll(".window:not(.is-minimized)").forEach(function (win) {
      const ins = dockInsets();
      const left = parseInt(win.style.left, 10) || ins.left;
      const top = parseInt(win.style.top, 10) || ins.top;
      const maxLeft = Math.max(ins.left, window.innerWidth - win.offsetWidth - ins.right);
      const maxTop = Math.max(ins.top, window.innerHeight - win.offsetHeight - ins.bottom);

      if (left > maxLeft) win.style.left = maxLeft + "px";
      if (top > maxTop) win.style.top = maxTop + "px";
      if (left < ins.left) win.style.left = ins.left + "px";
      if (top < ins.top) win.style.top = ins.top + "px";
    });
  }

  /* ---------- Перетаскивание ---------- */

  function startDrag(e, id) {
    if (isMobile() || hyprOn() || e.button !== 0) return;
    if (e.target.closest("button, a, input, textarea, select")) return;

    const win = windows.get(id);
    if (!win) return;

    focusWindow(id);

    if (win.classList.contains("is-kiosk")) return;

    dragState = {
      win: win,
      x: e.clientX,
      y: e.clientY,
      left: win.offsetLeft,
      top: win.offsetTop
    };

    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);

    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragState) return;

    const win = dragState.win;
    const dx = e.clientX - dragState.x;
    const dy = e.clientY - dragState.y;

    const ins = dockInsets();
    const maxLeft = Math.max(ins.left, window.innerWidth - win.offsetWidth - ins.right);
    const maxTop = Math.max(ins.top, window.innerHeight - win.offsetHeight - ins.bottom);

    const left = Math.max(ins.left, Math.min(maxLeft, dragState.left + dx));
    const top = Math.max(ins.top, Math.min(maxTop, dragState.top + dy));

    win.style.left = left + "px";
    win.style.top = top + "px";
  }

  function endDrag() {
    if (dragState && dragState.win) {
      dragState.win.dataset.positioned = "1";
      savePosition(dragState.win.dataset.app);
    }
    dragState = null;

    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", endDrag);
    document.removeEventListener("pointercancel", endDrag);
  }

  /* ---------- Изменение размера экрана ---------- */

  function onResize() {
    if (isMobile()) {
      const openIds = DATA.windows.map(function (cfg) { return cfg.id; }).filter(function (id) {
        return state[id];
      });

      if (openIds.length > 1) {
        const keep = openIds.indexOf(lastFocused) !== -1 ? lastFocused : openIds[openIds.length - 1];
        openIds.forEach(function (id) {
          if (id !== keep) hideInstant(id);
        });
      }
    } else {
      clampOpenWindows();
    }
  }

  /* ---------- Контекст для отрисовщиков ---------- */

  const ctx = {
    open: openWindow,
    close: closeWindow,
    minimize: minimizeWindow,
    toggle: toggleWindow,
    center: centerAndMark,
    focus: focusWindow,
    applySetting: applySetting,
    getTheme: function () {
      return { accent: themeState.accent, color: themeState.color };
    },
    getSettings: function () {
      return Object.assign({}, settingsState);
    },
    getWindow: function (id) {
      return windows.get(id) || null;
    }
  };

  /* ---------- Публичный доступ ---------- */

  window.WindowManager = {
    open: openWindow,
    close: closeWindow,
    minimize: minimizeWindow,
    toggle: toggleWindow,
    center: centerAndMark,
    focus: focusWindow,
    sync: sync,
    remove: removeWindow,
    refresh: function (id) {
      const cfg = configs.get(id);
      if (cfg) paintWindow(cfg);
    },
    getEl: function (id) {
      return windows.get(id) || null;
    }
  };

  /* ---------- Подсказки хоткеев (стиль hyprland) ---------- */

  let hintsEl = null;

  function buildHotkeyHints() {
    if (hintsEl) {
      hintsEl.remove();
      hintsEl = null;
    }
    if (isKiosk()) return;

    const list = (DATA.windows || []).slice(0, 9);
    if (!list.length) return;

    const bar = document.createElement("div");
    bar.className = "hotkey-hints";
    bar.id = "hotkey-hints";

    list.forEach(function (cfg, index) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hotkey-hint";
      btn.title = "открыть: " + (cfg.label || cfg.id);

      const key = document.createElement("kbd");
      key.textContent = "alt+" + (index + 1);
      btn.appendChild(key);
      btn.appendChild(document.createTextNode(" " + (cfg.label || cfg.id)));

      btn.addEventListener("click", function () {
        if (state[cfg.id] && windows.get(cfg.id).classList.contains("is-focused")) closeWindow(cfg.id);
        else if (state[cfg.id]) focusWindow(cfg.id);
        else openWindow(cfg.id);
      });

      bar.appendChild(btn);
    });

    [["q", "закрыть"], ["m", "свернуть"], ["f", "развернуть"]].forEach(function (action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hotkey-hint";
      btn.title = "окно: " + action[1];

      const key = document.createElement("kbd");
      key.textContent = "alt+" + action[0];
      btn.appendChild(key);
      btn.appendChild(document.createTextNode(" " + action[1]));

      btn.addEventListener("click", function () {
        if (!lastFocused || !state[lastFocused]) return;
        if (action[0] === "q") closeWindow(lastFocused);
        else if (action[0] === "m") minimizeWindow(lastFocused);
        else toggleMaximize(lastFocused);
      });

      bar.appendChild(btn);
    });

    document.body.appendChild(bar);
    hintsEl = bar;
  }

  function onHotkey(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (isKiosk() || isMobile()) return;
    if ((settingsState.style || "desktop") !== "hypr") return;

    const target = e.target;
    if (target && target.closest && target.closest("input, textarea, select, [contenteditable='true']")) return;

    const key = String(e.key || "").toLowerCase();

    if (key === "q" || key === "m" || key === "f") {
      if (!lastFocused || !state[lastFocused]) return;
      e.preventDefault();
      if (key === "q") closeWindow(lastFocused);
      else if (key === "m") minimizeWindow(lastFocused);
      else toggleMaximize(lastFocused);
      return;
    }

    const number = parseInt(key, 10);
    if (!(number >= 1 && number <= 9)) return;

    const cfg = (DATA.windows || [])[number - 1];
    if (!cfg) return;

    e.preventDefault();

    const win = windows.get(cfg.id);
    if (state[cfg.id] && win && win.classList.contains("is-focused")) closeWindow(cfg.id);
    else if (state[cfg.id]) focusWindow(cfg.id);
    else openWindow(cfg.id);
  }

  /* ---------- Запуск ---------- */

  function init() {
    if (DATA.meta && DATA.meta.title) {
      document.title = DATA.meta.title;
    }

    settingsState = loadSettings();
    themeColor();
    applySettings();
    applyTheme();
    buildClock();

    if (darkQuery && darkQuery.addEventListener) {
      darkQuery.addEventListener("change", function () {
        if ((settingsState.theme || "light") === "auto") applyTheme();
      });
    }

    if (isKiosk()) {
      const pinned = pinnedConfig();
      if (pinned) {
        configs.set(pinned.id, pinned);
        buildWindow(pinned);
        openWindow(pinned.id);
      }
    } else {
      DATA.windows.forEach(function (cfg) {
        configs.set(cfg.id, cfg);
        buildWindow(cfg);
      });

      buildDock();

      const savedOpen = loadOpenState();

      DATA.windows.forEach(function (cfg) {
        const shouldOpen = savedOpen ? savedOpen.indexOf(cfg.id) >= 0 : cfg.open;
        if (shouldOpen) openWindow(cfg.id);
      });
    }

    buildHotkeyHints();
    document.addEventListener("keydown", onHotkey);
    window.addEventListener("resize", onResize);
    window.addEventListener("resize", layoutHypr);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
