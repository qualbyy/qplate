/* ============================================================
   shell.js — менеджер окон и дока (qualbyy)
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
  const accentIdKey = "desktop-accent-id-v1";
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
  let restoredOpen = null;
  let lastFocused = null;
  let dragState = null;
  let settingsState = {};
  let settingsDefaults = {};
  let themeDefault = "";
  const themeState = { accent: "", color: "" };

  const isMobile = () => window.innerWidth <= 768;
  const motionOff = () => document.body.classList.contains("no-motion");

  /* ---------- Звуки интерфейса (Web Audio API) ---------- */
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!settingsState.sounds) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const style = settingsState.style || "desktop";

      if (type === "open") {
        if (style === "win98") {
          osc.type = "square";
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(880, now + 0.04);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.start(now);
          osc.stop(now + 0.12);
        } else if (style === "glass" || style === "aero") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5
          gain.gain.setValueAtTime(0.09, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
        } else {
          osc.type = "triangle";
          osc.frequency.setValueAtTime(320, now);
          osc.frequency.exponentialRampToValueAtTime(540, now + 0.06);
          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.start(now);
          osc.stop(now + 0.09);
        }
      } else if (type === "close") {
        if (style === "win98") {
          osc.type = "square";
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.setValueAtTime(300, now + 0.04);
          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
        } else {
          osc.type = "sine";
          osc.frequency.setValueAtTime(620, now);
          osc.frequency.exponentialRampToValueAtTime(260, now + 0.08);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.start(now);
          osc.stop(now + 0.12);
        }
      } else if (type === "click") {
        osc.type = style === "win98" ? "square" : "sine";
        osc.frequency.setValueAtTime(style === "win98" ? 800 : 700, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        osc.start(now);
        osc.stop(now + 0.035);
      }
    } catch (e) {
      /* Web Audio может быть заблокирован политикой браузера до первого клика */
    }
  }

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
    if (settingsState.dock === false) return ins;
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
    const val = value || (theme && theme.accent);

    const preset = (theme.presets || []).filter(function (item) {
      return item.id === val;
    })[0];

    if (preset) {
      themeState.accent = preset.id;
      themeState.color = preset.color;
      return preset.color;
    }

    if (/^#[0-9a-f]{6}$/i.test(String(val || ""))) {
      themeState.accent = "";
      themeState.color = val;
      return val;
    }

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
      /* Для чисто белого/ахроматического пресета подмешиваем нейтральный песочно-серый тон,
         чтобы в светлой теме не схлопывались границы и фоны окон */
      const isWhite = rgb.r >= 245 && rgb.g >= 245 && rgb.b >= 245;
      const baseRgb = isWhite ? { r: 110, g: 104, b: 96 } : rgb;

      root.setProperty("--bg", isWhite ? "#f3f3f0" : tint(rgb, 0.93));
      root.setProperty("--term-bg", isWhite ? "#fcfcfb" : tint(rgb, 0.965));
      root.setProperty("--header-bg", isWhite ? "#eaeae6" : tint(rgb, 0.87));
      root.setProperty("--border", isWhite ? "#d8d8d2" : tint(rgb, 0.78));
      root.setProperty("--border-dark", isWhite ? "#bebeb6" : tint(rgb, 0.66));
      root.setProperty("--text", "#141210");
      root.setProperty("--text-dim", "#3b352d");
      root.setProperty("--ink", "#141210");
      root.setProperty("--sand-dark", isWhite ? "#2e2b27" : shade(rgb, 0.2));
      root.setProperty("--sand-badge", isWhite ? "#e6e6e0" : tint(rgb, 0.88));
      root.setProperty("--prompt-user", isWhite ? "#4f6b62" : tint(rgb, 0.38));
      root.setProperty("--prompt-path", isWhite ? "#6e6e67" : tint(rgb, 0.55));
      root.setProperty("--dock-bg", isWhite ? "rgba(235, 235, 230, 0.88)" : tintAlpha(rgb, 0.87, 0.88));
      root.setProperty("--dock-hover-bg", isWhite ? "#ffffff" : tint(rgb, 0.985));
      root.setProperty("--surface-soft", isWhite ? "#f6f6f3" : tint(rgb, 0.96));
      root.setProperty("--surface-inset", isWhite ? "#fbfbfa" : tint(rgb, 0.975));
      root.setProperty("--surface-deep", isWhite ? "#eeeee9" : tint(rgb, 0.94));
      root.setProperty("--surface-mute", isWhite ? "#e3e3dc" : tint(rgb, 0.9));
      root.setProperty("--surface-paper", isWhite ? "#ffffff" : tint(rgb, 0.985));
      root.setProperty("--hover-strong", isWhite ? "#ddddd6" : tint(rgb, 0.865));
    }

    document.body.classList.toggle("theme-dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute("content", dark ? "dark" : "light");

    saveThemeState();
  }

  /* Цвет и id выбранного пресета храним отдельно: по id палитра
     понимает, какой кружок подсветить, а по цвету восстанавливает
     сам оттенок после перезагрузки. */
  function saveThemeState() {
    try {
      localStorage.setItem(themeKey, themeState.color);
      localStorage.setItem(accentIdKey, themeState.accent);
    } catch (err) {
      /* ничего */
    }
  }

  /* Возвращает выбранный пользователем цвет после перезагрузки.
     Раньше значение по умолчанию из data.js («white») всегда
     перебивало сохранённый цвет. */
  function restoreTheme() {
    const theme = DATA.theme || {};
    const presets = theme.presets || [];
    let color = "";
    let id = null;
    try {
      color = localStorage.getItem(themeKey) || "";
      id = localStorage.getItem(accentIdKey);
    } catch (err) {
      color = "";
      id = null;
    }

    if (/^#[0-9a-f]{6}$/i.test(color)) {
      let preset = id ? presets.filter(function (item) { return item.id === id; })[0] : null;
      if (!preset) {
        preset = presets.filter(function (item) {
          return String(item.color || "").toLowerCase() === color.toLowerCase();
        })[0];
      }
      themeState.accent = preset ? preset.id : "";
      themeState.color = preset ? preset.color : color;
      return;
    }

    themeColor(theme.accent);
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
    if (!settingsState.positions) return;

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
    if (!settingsState.positions) return null;

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
    document.body.classList.toggle("no-glare", settingsState.glare === false);
    document.body.classList.toggle("no-dock", settingsState.dock === false);
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

    /* Стекло включает только после согласия: иначе стиль не меняется. */
    if (id === "style" && value === "glass" && !glassAccepted()) {
      confirmGlass(GLASS_TEXT).then(function (sure) {
        if (sure) {
          rememberGlass();
          applySetting("style", "glass");
        } else if (window.WindowManager && windows.has("settings")) {
          window.WindowManager.refresh("settings");
        }
      });
      return;
    }

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

    const wasOpen = restoredOpen ? restoredOpen.indexOf(cfg.id) >= 0 : cfg.open;

    if (!wasOpen) {
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

    win.addEventListener("pointermove", function (e) {
      if (document.body.dataset.style !== "glass" || document.body.classList.contains("no-glare")) return;
      const rect = win.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      win.style.setProperty("--glass-x", x + "px");
      win.style.setProperty("--glass-y", y + "px");
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
    Array.from(dockButtons.values()).forEach(function (btn) {
      btn.remove();
    });
    dockButtons.clear();

    const apps = [];
    let editorCfg = null;
    DATA.windows.forEach(function (cfg) {
      if (cfg.type === "editor") editorCfg = cfg;
      else apps.push(cfg);
    });

    apps.forEach(createDockButton);

    /* Конструктор всегда последний в доке: снизу в вертикальном,
       справа в горизонтальном. Разделитель существует только пока
       на сайте есть окно конструктора, поэтому в экспорте его нет. */
    if (editorCfg) {
      const sep = document.createElement("div");
      sep.className = "dock-separator";
      sep.id = "dock-editor-separator";
      sep.setAttribute("aria-hidden", "true");
      dock.appendChild(sep);
      createDockButton(editorCfg);
    }
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

  function sync(force) {
    const nextDefaults = {};

    (DATA.settings || []).forEach(function (s) {
      if (!s || !s.id || s.value === undefined) return;
      nextDefaults[s.id] = s.value;

      /* Пресет в конструкторе — явная команда: его значения важнее
         сохранённого пользовательского выбора. */
      if (force) {
        settingsState[s.id] = s.value;
        return;
      }

      if (settingsState[s.id] === undefined) {
        settingsState[s.id] = s.value;
        return;
      }

      /* Значение по умолчанию изменили в конструкторе. Если пользователь
         его не трогал — берём новое; если выбрал своё — не затираем. */
      if (settingsDefaults[s.id] !== undefined && s.value !== settingsDefaults[s.id] && settingsState[s.id] === settingsDefaults[s.id]) {
        settingsState[s.id] = s.value;
      }
    });

    settingsDefaults = nextDefaults;

    if (DATA.theme && DATA.theme.accent) {
      const nextDefault = DATA.theme.accent;
      const current = themeState.accent || themeState.color;
      const untouched = !themeState.color
        || current === themeDefault
        || (!themeState.accent && String(themeState.color).toLowerCase() === String(themeDefault).toLowerCase());
      if (force || untouched) themeColor(nextDefault);
      saveThemeState();
      themeDefault = nextDefault;
    }

    applySettings();
    applyTheme();
    saveSettings();

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
    });

    buildDock();

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
    if (isMobile() && !motionOff()) {
      win.classList.remove("is-opening");
      void win.offsetWidth;
      win.classList.add("is-opening");
      window.setTimeout(function () {
        win.classList.remove("is-opening");
      }, 350);
    }
    win.removeAttribute("aria-hidden");
    updateDock(id, true);

    if (!win.dataset.positioned) {
      if (!restorePosition(id)) positionNew(id);
      win.dataset.positioned = "1";
    }

    saveOpenState();
    focusWindow(id);
    layoutHypr();
    playSound("open");

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
    clearFocusFrom(id);
    saveOpenState();
    layoutHypr();

    const lifecycle = lifecycles.get(id);
    if (lifecycle && typeof lifecycle.onHide === "function") lifecycle.onHide();
  }

  function minimizeWindow(id) {
    if (isKiosk() && pinnedConfig().id === id) return;
    if (isMobile()) {
      closeWindow(id);
      return;
    }
    hideInstant(id);
  }

  function closeWindow(id) {
    if (isKiosk() && pinnedConfig().id === id) return;
    if (!state[id]) return;

    const win = windows.get(id);
    state[id] = false;
    updateDock(id, false);
    clearFocusFrom(id);
    saveOpenState();
    playSound("close");
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

  function findTopOpenWindow(excludeId) {
    let bestId = null;
    let bestZ = -1;
    DATA.windows.forEach(function (cfg) {
      if (cfg.id === excludeId || !state[cfg.id]) return;
      const win = windows.get(cfg.id);
      const z = win ? (parseInt(win.style.zIndex, 10) || 0) : 0;
      if (z >= bestZ) {
        bestZ = z;
        bestId = cfg.id;
      }
    });
    return bestId;
  }

  function clearFocusFrom(id) {
    const win = windows.get(id);
    if (win) win.classList.remove("is-focused");
    if (lastFocused === id) {
      lastFocused = null;
      const nextId = findTopOpenWindow(id);
      if (nextId) focusWindow(nextId);
    }
  }

  function activeWindowId() {
    if (lastFocused && state[lastFocused]) return lastFocused;
    const nextId = findTopOpenWindow(null);
    if (nextId) {
      focusWindow(nextId);
      return nextId;
    }
    return null;
  }

  function focusWindow(id) {
    const win = windows.get(id);
    if (!win) return;
    if (lastFocused === id && win.classList.contains("is-focused")) return;

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
    const win = windows.get(id);
    if (!win || isMobile() || win.classList.contains("is-kiosk")) return;

    if (!motionOff()) {
      win.classList.add("is-animating-max");
      window.setTimeout(function () {
        win.classList.remove("is-animating-max");
      }, 320);
    }

    if (win.classList.contains("is-maximized")) {
      win.classList.remove("is-maximized");

      if (hyprOn()) {
        layoutHypr();
      } else {
        const saved = maxSaved.get(id);
        if (saved) {
          win.style.left = saved.left;
          win.style.top = saved.top;
          win.style.width = saved.width;
          win.style.height = saved.height;
        }
      }

      win.querySelector(".btn-max").setAttribute("title", "развернуть");
      win.querySelector(".btn-max").setAttribute("aria-label", "развернуть");
      if (!hyprOn()) savePosition(id);
      return;
    }

    if (!hyprOn()) {
      maxSaved.set(id, {
        left: win.style.left,
        top: win.style.top,
        width: win.style.width,
        height: win.style.height
      });
      win.dataset.sized = "1";
    }

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

  /* Ставит окно в конкретное место. Нужен пресетам конструктора:
     у них фиксированная раскладка, а не каскад по центру. */
  function placeWindow(id, rect) {
    const win = windows.get(id);
    if (!win || !rect || isMobile()) return;

    win.classList.remove("is-maximized");

    if (rect.width) {
      win.style.width = Math.max(280, Math.round(rect.width)) + "px";
      win.dataset.sized = "1";
    }
    if (rect.height) {
      win.style.height = Math.max(180, Math.round(rect.height)) + "px";
      win.dataset.sized = "1";
    }

    const ins = dockInsets();
    const maxLeft = Math.max(ins.left, window.innerWidth - win.offsetWidth - ins.right);
    const maxTop = Math.max(ins.top, window.innerHeight - win.offsetHeight - ins.bottom);

    win.style.left = Math.min(Math.max(ins.left, Math.round(rect.left || ins.left)), maxLeft) + "px";
    win.style.top = Math.min(Math.max(ins.top, Math.round(rect.top || ins.top)), maxTop) + "px";
    win.dataset.positioned = "1";
    savePosition(id);
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

  /* ---------- Предупреждение о liquid glass ----------
     Стекло тяжёлое для видеокарты, поэтому включается только после
     согласия. Окно настройки и конструктор могут спросить первыми —
     их согласие фиксируется в localStorage. */

  const glassKey = "desktop-glass-warning-v1";
  const GLASS_TEXT = "стиль liquid glass — самый тяжёлый в конструкторе: размытие и преломление света считаются " +
    "на видеокарте при каждом движении. на слабых компьютерах рабочий стол может лагать. включить стекло?";

  function glassAccepted() {
    try {
      return localStorage.getItem(glassKey) === "yes";
    } catch (err) {
      return false;
    }
  }

  function rememberGlass() {
    try {
      localStorage.setItem(glassKey, "yes");
    } catch (err) {
      /* хранилище может быть недоступно */
    }
  }

  function confirmGlass(question, okLabel) {
    return new Promise(function (resolve) {
      const overlay = document.createElement("div");
      overlay.className = "glass-dialog";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      const card = document.createElement("div");
      card.className = "glass-dialog-card";

      const title = document.createElement("div");
      title.className = "glass-dialog-title";
      title.textContent = "внимание: liquid glass";
      card.appendChild(title);

      const text = document.createElement("div");
      text.className = "glass-dialog-text";
      text.textContent = question;
      card.appendChild(text);

      const row = document.createElement("div");
      row.className = "glass-dialog-actions";

      const cancel = document.createElement("button");
      cancel.className = "glass-dialog-btn";
      cancel.type = "button";
      cancel.textContent = "оставить прежний стиль";

      const ok = document.createElement("button");
      ok.className = "glass-dialog-btn is-main";
      ok.type = "button";
      ok.textContent = okLabel || "включить стекло";

      let done = false;
      function finish(result) {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", onKey, true);
        overlay.remove();
        resolve(result);
      }

      function onKey(ev) {
        if (ev.key === "Escape") {
          ev.preventDefault();
          finish(false);
        }
      }

      cancel.addEventListener("click", function () { finish(false); });
      ok.addEventListener("click", function () { finish(true); });
      overlay.addEventListener("mousedown", function (ev) {
        if (ev.target === overlay) finish(false);
      });
      document.addEventListener("keydown", onKey, true);

      row.appendChild(cancel);
      row.appendChild(ok);
      card.appendChild(row);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      ok.focus();
    });
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

  /* qualbyy runtime signature */
  window.__qualbyy = "qualbyy.github.io";
  window.WindowManager = {
    /* Конструктор отмечает этим согласие на тяжёлое стекло. */
    allowGlass: rememberGlass,
    open: openWindow,
    close: closeWindow,
    minimize: minimizeWindow,
    toggle: toggleWindow,
    center: centerAndMark,
    place: placeWindow,
    focus: focusWindow,
    sync: sync,
    applySetting: applySetting,
    applyTheme: applyTheme,
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
        const targetId = activeWindowId();
        if (!targetId) return;
        if (action[0] === "q") closeWindow(targetId);
        else if (action[0] === "m") minimizeWindow(targetId);
        else toggleMaximize(targetId);
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

    const code = String(e.code || "");
    const key = String(e.key || "").toLowerCase();
    let action = "";
    if (code === "KeyQ" || key === "q") action = "q";
    else if (code === "KeyM" || key === "m") action = "m";
    else if (code === "KeyF" || key === "f") action = "f";

    if (action) {
      const targetId = activeWindowId();
      if (!targetId) return;
      e.preventDefault();
      if (action === "q") closeWindow(targetId);
      else if (action === "m") minimizeWindow(targetId);
      else toggleMaximize(targetId);
      return;
    }

    let number = parseInt(key, 10);
    if (!(number >= 1 && number <= 9)) {
      const digitMatch = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (digitMatch) number = parseInt(digitMatch[1], 10);
    }
    if (!(number >= 1 && number <= 9)) return;

    const cfg = (DATA.windows || [])[number - 1];
    if (!cfg) return;

    e.preventDefault();

    const win = windows.get(cfg.id);
    if (state[cfg.id] && win && win.classList.contains("is-focused")) closeWindow(cfg.id);
    else if (state[cfg.id]) focusWindow(cfg.id);
    else openWindow(cfg.id);
  }

  /* ---------- SVG-фильтр Liquid Glass ---------- */

  function ensureLiquidGlassFilter() {
    if (document.getElementById("liquid-glass-filter")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = [
      '<svg id="liquid-glass-svg" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden;pointer-events:none;" aria-hidden="true">',
      '  <defs>',
      '    <filter id="liquid-glass-filter" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">',
      '      <feImage result="dispMap" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none"',
      '        href="data:image/svg+xml,%3Csvg%20xmlns%3D\'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg\'%20viewBox%3D\'0%200%20100%20100\'%20preserveAspectRatio%3D\'none\'%3E%3Cdefs%3E%3ClinearGradient%20id%3D\'gx\'%20x1%3D\'0%25\'%20y1%3D\'0%25\'%20x2%3D\'100%25\'%20y2%3D\'0%25\'%3E%3Cstop%20offset%3D\'0%25\'%20stop-color%3D\'%23000\'%2F%3E%3Cstop%20offset%3D\'100%25\'%20stop-color%3D\'%23f00\'%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D\'gy\'%20x1%3D\'0%25\'%20y1%3D\'0%25\'%20x2%3D\'0%25\'%20y2%3D\'100%25\'%3E%3Cstop%20offset%3D\'0%25\'%20stop-color%3D\'%23000\'%2F%3E%3Cstop%20offset%3D\'100%25\'%20stop-color%3D\'%230f0\'%2F%3E%3C%2FlinearGradient%3E%3Cfilter%20id%3D\'b\'%3E%3CfeGaussianBlur%20stdDeviation%3D\'7\'%2F%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%3Crect%20width%3D\'100\'%20height%3D\'100\'%20rx%3D\'8\'%20fill%3D\'url(%23gx)\'%20style%3D\'mix-blend-mode%3Ascreen\'%2F%3E%3Crect%20width%3D\'100\'%20height%3D\'100\'%20rx%3D\'8\'%20fill%3D\'url(%23gy)\'%20style%3D\'mix-blend-mode%3Ascreen\'%2F%3E%3Crect%20width%3D\'100\'%20height%3D\'100\'%20rx%3D\'8\'%20fill%3D\'%23808080\'%20filter%3D\'url(%23b)\'%2F%3E%3C%2Fsvg%3E"',
      '      />',
      '      <feDisplacementMap in="SourceGraphic" in2="dispMap" scale="-28" xChannelSelector="R" yChannelSelector="G"/>',
      '    </filter>',
      '  </defs>',
      '</svg>'
    ].join("");
    if (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
  }

  /* ---------- Запуск ---------- */

  function init() {
    if (DATA.meta && DATA.meta.title) {
      document.title = DATA.meta.title;
    }

    ensureLiquidGlassFilter();
    settingsState = loadSettings();
    settingsDefaults = {};
    (DATA.settings || []).forEach(function (item) {
      if (item && item.id && item.value !== undefined) settingsDefaults[item.id] = item.value;
    });
    themeDefault = (DATA.theme && DATA.theme.accent) || "";
    restoreTheme();
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
      restoredOpen = loadOpenState();

      DATA.windows.forEach(function (cfg) {
        configs.set(cfg.id, cfg);
        buildWindow(cfg);
      });

      buildDock();

      DATA.windows.forEach(function (cfg) {
        if (restoredOpen && restoredOpen.indexOf(cfg.id) >= 0) openWindow(cfg.id);
      });

      if (!restoredOpen) {
        DATA.windows.forEach(function (cfg) {
          if (cfg.open) openWindow(cfg.id);
        });
      }
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
