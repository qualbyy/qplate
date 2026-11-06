/* ============================================================
   apps.js — отрисовка и поведение окон
   Каждый тип окна добавляется в APP_RENDERERS.
   ============================================================ */

(function () {
  "use strict";

  const DATA = window.DATA || {};
  const renderers = {};

  const ICON_PREV = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="2.4" height="14" rx="1"/><path d="M19 6.4v11.2a1 1 0 0 1-1.5.85l-9-5.6a1 1 0 0 1 0-1.7l9-5.6A1 1 0 0 1 19 6.4Z"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="16.6" y="5" width="2.4" height="14" rx="1"/><path d="M5 6.4v11.2a1 1 0 0 0 1.5.85l9-5.6a1 1 0 0 0 0-1.7l-9-5.6A1 1 0 0 0 5 6.4Z"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2"/></svg>';

  const isMobile = () => window.innerWidth <= 768;
  const motionOn = () => !document.body.classList.contains("no-motion");

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function promptNode(user, path) {
    const prompt = make("span", "prompt");
    prompt.innerHTML = '<span class="p-user"></span><span class="p-sym">:</span><span class="p-path"></span><span class="p-sym">$</span>';
    prompt.querySelector(".p-user").textContent = user;
    prompt.querySelector(".p-path").textContent = path;
    return prompt;
  }

  function user() {
    return (DATA.meta && DATA.meta.user) || "you";
  }

  /* Возвращает svg-иконку приложения из DATA.icons. */
  function appIcon(key, className) {
    const icons = DATA.icons || {};
    const wrap = make("span", className || "app-icon");
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML = icons[key] || "";
    return wrap;
  }

  /* Показывает содержимое в одном из двух режимов: текст или html. */
  function contentBlock(item, htmlByDefault) {
    const wrap = make("div", "content-block");
    const useHtml = item.mode === "html" || (!item.mode && htmlByDefault && item.html);

    if (useHtml && item.html) {
      const html = make("div", "content-html");
      html.innerHTML = item.html;
      wrap.appendChild(html);
      return wrap;
    }

    const text = item.text !== undefined ? item.text : (item.body || "");
    String(text).split(/\n{2,}/).forEach(function (part) {
      const trimmed = part.replace(/^\s+|\s+$/g, "");
      if (trimmed) wrap.appendChild(make("p", "content-text", trimmed));
    });

    const links = Array.isArray(item.links) ? item.links : [];
    if (links.length) {
      const list = make("div", "content-links");
      links.forEach(function (link) {
        if (!link || !link.url) return;
        const a = make("a", "content-link", link.label || link.url);
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        list.appendChild(a);
      });
      wrap.appendChild(list);
    }

    return wrap;
  }

  /* ==========================================================
     Терминал
     ========================================================== */

  function renderTerminal(body, cfg, ctx) {
    const data = DATA.terminal || {};
    const paths = data.paths || {};
    const eggs = Array.isArray(data.terminal && data.terminal.easterEggs) ? data.terminal.easterEggs : [];

    const commands = Object.keys(paths).map(function (key) {
      return Object.assign({ id: key }, paths[key]);
    });

    const app = make("div", "app-terminal");

    const fetchLine = make("div", "term-line");
    const fetchRow = make("div", "prompt-row");
    fetchRow.appendChild(promptNode(user(), "~"));
    const fetchCmd = make("span", "command", "fastfetch");
    fetchRow.appendChild(fetchCmd);
    fetchLine.appendChild(fetchRow);

    const fetchContainer = make("div", "fetch-container");
    const ascii = make("pre", "fetch-ascii", data.ascii || "");
    fetchContainer.appendChild(ascii);

    const fetchInfo = make("div", "fetch-info");
    fetchInfo.appendChild(make("div", "fetch-title", data.fetchTitle || user() + "@shell"));
    fetchInfo.appendChild(make("div", "fetch-sep", "-----------------------------"));

    // список приложений в карточке убран целиком
//     DATA.windows.forEach(function (item) {
//       if (fetchApps.indexOf(item.id) >= 0) return;
//       const line = make("div", "fetch-row");
//       const icon = appIcon(item.iconKey, "f-icon");
//       line.appendChild(icon);
//       line.appendChild(make("span", "f-key", item.label || item.id));
//       line.appendChild(make("span", "f-val", item.title || ""));
//       fetchInfo.appendChild(line);
//     });

    (data.rows || []).forEach(function (row) {
      const line = make("div", "fetch-row");
      line.appendChild(make("span", "f-key", row[0]));
      line.appendChild(make("span", "f-val", row[1]));
      fetchInfo.appendChild(line);
    });

    fetchContainer.appendChild(fetchInfo);
    fetchContainer.dataset.fetch = "1";
    fetchLine.appendChild(fetchContainer);
    app.appendChild(fetchLine);

    const quickLine = make("div", "term-line");
    quickLine.appendChild(make("div", "term-dim", "быстрые команды:"));
    const quickNav = make("div", "quick-nav");

    function quickButton(label, id) {
      const btn = make("button", "nav-btn", label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        run(id);
      });
      quickNav.appendChild(btn);
    }

    quickButton("all", "all");
    commands.forEach(function (command) {
      quickButton(command.label || command.id, command.id);
    });
    quickButton("help", "help");
    quickButton("clear", "clear");

    // neofetch-кнопка убрана

    quickLine.appendChild(quickNav);
    quickLine.appendChild(make("div", "term-dim", data.hint || ""));
    app.appendChild(quickLine);

    const output = make("div", "terminal-output");
    app.appendChild(output);

    function iconButton(id, label) {
      const btn = make("button", "nav-icon-btn");
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3.5V9h-5.5"/></svg>';
      btn.type = "button";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      btn.appendChild(make("span", null, label));
      btn.addEventListener("click", function () {
        run(id);
      });
      return btn;
    }

    const inputRow = make("div", "interactive-line");
    inputRow.appendChild(promptNode(user(), "~"));
    const input = make("input", "cmd-input");
    input.type = "text";
    input.placeholder = "введи команду";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "команда терминала");
    inputRow.appendChild(input);
    app.appendChild(inputRow);

    body.appendChild(app);

    function scrollTo(node) {
      if (!node) return;
      node.scrollIntoView({ block: "nearest", behavior: motionOn() ? "smooth" : "auto" });
    }

    function lineWithPrompt(label) {
      const line = make("div", "term-line");
      const row = make("div", "prompt-row");
      row.appendChild(promptNode(user(), "~"));
      row.appendChild(make("span", "command", label));
      line.appendChild(row);
      return line;
    }

    function appendCommand(command) {
      const commandLabel = command.file ? "cat ./" + command.file : (command.label || command.id);
      const line = lineWithPrompt(commandLabel);
      const out = make("div", "term-output");
      out.appendChild(contentBlock(command, true));
      line.appendChild(out);
      output.appendChild(line);
      scrollTo(line);
    }

    function appendText(label, text) {
      const line = lineWithPrompt(label);
      const out = make("div", "term-output", text);
      line.appendChild(out);
      output.appendChild(line);
      scrollTo(line);
    }

    function helpText() {
      const rows = commands.map(function (command) {
        const desc = command.desc || "cat ./" + (command.file || command.id);
        return "  - " + (command.id + "          ").slice(0, 11) + ": " + desc;
      });

      rows.push("  - all        : показать все разделы");
      rows.push("  - neofetch   : только карточка fastfetch");
      rows.push("  - help       : этот список");
      rows.push("  - clear      : очистить вывод");

      return "доступные команды:\n" + rows.join("\n");
    }

    function runUserCode(command) {
      const source = String(command.code || "");
      if (!source.trim()) {
        appendText(command.label || command.id, "код пустой.");
        return;
      }

      function print(value) {
        let text;
        if (typeof value === "string") {
          text = value;
        } else {
          try {
            text = JSON.stringify(value, null, 2);
          } catch (err) {
            text = String(value);
          }
        }
        appendText(command.label || command.id, text);
      }

      const api = {
        print: print,
        text: function (value) { return String(value === undefined ? "" : value); },
        open: function (id) { ctx.open(id); },
        close: function (id) { ctx.close(id); },
        link: function (url) { window.open(url, "_blank", "noopener"); },
        data: DATA
      };

      try {
        const fn = new Function("api", "print", "open", "close", "link", "data", source);
        fn(api, api.print, api.open, api.close, api.link, DATA);
      } catch (err) {
        appendText(command.label || command.id, "ошибка выполнения: " + (err && err.message ? err.message : String(err)));
      }
    }

    function runAction(command) {
      const action = command.action || (command.code ? "code" : command.url ? "link" : command.target ? "open" : "text");

      if (action === "open" && command.target) {
        ctx.open(command.target);
        return;
      }

      if (action === "link" && command.url) {
        window.open(command.url, "_blank", "noopener");
        return;
      }

      if (action === "code") {
        runUserCode(command);
        return;
      }

      appendCommand(command);
    }

    function run(raw) {
      const command = String(raw || "").trim().toLowerCase();
      if (!command) return;

      if (command === "clear") {
        output.innerHTML = "";
        return;
      }

      if (command === "help") {
        appendText("help", helpText());
        return;
      }

      if (command === "fetch" || command === "neofetch" || command === "fastfetch") {
        output.innerHTML = "";
        scrollTo(app.querySelector(".fetch-container"));
        return;
      }

      if (command === "all") {
        commands.forEach(function (item) {
          const action = item.action || (item.code ? "code" : item.url ? "link" : item.target ? "open" : "text");
          if (action === "code" || action === "open" || action === "link") {
            appendText(item.label || item.id, action === "open" ? "открывает окно «" + item.target + "»" : action === "link" ? "ссылка: " + item.url : "свой код — запусти командой «" + item.id + "»");
          } else {
            appendCommand(item);
          }
        });
        const foot = lineWithPrompt('echo "' + (data.footer || "") + '"');
        foot.appendChild(make("div", "term-dim", data.footer || ""));
        output.appendChild(foot);
        scrollTo(foot);
        return;
      }

      const found = commands.filter(function (item) {
        return item.id === command;
      })[0];

      if (found) {
        runAction(found);
        return;
      }

      const egg = eggs.filter(function (item) {
        return item.id === command;
      })[0];

      if (egg) {
        appendText(command, egg.text || "");
        return;
      }

      appendText(command, 'shell: команда не найдена: ' + command + '. введи "help" для списка.');
    }

    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      run(input.value);
      input.value = "";
    });

    return {
      onOpen: function () {
        if (isMobile()) return;
        window.setTimeout(function () {
          input.focus({ preventScroll: true });
        }, 40);
      }
    };
  }

  /* ==========================================================
     Заметки
     ========================================================== */

  function renderNotes(body) {
    const app = make("div", "app-notes");
    const list = Array.isArray(DATA.notes) ? DATA.notes : [];

    if (!list.length) {
      app.appendChild(make("div", "empty-note", "заметок пока нет."));
    } else {
      list.forEach(function (note) {
        const card = make("article", "note-card");
        const meta = make("div", "note-meta");
        meta.appendChild(make("span", "note-title", note.title || "без названия"));
        meta.appendChild(make("span", null, note.date || ""));
        card.appendChild(meta);
        const noteBody = make("div", "note-body");
        noteBody.appendChild(contentBlock(note, false));
        card.appendChild(noteBody);
        app.appendChild(card);
      });
    }

    body.appendChild(app);
  }

  /* ==========================================================
     Браузер
     ========================================================== */

  function renderBrowser(body) {
    const data = DATA.browser || {};
    const tabs = Array.isArray(data.tabs) ? data.tabs : [];

    const app = make("div", "app-browser");
    const chrome = make("div", "browser-chrome");
    const tabsBar = make("div", "browser-tabs");
    tabsBar.setAttribute("role", "tablist");
    tabsBar.setAttribute("aria-label", "вкладки браузера");

    const toolbar = make("div", "browser-toolbar");
    const nav = make("div", "browser-nav");

    const back = make("button", "icon-btn");
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>';
    back.type = "button";
    back.setAttribute("aria-label", "назад");

    const forward = make("button", "icon-btn");
    forward.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
    forward.type = "button";
    forward.setAttribute("aria-label", "вперёд");

    const refresh = make("button", "icon-btn");
    refresh.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3.5V9h-5.5"/></svg>';
    refresh.type = "button";
    refresh.setAttribute("aria-label", "обновить");

    nav.appendChild(back);
    nav.appendChild(forward);
    nav.appendChild(refresh);

    const urlBar = make("div", "url-bar");
    urlBar.innerHTML = '<svg class="url-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
    const urlText = make("span", "url-text");
    urlBar.appendChild(urlText);

    toolbar.appendChild(nav);
    toolbar.appendChild(urlBar);

    chrome.appendChild(tabsBar);
    chrome.appendChild(toolbar);

    const view = make("div", "browser-view");
    view.setAttribute("role", "tabpanel");

    const footer = make("div", "browser-footer");
    footer.appendChild(make("span", null, data.footer || ""));
    footer.appendChild(make("span", null, "рабочий стол"));

    app.appendChild(chrome);
    app.appendChild(view);
    app.appendChild(footer);
    body.appendChild(app);

    if (!tabs.length) {
      view.appendChild(make("div", "empty-note", "в браузере пока нет вкладок."));
      back.disabled = true;
      forward.disabled = true;
      refresh.disabled = true;
      return;
    }

    const tabButtons = new Map();
    let activeId = tabs[0].id;
    const history = [activeId];
    let historyIndex = 0;

    tabs.forEach(function (tab) {
      const btn = make("button", "browser-tab");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.textContent = tab.title || tab.id;

      btn.addEventListener("click", function () {
        if (tab.id === activeId) return;

        history.splice(historyIndex + 1);
        history.push(tab.id);
        historyIndex = history.length - 1;
        applyTab(tab.id);
      });

      tabsBar.appendChild(btn);
      tabButtons.set(tab.id, btn);
    });

    function applyTab(id) {
      const tab = tabs.filter(function (item) {
        return item.id === id;
      })[0];

      if (!tab) return;

      activeId = id;
      view.innerHTML = "";
      if (tab.heading) view.appendChild(make("h2", "content-heading", tab.heading));
      view.appendChild(contentBlock(tab, true));
      urlText.textContent = tab.url || "";

      tabButtons.forEach(function (btn, tabId) {
        const isActive = tabId === activeId;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      back.disabled = historyIndex <= 0;
      forward.disabled = historyIndex >= history.length - 1;
    }

    back.addEventListener("click", function () {
      if (historyIndex <= 0) return;
      historyIndex -= 1;
      applyTab(history[historyIndex]);
    });

    forward.addEventListener("click", function () {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      applyTab(history[historyIndex]);
    });

    refresh.addEventListener("click", function () {
      const current = activeId;
      applyTab(current);
    });

    applyTab(activeId);
  }

  /* ==========================================================
     Файлы
     ========================================================== */

  function renderFiles(body) {
    const data = DATA.files || {};

    if (!data.root) {
      body.appendChild(make("p", "empty-note", "нет данных для окна файлов."));
      return;
    }

    const app = make("div", "app-files");
    const toolbar = make("div", "files-toolbar");
    const list = make("div", "files-list");
    const preview = make("div", "file-preview");
    preview.hidden = true;

    const previewHead = make("div", "file-preview-head");
    const previewName = make("span", null, "");
    const previewClose = make("button", "preview-close", "закрыть");
    previewClose.type = "button";
    previewHead.appendChild(previewName);
    previewHead.appendChild(previewClose);

    const previewBody = make("pre", "file-preview-body");

    preview.appendChild(previewHead);
    preview.appendChild(previewBody);

    app.appendChild(toolbar);
    app.appendChild(list);
    app.appendChild(preview);
    body.appendChild(app);

    const path = [data.root];

    function renderBreadcrumbs() {
      toolbar.innerHTML = "";

      path.forEach(function (folder, index) {
        const crumb = make("button", "breadcrumb", folder.name || "~");
        crumb.type = "button";

        crumb.addEventListener("click", function () {
          path.splice(index + 1);
          hidePreview();
          render();
        });

        toolbar.appendChild(crumb);

        if (index < path.length - 1) {
          toolbar.appendChild(make("span", "breadcrumb-sep", "/"));
        }
      });
    }

    function hidePreview() {
      preview.hidden = true;
      previewBody.textContent = "";
    }

    function showFile(file) {
      previewName.textContent = file.name;
      previewBody.textContent = file.content || "(пусто)";
      preview.hidden = false;
    }

    function renderList() {
      list.innerHTML = "";

      const current = path[path.length - 1];
      const children = Array.isArray(current.children) ? current.children : [];

      if (!children.length) {
        list.appendChild(make("div", "empty-note", "папка пустая."));
        return;
      }

      children.forEach(function (child) {
        const isFolder = child.type === "folder";
        const row = make("button", "file-row" + (isFolder ? " is-folder" : ""));
        row.type = "button";

        const glyph = make("span", "file-glyph");
        glyph.innerHTML = isFolder ? DATA.icons.files : DATA.icons.pdf;
        row.appendChild(glyph);
        row.appendChild(make("span", "file-name", child.name || "без имени"));
        row.appendChild(make("span", "file-meta", isFolder ? "папка" : "файл"));

        row.addEventListener("click", function () {
          if (isFolder) {
            path.push(child);
            hidePreview();
            render();
            list.scrollTop = 0;
          } else {
            showFile(child);
          }
        });

        list.appendChild(row);
      });
    }

    function render() {
      renderBreadcrumbs();
      renderList();
    }

    previewClose.addEventListener("click", hidePreview);

    render();
  }

  /* ==========================================================
     Фотографии
     ========================================================== */

  function renderPhotos(body) {
    const photos = Array.isArray(DATA.photos) ? DATA.photos : [];

    const app = make("div", "app-photos");
    const grid = make("div", "photo-grid");
    const lightbox = make("div", "photo-lightbox");
    lightbox.hidden = true;
    lightbox.tabIndex = -1;

    const card = make("div", "lightbox-card");
    const image = make("img");
    image.alt = "";
    const bar = make("div", "lightbox-bar");
    const title = make("span", null, "");
    const nav = make("div", "lightbox-nav");

    const prev = make("button", "icon-btn");
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>';
    prev.type = "button";
    prev.setAttribute("aria-label", "предыдущее фото");

    const next = make("button", "icon-btn");
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
    next.type = "button";
    next.setAttribute("aria-label", "следующее фото");

    const close = make("button", "icon-btn");
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.type = "button";
    close.setAttribute("aria-label", "закрыть просмотр");

    nav.appendChild(prev);
    nav.appendChild(next);
    nav.appendChild(close);

    bar.appendChild(title);
    bar.appendChild(nav);
    card.appendChild(image);
    card.appendChild(bar);
    lightbox.appendChild(card);
    app.appendChild(grid);
    app.appendChild(lightbox);
    body.appendChild(app);

    if (!photos.length) {
      grid.appendChild(make("div", "empty-note", "фотографий пока нет."));
      return;
    }

    let current = 0;

    function paintLightbox() {
      const photo = photos[current];
      image.src = photo.src;
      image.alt = photo.title || "фотография";
      title.textContent = (current + 1) + " / " + photos.length + " • " + (photo.title || "") + (photo.note ? " — " + photo.note : "");
    }

    function openLightbox(index) {
      current = index;
      paintLightbox();
      lightbox.hidden = false;
      lightbox.focus();
    }

    function closeLightbox() {
      lightbox.hidden = true;
    }

    function step(delta) {
      current = (current + delta + photos.length) % photos.length;
      paintLightbox();
    }

    photos.forEach(function (photo, index) {
      const tile = make("button", "photo-tile");
      tile.type = "button";
      tile.setAttribute("aria-label", "открыть фото " + (photo.title || index + 1));

      const img = make("img");
      img.src = photo.src;
      img.alt = photo.title || "фотография";
      img.loading = "lazy";
      img.addEventListener("error", function () {
        img.classList.add("is-missing");
        img.alt = "картинка не найдена: " + (photo.src || "");
      });

      const caption = make("span", "photo-caption");
      caption.appendChild(make("strong", null, photo.title || "фото"));
      caption.appendChild(make("span", null, String(index + 1).padStart(2, "0")));

      tile.appendChild(img);
      tile.appendChild(caption);
      tile.addEventListener("click", function () {
        openLightbox(index);
      });

      grid.appendChild(tile);
    });

    prev.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
    close.addEventListener("click", closeLightbox);

    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", function (e) {
      if (lightbox.hidden) return;

      if (e.key === "Escape") {
        closeLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
    });
  }

  /* ==========================================================
     Плеер
     ========================================================== */

  function renderMusic(body) {
    const data = DATA.music || {};
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];

    const app = make("div", "app-music");

    if (!tracks.length) {
      app.appendChild(make("div", "empty-note", "плейлист пуст."));
      body.appendChild(app);
      return;
    }

    const cover = make("img", "music-cover");
    cover.src = data.cover || "";
    cover.alt = "обложка альбома";
    cover.addEventListener("error", function () {
      cover.classList.add("is-missing");
    });

    const meta = make("div", "music-meta");
    const trackTitle = make("div", "music-title");
    const trackArtist = make("div", "music-artist");

    meta.appendChild(trackTitle);
    meta.appendChild(trackArtist);

    const progress = make("div", "music-progress");
    const range = make("input", "music-range");
    range.type = "range";
    range.min = "0";
    range.max = "1000";
    range.value = "0";
    range.setAttribute("aria-label", "позиция трека");

    const times = make("div", "music-time");
    const elapsedText = make("span", null, "0:00");
    const totalText = make("span", null, "0:00");
    times.appendChild(elapsedText);
    times.appendChild(totalText);

    progress.appendChild(range);
    progress.appendChild(times);

    const controls = make("div", "music-controls");

    const prev = make("button", "music-btn");
    prev.innerHTML = ICON_PREV;
    prev.type = "button";
    prev.setAttribute("aria-label", "предыдущий трек");

    const play = make("button", "music-btn play");
    play.innerHTML = ICON_PLAY;
    play.type = "button";
    play.setAttribute("aria-label", "играть");

    const next = make("button", "music-btn");
    next.innerHTML = ICON_NEXT;
    next.type = "button";
    next.setAttribute("aria-label", "следующий трек");

    controls.appendChild(prev);
    controls.appendChild(play);
    controls.appendChild(next);

    app.appendChild(cover);
    app.appendChild(meta);
    app.appendChild(progress);
    app.appendChild(controls);
    app.appendChild(make("div", "music-note", "звука нет — только визуальный прогресс."));
    body.appendChild(app);

    let current = 0;
    let elapsed = 0;
    let playing = false;
    let timer = null;
    let lastTick = 0;

    function formatTime(seconds) {
      const safe = Math.max(0, Math.floor(seconds || 0));
      return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
    }

    function paint() {
      const track = tracks[current];
      const duration = Math.max(1, track.seconds || 1);
      const percent = Math.min(1000, Math.round((elapsed / duration) * 1000));

      trackTitle.textContent = track.title || "без названия";
      trackArtist.textContent = (track.artist || "неизвестный исполнитель") + " • " + (data.album || "");
      range.value = String(percent);
      range.setAttribute("aria-valuetext", formatTime(elapsed) + " из " + formatTime(duration));
      elapsedText.textContent = formatTime(elapsed);
      totalText.textContent = formatTime(duration);
      play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      play.setAttribute("aria-label", playing ? "пауза" : "играть");
    }

    function stopTimer() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    function startTimer() {
      stopTimer();
      lastTick = Date.now();

      timer = window.setInterval(function () {
        if (!playing) return;

        const now = Date.now();
        elapsed += (now - lastTick) / 1000;
        lastTick = now;

        const duration = Math.max(1, tracks[current].seconds || 1);

        if (elapsed >= duration) {
          elapsed = 0;
          current = (current + 1) % tracks.length;
        }

        paint();
      }, 250);
    }

    function pause() {
      playing = false;
      stopTimer();
      paint();
    }

    function togglePlay() {
      playing = !playing;

      if (playing) {
        lastTick = Date.now();
        startTimer();
      } else {
        stopTimer();
      }

      paint();
    }

    function selectTrack(index, autoplay) {
      current = (index + tracks.length) % tracks.length;
      elapsed = 0;
      paint();

      if (autoplay) {
        playing = true;
        lastTick = Date.now();
        startTimer();
        paint();
      }
    }

    play.addEventListener("click", togglePlay);

    prev.addEventListener("click", function () {
      selectTrack(current - 1, playing);
    });

    next.addEventListener("click", function () {
      selectTrack(current + 1, playing);
    });

    range.addEventListener("input", function () {
      const duration = Math.max(1, tracks[current].seconds || 1);
      elapsed = (Number(range.value) / 1000) * duration;
      paint();
    });

    paint();

    return {
      onHide: pause
    };
  }

  /* ==========================================================
     Настройки
     ========================================================== */

  function renderSettings(body, cfg, ctx) {
    const items = (Array.isArray(DATA.settings) ? DATA.settings : []).filter(function (item) {
      return item && !item.hidden;
    });
    const app = make("div", "app-settings");

    app.appendChild(make("div", "settings-intro", "эти настройки сохраняются в браузере."));

    if (!items.length) {
      app.appendChild(make("div", "empty-note", "настроек пока нет."));
      body.appendChild(app);
      return;
    }

    let currentSettings = ctx.getSettings();

    const theme = DATA.theme || {};

    function swatchRow() {
      const block = make("div", "theme-block");
      block.appendChild(make("div", "setting-label", "ключевой цвет"));
      block.appendChild(make("div", "setting-hint", "меняет акценты и фоны по всему сайту."));

      const swatches = make("div", "theme-swatches");

      function mark() {
        swatches.querySelectorAll(".swatch").forEach(function (b) {
          b.classList.toggle("is-active", b.dataset.id === ctx.getTheme().accent);
        });
      }

      const lockedColors = Array.isArray(theme.locked) ? theme.locked : [];

      (theme.presets || []).forEach(function (preset) {
        if (lockedColors.indexOf(preset.id) >= 0) return;
        const sw = make("button", "swatch");
        sw.type = "button";
        sw.dataset.id = preset.id;
        sw.style.background = preset.color;
        sw.title = preset.label || preset.id;
        sw.setAttribute("aria-label", preset.label || preset.id);
        sw.addEventListener("click", function () {
          ctx.applySetting("accent", preset.id);
          picker.value = preset.color;
          mark();
        });
        swatches.appendChild(sw);
      });

      if (!theme.lockedCustom) {
        const custom = make("label", "swatch custom");
        custom.dataset.id = "custom";
        custom.title = "свой цвет";
        const picker = make("input", "swatch-picker");
        picker.type = "color";
        picker.value = ctx.getTheme().color;
        picker.setAttribute("aria-label", "свой ключевой цвет");
        picker.addEventListener("input", function () {
          ctx.applySetting("accent", picker.value);
          custom.style.background = picker.value;
          mark();
        });
        custom.appendChild(picker);

        swatches.appendChild(custom);
      }
      block.appendChild(swatches);
      app.appendChild(block);
      mark();
    }

    swatchRow();

    function shrinkWallpaper(file, done) {
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          const maxW = 1920;
          const maxH = 1200;
          const scale = Math.min(1, maxW / img.width, maxH / img.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            done(canvas.toDataURL("image/jpeg", 0.82));
          } catch (err) {
            done(String(reader.result));
          }
        };
        img.onerror = function () {
          done(String(reader.result));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    }

    function settingRow(item) {
      const row = make("div", "setting-row");

      const text = make("div", "setting-text");
      text.appendChild(make("div", "setting-label", item.label || item.id));
      if (item.hint) text.appendChild(make("div", "setting-hint", item.hint));
      row.appendChild(text);

      if (item.type === "select") {
        const locked = Array.isArray(item.locked) ? item.locked : [];
        const select = make("select", "setting-select");
        let first = "";
        (item.options || []).forEach(function (pair) {
          if (locked.indexOf(pair[0]) >= 0) return;
          if (!first) first = pair[0];
          const option = make("option", null, pair[1]);
          option.value = pair[0];
          if (currentSettings[item.id] === pair[0]) option.selected = true;
          select.appendChild(option);
        });
        if (locked.indexOf(currentSettings[item.id]) >= 0 && first) {
          select.value = first;
          ctx.applySetting(item.id, first);
          currentSettings = ctx.getSettings();
        }
        select.addEventListener("change", function () {
          ctx.applySetting(item.id, select.value);
          currentSettings = ctx.getSettings();
        });
        row.appendChild(select);
        return row;
      }

      if (item.type === "wallpaper") {
        const wrap = make("div", "setting-actions");

        const locked = Array.isArray(item.locked) ? item.locked : [];
        const select = make("select", "setting-select");
        let first = "";
        (item.options || []).forEach(function (pair) {
          if (locked.indexOf(pair[0]) >= 0) return;
          if (!first) first = pair[0];
          const option = make("option", null, pair[1]);
          option.value = pair[0];
          if (currentSettings[item.id] === pair[0]) option.selected = true;
          select.appendChild(option);
        });

        if (locked.indexOf("custom") < 0) {
          const custom = make("option", null, "своя картинка");
          custom.value = "custom";
          if (currentSettings[item.id] === "custom") custom.selected = true;
          select.appendChild(custom);
        }

        if (locked.indexOf(currentSettings[item.id]) >= 0 && first) {
          select.value = first;
          ctx.applySetting(item.id, first);
          currentSettings = ctx.getSettings();
        }

        const pick = make("button", "setting-pick", "выбрать файл");
        pick.type = "button";
        pick.setAttribute("aria-label", "выбрать свою картинку для обоев");

        select.addEventListener("change", function () {
          ctx.applySetting(item.id, select.value);
          currentSettings = ctx.getSettings();
        });

        pick.addEventListener("click", function () {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";

          input.addEventListener("change", function () {
            const file = input.files && input.files[0];
            if (!file) return;

            shrinkWallpaper(file, function (data) {
              try {
                localStorage.setItem("desktop-wallpaper-v1", data);
              } catch (err) {
                text.querySelector(".setting-hint").textContent = "картинка не поместилась в память браузера — выбери поменьше";
                return;
              }
              ctx.applySetting("wallpaper", "custom");
              currentSettings = ctx.getSettings();
              select.value = "custom";
            });
          });

          input.click();
        });

        wrap.appendChild(select);
        if (locked.indexOf("custom") < 0) wrap.appendChild(pick);
        row.appendChild(wrap);
        return row;
      }

      const toggle = make("button", "setting-toggle");
      toggle.type = "button";
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-label", item.label || item.id);
      toggle.setAttribute("aria-checked", currentSettings[item.id] ? "true" : "false");

      toggle.addEventListener("click", function () {
        const next = !currentSettings[item.id];
        ctx.applySetting(item.id, next);
        currentSettings = ctx.getSettings();
        toggle.setAttribute("aria-checked", next ? "true" : "false");
      });

      row.appendChild(toggle);
      return row;
    }

    const groups = [];
    items.forEach(function (item) {
      const name = item.group || "";
      if (groups.indexOf(name) < 0) groups.push(name);
    });

    groups.forEach(function (groupName) {
      if (groupName) app.appendChild(make("div", "settings-group", groupName));

      items.filter(function (item) {
        return (item.group || "") === groupName;
      }).forEach(function (item) {
        app.appendChild(settingRow(item));
      });
    });

    body.appendChild(app);
  }

  /* ==========================================================
     Документ
     ========================================================== */

  function htmlToText(html) {
    const holder = document.createElement("div");
    holder.innerHTML = html || "";
    return (holder.textContent || "").replace(/[ \t]+\n/g, "\n").trim();
  }

  function renderPdf(body) {
    const data = DATA.pdf || {};
    const pages = Array.isArray(data.pages) ? data.pages : [];

    const app = make("div", "app-pdf");
    const viewport = make("div", "pdf-viewport");
    const sheet = make("div", "pdf-sheet");
    viewport.appendChild(sheet);

    const toolbar = make("div", "pdf-toolbar");
    const download = make("button", "pdf-download", "скачать .txt");
    download.type = "button";
    download.setAttribute("aria-label", "скачать текст документа");

    const pager = make("div", "pdf-pager");
    const prev = make("button", "icon-btn");
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>';
    prev.type = "button";
    prev.setAttribute("aria-label", "предыдущая страница");

    const counter = make("span", null, "");
    const next = make("button", "icon-btn");
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
    next.type = "button";
    next.setAttribute("aria-label", "следующая страница");

    pager.appendChild(prev);
    pager.appendChild(counter);
    pager.appendChild(next);

    toolbar.appendChild(download);
    toolbar.appendChild(pager);

    app.appendChild(viewport);
    app.appendChild(toolbar);
    body.appendChild(app);

    if (!pages.length) {
      sheet.appendChild(make("div", "empty-note", "в документе нет страниц."));
      prev.disabled = true;
      next.disabled = true;
      download.disabled = true;
      return;
    }

    let current = 0;

    function paintPage() {
      const page = pages[current];
      sheet.innerHTML = "";
      sheet.appendChild(make("h3", null, page.title || "страница " + (current + 1)));
      sheet.appendChild(contentBlock(page, true));

      counter.textContent = (current + 1) + " / " + pages.length;
      prev.disabled = current <= 0;
      next.disabled = current >= pages.length - 1;
      viewport.scrollTop = 0;
    }

    prev.addEventListener("click", function () {
      if (current <= 0) return;
      current -= 1;
      paintPage();
    });

    next.addEventListener("click", function () {
      if (current >= pages.length - 1) return;
      current += 1;
      paintPage();
    });

    download.addEventListener("click", function () {
      const text = pages.map(function (page, index) {
        const body = page.text !== undefined ? page.text : htmlToText(page.html);
        return (page.title || "страница " + (index + 1)) + "\n" + body;
      }).join("\n\n");

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = String(data.title || "документ").replace(/\.pdf$/i, "") || "документ";

      link.href = url;
      link.download = filename + ".txt";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    });

    paintPage();
  }

  /* ==========================================================
     Своя страница
     ========================================================== */

  function renderPage(body, cfg) {
    const page = (cfg && cfg.page) || {};
    const app = make("div", "app-page");

    if (page.title) app.appendChild(make("h2", "content-heading", page.title));
    app.appendChild(contentBlock(page, true));

    body.appendChild(app);
  }

  /* ==========================================================
     Заглушка и регистрация
     ========================================================== */

  function renderFallback(body, cfg) {
    body.appendChild(make("p", "empty-note", "неизвестный тип окна: " + (cfg.type || "без типа") + ". добавь его в apps.js."));
  }

  renderers.terminal = { render: renderTerminal };
  renderers.notes = { render: renderNotes };
  renderers.browser = { render: renderBrowser };
  renderers.files = { render: renderFiles };
  renderers.photos = { render: renderPhotos };
  renderers.music = { render: renderMusic };
  renderers.settings = { render: renderSettings };
  renderers.pdf = { render: renderPdf };
  renderers.page = { render: renderPage };
  renderers.__fallback = { render: renderFallback };

  window.APP_RENDERERS = renderers;
})();
