/* ============================================================
   editor.js — конструктор сайта прямо в окне
   Черновик хранится в localStorage, применяется кнопкой.
   ============================================================ */

(function () {
  "use strict";

  const DATA = window.DATA || {};
  const STORE = "desktop-project-v1";
  const registry = window.APP_RENDERERS || (window.APP_RENDERERS = {});

  let draft = null;
  let bodyRef = null;
  let panelRef = null;
  let folderHandle = null;
  let statusTimer = null;
  let saveTimer = null;
  /* Пока плашка пресета на экране, обычные статусы её не затирают. */
  let noticeActive = false;
  /* Предупреждение о liquid glass спрашиваем один раз за сессию. */
  let glassWarned = false;
  let glassNotice = null;
  /* Вернуть прежний стиль, если пользователь отказался от стекла. */
  let revertGlass = null;

  /* ---------- Мелкие помощники ---------- */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* Снимок исходных данных для полного сброса. */
  const ORIGINAL = clone(DATA);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function queueSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 350);
  }

  function saveDraft() {
    try {
      localStorage.setItem(STORE, JSON.stringify(draft));
    } catch (err) {
      setStatus("не удалось сохранить черновик в браузере", "err");
    }
  }

  function setStatus(text, kind) {
    if (!bodyRef) return;
    const node = bodyRef.querySelector(".ed-status");
    if (!node) return;
    if (noticeActive && kind !== "err") return;
    if (noticeActive) noticeActive = false;

    node.textContent = text;
    node.className = "ed-status show " + (kind || "");
    node.style.display = "";
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(function () {
      node.className = "ed-status";
      node.textContent = "";
    }, 5000);
  }

  function showPresetNotice(presetName) {
    if (!bodyRef) return;
    const node = bodyRef.querySelector(".ed-status");
    if (!node) return;

    node.innerHTML = "";
    node.className = "ed-status show ok";
    noticeActive = true;
    node.style.display = "flex";
    node.style.alignItems = "center";
    node.style.justifyContent = "space-between";
    node.style.gap = "10px";

    const textSpan = el("span", null, "применён пресет «" + presetName + "»! ");
    const rightBox = el("div", "ed-row");
    rightBox.style.display = "flex";
    rightBox.style.alignItems = "center";
    rightBox.style.gap = "6px";

    const reloadBtn = el("button", "ed-btn ed-btn-main", "перезагрузить сайт");
    reloadBtn.type = "button";
    reloadBtn.style.padding = "2px 8px";
    reloadBtn.style.fontSize = "11px";
    reloadBtn.addEventListener("click", function () {
      window.location.reload();
    });

    const closeBtn = el("button", "ed-mini", "×");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", function () {
      noticeActive = false;
      window.clearTimeout(statusTimer);
      node.className = "ed-status";
      node.textContent = "";
      node.style.display = "";
    });

    rightBox.appendChild(reloadBtn);
    rightBox.appendChild(closeBtn);
    node.appendChild(textSpan);
    node.appendChild(rightBox);

    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(function () {
      noticeActive = false;
      node.className = "ed-status";
      node.textContent = "";
      node.style.display = "";
    }, 15000);
  }

  /* Своё окно подтверждения вместо window.confirm: браузерные диалоги
     блокируются, и кнопки молча ничего не делают. */
  function edConfirm(message, opts) {
    const options = opts || {};
    return new Promise(function (resolve) {
      const overlay = el("div", "ed-dialog");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      const card = el("div", "ed-dialog-card");
      card.appendChild(el("div", "ed-dialog-title", options.title || "подтверждение"));
      card.appendChild(el("div", "ed-dialog-text", message));

      const row = el("div", "ed-dialog-actions");
      const cancel = el("button", "ed-btn", options.cancel || "отмена");
      cancel.type = "button";

      const ok = el("button", "ed-btn " + (options.danger === false ? "ed-btn-main" : "ed-btn-danger"), options.ok || "подтвердить");
      ok.type = "button";

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
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          finish(true);
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
      window.requestAnimationFrame(function () { overlay.classList.add("is-on"); });
      ok.focus();
    });
  }

  /* ---------- Данные черновика ---------- */

  function contentEntry(item, htmlByDefault) {
    const source = item || {};
    let mode = source.mode;

    if (mode !== "text" && mode !== "html") {
      mode = htmlByDefault && source.html && !source.body ? "html" : "text";
    }

    return {
      title: source.title || "",
      mode: mode,
      text: source.text !== undefined ? source.text : (source.body || ""),
      html: source.html || "",
      links: Array.isArray(source.links) ? source.links.map(function (link) {
        return { label: (link && link.label) || "", url: (link && link.url) || "" };
      }) : []
    };
  }

  function draftFromData(source) {
    const s = source || {};
    const pdf = s.pdf || {};
    const browser = s.browser || {};
    const terminal = s.terminal || {};

    return {
      meta: {
        title: (s.meta && s.meta.title) || "мой рабочий стол",
        user: (s.meta && s.meta.user) || "you",
        name: (s.meta && s.meta.name) || "",
        footer: (s.meta && s.meta.footer) || "",
        preview: {
          title: (s.meta && s.meta.preview && s.meta.preview.title) || "",
          description: (s.meta && s.meta.preview && s.meta.preview.description) || "",
          image: (s.meta && s.meta.preview && s.meta.preview.image) || "assets/preview.png",
          url: (s.meta && s.meta.preview && s.meta.preview.url) || "https://qualbyy.github.io/qplate/"
        }
      },
      notes: (Array.isArray(s.notes) ? s.notes : []).map(function (note) {
        const entry = contentEntry(note, false);
        entry.date = note.date || "";
        return entry;
      }),
      pdf: {
        title: pdf.title || "документ",
        pages: (Array.isArray(pdf.pages) ? pdf.pages : []).map(function (page) {
          return contentEntry(page, true);
        })
      },
      browser: {
        tabs: (Array.isArray(browser.tabs) ? browser.tabs : []).map(function (tab, index) {
          const entry = contentEntry(tab, true);
          entry.id = tab.id || "tab" + (index + 1);
          entry.url = tab.url || "";
          entry.heading = tab.heading || "";
          return entry;
        })
      },
      terminal: {
        paths: clone(terminal.paths || {}),
        fastfetch: {
          ascii: terminal.ascii || "",
          fetchTitle: terminal.fetchTitle || "",
          rows: clone(Array.isArray(terminal.rows) ? terminal.rows : [])
        }
      },
      windows: clone(Array.isArray(s.windows) ? s.windows : []),
      settings: clone(Array.isArray(s.settings) ? s.settings : []),
      theme: clone(s.theme || {}),
      photos: clone(Array.isArray(s.photos) ? s.photos : []),
      files: clone((s.files && s.files.root) ? s.files : {
        root: { name: "~", type: "folder", children: [] }
      }),
      music: {
        cover: (s.music && s.music.cover) || "",
        coverMode: (s.music && s.music.coverMode) || "photo",
        note: (s.music && s.music.note) || "",
        album: (s.music && s.music.album) || "",
        tracks: clone((s.music && Array.isArray(s.music.tracks)) ? s.music.tracks : [])
      }
    };
  }

  function normalizeDraft(value) {
    const d = value || {};

    if (!d.meta) d.meta = { title: "мой рабочий стол", user: "you", name: "", footer: "" };
    if (!d.meta.preview) d.meta.preview = clone((DATA.meta && DATA.meta.preview) || {
      title: "", description: "", image: "assets/preview.png", url: ""
    });
    if (!Array.isArray(d.notes)) d.notes = [];
    if (!d.pdf) d.pdf = { title: "документ", pages: [] };
    if (!Array.isArray(d.pdf.pages)) d.pdf.pages = [];
    if (!d.browser) d.browser = { tabs: [] };
    if (!Array.isArray(d.browser.tabs)) d.browser.tabs = [];
    if (!d.terminal) d.terminal = { paths: {} };
    if (!d.terminal.paths) d.terminal.paths = {};
    if (!d.terminal.fastfetch) {
      const source = DATA.terminal || {};
      d.terminal.fastfetch = {
        ascii: source.ascii || "",
        fetchTitle: source.fetchTitle || "",
        rows: clone(Array.isArray(source.rows) ? source.rows : [])
      };
    }
    if (!Array.isArray(d.terminal.fastfetch.rows)) d.terminal.fastfetch.rows = [];
    if (!Array.isArray(d.windows)) d.windows = clone(DATA.windows || []);
    if (!Array.isArray(d.settings)) d.settings = clone(DATA.settings || []);
    (DATA.settings || []).forEach(function (item) {
      if (!d.settings.some(function (s) { return s && s.id === item.id; })) d.settings.push(clone(item));
    });
    if (!d.theme) d.theme = clone(DATA.theme || {});
    if (!Array.isArray(d.theme.presets)) d.theme.presets = clone((DATA.theme && DATA.theme.presets) || []);
    if (!Array.isArray(d.theme.locked)) d.theme.locked = [];
    if (!Array.isArray(d.photos)) d.photos = clone(DATA.photos || []);
    if (!d.files || !d.files.root) {
      d.files = clone(DATA.files || {});
      if (!d.files.root) d.files.root = { name: "~", type: "folder", children: [] };
    }
    if (!Array.isArray(d.files.root.children)) d.files.root.children = [];
    if (!d.music) d.music = clone(DATA.music || {});
    if (!Array.isArray(d.music.tracks)) d.music.tracks = [];

    return d;
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return draftFromData(DATA);
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.windows) || !parsed.terminal) {
        return normalizeDraft(draftFromData(DATA));
      }
      return normalizeDraft(parsed);
    } catch (err) {
      return normalizeDraft(draftFromData(DATA));
    }
  }

  function commit() {
    DATA.meta = Object.assign({}, DATA.meta, draft.meta);
    DATA.notes = clone(draft.notes);
    DATA.pdf = Object.assign({}, DATA.pdf, {
      title: draft.pdf.title,
      pages: clone(draft.pdf.pages)
    });
    DATA.browser = Object.assign({}, DATA.browser, { tabs: clone(draft.browser.tabs) });
    DATA.terminal = Object.assign({}, DATA.terminal, {
      paths: clone(draft.terminal.paths),
      ascii: draft.terminal.fastfetch.ascii,
      fetchTitle: draft.terminal.fastfetch.fetchTitle,
      rows: clone(draft.terminal.fastfetch.rows)
    });
    DATA.windows = clone(draft.windows);
    draft.windows.forEach(function (win) {
      if (win.iconSvg && win.iconKey) DATA.icons[win.iconKey] = win.iconSvg;
    });
    DATA.photos = clone(draft.photos);
    DATA.files = clone(draft.files);
    DATA.music = clone(draft.music);
    DATA.settings = clone(draft.settings);
    DATA.theme = Object.assign({}, DATA.theme, draft.theme);
  }

  function applyDraft() {
    if (glassSelected() && !isGlassLive() && !glassWarned) {
      const previous = currentStyleValue();
      /* «Сохранить сайт» сперва зовёт commit(): отказ возвращает прежний стиль. */
      revertGlass = function () {
        const list = (draft.settings || []).concat((DATA.settings || []).filter(function (live) {
          return live && live.id === "style";
        }));
        const seen = [];
        list.forEach(function (item) {
          if (!item || item.id !== "style" || seen.indexOf(item) >= 0) return;
          seen.push(item);
          item.value = previous;
        });
        saveDraft();
      };
      showGlassWarning();
      return Promise.resolve(false);
    }

    commit();
    saveDraft();
    if (window.WindowManager && WindowManager.sync) WindowManager.sync();
    setStatus("применено: сайт обновился", "ok");
    return Promise.resolve(true);
  }

  /* Возвращает набор открытых окон к значениям data.js (open: true). */
  function restoreDefaultLayout() {
    if (!window.WindowManager) return;
    DATA.windows.forEach(function (w) {
      if (!w || w.type === "editor") return;
      if (w.open === true) {
        if (window.WindowManager.open) window.WindowManager.open(w.id);
      } else if (window.WindowManager.close) {
        window.WindowManager.close(w.id);
      }
    });
  }

  async function resetAll() {
    const sure = await edConfirm("сбросить все изменения? сайт вернётся к исходным данным, черновик будет удалён.", {
      title: "сбросить всё",
      ok: "сбросить"
    });
    if (!sure) return;

    try {
      localStorage.removeItem(STORE);
      localStorage.removeItem("desktop-settings-v1");
      localStorage.removeItem("desktop-accent-v1");
      localStorage.removeItem("desktop-theme-accent-v1");
      localStorage.removeItem("desktop-wallpaper-v1");
      localStorage.removeItem("desktop-window-positions-v1");
      localStorage.removeItem("desktop-window-state-v1");
      localStorage.removeItem("desktop-clock-pos-v1");
    } catch (err) {
      /* хранилище может быть недоступно */
    }

    draft = normalizeDraft(draftFromData(ORIGINAL));
    commit();
    if (window.WindowManager && WindowManager.sync) WindowManager.sync();
    restoreDefaultLayout();
    window.location.reload();
  }

  /* ---------- Предупреждение о liquid glass ----------
     Стекло считается на видеокарте (feDisplacementMap), поэтому на слабых
     машинах может лагать. Перед переключением показываем объяснение. */

  const GLASS_TEXT = "стиль liquid glass — самый тяжёлый в конструкторе: " +
    "размытие и преломление света пересчитываются на видеокарте при каждом движении. " +
    "на ноутбуках и слабых компьютерах рабочий стол может лагать. " +
    "если станет тяжело, верните стиль «по умолчанию» или «aero».";

  /* Стекло уже включено на рабочем столе — второй раз не предупреждаем. */
  function isGlassLive() {
    return document.body.dataset.style === "glass";
  }

  function glassSelected() {
    return (draft.settings || []).some(function (item) {
      return item && item.id === "style" && item.value === "glass";
    });
  }

  function showGlassWarning() {
    if (!glassNotice) return;
    glassNotice.classList.add("is-on");
    glassNotice.setAttribute("aria-hidden", "false");
    const ok = glassNotice.querySelector(".ed-glass-notice-yes");
    if (ok) ok.focus();
  }

  /* Закрытие без согласия: стекло не включаем, стиль возвращается прежний. */
  function dismissGlassWarning() {
    if (glassNotice) {
      glassNotice.classList.remove("is-on");
      glassNotice.setAttribute("aria-hidden", "true");
    }
    const undo = revertGlass;
    revertGlass = null;
    if (typeof undo === "function") undo();
    renderSettingsTab();
  }

  function acceptGlass() {
    glassWarned = true;
    revertGlass = null;
    /* Запоминаем согласие и для окна настроек: второй раз не спрашиваем. */
    if (window.WindowManager && window.WindowManager.allowGlass) window.WindowManager.allowGlass();
    if (glassNotice) {
      glassNotice.classList.remove("is-on");
      glassNotice.setAttribute("aria-hidden", "true");
    }
    renderSettingsTab();
    setStatus("стиль liquid glass выбран: нажмите «применить»", "ok");
  }

  /* Стиль, который сейчас показан на рабочем столе (или сохранён). */
  function currentStyleValue() {
    const live = document.body.dataset.style;
    if (live && live !== "glass") return live;
    if (window.WindowManager && window.WindowManager.getSettings) {
      const shown = window.WindowManager.getSettings().style;
      if (shown && shown !== "glass") return shown;
    }
    const saved = (draft.settings || []).filter(function (item) {
      return item && item.id === "style";
    })[0];
    return (saved && saved.value) || "desktop";
  }

  /* Перерисовываем только вкладку настроек, не трогая остальные. */
  function renderSettingsTab() {
    if (activeTab === "settings") renderPanel();
  }

  function buildGlassNotice() {
    if (glassNotice) return glassNotice;

    const overlay = el("div", "ed-dialog ed-glass-notice");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-labelledby", "ed-glass-notice-title");

    const card = el("div", "ed-dialog-card");

    const head = el("div", "ed-card-head");
    const title = el("div", "ed-dialog-title", "внимание: liquid glass");
    title.id = "ed-glass-notice-title";
    head.appendChild(title);
    const close = el("button", "ed-mini", "закрыть");
    close.type = "button";
    close.addEventListener("click", dismissGlassWarning);
    head.appendChild(close);
    card.appendChild(head);

    card.appendChild(el("div", "ed-dialog-text ed-glass-notice-text", GLASS_TEXT));

    const actions = el("div", "ed-dialog-actions ed-glass-notice-actions");
    const cancel = el("button", "ed-btn", "оставить прежний стиль");
    cancel.type = "button";
    cancel.addEventListener("click", dismissGlassWarning);

    const ok = el("button", "ed-btn ed-btn-main ed-glass-notice-yes", "включить стекло");
    ok.type = "button";
    ok.addEventListener("click", acceptGlass);

    actions.appendChild(cancel);
    actions.appendChild(ok);
    card.appendChild(actions);

    overlay.addEventListener("mousedown", function (ev) {
      if (ev.target === overlay) dismissGlassWarning();
    });

    overlay.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        dismissGlassWarning();
      }
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    glassNotice = overlay;
    return overlay;
  }

  /* ---------- Поля формы ---------- */

  function shrinkImage(file, dataUrl, done) {
    if (file.size < 350 * 1024) {
      done(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = function () {
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        done(canvas.toDataURL("image/jpeg", 0.85));
      } catch (err) {
        done(dataUrl);
      }
    };
    img.onerror = function () {
      done(dataUrl);
    };
    img.src = dataUrl;
  }

  /* ---------- Окно загрузки файла ---------- */

  let loadNode = null;
  let loadCloseTimer = null;

  function closeLoader() {
    window.clearTimeout(loadCloseTimer);
    const node = loadNode;
    loadNode = null;
    if (!node) return;

    node.classList.add("is-out");
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 220);
  }

  function showLoader(fileName) {
    closeLoader();

    const wrap = el("div", "ed-load");
    const card = el("div", "ed-load-card");
    const ring = el("div", "ed-load-ring");
    const title = el("div", "ed-load-title", "загрузка файла");
    const name = el("div", "ed-load-file", fileName || "");
    const bar = el("div", "ed-load-bar");
    const fill = el("span", "ed-load-fill");
    const row = el("div", "ed-load-row");
    const note = el("span", "ed-load-note", "читаем данные");
    const pct = el("span", "ed-load-pct", "0%");

    if (fileName) name.title = fileName;

    bar.appendChild(fill);
    row.appendChild(note);
    row.appendChild(pct);
    card.appendChild(ring);
    card.appendChild(title);
    card.appendChild(name);
    card.appendChild(bar);
    card.appendChild(row);
    wrap.appendChild(card);
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");

    document.body.appendChild(wrap);
    window.requestAnimationFrame(function () {
      wrap.classList.add("is-on");
    });

    const started = Date.now();
    loadNode = wrap;

    return {
      set: function (percent, text) {
        const safe = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        fill.style.width = safe + "%";
        pct.textContent = safe + "%";
        if (text) note.textContent = text;
      },
      done: function (text) {
        this.set(100, text || "готово");
        window.clearTimeout(loadCloseTimer);
        loadCloseTimer = window.setTimeout(closeLoader, Math.max(0, 750 - (Date.now() - started)));
      },
      fail: function (text) {
        note.textContent = text || "не удалось прочитать файл";
        pct.textContent = "—";
        window.clearTimeout(loadCloseTimer);
        loadCloseTimer = window.setTimeout(closeLoader, 1100);
      }
    };
  }

  function pickButton(accept, onResult) {
    const btn = el("button", "ed-btn ed-btn-main", "из файла");
    btn.type = "button";
    btn.style.flex = "none";

    btn.addEventListener("click", function () {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;

      input.addEventListener("change", function () {
        const file = input.files && input.files[0];
        if (!file) return;

        const isImage = accept.indexOf("image") === 0;
        const isAudio = accept.indexOf("audio") === 0;
        const isBinary = isImage || isAudio || accept.indexOf("pdf") >= 0 || accept.indexOf("application/octet-stream") >= 0;
        const load = showLoader(file.name);
        const reader = new FileReader();

        if (file.size > 2 * 1024 * 1024 && !isImage) {
          setStatus("файл больше 2 МБ — может не сохраниться в черновике", "err");
        }

        reader.onprogress = function (e) {
          if (e && e.lengthComputable && e.total) {
            load.set((e.loaded / e.total) * 100, "читаем данные");
          }
        };

        reader.onload = function () {
          const result = String(reader.result || "");

          if (!isImage) {
            onResult(result, file);
            queueSave();
            renderPanel();
            load.done("файл загружен");
            return;
          }

          shrinkImage(file, result, function (value) {
            onResult(value, file);
            queueSave();
            renderPanel();
            load.done("файл загружен");
          });
        };

        reader.onerror = function () {
          setStatus("не удалось прочитать файл", "err");
          load.fail("не удалось прочитать файл");
        };

        if (isBinary) reader.readAsDataURL(file);
        else reader.readAsText(file);
      });

      input.click();
    });

    return btn;
  }

  function field(labelText, value, onChange, opts) {
    const options = opts || {};
    const wrap = el("div", "ed-field");
    wrap.appendChild(el("span", "ed-label", labelText));

    let input;
    if (options.multiline) {
      input = el("textarea", "ed-textarea" + (options.code ? " ed-code" : ""));
      input.value = value || "";
      if (options.rows) input.rows = options.rows;
    } else {
      input = el("input", "ed-input");
      input.type = "text";
      input.value = value || "";
      if (options.placeholder) input.placeholder = options.placeholder;
    }

    input.addEventListener("input", function () {
      onChange(input.value);
      queueSave();
    });

    if (options.pick) {
      const row = el("div", "ed-row");
      row.appendChild(input);
      row.appendChild(pickButton(options.pick.accept, options.pick.apply));
      wrap.appendChild(row);
    } else {
      wrap.appendChild(input);
    }

    if (options.hint) wrap.appendChild(el("div", "ed-hint", options.hint));
    return wrap;
  }

  function selectField(labelText, value, options, onChange) {
    const wrap = el("div", "ed-field");
    wrap.appendChild(el("span", "ed-label", labelText));

    const select = el("select", "ed-select");
    options.forEach(function (pair) {
      const option = el("option", null, pair[1]);
      option.value = pair[0];
      if (pair[0] === value) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener("change", function () {
      onChange(select.value);
      queueSave();
    });

    wrap.appendChild(select);
    return wrap;
  }

  function modeControl(item) {
    const wrap = el("div", "ed-seg");
    [["text", "текст"], ["html", "html"]].forEach(function (pair) {
      const btn = el("button", item.mode === pair[0] ? "active" : "", pair[1]);
      btn.type = "button";
      btn.addEventListener("click", function () {
        item.mode = pair[0];
        queueSave();
        renderPanel();
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function contentEditor(item) {
    const wrap = el("div", "ed-card");
    wrap.style.background = "transparent";
    wrap.style.border = "0";
    wrap.style.padding = "0";
    wrap.style.gap = "8px";

    const top = el("div", "ed-row");
    top.appendChild(modeControl(item));
    top.appendChild(el("span", "ed-hint", item.mode === "html" ? "можно вставлять свой html-код" : "обычный текст, абзацы через пустую строку"));
    wrap.appendChild(top);

    const isHtml = item.mode === "html";
    let showPreview = false;

    const editorBox = el("div", "ed-field");

    const labelRow = el("div", "ed-row");
    labelRow.style.justifyContent = "space-between";
    labelRow.style.alignItems = "center";
    labelRow.style.marginBottom = "6px";

    const label = el("span", "ed-label", isHtml ? "html-код" : "текст");
    labelRow.appendChild(label);

    const labelActions = el("div", "ed-row");
    labelActions.style.display = "flex";
    labelActions.style.alignItems = "center";
    labelActions.style.gap = "6px";

    if (isHtml) {
      const pick = pickButton(".html,.htm,text/html", function (val) {
        item.html = val;
        textarea.value = val;
        queueSave();
      });
      pick.className = "ed-fmt-btn";
      pick.style.height = "auto";
      pick.style.padding = "3px 8px";
      labelActions.appendChild(pick);
    }

    const previewBtn = el("button", "ed-fmt-btn", "предпросмотр");
    previewBtn.type = "button";
    labelActions.appendChild(previewBtn);
    labelRow.appendChild(labelActions);
    editorBox.appendChild(labelRow);

    let fmtBar = null;
    const textarea = el("textarea", "ed-textarea" + (isHtml ? " ed-code" : ""));
    textarea.value = (isHtml ? item.html : item.text) || "";
    textarea.rows = 9;

    const previewArea = el("div", "ed-preview-box");
    previewArea.style.display = "none";

    function updatePreview() {
      if (!isHtml) {
        previewArea.innerHTML = "";
        const val = String(item.text || "").trim();
        if (!val) {
          previewArea.innerHTML = '<span style="color:var(--text-dim);font-style:italic;">текст пуст</span>';
        } else {
          val.split(/\n{2,}/).forEach(function (part) {
            const p = el("p", "content-text", part.trim());
            p.style.margin = "0 0 8px 0";
            previewArea.appendChild(p);
          });
        }
      } else {
        previewArea.innerHTML = item.html || '<span style="color:var(--text-dim);font-style:italic;">код пуст</span>';
      }
    }

    function wrapSelection(before, after) {
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const val = textarea.value;
      const selected = val.substring(start, end) || "текст";
      const replacement = before + selected + after;
      textarea.value = val.substring(0, start) + replacement + val.substring(end);
      textarea.focus();
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selected.length;
      if (isHtml) item.html = textarea.value;
      else item.text = textarea.value;
      queueSave();
    }

    if (isHtml) {
      fmtBar = el("div", "ed-fmt-bar");
      const tools = [
        ["Ж", "<b>", "</b>", "жирный"],
        ["К", "<i>", "</i>", "курсив"],
        ["Код", "<code>", "</code>", "код"],
        ["Ссылка", '<a href="https://">', "</a>", "ссылка"],
        ["Цитата", "<blockquote>", "</blockquote>", "цитата"],
        ["Список", "<ul>\n  <li>", "</li>\n</ul>", "список"],
        ["Заголовок", "<h3>", "</h3>", "подзаголовок"]
      ];

      tools.forEach(function (t) {
        const btn = el("button", "ed-fmt-btn", t[0]);
        btn.type = "button";
        btn.title = t[3];
        btn.addEventListener("click", function () {
          wrapSelection(t[1], t[2]);
        });
        fmtBar.appendChild(btn);
      });
      editorBox.appendChild(fmtBar);
    }

    previewBtn.addEventListener("click", function () {
      showPreview = !showPreview;
      previewBtn.classList.toggle("active", showPreview);
      previewBtn.textContent = showPreview ? "редактор" : "предпросмотр";
      textarea.style.display = showPreview ? "none" : "";
      if (fmtBar) fmtBar.style.display = showPreview ? "none" : "flex";
      previewArea.style.display = showPreview ? "block" : "none";
      if (showPreview) updatePreview();
    });

    textarea.addEventListener("input", function () {
      if (isHtml) item.html = textarea.value;
      else item.text = textarea.value;
      queueSave();
    });

    editorBox.appendChild(textarea);
    editorBox.appendChild(previewArea);
    wrap.appendChild(editorBox);

    return wrap;
  }

  function linksEditor(item) {
    const wrap = el("div", "ed-field");
    wrap.appendChild(el("span", "ed-label", "ссылки (работают в режиме текста)"));

    if (!Array.isArray(item.links)) item.links = [];

    const list = el("div", "ed-list");

    item.links.forEach(function (link, index) {
      const row = el("div", "ed-link-row");

      const label = el("input", "ed-input");
      label.type = "text";
      label.placeholder = "подпись";
      label.value = link.label || "";
      label.addEventListener("input", function () {
        link.label = label.value;
        queueSave();
      });

      const url = el("input", "ed-input");
      url.type = "text";
      url.placeholder = "https://...";
      url.value = link.url || "";
      url.addEventListener("input", function () {
        link.url = url.value;
        queueSave();
      });

      const del = el("button", "ed-mini", "×");
      del.type = "button";
      del.title = "удалить ссылку";
      del.addEventListener("click", function () {
        item.links.splice(index, 1);
        queueSave();
        renderPanel();
      });

      row.appendChild(label);
      row.appendChild(url);
      row.appendChild(del);
      list.appendChild(row);
    });

    wrap.appendChild(list);

    const add = el("button", "ed-add", "+ ссылка");
    add.type = "button";
    add.addEventListener("click", function () {
      item.links.push({ label: "", url: "" });
      queueSave();
      renderPanel();
    });
    wrap.appendChild(add);

    return wrap;
  }

  /* ---------- Кнопки перемещения ---------- */

  function orderButtons(items, index, renderFn) {
    const wrap = el("div", "ed-row");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "4px";

    const up = el("button", "ed-btn", "▲");
    up.type = "button";
    up.title = "переместить выше";
    up.disabled = index === 0;
    up.addEventListener("click", function () {
      if (index > 0) {
        const temp = items[index];
        items[index] = items[index - 1];
        items[index - 1] = temp;
        queueSave();
        (renderFn || renderPanel)();
      }
    });
    wrap.appendChild(up);

    const down = el("button", "ed-btn", "▼");
    down.type = "button";
    down.title = "переместить ниже";
    down.disabled = index >= items.length - 1;
    down.addEventListener("click", function () {
      if (index < items.length - 1) {
        const temp = items[index];
        items[index] = items[index + 1];
        items[index + 1] = temp;
        queueSave();
        (renderFn || renderPanel)();
      }
    });
    wrap.appendChild(down);

    return wrap;
  }

  /* ---------- Карточка записи ---------- */

  function entryCard(item, kind, onDelete, items, index) {
    const card = el("div", "ed-card");

    const head = el("div", "ed-card-head");
    head.appendChild(el("span", "ed-card-title", kind === "note" ? "заметка" : kind === "page" ? "страница документа" : "вкладка браузера"));

    if (items && typeof index === "number") {
      head.appendChild(orderButtons(items, index));
    }

    const del = el("button", "ed-btn ed-btn-danger", "удалить");
    del.type = "button";
    del.addEventListener("click", function () {
      onDelete();
      queueSave();
      renderPanel();
    });
    head.appendChild(del);
    card.appendChild(head);

    card.appendChild(field("заголовок", item.title, function (value) {
      item.title = value;
    }));

    if (kind === "note") {
      card.appendChild(field("дата", item.date, function (value) {
        item.date = value;
      }));
    }

    if (kind === "tab") {
      card.appendChild(field("адрес в строке", item.url, function (value) {
        item.url = value;
      }));
      card.appendChild(field("подзаголовок (необязательно)", item.heading, function (value) {
        item.heading = value;
      }));
    }

    card.appendChild(contentEditor(item));
    card.appendChild(linksEditor(item));

    return card;
  }

  /* ---------- Вкладки ---------- */

  function collectionTab(items, kind, addLabel, makeItem) {
    const box = el("div", "ed-card");
    box.style.background = "transparent";
    box.style.border = "0";
    box.style.padding = "0";

    if (!items.length) box.appendChild(el("div", "ed-empty", "пока пусто — добавь первую запись"));

    items.forEach(function (item, index) {
      box.appendChild(entryCard(item, kind, function () {
        items.splice(index, 1);
      }, items, index));
    });

    const add = el("button", "ed-add", addLabel);
    add.type = "button";
    add.addEventListener("click", function () {
      items.push(makeItem());
      queueSave();
      renderPanel();
    });
    box.appendChild(add);

    return box;
  }

  function projectTab() {
    const box = el("div", "ed-card");
    box.appendChild(el("div", "ed-card-title", "о сайте"));

    box.appendChild(presetsBlock());

    box.appendChild(field("название сайта", draft.meta.title, function (value) {
      draft.meta.title = value;
    }, { hint: "показывается во вкладке браузера" }));

    box.appendChild(field("имя пользователя", draft.meta.user, function (value) {
      draft.meta.user = value;
    }, { hint: "используется в приглашении терминала" }));

    box.appendChild(field("имя", draft.meta.name, function (value) {
      draft.meta.name = value;
    }));

    box.appendChild(field("подпись внизу", draft.meta.footer, function (value) {
      draft.meta.footer = value;
    }, { multiline: true, rows: 2 }));

    box.appendChild(previewBlock());

    const hint = el("div", "ed-hint", "изменения видны сразу после кнопки «применить». черновик сохраняется сам.");
    box.appendChild(hint);

    const reset = el("button", "ed-btn ed-btn-danger", "сбросить всё");
    reset.type = "button";
    reset.title = "вернуть исходные данные сайта и удалить черновик";
    reset.addEventListener("click", resetAll);
    box.appendChild(reset);

    return box;
  }

  /* Блок готовых шаблонов (пресетов) сайта */
  function presetsBlock() {
    const box = el("div", "ed-card");
    box.appendChild(el("div", "ed-card-title", "готовые пресеты сайта"));
    box.appendChild(el("div", "ed-hint", "полностью преобразит тему, стиль, обои и порядок окон сайта в один клик:"));

    const row = el("div", "ed-restore-list");
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "8px";
    row.style.marginTop = "8px";

    function setSettingVal(key, val) {
      const item = (draft.settings || []).find(function (s) { return s.id === key; });
      if (item) item.value = val;
    }

    function ensureWindow(id) {
      if (!draft.windows.some(function (w) { return w.id === id; })) {
        const orig = (ORIGINAL.windows || []).find(function (w) { return w.id === id; });
        if (orig) draft.windows.push(clone(orig));
      }
    }

    const presets = [
      {
        id: "dev",
        title: "портфолио разработчика",
        desc: "стиль hyprland, тёмная тема, обои-сетка, терминал, проекты и стек технологий",
        apply: function () {
          draft.meta.title = "портфолио • developer";
          draft.meta.name = "алексей • software engineer";
          draft.meta.footer = "typescript • node.js • go • linux • web architecture";
          setSettingVal("style", "hypr");
          setSettingVal("theme", "dark");
          setSettingVal("wallpaper", "grid");
          setSettingVal("hints", true);
          draft.theme.accent = "#50fa7b";

          ["term", "files", "browser", "notes", "settings"].forEach(ensureWindow);
          draft.windows.forEach(function (w) { w.pinned = false; });
          const order = ["term", "files", "browser", "notes", "settings", "editor"];
          draft.windows.sort(function (a, b) {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            if (ia >= 0 && ib >= 0) return ia - ib;
            if (ia >= 0) return -1;
            if (ib >= 0) return 1;
            return 0;
          });

          draft.notes = [
            contentEntry({
              title: "стек и технологии",
              mode: "html",
              html: "<p><b>языки:</b> typescript, javascript, go, python, sql</p><p><b>технологии:</b> react, node.js, docker, postgresql, tailwind</p><blockquote>фокусируюсь на быстродействии, чистой архитектуре и zero-dependency решениях.</blockquote>",
              links: []
            }, false),
            contentEntry({
              title: "принципы разработки",
              mode: "html",
              html: "<p>• понятный и тестируемый код превыше оверинжиниринга<br>• local-first и приватность пользовательских данных<br>• надежные ci/cd пайплайны и автоматизация</p>",
              links: []
            }, false)
          ];
          draft.notes[0].date = today();
          draft.notes[1].date = today();

          draft.browser.tabs = [
            (function () {
              const tab = contentEntry({
                title: "проекты",
                mode: "html",
                html: "<h3>1. qplate desktop</h3><p>легковесный рабочий стол в браузере без сборщиков и сторонних библиотек.</p><p><a href=\"#\">github</a> · <a href=\"#\">демо</a></p><hr style=\"border:0;border-top:1px solid var(--border);margin:12px 0;\"><h3>2. micro-api engine</h3><p>микросервисный шлюз на go с минимальным временем отклика.</p><p><a href=\"#\">документация</a></p>",
                links: []
              }, true);
              tab.id = "projects-tab";
              tab.url = "https://github.com/developer";
              tab.heading = "избранные open source работы";
              return tab;
            })()
          ];

          applyDraft();
          if (window.WindowManager) {
            if (window.WindowManager.close) {
              DATA.windows.forEach(function (w) {
                if (w.id !== "editor" && w.id !== "term" && w.id !== "browser") {
                  window.WindowManager.close(w.id);
                }
              });
            }
            if (window.WindowManager.open) {
              window.WindowManager.open("term");
              window.WindowManager.open("browser");
              window.WindowManager.focus("term");
            }
          }
        }
      },
      {
        id: "writer",
        title: "блог и заметки",
        desc: "классический десктоп, текстура бумаги, эссе и статьи",
        apply: function () {
          draft.meta.title = "блог и эссе • записки";
          draft.meta.name = "анна • автор и редактор";
          draft.meta.footer = "мысли о книгах, дизайне и тихой жизни в сети";
          setSettingVal("style", "desktop");
          setSettingVal("theme", "light");
          setSettingVal("wallpaper", "paper");
          draft.theme.accent = "#a07844";

          ["pdf", "notes", "browser", "photos", "settings"].forEach(ensureWindow);
          draft.windows.forEach(function (w) { w.pinned = false; });
          const order = ["pdf", "notes", "browser", "photos", "settings", "editor"];
          draft.windows.sort(function (a, b) {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            if (ia >= 0 && ib >= 0) return ia - ib;
            if (ia >= 0) return -1;
            if (ib >= 0) return 1;
            return 0;
          });

          draft.pdf.title = "сборник эссе";
          draft.pdf.pages = [
            contentEntry({
              title: "манифест простоты",
              mode: "html",
              html: "<h3>о цифровом шуме</h3><p>современный интернет перегружен баннерами и сложными интерфейсами. но настоящее удовольствие от текста возвращается там, где остаётся только суть: буква, поля и воздух.</p><blockquote>простота — это не нехватка чего-то, а отсутствие лишнего.</blockquote><p>когда мы убираем лишнее, остаётся пространство для глубокого чтения и ясных мыслей.</p>",
              links: []
            }, true),
            contentEntry({
              title: "книжная полка",
              mode: "html",
              html: "<h3>что я читаю сейчас</h3><p>список книг, которые повлияли на моё видение дизайна и типографики:</p><ul><li>«облик книги» — ян чихольд</li><li>«дизайн привычных вещей» — дон норман</li><li>«тихий свет» — сборник очерков</li></ul>",
              links: []
            }, true)
          ];

          draft.notes = [
            contentEntry({
              title: "наблюдения за неделю",
              mode: "text",
              text: "заметила, как сильно меняется восприятие дня, если утро начинается без бесконечной ленты соцсетей.\n\nза чашкой кофе приходят самые ценные идеи для новых глав.",
              links: []
            }, false)
          ];
          draft.notes[0].date = today();

          applyDraft();
          if (window.WindowManager) {
            if (window.WindowManager.close) {
              DATA.windows.forEach(function (w) {
                if (w.id !== "editor" && w.id !== "pdf" && w.id !== "notes") {
                  window.WindowManager.close(w.id);
                }
              });
            }
            if (window.WindowManager.open) {
              window.WindowManager.open("pdf");
              window.WindowManager.open("notes");
              window.WindowManager.focus("pdf");
            }
          }
        }
      },
      {
        id: "music",
        title: "музыка и медиа",
        desc: "стиль liquid glass, неоновые волны, плеер, треки и фото",
        apply: function () {
          draft.meta.title = "soundwave studio • beats & ambient";
          draft.meta.name = "soundwave audio";
          draft.meta.footer = "lo-fi beats, ambient soundscapes & modular synth sessions";
          setSettingVal("style", "glass");
          setSettingVal("theme", "dark");
          setSettingVal("wallpaper", "waves");
          draft.theme.accent = "#bd93f9";

          ["music", "photos", "notes", "files", "settings"].forEach(ensureWindow);
          draft.windows.forEach(function (w) { w.pinned = false; });
          const order = ["music", "photos", "notes", "files", "settings", "editor"];
          draft.windows.sort(function (a, b) {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            if (ia >= 0 && ib >= 0) return ia - ib;
            if (ia >= 0) return -1;
            if (ib >= 0) return 1;
            return 0;
          });

          draft.music.album = "midnight session (ep)";
          draft.music.note = "слушайте на всех стриминговых платформах";
          draft.music.tracks = [
            { title: "01. midnight rain", artist: "soundwave", seconds: 194 },
            { title: "02. neon boulevard", artist: "soundwave", seconds: 218 },
            { title: "03. analog nostalgia", artist: "soundwave", seconds: 165 }
          ];

          draft.notes = [
            contentEntry({
              title: "стриминг и релизы",
              mode: "html",
              html: "<h3>слушать онлайн</h3><p>новый мини-альбом доступен на площадках:</p><ul><li><a href=\"#\">spotify</a></li><li><a href=\"#\">apple music</a></li><li><a href=\"#\">bandcamp</a></li><li><a href=\"#\">soundcloud</a></li></ul><blockquote>спасибо за прослушивание и поддержку независимой музыки!</blockquote>",
              links: []
            }, false)
          ];
          draft.notes[0].date = today();

          applyDraft();
          if (window.WindowManager) {
            if (window.WindowManager.close) {
              DATA.windows.forEach(function (w) {
                if (w.id !== "editor" && w.id !== "music" && w.id !== "photos") {
                  window.WindowManager.close(w.id);
                }
              });
            }
            if (window.WindowManager.open) {
              window.WindowManager.open("music");
              window.WindowManager.open("photos");
              window.WindowManager.focus("music");
            }
          }
        }
      },
      {
        id: "card",
        title: "одно главное окно (визитка)",
        desc: "минималистичная визитка по центру экрана без дока",
        apply: function () {
          draft.meta.title = "визитка • bio";
          draft.meta.name = "иван иванов";
          draft.meta.footer = "кратко обо мне, проекты и способы связи";
          setSettingVal("style", "desktop");
          setSettingVal("theme", "dark");
          setSettingVal("wallpaper", "dots");
          draft.theme.accent = "#ff79c6";

          ensureWindow("notes");
          draft.windows.forEach(function (w) {
            w.pinned = (w.id === "notes");
          });

          draft.notes = [
            contentEntry({
              title: "привет, я иван",
              mode: "html",
              html: "<h3>цифровой дизайнер и разработчик</h3><p>создаю минималистичные интерфейсы, типографику и аккуратные веб-сервисы.</p><blockquote>«хороший дизайн незаметен — он просто работает.»</blockquote><h3>связаться со мной</h3><ul><li>telegram: <a href=\"https://t.me/\">@username</a></li><li>github: <a href=\"https://github.com/\">github.com/username</a></li><li>почта: <a href=\"mailto:mail@example.com\">mail@example.com</a></li></ul>",
              links: []
            }, false)
          ];
          draft.notes[0].date = today();

          applyDraft();
          if (window.WindowManager) {
            if (window.WindowManager.close) {
              DATA.windows.forEach(function (w) {
                if (w.id !== "editor" && w.id !== "notes") {
                  window.WindowManager.close(w.id);
                }
              });
            }
            if (window.WindowManager.open) {
              window.WindowManager.open("notes");
              window.WindowManager.focus("notes");
            }
          }
        }
      },
      {
        id: "default",
        title: "по умолчанию",
        desc: "вернуть тему, стиль, обои, окна и содержимое к стандартным",
        apply: function () {
          draft = normalizeDraft(draftFromData(ORIGINAL));
          try {
            localStorage.removeItem("desktop-theme-accent-v1");
            localStorage.removeItem("desktop-wallpaper-v1");
            localStorage.removeItem("desktop-window-positions-v1");
            localStorage.removeItem("desktop-window-state-v1");
          } catch (err) {
            /* хранилище может быть недоступно */
          }
          applyDraft();
          restoreDefaultLayout();
        }
      }
    ];

    presets.forEach(function (p) {
      const btn = el("button", "ed-btn", p.title);
      btn.type = "button";
      btn.title = p.desc;
      btn.addEventListener("click", function () {
        noticeActive = true;
        let failed = null;
        try {
          p.apply();
        } catch (err) {
          failed = err;
          noticeActive = false;
        }
        saveDraft();
        renderPanel();
        if (failed) {
          setStatus("пресет «" + p.title + "» применился не полностью: " + failed.message, "err");
        } else {
          showPresetNotice(p.title);
        }
      });
      row.appendChild(btn);
    });

    box.appendChild(row);
    return box;
  }

  /* Блок «превью для ссылок»: заголовок, описание и картинка. */
  function previewBlock() {
    const box = el("div", "ed-card");
    box.appendChild(el("div", "ed-card-title", "превью для ссылок"));
    box.appendChild(el("div", "ed-hint", "заголовок, описание и картинка в мессенджерах и соцсетях"));

    box.appendChild(field("заголовок превью", draft.meta.preview.title, function (value) {
      draft.meta.preview.title = value;
    }, { placeholder: "если пусто — название сайта" }));

    box.appendChild(field("описание", draft.meta.preview.description, function (value) {
      draft.meta.preview.description = value;
    }, { multiline: true, rows: 2, hint: "одна-две строки, что это за сайт" }));

    box.appendChild(field("картинка (адрес)", draft.meta.preview.image, function (value) {
      draft.meta.preview.image = value;
    }, {
      pick: {
        accept: "image/*",
        apply: function (value) { draft.meta.preview.image = value; }
      },
      hint: "по умолчанию assets/preview.png, ширину делай около 1200 px. адрес сайта подставится сам"
    }));

    const image = document.createElement("img");
    image.className = "ed-preview-img";
    image.alt = "превью ссылки";
    image.src = draft.meta.preview.image || "assets/preview.png";
    image.addEventListener("error", function () {
      image.style.display = "none";
    });
    image.addEventListener("load", function () {
      image.style.display = "";
    });
    box.appendChild(image);

    return box;
  }

  function notesTab() {
    return collectionTab(draft.notes, "note", "+ заметка", function () {
      const note = contentEntry({ title: "новая заметка" }, false);
      note.date = today();
      return note;
    });
  }

  function pdfTab() {
    const box = el("div", "ed-card");
    box.appendChild(el("div", "ed-card-title", "документ"));
    box.appendChild(field("название файла", draft.pdf.title, function (value) {
      draft.pdf.title = value;
    }, { hint: "кнопка скачивания возьмёт это имя" }));

    const pages = collectionTab(draft.pdf.pages, "page", "+ страница", function () {
      return contentEntry({ title: "новая страница" }, false);
    });
    box.appendChild(pages);

    return box;
  }

  function browserTab() {
    return collectionTab(draft.browser.tabs, "tab", "+ вкладка", function () {
      return (function () {
        const entry = contentEntry({ title: "новая вкладка" }, false);
        entry.id = "tab" + (draft.browser.tabs.length + 1) + "-" + Date.now();
        entry.url = "https://";
        entry.heading = "";
        return entry;
      })();
    });
  }

  function fileKind(node) {
    if (node.kind) return node.kind;
    const ext = String(node.name || "").split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].indexOf(ext) >= 0) return "image";
    if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].indexOf(ext) >= 0) return "audio";
    if (ext === "pdf") return "pdf";
    if (["txt", "md", "js", "css", "html", "json", "csv", "log", "xml", "yml", "yaml", "ts", "jsx", "tsx"].indexOf(ext) >= 0) return "text";
    return "unknown";
  }

  function filesTab() {
    if (!draft.files || !draft.files.root) {
      draft.files = clone((DATA.files && DATA.files.root) ? DATA.files : {
        root: { name: "~", type: "folder", children: [] }
      });
    }
    if (!draft.files.root) draft.files.root = { name: "~", type: "folder", children: [] };
    if (!Array.isArray(draft.files.root.children)) draft.files.root.children = [];

    const wrap = el("div", "ed-tree");
    wrap.appendChild(el("div", "ed-hint", "папки и файлы окна «файлы». текст открывается как текст, картинки, аудио и pdf — во встроенном просмотрщике."));

    function addNode(parent, kind) {
      if (!Array.isArray(parent.children)) parent.children = [];

      if (kind === "folder") {
        parent.children.push({ name: "новая папка", type: "folder", children: [] });
      } else if (kind === "text") {
        parent.children.push({ name: "новый файл.txt", type: "file", kind: "text", content: "" });
      } else if (kind === "image") {
        parent.children.push({ name: "картинка.png", type: "file", kind: "image", src: "" });
      } else if (kind === "audio") {
        parent.children.push({ name: "аудио.mp3", type: "file", kind: "audio", src: "" });
      } else {
        parent.children.push({ name: "документ.pdf", type: "file", kind: "pdf", src: "" });
      }

      queueSave();
      renderPanel();
    }

    function importNode(parent) {
      const input = document.createElement("input");
      input.type = "file";

      input.addEventListener("change", function () {
        const file = input.files && input.files[0];
        if (!file) return;

        const kind = fileKind({ name: file.name });
        if (file.size > 2 * 1024 * 1024) setStatus("файл больше 2 МБ — может не сохраниться в черновике", "err");

        const reader = new FileReader();

        reader.onload = function () {
          const value = String(reader.result || "");
          const node = { name: file.name, type: "file", kind: kind };

          function commitNode(srcOrContent) {
            if (kind === "text") node.content = srcOrContent;
            else node.src = srcOrContent;

            if (!Array.isArray(parent.children)) parent.children = [];
            parent.children.push(node);
            queueSave();
            renderPanel();
            setStatus("файл «" + file.name + "» добавлен");
          }

          if (kind === "image") {
            shrinkImage(file, value, commitNode);
          } else {
            commitNode(value);
          }
        };

        reader.onerror = function () {
          setStatus("не удалось прочитать файл", "err");
        };

        if (kind === "text") reader.readAsText(file);
        else reader.readAsDataURL(file);
      });

      input.click();
    }

    function actionRow(parent) {
      const row = el("div", "ed-tree-actions");

      [["folder", "+ папка"], ["text", "+ текст"], ["image", "+ картинка"], ["audio", "+ аудио"], ["pdf", "+ pdf"]].forEach(function (pair) {
        const btn = el("button", "ed-btn", pair[1]);
        btn.type = "button";
        btn.addEventListener("click", function () {
          addNode(parent, pair[0]);
        });
        row.appendChild(btn);
      });

      const imp = el("button", "ed-btn", "импортировать свой");
      imp.type = "button";
      imp.addEventListener("click", function () {
        importNode(parent);
      });
      row.appendChild(imp);

      return row;
    }

    function nodeCard(node, parent) {
      const card = el("div", "ed-card ed-tree-node");

      const head = el("div", "ed-card-head");
      head.appendChild(el("span", "ed-card-title", node.type === "folder" ? "папка" : "файл"));

      const del = el("button", "ed-btn ed-btn-danger", "удалить");
      del.type = "button";
      del.addEventListener("click", async function () {
        if (node.type === "folder" && Array.isArray(node.children) && node.children.length) {
          const sure = await edConfirm("удалить папку «" + (node.name || "без имени") + "» вместе с содержимым?", {
            title: "удалить папку",
            ok: "удалить"
          });
          if (!sure) return;
        }

        const index = Array.isArray(parent.children) ? parent.children.indexOf(node) : -1;
        if (index >= 0) parent.children.splice(index, 1);

        queueSave();
        renderPanel();
      });
      head.appendChild(del);
      card.appendChild(head);

      card.appendChild(field("название", node.name || "", function (value) {
        node.name = value;
      }));

      if (node.type === "folder") {
        if (!Array.isArray(node.children)) node.children = [];

        const children = el("div", "ed-tree-children");
        node.children.forEach(function (child) {
          children.appendChild(nodeCard(child, node));
        });

        if (!node.children.length) {
          children.appendChild(el("div", "ed-empty", "папка пустая"));
        }

        card.appendChild(children);
        card.appendChild(actionRow(node));
      } else {
        const kind = fileKind(node);
        node.kind = kind;

        if (kind === "text" || kind === "unknown") {
          card.appendChild(field("содержимое", node.content || "", function (value) {
            node.content = value;
          }, { multiline: true, rows: 6, code: true }));
        }

        if (kind === "image" || kind === "audio" || kind === "pdf") {
          const accept = kind === "image" ? "image/*" : kind === "audio" ? "audio/*" : ".pdf,application/pdf";
          card.appendChild(field("адрес файла", node.src || "", function (value) {
            node.src = value;
          }, {
            hint: "путь из assets или выбранный файл. большой файл может не поместиться в черновик.",
            pick: {
              accept: accept,
              apply: function (value) {
                node.src = value;
              }
            }
          }));
        } else if (kind === "unknown") {
          card.appendChild(field("адрес файла", node.src || "", function (value) {
            node.src = value;
          }, { hint: "неизвестный формат: в окне файлов появится сообщение и кнопка «скачать»." }));
        }
      }

      return card;
    }

    const rootCard = el("div", "ed-card");
    const rootHead = el("div", "ed-card-head");
    rootHead.appendChild(el("span", "ed-card-title", "корень · " + (draft.files.root.name || "~")));
    rootCard.appendChild(rootHead);

    const rootChildren = el("div", "ed-tree-children ed-tree-root");
    draft.files.root.children.forEach(function (child) {
      rootChildren.appendChild(nodeCard(child, draft.files.root));
    });

    if (!draft.files.root.children.length) {
      rootChildren.appendChild(el("div", "ed-empty", "файлов пока нет"));
    }

    rootCard.appendChild(rootChildren);
    rootCard.appendChild(actionRow(draft.files.root));
    wrap.appendChild(rootCard);

    return wrap;
  }

  function photosTab() {
    const wrap = el("div", "ed-card");
    wrap.appendChild(el("div", "ed-card-title", "фотографии"));
    wrap.appendChild(el("div", "ed-hint", "картинки положи в папку assets рядом с сайтом и пиши адрес так: assets/имя.svg"));

    if (!draft.photos.length) wrap.appendChild(el("div", "ed-empty", "фотографий нет"));

    draft.photos.forEach(function (photo, index) {
      const card = el("div", "ed-card");

      const head = el("div", "ed-card-head");
      head.appendChild(el("span", "ed-card-title", "фото " + (index + 1)));
      head.appendChild(orderButtons(draft.photos, index));
      const del = el("button", "ed-btn ed-btn-danger", "удалить");
      del.type = "button";
      del.addEventListener("click", function () {
        draft.photos.splice(index, 1);
        queueSave();
        renderPanel();
      });
      head.appendChild(del);
      card.appendChild(head);

      card.appendChild(field("адрес картинки", photo.src, function (value) {
        photo.src = value;
      }, {
        hint: "можно любую ссылку, файл в assets или выбрать с устройства",
        pick: {
          accept: "image/*",
          apply: function (value) {
            photo.src = value;
          }
        }
      }));

      card.appendChild(field("название", photo.title, function (value) {
        photo.title = value;
      }));

      card.appendChild(field("подпись", photo.note, function (value) {
        photo.note = value;
      }));

      wrap.appendChild(card);
    });

    const add = el("button", "ed-add", "+ фото");
    add.type = "button";
    add.addEventListener("click", function () {
      draft.photos.push({ src: "assets/", title: "новое фото", note: "" });
      queueSave();
      renderPanel();
    });
    wrap.appendChild(add);

    return wrap;
  }

  function musicTab() {
    const wrap = el("div", "ed-card");
    wrap.appendChild(el("div", "ed-card-title", "музыка"));

    wrap.appendChild(field("название альбома", draft.music.album, function (value) {
      draft.music.album = value;
    }));

    wrap.appendChild(selectField("обложка", draft.music.coverMode || "photo", [
      ["photo", "как на фото"],
      ["accent", "ключевым цветом"]
    ], function (value) {
      draft.music.coverMode = value;
    }));

    wrap.appendChild(field("картинка обложки", draft.music.cover, function (value) {
      draft.music.cover = value;
    }, {
      hint: "адрес картинки, файл в assets или выбрать с устройства",
      pick: {
        accept: "image/*",
        apply: function (value) {
          draft.music.cover = value;
        }
      }
    }));

    wrap.appendChild(field("подпись внизу", draft.music.note, function (value) {
      draft.music.note = value;
    }, {
      hint: "строка под плеером"
    }));

    draft.music.tracks.forEach(function (track, index) {
      const card = el("div", "ed-card");

      const head = el("div", "ed-card-head");
      head.appendChild(el("span", "ed-card-title", "трек " + (index + 1)));
      head.appendChild(orderButtons(draft.music.tracks, index));
      const del = el("button", "ed-btn ed-btn-danger", "удалить");
      del.type = "button";
      del.addEventListener("click", function () {
        draft.music.tracks.splice(index, 1);
        queueSave();
        renderPanel();
      });
      head.appendChild(del);
      card.appendChild(head);

      card.appendChild(field("название", track.title, function (value) {
        track.title = value;
      }));

      card.appendChild(field("исполнитель", track.artist, function (value) {
        track.artist = value;
      }));

      card.appendChild(field("длительность, секунд", String(track.seconds || 0), function (value) {
        track.seconds = Math.max(1, parseInt(value, 10) || 1);
      }));

      const embedded = (track.src || "").indexOf("data:") === 0;

      card.appendChild(field("файл трека", embedded ? "" : (track.src || ""), function (value) {
        track.src = value;
        if (!value) delete track.srcName;
      }, {
        placeholder: embedded ? "файл выбран: " + (track.srcName || "встроенный файл") : "адрес mp3",
        hint: "адрес mp3 или выбрать файл с устройства; файл встраивается в сайт",
        pick: {
          accept: "audio/*",
          apply: function (value, file) {
            track.src = value;
            if (file) track.srcName = file.name;
          }
        }
      }));

      wrap.appendChild(card);
    });

    const add = el("button", "ed-add", "+ трек");
    add.type = "button";
    add.addEventListener("click", function () {
      draft.music.tracks.push({ title: "новый трек", artist: draft.meta.user || "you", seconds: 180 });
      queueSave();
      renderPanel();
    });
    wrap.appendChild(add);

    return wrap;
  }

  function commandCard(id, command) {
    const card = el("div", "ed-card");

    const head = el("div", "ed-card-head");
    head.appendChild(el("span", "ed-card-title", "команда: " + id));
    const del = el("button", "ed-btn ed-btn-danger", "удалить");
    del.type = "button";
    del.addEventListener("click", function () {
      delete draft.terminal.paths[id];
      queueSave();
      renderPanel();
    });
    head.appendChild(del);
    card.appendChild(head);

    if (command.id === undefined) command.id = id;

    card.appendChild(field("подпись на кнопке", command.label || id, function (value) {
      command.label = value;
    }));

    card.appendChild(field("описание для help", command.desc || "", function (value) {
      command.desc = value;
    }, { hint: "показывается в списке команд" }));

    const action = command.action || (command.code ? "code" : command.url ? "link" : command.target ? "open" : "text");

    card.appendChild(selectField("что делает", action, [
      ["text", "показывает текст"],
      ["open", "открывает окно"],
      ["link", "открывает ссылку"],
      ["code", "свой javascript-код"]
    ], function (value) {
      command.action = value;
      renderPanel();
    }));

    if (action === "open") {
      const options = draft.windows.filter(function (win) {
        return win.id !== "editor";
      }).map(function (win) {
        return [win.id, win.label || win.title || win.id];
      });
      card.appendChild(selectField("какое окно открыть", command.target || (options[0] && options[0][0]) || "", options, function (value) {
        command.target = value;
      }));
      if (!command.target && options[0]) command.target = options[0][0];
    } else if (action === "link") {
      card.appendChild(field("адрес ссылки", command.url || "https://", function (value) {
        command.url = value;
      }));
    } else if (action === "code") {
      card.appendChild(field("твой код", command.code || "", function (value) {
        command.code = value;
      }, {
        multiline: true,
        code: true,
        rows: 10,
        hint: "доступно: print(значение), open(\"id окна\"), close(\"id окна\"), link(\"адрес\"), data — все данные сайта."
      }));
    } else {
      card.appendChild(contentEditor(command));
      card.appendChild(linksEditor(command));
    }

    return card;
  }

  function fastfetchCard() {
    const ff = draft.terminal.fastfetch;
    const card = el("div", "ed-card");
    card.appendChild(el("div", "ed-card-title", "fastfetch в терминале"));
    card.appendChild(el("div", "ed-hint", "картинка слева, строки справа. видно по команде fastfetch и all."));

    card.appendChild(field("заголовок", ff.fetchTitle, function (value) {
      ff.fetchTitle = value;
    }));

    card.appendChild(field("картинка (ascii)", ff.ascii, function (value) {
      ff.ascii = value;
    }, {
      multiline: true,
      rows: 6,
      code: true,
      hint: "пробелы сохраняются. можно загрузить txt-файл.",
      pick: { accept: ".txt,text/plain", apply: function (value) { ff.ascii = value; } }
    }));

    const rowsWrap = el("div", "ed-field");
    rowsWrap.appendChild(el("span", "ed-label", "строки"));
    const list = el("div", "ed-list");

    ff.rows.forEach(function (row, index) {
      const line = el("div", "ed-link-row");

      const key = el("input", "ed-input");
      key.type = "text";
      key.placeholder = "ключ";
      key.value = row[0] || "";
      key.addEventListener("input", function () {
        row[0] = key.value;
        queueSave();
      });

      const val = el("input", "ed-input");
      val.type = "text";
      val.placeholder = "значение";
      val.value = row[1] || "";
      val.addEventListener("input", function () {
        row[1] = val.value;
        queueSave();
      });

      const del = el("button", "ed-mini", "×");
      del.type = "button";
      del.title = "удалить строку";
      del.addEventListener("click", function () {
        ff.rows.splice(index, 1);
        queueSave();
        renderPanel();
      });

      line.appendChild(key);
      line.appendChild(val);
      line.appendChild(del);
      list.appendChild(line);
    });

    rowsWrap.appendChild(list);

    const add = el("button", "ed-add", "+ строка");
    add.type = "button";
    add.addEventListener("click", function () {
      ff.rows.push(["ключ", "значение"]);
      queueSave();
      renderPanel();
    });
    rowsWrap.appendChild(add);
    card.appendChild(rowsWrap);

    return card;
  }

  function terminalTab() {
    const wrap = el("div", "ed-card");
    wrap.style.background = "transparent";
    wrap.style.border = "0";
    wrap.style.padding = "0";

    wrap.appendChild(el("div", "ed-hint", "каждая команда — кнопка в терминале и строка в help. «свой javascript-код» даёт полноценную мини-функцию."));
    wrap.appendChild(fastfetchCard());

    const paths = draft.terminal.paths || (draft.terminal.paths = {});
    const ids = Object.keys(paths);

    if (!ids.length) wrap.appendChild(el("div", "ed-empty", "команд нет"));

    ids.forEach(function (id) {
      wrap.appendChild(commandCard(id, paths[id]));
    });

    const add = el("button", "ed-add", "+ команда");
    add.type = "button";
    add.addEventListener("click", function () {
      const base = "cmd";
      let index = 1;
      while (paths[base + index]) index += 1;
      paths[base + index] = { label: "новая команда", action: "text", text: "" };
      queueSave();
      renderPanel();
    });
    wrap.appendChild(add);

    return wrap;
  }

  function appsTab() {
    const wrap = el("div", "ed-apps");
    const head = el("div", "ed-card");
    head.appendChild(el("div", "ed-card-title", "приложения на рабочем столе"));
    head.appendChild(el("div", "ed-hint", "каждое приложение — отдельная карточка: порядок в доке, название, размер, иконка и содержимое."));
    wrap.appendChild(head);

    draft.windows.forEach(function (win, index) {
      const appCard = el("div", "ed-card ed-app-card");
      const row = el("div", "ed-app-row" + (win.type === "editor" ? " is-fixed" : ""));

      const icon = el("div", "ed-app-icon");
      icon.innerHTML = (DATA.icons || {})[win.iconKey] || "";
      row.appendChild(icon);

      const info = el("div", "ed-app-info");
      info.appendChild(el("div", "ed-app-name", win.label || win.id));
      info.appendChild(el("div", "ed-app-type", "тип: " + (win.type || "неизвестно")));
      row.appendChild(info);

      if (win.type !== "editor") {
        const actions = el("div", "ed-row");
        actions.style.marginLeft = "auto";
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "4px";

        const up = el("button", "ed-btn", "▲");
        up.type = "button";
        up.title = "переместить левее в доке";
        up.disabled = index === 0;
        up.addEventListener("click", function () {
          if (index > 0) {
            const temp = draft.windows[index];
            draft.windows[index] = draft.windows[index - 1];
            draft.windows[index - 1] = temp;
            queueSave();
            renderPanel();
          }
        });
        actions.appendChild(up);

        const down = el("button", "ed-btn", "▼");
        down.type = "button";
        down.title = "переместить правее в доке";
        const nextIsEditor = index < draft.windows.length - 1 && draft.windows[index + 1].type === "editor";
        down.disabled = index >= draft.windows.length - 1 || nextIsEditor;
        down.addEventListener("click", function () {
          if (index < draft.windows.length - 1 && !nextIsEditor) {
            const temp = draft.windows[index];
            draft.windows[index] = draft.windows[index + 1];
            draft.windows[index + 1] = temp;
            queueSave();
            renderPanel();
          }
        });
        actions.appendChild(down);

        const del = el("button", "ed-btn ed-btn-danger", "удалить");
        del.type = "button";
        del.addEventListener("click", function () {
          draft.windows.splice(index, 1);
          queueSave();
          renderPanel();
        });
        actions.appendChild(del);

        row.appendChild(actions);
      }

      const fields = el("div", "ed-app-fields");
      fields.style.flex = "1 1 100%";
      fields.style.display = "grid";
      fields.style.gap = "6px";
      fields.style.marginTop = "6px";
      fields.style.minWidth = "0";

      const nameInput = el("input", "ed-input");
      nameInput.type = "text";
      nameInput.placeholder = "название в доке";
      nameInput.value = win.label || "";
      nameInput.addEventListener("input", function () {
        win.label = nameInput.value;
        queueSave();
      });
      fields.appendChild(nameInput);

      const titleInput = el("input", "ed-input");
      titleInput.type = "text";
      titleInput.placeholder = "заголовок окна";
      titleInput.value = win.title || "";
      titleInput.addEventListener("input", function () {
        win.title = titleInput.value;
        queueSave();
      });
      fields.appendChild(titleInput);

      const sizeRow = el("div", "ed-row");

      const widthBox = el("div", "ed-field");
      widthBox.appendChild(el("span", "ed-label", "ширина, точек"));
      const widthInput = el("input", "ed-input");
      widthInput.type = "number";
      widthInput.min = "280";
      widthInput.step = "20";
      widthInput.value = String(win.width || 620);
      widthInput.addEventListener("input", function () {
        win.width = Math.max(280, parseInt(widthInput.value, 10) || 620);
        queueSave();
      });
      widthBox.appendChild(widthInput);

      const heightBox = el("div", "ed-field");
      heightBox.appendChild(el("span", "ed-label", "высота, точек"));
      const heightInput = el("input", "ed-input");
      heightInput.type = "number";
      heightInput.min = "180";
      heightInput.step = "20";
      heightInput.placeholder = "по содержимому";
      heightInput.value = win.height ? String(win.height) : "";
      heightInput.addEventListener("input", function () {
        const value = parseInt(heightInput.value, 10);
        win.height = value ? Math.max(180, value) : 0;
        queueSave();
      });
      heightBox.appendChild(heightInput);

      sizeRow.appendChild(widthBox);
      sizeRow.appendChild(heightBox);
      fields.appendChild(sizeRow);

      if (win.type !== "editor") {
        const pinRow = el("div", "ed-row");
        pinRow.appendChild(el("span", "ed-label", "главное окно сайта"));
        pinRow.appendChild(stateButton(win.pinned === true, "включено", "выключено", function (on) {
          draft.windows.forEach(function (other) {
            other.pinned = other === win && on;
          });
        }));
        fields.appendChild(pinRow);
        fields.appendChild(el("div", "ed-hint", "в готовом сайте останется только это окно — без дока, кнопок и перетаскивания. в конструкторе оно остаётся редактируемым."));
      }

      const iconKeys = Object.keys(DATA.icons || {});
      if (iconKeys.indexOf(win.iconKey) < 0) iconKeys.unshift(win.iconKey || "");
      const iconSelect = el("select", "ed-select");
      iconKeys.forEach(function (key) {
        const option = el("option", null, key || "без иконки");
        option.value = key || "";
        iconSelect.appendChild(option);
      });
      iconSelect.value = win.iconKey || "";
      iconSelect.addEventListener("change", function () {
        win.iconKey = iconSelect.value;
        queueSave();
        renderPanel();
      });
      fields.appendChild(iconSelect);

      const ownBtn = el("button", "ed-btn ed-btn-main", "свой файл иконки");
      ownBtn.type = "button";
      ownBtn.style.flex = "none";
      ownBtn.addEventListener("click", function () {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".svg,image/svg+xml,image/png,image/jpeg,image/webp";

        input.addEventListener("change", function () {
          const file = input.files && input.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = function () {
            let svg = String(reader.result || "");
            const isSvgText = file.name.toLowerCase().endsWith(".svg") || svg.indexOf("<svg") >= 0;

            if (!isSvgText) {
              svg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><image href="' +
                svg + '" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></svg>';
            }

            const key = (win.id || "app") + "-own";
            DATA.icons[key] = svg;
            win.iconKey = key;
            win.iconSvg = svg;
            queueSave();
            renderPanel();
          };
          reader.onloadend = function () {
            if (reader.error) setStatus("не получилось прочитать файл иконки", "err");
          };

          if (file.name.toLowerCase().endsWith(".svg")) reader.readAsText(file);
          else reader.readAsDataURL(file);
        });

        input.click();
      });
      fields.appendChild(ownBtn);

      if (win.type === "page") {
        if (!win.page) win.page = contentEntry({ title: win.title || "своё приложение" }, false);
        const pageCard = el("div", "ed-field");
        pageCard.style.marginTop = "8px";
        pageCard.style.paddingTop = "8px";
        pageCard.style.borderTop = "1px dashed var(--border)";
        pageCard.appendChild(el("span", "ed-label", "текст и содержимое приложения:"));
        pageCard.appendChild(contentEditor(win.page));
        fields.appendChild(pageCard);
      }

      row.appendChild(fields);
      row.style.flexWrap = "wrap";
      row.style.alignItems = "flex-start";

      appCard.appendChild(row);
      wrap.appendChild(appCard);
    });

    const addCard = el("div", "ed-card");
    addCard.appendChild(el("div", "ed-card-title", "добавить приложение"));
    addCard.appendChild(el("div", "ed-hint", "своя страница-приложение появится в доке отдельным окном."));

    const addRow = el("div", "ed-restore-list");
    addRow.style.display = "flex";
    addRow.style.flexWrap = "wrap";
    addRow.style.gap = "8px";

    const addPage = el("button", "ed-add", "+ своё приложение");
    addPage.type = "button";
    addPage.style.alignSelf = "auto";
    addPage.addEventListener("click", function () {
      let index = 1;
      while (draft.windows.some(function (win) { return win.id === "page" + index; })) index += 1;
      draft.windows.push({
        id: "page" + index,
        type: "page",
        title: "своё приложение",
        label: "приложение " + index,
        iconKey: "pdf",
        width: 620,
        page: contentEntry({ title: "своё приложение" }, false)
      });
      queueSave();
      renderPanel();
    });
    addRow.appendChild(addPage);
    addCard.appendChild(addRow);
    wrap.appendChild(addCard);

    const missingBuiltins = (ORIGINAL.windows || []).filter(function (orig) {
      if (orig.type === "editor") return false;
      return !draft.windows.some(function (w) { return w.id === orig.id; });
    });

    if (missingBuiltins.length > 0) {
      const restoreCard = el("div", "ed-card");
      restoreCard.style.marginTop = "14px";
      restoreCard.appendChild(el("div", "ed-card-title", "удалённые встроенные приложения"));
      restoreCard.appendChild(el("div", "ed-hint", "вы можете вернуть удалённые стандартные окна обратно на рабочий стол:"));

      const list = el("div", "ed-restore-list");
      list.style.display = "flex";
      list.style.flexWrap = "wrap";
      list.style.gap = "8px";
      list.style.marginTop = "10px";

      missingBuiltins.forEach(function (orig) {
        const btn = el("button", "ed-btn", "+ вернуть " + (orig.label || orig.title || orig.id));
        btn.type = "button";
        btn.title = "вернуть окно «" + (orig.title || orig.id) + "» в док";
        btn.addEventListener("click", function () {
          const restored = clone(orig);
          let editorIdx = -1;
          for (let i = 0; i < draft.windows.length; i += 1) {
            if (draft.windows[i].type === "editor") {
              editorIdx = i;
              break;
            }
          }
          if (editorIdx >= 0) {
            draft.windows.splice(editorIdx, 0, restored);
          } else {
            draft.windows.push(restored);
          }
          queueSave();
          renderPanel();
          setStatus("приложение «" + (orig.label || orig.id) + "» возвращено", "ok");
        });
        list.appendChild(btn);
      });

      if (missingBuiltins.length > 1) {
        const allBtn = el("button", "ed-btn ed-btn-main", "вернуть все");
        allBtn.type = "button";
        allBtn.title = "вернуть все удалённые встроенные окна";
        allBtn.addEventListener("click", function () {
          missingBuiltins.forEach(function (orig) {
            const restored = clone(orig);
            let editorIdx = -1;
            for (let i = 0; i < draft.windows.length; i += 1) {
              if (draft.windows[i].type === "editor") {
                editorIdx = i;
                break;
              }
            }
            if (editorIdx >= 0) {
              draft.windows.splice(editorIdx, 0, restored);
            } else {
              draft.windows.push(restored);
            }
          });
          queueSave();
          renderPanel();
          setStatus("все встроенные приложения возвращены", "ok");
        });
        list.appendChild(allBtn);
      }

      restoreCard.appendChild(list);
      wrap.appendChild(restoreCard);
    }

    return wrap;
  }

  function today() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "." + month + "." + day;
  }

  /* ---------- Сборка панели ---------- */

  function stateButton(on, onText, offText, onChange) {
    const btn = el("button", "ed-btn" + (on ? " ed-btn-main" : ""), on ? onText : offText);
    btn.type = "button";
    btn.addEventListener("click", function () {
      onChange(!on);
      queueSave();
      renderPanel();
    });
    return btn;
  }

  function settingsItemCard(item) {
    const card = el("div", "ed-card");
    card.appendChild(el("div", "ed-card-title", (item.group ? item.group + " · " : "") + (item.label || item.id)));

    const valueRow = el("div", "ed-row");
    valueRow.appendChild(el("span", "ed-label", "значение"));

    if (item.type === "toggle") {
      const seg = el("div", "ed-seg");
      [[true, "включено"], [false, "выключено"]].forEach(function (pair) {
        const btn = el("button", item.value === pair[0] ? "active" : "", pair[1]);
        btn.type = "button";
        btn.addEventListener("click", function () {
          item.value = pair[0];
          queueSave();
          renderPanel();
        });
        seg.appendChild(btn);
      });
      valueRow.appendChild(seg);
    } else if (item.type === "number") {
      const input = el("input", "ed-input");
      input.type = "number";
      input.step = "1";
      if (item.min !== undefined) input.min = String(item.min);
      if (item.max !== undefined) input.max = String(item.max);
      input.value = String(item.value !== undefined ? item.value : "");
      input.addEventListener("input", function () {
        const parsed = parseInt(input.value, 10);
        item.value = Number.isFinite(parsed) ? parsed : 0;
        queueSave();
      });
      valueRow.appendChild(input);
    } else {
      const select = el("select", "ed-select");
      (item.options || []).forEach(function (pair) {
        const option = el("option", null, pair[1]);
        option.value = pair[0];
        if (item.value === pair[0]) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", function () {
        item.value = select.value;
        queueSave();
        /* Стекло тяжёлое: предупреждаем перед включением. */
        if (item.id === "style" && select.value === "glass" && !glassWarned && !isGlassLive()) {
          const previous = currentStyleValue();
          revertGlass = function () {
            item.value = previous;
            saveDraft();
          };
          showGlassWarning();
        }
      });
      valueRow.appendChild(select);
    }
    card.appendChild(valueRow);

    if (item.id === "style") {
      card.appendChild(el("div", "ed-hint ed-glass-note", "liquid glass — самый тяжёлый стиль: на слабых компьютерах может лагать. при выборе покажем предупреждение."));
    }

    if (item.type !== "toggle" && Array.isArray(item.options)) {
      if (!Array.isArray(item.locked)) item.locked = [];
      item.options.forEach(function (pair) {
        const row = el("div", "ed-row");
        row.appendChild(el("span", "ed-label", pair[1]));
        row.appendChild(stateButton(item.locked.indexOf(pair[0]) >= 0, "заблокирован", "разрешён", function (on) {
          const at = item.locked.indexOf(pair[0]);
          if (on && at < 0) item.locked.push(pair[0]);
          if (!on && at >= 0) item.locked.splice(at, 1);
        }));
        card.appendChild(row);
      });
    }

    const onlyRow = el("div", "ed-row");
    onlyRow.appendChild(el("span", "ed-label", "только при стиле hyprland"));
    onlyRow.appendChild(stateButton(item.only === "hypr", "да", "нет", function (on) {
      if (on) item.only = "hypr";
      else delete item.only;
    }));
    card.appendChild(onlyRow);

    const hideRow = el("div", "ed-row");
    hideRow.appendChild(el("span", "ed-label", "пункт в настройках"));
    hideRow.appendChild(stateButton(item.hidden === true, "скрыт", "показан", function (on) {
      item.hidden = on;
    }));
    card.appendChild(hideRow);

    return card;
  }

  function settingsTab() {
    const box = el("div", "ed-card");
    box.style.background = "transparent";
    box.style.border = "0";
    box.style.padding = "0";

    const topBar = el("div", "ed-row");
    topBar.style.marginBottom = "12px";
    topBar.style.display = "flex";
    topBar.style.alignItems = "center";
    topBar.style.gap = "10px";

    const openSettingsBtn = el("button", "ed-btn ed-btn-main", "открыть окно настроек");
    openSettingsBtn.type = "button";
    openSettingsBtn.title = "применит текущие параметры и откроет окно настроек на рабочем столе";
    openSettingsBtn.addEventListener("click", function () {
      const hasSettings = draft.windows.some(function (w) { return w.id === "settings"; });
      if (!hasSettings) {
        setStatus("окно «настройки» удалено из списка приложений — восстановите его во вкладке «приложения»", "err");
        return;
      }
      commit();
      saveDraft();
      if (window.WindowManager && window.WindowManager.sync) WindowManager.sync();
      if (window.WindowManager && window.WindowManager.open) {
        window.WindowManager.open("settings");
        if (window.WindowManager.focus) window.WindowManager.focus("settings");
      }
    });

    const clearSettingsBtn = el("button", "ed-btn ed-btn-danger", "очистить сохранённые настройки");
    clearSettingsBtn.type = "button";
    clearSettingsBtn.title = "удалить сохранённые стили, тему и цвет из localStorage браузера";
    clearSettingsBtn.addEventListener("click", function () {
      [
        STORE,
        "desktop-settings-v1",
        "desktop-accent-v1",
        "desktop-theme-accent-v1",
        "desktop-wallpaper-v1",
        "desktop-window-positions-v1",
        "desktop-window-state-v1",
        "desktop-clock-pos-v1"
      ].forEach(function (k) {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      window.location.reload();
    });

    topBar.appendChild(openSettingsBtn);
    topBar.appendChild(clearSettingsBtn);
    box.appendChild(topBar);

    if (!glassNotice) buildGlassNotice();

    box.appendChild(el("div", "ed-hint", "значения станут начальными для готового сайта. заблокированное нельзя будет выбрать, скрытое исчезнет из окна настроек. новые пункты — док, сторона дока, подсказки hypr и их размер — правятся здесь же."));

    if (!Array.isArray(draft.theme.locked)) draft.theme.locked = [];

    const colors = el("div", "ed-card");
    colors.appendChild(el("div", "ed-card-title", "цвета"));

    (draft.theme.presets || []).forEach(function (preset) {
      const row = el("div", "ed-row");
      row.appendChild(el("span", "ed-label", (preset.label || preset.id) + " · " + (preset.color || "")));
      row.appendChild(stateButton(draft.theme.locked.indexOf(preset.id) >= 0, "заблокирован", "разрешён", function (on) {
        const at = draft.theme.locked.indexOf(preset.id);
        if (on && at < 0) draft.theme.locked.push(preset.id);
        if (!on && at >= 0) draft.theme.locked.splice(at, 1);
      }));
      colors.appendChild(row);
    });

    const custom = el("div", "ed-row");
    custom.appendChild(el("span", "ed-label", "свой цвет (пипетка)"));
    custom.appendChild(stateButton(draft.theme.lockedCustom === true, "заблокирована", "разрешена", function (on) {
      draft.theme.lockedCustom = on;
    }));
    colors.appendChild(custom);
    box.appendChild(colors);

    const glassCard = el("div", "ed-card");
    glassCard.appendChild(el("div", "ed-card-title", "liquid glass"));
    preview.appendChild(el("div", "ed-hint", "посмотреть предупреждение о тяжёлом стиле ещё раз. согласие помнится до очистки настроек."));
    const glassBtn = el("button", "ed-btn", "показать предупреждение");
    glassBtn.type = "button";
    glassBtn.addEventListener("click", function () {
      const styleItem = (draft.settings || []).filter(function (item) {
        return item && item.id === "style";
      })[0];
      if (styleItem) {
        const previous = styleItem.value;
        revertGlass = function () { styleItem.value = previous; };
      } else {
        revertGlass = null;
      }
      showGlassWarning();
    });
    glassCard.appendChild(glassBtn);
    box.appendChild(glassCard);

    draft.settings.forEach(function (item) {
      box.appendChild(settingsItemCard(item));
    });

    return box;
  }

  function guideTab() {
    const wrap = el("div", "ed-guide");

    function card(title, html) {
      const node = el("div", "ed-card");
      node.appendChild(el("div", "ed-card-title", title));
      if (html) {
        const body = el("div", "ed-guide-body");
        body.innerHTML = html;
        node.appendChild(body);
      }
      return node;
    }

    function code(text) {
      return el("pre", "ed-guide-code", text);
    }

    wrap.appendChild(card("гайд: своё приложение в стиле qplate",
      '<p class="ed-guide-p">этот гайд — про сам qplate, а не общий учебник по вёрстке. ниже — минимум, чтобы новое окно выглядело своим.</p>' +
      '<p class="ed-guide-p">приложение — это запись окна в <code>data.js</code> и функция отрисовки в <code>apps.js</code>. ядро трогать не нужно.</p>'));

    const steps = card("как добавить своё окно",
      '<ol class="ed-guide-list">' +
      '<li>добавь иконку в <code>DATA.icons</code>, если нужна своя;</li>' +
      '<li>добавь запись в <code>DATA.windows</code>;</li>' +
      '<li>напиши функцию <code>render</code> в <code>apps.js</code>;</li>' +
      '<li>зарегистрируй тип в реестре отрисовщиков.</li>' +
      '</ol>' +
      '<p class="ed-guide-p">запись окна:</p>');
    steps.appendChild(code('{ id: "guestbook", type: "guestbook", title: "гостевая",\n  label: "гостевая", iconKey: "notes", width: 480, height: 420 }'));
    steps.appendChild(el("p", "ed-guide-p", "функция отрисовки:"));
    steps.appendChild(code('function renderGuestbook(body, cfg, ctx) {\n  const app = document.createElement("div");\n  app.className = "app-page";\n  app.textContent = "здесь будет гостевая.";\n  body.appendChild(app);\n}\n\nrenderers.guestbook = { render: renderGuestbook };'));
    wrap.appendChild(steps);

    wrap.appendChild(card("правила qplate",
      '<ul class="ed-guide-list">' +
      '<li><b>цвета</b> — только <code>var(--accent)</code>, <code>var(--text)</code>, <code>var(--surface-*)</code>, <code>var(--border*)</code>, <code>var(--dock-*)</code>. свои hex-цвета не вписываем;</li>' +
      '<li><b>шрифт</b> — наследуется от оболочки, новые шрифты не подключаем;</li>' +
      '<li><b>форма</b> — окно 8 px, карточки 8–10 px, кнопки 6–8 px;</li>' +
      '<li><b>отступы</b> — 12, 16, 20 или 24 px; корень приложения — <code>class="app-page"</code>;</li>' +
      '<li><b>кнопки</b> — существующие классы, состояния hover, focus-visible и disabled;</li>' +
      '<li><b>анимации</b> — 0.15–0.3 с, при <code>body.no-motion</code> не анимируем;</li>' +
      '<li><b>телефон</b> — проверяем на 390 px, прокрутка через <code>.window-body</code>;</li>' +
      '<li><b>тёмная тема</b> — не хардкодим белый и чёрный фон, проверяем <code>body.theme-dark</code>.</li>' +
      '</ul>'));

    wrap.appendChild(card("готовые классы",
      '<ul class="ed-guide-list">' +
      '<li><code>.app-page</code> — корень приложения с отступами;</li>' +
      '<li><code>.content-heading</code> — заголовок внутри окна;</li>' +
      '<li><code>.empty-note</code> — спокойная надпись «пусто»;</li>' +
      '<li><code>.icon-btn</code> — кнопка-иконка;</li>' +
      '<li><code>.window-body</code> — прокручиваемая часть окна;</li>' +
      '<li><code>.setting-row</code>, <code>.file-row</code> — готовые строки настроек и файлов.</li>' +
      '</ul>' +
      '<p class="ed-guide-p">классы <code>.ed-*</code> — только для конструктора, в готовом сайте их нет.</p>'));

    wrap.appendChild(card("чего избегать",
      '<ul class="ed-guide-list">' +
      '<li>библиотек, фреймворков и сборки;</li>' +
      '<li>глобальных селекторов вроде <code>div { ... }</code>;</li>' +
      '<li><code>z-index</code> выше 900 — окна и док живут ниже;</li>' +
      '<li>инлайновых стилей вместо классов;</li>' +
      '<li>новых ключей <code>localStorage</code> без префикса;</li>' +
      '<li>заглушек и надписей «потом доделаю».</li>' +
      '</ul>'));

    wrap.appendChild(card("проверка перед сдачей",
      '<ul class="ed-guide-list">' +
      '<li>окно открывается из дока и не ломает другие;</li>' +
      '<li>на 390 px ничего не обрезано;</li>' +
      '<li>тёмная тема и крупный текст читаются;</li>' +
      '<li>при выключенных анимациях всё работает;</li>' +
      '<li>экспорт сайта сохраняет новое окно;</li>' +
      '<li>в консоли нет ошибок.</li>' +
      '</ul>'));

    return wrap;
  }

  const TABS = [
    { id: "project", label: "проект" },
    { id: "notes", label: "заметки" },
    { id: "pdf", label: "документы" },
    { id: "browser", label: "браузер" },
    { id: "files", label: "файлы" },
    { id: "photos", label: "фото" },
    { id: "music", label: "музыка" },
    { id: "settings", label: "настройки" },
    { id: "terminal", label: "терминал" },
    { id: "apps", label: "приложения" },
    { id: "guide", label: "гайд" }
  ];

  let activeTab = "project";

  function tabNode(tab) {
    const btn = el("button", "ed-tab" + (activeTab === tab.id ? " active" : ""), tab.label);
    btn.type = "button";
    btn.addEventListener("click", function () {
      activeTab = tab.id;
      bodyRef.querySelectorAll(".ed-tab").forEach(function (node) {
        node.classList.toggle("active", node === btn);
      });
      renderPanel();
    });
    return btn;
  }

  function renderPanel() {
    if (!panelRef) return;

    const scroll = panelRef.scrollTop || 0;
    panelRef.innerHTML = "";

    if (activeTab === "notes") panelRef.appendChild(notesTab());
    else if (activeTab === "pdf") panelRef.appendChild(pdfTab());
    else if (activeTab === "browser") panelRef.appendChild(browserTab());
    else if (activeTab === "files") panelRef.appendChild(filesTab());
    else if (activeTab === "photos") panelRef.appendChild(photosTab());
    else if (activeTab === "music") panelRef.appendChild(musicTab());
    else if (activeTab === "settings") panelRef.appendChild(settingsTab());
    else if (activeTab === "terminal") panelRef.appendChild(terminalTab());
    else if (activeTab === "apps") panelRef.appendChild(appsTab());
    else if (activeTab === "guide") panelRef.appendChild(guideTab());
    else panelRef.appendChild(projectTab());

    panelRef.scrollTop = scroll;
  }

  /* ---------- Сохранение сайта ---------- */

  function exportData() {
    const out = clone(DATA);
    out.windows = (out.windows || []).filter(function (win) {
      return win.type !== "editor";
    });
    return out;
  }

  function buildDataFile() {
    return "/* данные сайта, собраны конструктором */\nwindow.DATA = " + JSON.stringify(exportData(), null, 2) + ";\n";
  }

  function buildIndexHtml() {
    const title = (DATA.meta && DATA.meta.title) || "рабочий стол";
    const preview = (DATA.meta && DATA.meta.preview) || {};
    const ogTitle = preview.title || title;
    const ogText = preview.description || "";
    const ogImage = absoluteUrl(preview.image);
    const ogUrl = absoluteUrl(preview.url);
    const head = [];

    if (ogText) head.push('  <meta name="description" content="' + esc(ogText) + '">');
    head.push('  <meta property="og:type" content="website">');
    head.push('  <meta property="og:site_name" content="' + esc(title) + '">');
    head.push('  <meta property="og:title" content="' + esc(ogTitle) + '">');
    if (ogText) head.push('  <meta property="og:description" content="' + esc(ogText) + '">');
    if (ogImage) head.push('  <meta property="og:image" content="' + esc(ogImage) + '">');
    if (ogUrl) head.push('  <meta property="og:url" content="' + esc(ogUrl) + '">');
    head.push('  <meta name="twitter:card" content="' + (ogImage ? "summary_large_image" : "summary") + '">');
    head.push('  <meta name="twitter:title" content="' + esc(ogTitle) + '">');
    if (ogText) head.push('  <meta name="twitter:description" content="' + esc(ogText) + '">');
    if (ogImage) head.push('  <meta name="twitter:image" content="' + esc(ogImage) + '">');

    return [
      "<!DOCTYPE html>",
      '<html lang="ru">',
      "<head>",
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
      '  <meta name="color-scheme" content="light">',
      "  <title>" + esc(title) + "</title>"
    ].concat(head, [
      '  <link rel="stylesheet" href="shell.css">',
      '  <link rel="stylesheet" href="apps.css">',
      "</head>",
      "<body>",
      '  <main class="desktop" id="desktop" aria-label="рабочий стол"></main>',
      '  <nav class="side-dock" id="dock" aria-label="приложения"></nav>',
      '  <svg id="liquid-glass-svg" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden;pointer-events:none;" aria-hidden="true"><defs><filter id="liquid-glass-filter" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%"><feImage result="dispMap" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" href="data:image/svg+xml,%3Csvg%20xmlns%3D\'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg\'%20viewBox%3D\'0%200%20100%20100\'%20preserveAspectRatio%3D\'none\'%3E%3Cdefs%3E%3ClinearGradient%20id%3D\'gx\'%20x1%3D\'0%25\'%20y1%3D\'0%25\'%20x2%3D\'100%25\'%20y2%3D\'0%25\'%3E%3Cstop%20offset%3D\'0%25\'%20stop-color%3D\'%23000\'%2F%3E%3Cstop%20offset%3D\'100%25\'%20stop-color%3D\'%23f00\'%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D\'gy\'%20x1%3D\'0%25\'%20y1%3D\'0%25\'%20x2%3D\'0%25\'%20y2%3D\'100%25\'%3E%3Cstop%20offset%3D\'0%25\'%20stop-color%3D\'%23000\'%2F%3E%3Cstop%20offset%3D\'100%25\'%20stop-color%3D\'%230f0\'%2F%3E%3C%2FlinearGradient%3E%3Cfilter%20id%3D\'b\'%3E%3CfeGaussianBlur%20stdDeviation%3D\'7\'%2F%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%3Crect%20width%3D\'100\'%20height%3D\'100\'%20rx%3D\'8\'%20fill%3D\'url(%23gx)\'%20style%3D\'mix-blend-mode%3Ascreen\'%2F%3E%3Crect%20width%3D\'100\'%20height%3D\'100\'%20rx%3D\'8\'%20fill%3D\'url(%23gy)\'%20style%3D\'mix-blend-mode%3Ascreen\'%2F%3E%3Crect%20width%3D\'100\'%20height%3D\'100\'%20rx%3D\'8\'%20fill%3D\'%23808080\'%20filter%3D\'url(%23b)\'%2F%3E%3C%2Fsvg%3E"/><feDisplacementMap in="SourceGraphic" in2="dispMap" scale="-28" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>',
      '  <script src="data.js"></script>',
      '  <script src="apps.js"></script>',
      '  <script src="shell.js"></script>',
      "</body>",
      "</html>",
      ""
    ]).join("\n");
  }

  /* Картинка превью должна быть полным адресом, иначе мессенджеры её не увидят. */
  function absoluteUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.indexOf("data:") === 0 || /^https?:\/\//i.test(text)) return text;
    let base = (DATA.meta && DATA.meta.preview && DATA.meta.preview.url) || "";
    if (!/^https?:\/\//i.test(base)) base = location.href.split(/[?#]/)[0];
    try {
      return new URL(text, base).href;
    } catch (err) {
      return text;
    }
  }

  function buildReadme() {
    const title = (DATA.meta && DATA.meta.title) || "мой сайт";
    return [
      "# " + title,
      "",
      "Сайт собран конструктором. Открывай index.html или запусти сервер:",
      "",
      "    python3 -m http.server 8000",
      "",
      "и зайди на http://localhost:8000.",
      "",
      "## Файлы",
      "",
      "- data.js — весь текст, заметки, вкладки, команды и список окон;",
      "- shell.js / shell.css — окна, док, тема;",
      "- apps.js / apps.css — содержимое окон;",
      "- index.html — точка входа;",
      "- .github/workflows/deploy.yml — автоматический деплой на GitHub Pages.",
      "",
      "## Публикация на GitHub Pages",
      "",
      "1. Создай репозиторий на GitHub и загрузи эти файлы.",
      "2. В настройках репозитория (Settings -> Pages -> Build and deployment) выбери «GitHub Actions».",
      "3. При каждом коммите сайт автоматически публикуется.",
      "",
      "Правь data.js вручную или снова открой проект в конструкторе",
      "(project.json лежит рядом).",
      ""
    ].join("\n");
  }

  function buildProjectFile() {
    return JSON.stringify({
      format: "desktop-project",
      version: 1,
      savedAt: new Date().toISOString(),
      data: exportData()
    }, null, 2);
  }

  function buildDeployWorkflow() {
    return [
      "name: Deploy site to GitHub Pages",
      "",
      "on:",
      "  push:",
      "    branches: [main, master]",
      "  workflow_dispatch:",
      "",
      "permissions:",
      "  contents: read",
      "  pages: write",
      "  id-token: write",
      "",
      "concurrency:",
      "  group: 'pages'",
      "  cancel-in-progress: false",
      "",
      "jobs:",
      "  deploy:",
      "    environment:",
      "      name: github-pages",
      "      url: ${{ steps.deployment.outputs.page_url }}",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - name: Checkout",
      "        uses: actions/checkout@v4",
      "      - name: Setup Pages",
      "        uses: actions/configure-pages@v4",
      "      - name: Upload artifact",
      "        uses: actions/upload-pages-artifact@v3",
      "        with:",
      "          path: '.'",
      "      - name: Deploy to GitHub Pages",
      "        id: deployment",
      "        uses: actions/deploy-pages@v4",
      ""
    ].join("\n");
  }

  async function writeFile(dir, name, text) {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  const crcTable = (function () {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let code = i;
      for (let k = 0; k < 8; k += 1) code = code & 1 ? 0xedb88320 ^ (code >>> 1) : code >>> 1;
      table[i] = code >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let code = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      code = crcTable[(code ^ bytes[i]) & 0xff] ^ (code >>> 8);
    }
    return (code ^ 0xffffffff) >>> 0;
  }

  function zipDate(now) {
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    return { time: time & 0xffff, date: date & 0xffff };
  }

  async function buildZip(files) {
    const encoder = new TextEncoder();
    const stamp = zipDate(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const nameBytes = encoder.encode(file[0]);
      const data = file[1] instanceof Blob
        ? new Uint8Array(await file[1].arrayBuffer())
        : encoder.encode(file[1]);
      const crc = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);

      parts.push(local, data);
      central.push(cd);
      offset += local.length + data.length;
    }

    const centralSize = central.reduce(function (sum, part) { return sum + part.length; }, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
  }

  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* Картинка превью: локальный файл assets/preview.png (или другой из папки assets). */
  async function previewAsset() {
    const value = String((draft.meta.preview && draft.meta.preview.image) || "");
    if (!/^assets\/[^/]+\.(png|jpe?g|webp|gif|svg)$/i.test(value)) return null;
    try {
      const response = await fetch(value + "?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return null;
      return [value, await response.blob()];
    } catch (err) {
      return null;
    }
  }

  async function downloadFiles() {
    commit();
    saveDraft();

    const files = [
      ["index.html", buildIndexHtml()],
      ["data.js", buildDataFile()]
    ];

    const sources = ["shell.css", "apps.css", "shell.js", "apps.js"];
    const missing = [];

    for (let i = 0; i < sources.length; i += 1) {
      try {
        const response = await fetch(sources[i] + "?v=" + Date.now(), { cache: "no-store" });
        if (!response.ok) throw new Error("нет файла");
        files.push([sources[i], await response.text()]);
      } catch (err) {
        missing.push(sources[i]);
      }
    }

    files.push(["README.md", buildReadme()]);
    files.push(["project.json", buildProjectFile()]);
    files.push([".github/workflows/deploy.yml", buildDeployWorkflow()]);

    const asset = await previewAsset();
    if (asset) files.push(asset);

    if (missing.length) {
      setStatus("не читаются " + missing.join(", ") + ": открой сайт через сервер и повтори", "err");
      return;
    }

    downloadBlob("site.zip", buildZip(files));
    setStatus("скачан site.zip: распакуй и открой index.html", "ok");
  }

  async function saveToFolder() {
    commit();
    saveDraft();

    if (!window.showDirectoryPicker) {
      await downloadFiles();
      return;
    }

    try {
      if (!folderHandle) {
        folderHandle = await window.showDirectoryPicker({ id: "desktop-site", mode: "readwrite" });
      }

      let exists = false;
      try {
        await folderHandle.getFileHandle("index.html");
        exists = true;
      } catch (err) {
        exists = false;
      }

      if (exists) {
        const sure = await edConfirm("в папке уже есть index.html. заменить файлы сайта?", {
          title: "сохранение сайта",
          ok: "заменить",
          danger: false
        });
        if (!sure) return;
      }

      const sources = ["shell.css", "apps.css", "shell.js", "apps.js"];
      const texts = {};

      for (let i = 0; i < sources.length; i += 1) {
        const response = await fetch(sources[i] + "?v=" + Date.now(), { cache: "no-store" });
        if (!response.ok) throw new Error("не читается " + sources[i]);
        texts[sources[i]] = await response.text();
      }

      await writeFile(folderHandle, "index.html", buildIndexHtml());
      await writeFile(folderHandle, "data.js", buildDataFile());

      for (let i = 0; i < sources.length; i += 1) {
        await writeFile(folderHandle, sources[i], texts[sources[i]]);
      }

      await writeFile(folderHandle, "README.md", buildReadme());
      await writeFile(folderHandle, "project.json", buildProjectFile());

      try {
        const ghDir = await folderHandle.getDirectoryHandle(".github", { create: true });
        const wfDir = await ghDir.getDirectoryHandle("workflows", { create: true });
        await writeFile(wfDir, "deploy.yml", buildDeployWorkflow());
      } catch (err) {
        /* создание папки workflows не блокирует сохранение */
      }

      try {
        await folderHandle.getDirectoryHandle("assets", { create: true });
      } catch (err) {
        /* папка для картинок необязательна */
      }

      const asset = await previewAsset();
      if (asset) {
        const assetsDir = await folderHandle.getDirectoryHandle("assets", { create: true });
        const name = asset[0].replace(/^assets\//, "");
        const fileHandle = await assetsDir.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(asset[1]);
        await writable.close();
      }

      setStatus("сайт сохранён в папку «" + folderHandle.name + "»", "ok");
    } catch (err) {
      if (err && err.name === "AbortError") return;
      setStatus("не получилось сохранить: " + (err && err.message ? err.message : String(err)), "err");
    }
  }

  function openProject() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";

    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(String(reader.result));
          const data = parsed && parsed.data ? parsed.data : parsed;
          if (!data || !Array.isArray(data.windows)) throw new Error("нет списка окон");
          draft = draftFromData(data);
          saveDraft();
          commit();
          if (window.WindowManager && WindowManager.sync) WindowManager.sync();
          activeTab = "project";
          setStatus("проект открыт: «" + file.name + "»", "ok");
        } catch (err) {
          setStatus("файл не похож на проект", "err");
        }
      };
      reader.readAsText(file);
    });

    input.click();
  }

  /* ---------- Окно конструктора ---------- */

  function renderEditor(body) {
    bodyRef = body;

    if (!draft) draft = loadDraft();
    draft.windows.forEach(function (win) {
      if (win.iconSvg && win.iconKey) DATA.icons[win.iconKey] = win.iconSvg;
    });

    const app = el("div", "app-editor");

    const top = el("div", "ed-top");
    top.appendChild(el("div", "ed-brand", "конструктор"));

    const actions = el("div", "ed-actions");

    const apply = el("button", "ed-btn ed-btn-main", "применить");
    apply.type = "button";
    apply.addEventListener("click", applyDraft);

    const saveMenu = el("details", "ed-save-menu");
    const saveToggle = el("summary", "ed-btn ed-btn-save", "сохранить сайт");
    saveToggle.title = window.showDirectoryPicker
      ? "выбери способ: записать файлы прямо в папку или скачать zip-архив"
      : "браузер не умеет писать в папку — останется скачать zip-архив";
    saveMenu.appendChild(saveToggle);

    const saveList = el("div", "ed-save-list");

    const folderItem = el("button", "ed-save-item", "в папку на диске");
    folderItem.type = "button";
    if (window.showDirectoryPicker) {
      folderItem.title = "выбрать папку и записать index.html, data.js и остальные файлы";
    } else {
      folderItem.disabled = true;
      folderItem.textContent = "в папку на диске";
      folderItem.title = "этот браузер не поддерживает запись в папку";
    }
    folderItem.addEventListener("click", function () {
      saveMenu.removeAttribute("open");
      saveToFolder();
    });

    const zipItem = el("button", "ed-save-item", "скачать zip-архив");
    zipItem.type = "button";
    zipItem.title = "работает везде: распакуй site.zip и открой index.html";
    zipItem.addEventListener("click", function () {
      saveMenu.removeAttribute("open");
      downloadFiles();
    });

    saveList.appendChild(folderItem);
    saveList.appendChild(zipItem);
    saveMenu.appendChild(saveList);

    document.addEventListener("click", function (ev) {
      if (!saveMenu.contains(ev.target)) saveMenu.removeAttribute("open");
    });

    const open = el("button", "ed-btn", "открыть проект");
    open.type = "button";
    open.addEventListener("click", openProject);

    const reloadBtn = el("button", "ed-btn", "перезагрузить сайт");
    reloadBtn.type = "button";
    reloadBtn.title = "перезагрузить страницу сайта в браузере";
    reloadBtn.addEventListener("click", function () {
      window.location.reload();
    });

    actions.appendChild(apply);
    actions.appendChild(saveMenu);
    actions.appendChild(open);
    actions.appendChild(reloadBtn);
    top.appendChild(actions);

    const status = el("div", "ed-status");
    status.setAttribute("role", "status");

    const middle = el("div", "ed-body");
    const nav = el("nav", "ed-nav");
    nav.setAttribute("aria-label", "разделы конструктора");

    TABS.forEach(function (tab) {
      nav.appendChild(tabNode(tab));
    });

    const panel = el("div", "ed-panel");
    panelRef = panel;

    middle.appendChild(nav);
    middle.appendChild(panel);

    app.appendChild(top);
    app.appendChild(status);
    app.appendChild(middle);
    body.appendChild(app);

    renderPanel();
  }

  registry.editor = { render: renderEditor };

  /* Инициализируем и применяем сохраненный черновик при старте страницы,
     чтобы импортированные страницы и настройки сохранялись при перезагрузке */
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      draft = loadDraft();
      commit();
    }
  } catch (err) {
    /* localStorage может быть недоступен */
  }
})();
