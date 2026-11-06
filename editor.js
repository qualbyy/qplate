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

    node.textContent = text;
    node.className = "ed-status show " + (kind || "");
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(function () {
      node.className = "ed-status";
      node.textContent = "";
    }, 5000);
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
        footer: (s.meta && s.meta.footer) || ""
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
    commit();
    saveDraft();
    if (window.WindowManager && WindowManager.sync) WindowManager.sync();
    setStatus("применено: сайт обновился", "ok");
  }

  function resetAll() {
    if (!window.confirm("сбросить все изменения? сайт вернётся к исходным данным, черновик будет удалён.")) {
      return;
    }

    try {
      localStorage.removeItem(STORE);
    } catch (err) {
      /* хранилище может быть недоступно */
    }

    draft = normalizeDraft(draftFromData(ORIGINAL));
    commit();
    if (window.WindowManager && WindowManager.sync) WindowManager.sync();
    setStatus("сброшено: вернулись исходные данные сайта", "ok");
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
        const load = showLoader(file.name);
        const reader = new FileReader();

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

        if (isImage || isAudio) reader.readAsDataURL(file);
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
    const textOpts = { multiline: true, code: isHtml, rows: 9 };

    if (isHtml) {
      textOpts.pick = {
        accept: ".html,.htm,text/html",
        apply: function (value) {
          item.html = value;
        }
      };
    }

    wrap.appendChild(field(isHtml ? "html-код" : "текст", isHtml ? item.html : item.text, function (value) {
      if (isHtml) item.html = value;
      else item.text = value;
    }, textOpts));

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

  /* ---------- Карточка записи ---------- */

  function entryCard(item, kind, onDelete) {
    const card = el("div", "ed-card");

    const head = el("div", "ed-card-head");
    head.appendChild(el("span", "ed-card-title", kind === "note" ? "заметка" : kind === "page" ? "страница документа" : "вкладка браузера"));

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
      }));
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

    const hint = el("div", "ed-hint", "изменения видны сразу после кнопки «применить». черновик сохраняется сам.");
    box.appendChild(hint);

    const reset = el("button", "ed-btn ed-btn-danger", "сбросить всё");
    reset.type = "button";
    reset.title = "вернуть исходные данные сайта и удалить черновик";
    reset.addEventListener("click", resetAll);
    box.appendChild(reset);

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

  function filesTab() {
    if (!draft.files || !draft.files.root) {
      draft.files = clone((DATA.files && DATA.files.root) ? DATA.files : {
        root: { name: "~", type: "folder", children: [] }
      });
    }
    if (!draft.files.root) draft.files.root = { name: "~", type: "folder", children: [] };
    if (!Array.isArray(draft.files.root.children)) draft.files.root.children = [];

    const wrap = el("div", "ed-tree");
    wrap.appendChild(el("div", "ed-hint", "папки и файлы окна «файлы». текст файла показывается по клику, как в проводнике."));

    function addNode(parent, type) {
      if (!Array.isArray(parent.children)) parent.children = [];

      if (type === "folder") {
        parent.children.push({ name: "новая папка", type: "folder", children: [] });
      } else {
        parent.children.push({ name: "новый файл.txt", type: "file", content: "" });
      }

      queueSave();
      renderPanel();
    }

    function actionRow(parent) {
      const row = el("div", "ed-tree-actions");

      const folder = el("button", "ed-btn", "+ папка");
      folder.type = "button";
      folder.addEventListener("click", function () {
        addNode(parent, "folder");
      });

      const file = el("button", "ed-btn", "+ файл");
      file.type = "button";
      file.addEventListener("click", function () {
        addNode(parent, "file");
      });

      row.appendChild(folder);
      row.appendChild(file);
      return row;
    }

    function nodeCard(node, parent) {
      const card = el("div", "ed-card ed-tree-node");

      const head = el("div", "ed-card-head");
      head.appendChild(el("span", "ed-card-title", node.type === "folder" ? "папка" : "файл"));

      const del = el("button", "ed-btn ed-btn-danger", "удалить");
      del.type = "button";
      del.addEventListener("click", function () {
        if (node.type === "folder" && Array.isArray(node.children) && node.children.length) {
          if (!window.confirm("удалить папку «" + (node.name || "без имени") + "» вместе с содержимым?")) return;
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
        card.appendChild(field("содержимое", node.content || "", function (value) {
          node.content = value;
        }, { multiline: true, rows: 6, code: true }));
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
    const wrap = el("div", "ed-card");
    wrap.appendChild(el("div", "ed-card-title", "приложения на рабочем столе"));

    draft.windows.forEach(function (win, index) {
      const row = el("div", "ed-app-row" + (win.type === "editor" ? " is-fixed" : ""));

      const icon = el("div", "ed-app-icon");
      icon.innerHTML = (DATA.icons || {})[win.iconKey] || "";
      row.appendChild(icon);

      const info = el("div", "ed-app-info");
      info.appendChild(el("div", "ed-app-name", win.label || win.id));
      info.appendChild(el("div", "ed-app-type", "тип: " + (win.type || "неизвестно")));
      row.appendChild(info);

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

      row.appendChild(fields);
      row.style.flexWrap = "wrap";
      row.style.alignItems = "flex-start";

      if (win.type !== "editor") {
        const del = el("button", "ed-btn ed-btn-danger", "удалить");
        del.type = "button";
        del.addEventListener("click", function () {
          draft.windows.splice(index, 1);
          queueSave();
          renderPanel();
        });
        row.appendChild(del);
      }

      wrap.appendChild(row);
    });

    const addPage = el("button", "ed-add", "+ своя страница");
    addPage.type = "button";
    addPage.addEventListener("click", function () {
      let index = 1;
      while (draft.windows.some(function (win) { return win.id === "page" + index; })) index += 1;
      draft.windows.push({
        id: "page" + index,
        type: "page",
        title: "своя страница",
        label: "страница " + index,
        iconKey: "pdf",
        width: 620,
        page: contentEntry({ title: "своя страница" }, false)
      });
      queueSave();
      renderPanel();
    });
    wrap.appendChild(addPage);

    const empty = draft.windows.filter(function (win) {
      return win.type === "page";
    });

    if (empty.length) {
      wrap.appendChild(el("div", "ed-card-title", "содержимое своих страниц"));
      empty.forEach(function (win) {
        wrap.appendChild(entryCard(win.page, "page", function () {
          const at = draft.windows.indexOf(win);
          if (at >= 0) draft.windows.splice(at, 1);
        }));
      });
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
    card.appendChild(el("div", "ed-card-title", item.label || item.id));

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
      });
      valueRow.appendChild(select);
    }
    card.appendChild(valueRow);

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

    box.appendChild(el("div", "ed-hint", "значения станут начальными для готового сайта. заблокированное нельзя будет выбрать, скрытое исчезнет из окна настроек."));

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

    draft.settings.forEach(function (item) {
      box.appendChild(settingsItemCard(item));
    });

    return box;
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
    { id: "apps", label: "приложения" }
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
    return [
      "<!DOCTYPE html>",
      '<html lang="ru">',
      "<head>",
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <meta name="color-scheme" content="light">',
      "  <title>" + esc(title) + "</title>",
      '  <link rel="stylesheet" href="shell.css">',
      '  <link rel="stylesheet" href="apps.css">',
      "</head>",
      "<body>",
      '  <main class="desktop" id="desktop" aria-label="рабочий стол"></main>',
      '  <nav class="side-dock" id="dock" aria-label="приложения"></nav>',
      '  <script src="data.js"></script>',
      '  <script src="apps.js"></script>',
      '  <script src="shell.js"></script>',
      "</body>",
      "</html>",
      ""
    ].join("\n");
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
      "- index.html — точка входа.",
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

  function buildZip(files) {
    const encoder = new TextEncoder();
    const stamp = zipDate(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    files.forEach(function (file) {
      const nameBytes = encoder.encode(file[0]);
      const data = encoder.encode(file[1]);
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
    });

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

      if (exists && !window.confirm("в папке уже есть index.html. заменить файлы сайта?")) {
        return;
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
        await folderHandle.getDirectoryHandle("assets", { create: true });
      } catch (err) {
        /* папка для картинок необязательна */
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

    const save = el("button", "ed-btn ed-btn-save", "сохранить готовый сайт");
    save.type = "button";
    save.title = "соберёт index.html, data.js и остальные файлы в выбранной папке";
    save.addEventListener("click", saveToFolder);

    const open = el("button", "ed-btn", "открыть проект");
    open.type = "button";
    open.addEventListener("click", openProject);

    const downloadBtn = el("button", "ed-btn", "скачать zip");
    downloadBtn.type = "button";
    downloadBtn.addEventListener("click", downloadFiles);

    actions.appendChild(apply);
    actions.appendChild(save);
    actions.appendChild(open);
    actions.appendChild(downloadBtn);
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
})();
