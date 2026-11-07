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

  /* ---------- Цвета обложек ----------
     Каждая обложка получает свой отсвет и подложку,
     цвет берём прямо из картинки. */

  const coverColorCache = new Map();

  function darkenColor(color) {
    return {
      r: Math.round(color.r * 0.58),
      g: Math.round(color.g * 0.58),
      b: Math.round(color.b * 0.58)
    };
  }

  function coverColors(img) {
    try {
      const size = 24;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      const buckets = new Map();
      const total = { r: 0, g: 0, b: 0, w: 0 };

      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 140) continue;

        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const light = (max + min) / 2;

        if (light < 18 || light > 244) continue;

        total.r += r;
        total.g += g;
        total.b += b;
        total.w += 1;

        const key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { r: 0, g: 0, b: 0, w: 0 };
          buckets.set(key, bucket);
        }
        const sat = max === 0 ? 0 : (max - min) / max;
        const weight = 0.35 + sat;
        bucket.r += r * weight;
        bucket.g += g * weight;
        bucket.b += b * weight;
        bucket.w += weight;
      }

      const list = [];
      buckets.forEach(function (bucket) {
        if (bucket.w > 0) {
          list.push({
            r: Math.round(bucket.r / bucket.w),
            g: Math.round(bucket.g / bucket.w),
            b: Math.round(bucket.b / bucket.w),
            w: bucket.w
          });
        }
      });
      list.sort(function (a, b) { return b.w - a.w; });

      if (!list.length) {
        if (!total.w) return null;
        const gray = {
          r: Math.round(total.r / total.w),
          g: Math.round(total.g / total.w),
          b: Math.round(total.b / total.w)
        };
        return [gray, darkenColor(gray)];
      }

      const first = list[0];
      let second = null;
      for (let i = 1; i < list.length; i++) {
        const c = list[i];
        if (Math.abs(c.r - first.r) + Math.abs(c.g - first.g) + Math.abs(c.b - first.b) > 80) {
          second = c;
          break;
        }
      }

      return [first, second || darkenColor(first)];
    } catch (err) {
      return null;
    }
  }

  function paintCoverColors(item, art) {
    const src = art.currentSrc || art.getAttribute("src") || "";
    if (!src) return;

    let colors = coverColorCache.get(src);
    if (colors === undefined) {
      colors = coverColors(art);
      coverColorCache.set(src, colors);
    }
    if (!colors) return;

    item.style.setProperty("--cf-a", colors[0].r + ", " + colors[0].g + ", " + colors[0].b);
    item.style.setProperty("--cf-b", colors[1].r + ", " + colors[1].g + ", " + colors[1].b);
  }

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
      const rawHtml = String(item.html);
      /* Если импортированный html содержит теги <style>, изолируем его через shadowRoot,
         чтобы чужие правила (напр. body, html) не ломали обои и оформление сайта */
      if (/<style[\s>]/i.test(rawHtml) && html.attachShadow) {
        try {
          const shadow = html.attachShadow({ mode: "open" });
          shadow.innerHTML = rawHtml;
        } catch (e) {
          html.innerHTML = rawHtml;
        }
      } else {
        html.innerHTML = rawHtml;
      }
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
      rows.push("  - echo <txt> : напечатать текст");
      rows.push("  - fastfetch  : карточка с информацией");
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
      const trimmed = String(raw || "").trim();
      if (!trimmed) return;

      const lower = trimmed.toLowerCase();

      if (lower.startsWith("echo ") || lower === "echo") {
        const text = trimmed.slice(4).trim();
        appendText(trimmed, text);
        return;
      }

      const command = lower;

      if (command === "clear") {
        output.innerHTML = "";
        return;
      }

      if (command === "help") {
        appendText("help", helpText());
        return;
      }

      if (command === "fetch" || command === "fastfetch") {
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

    const KINDS = {
      image: { label: "картинка", icon: "photos" },
      audio: { label: "аудио", icon: "music" },
      pdf: { label: "pdf", icon: "pdf" },
      text: { label: "текст", icon: "notes" },
      unknown: { label: "файл", icon: "files" }
    };

    function fileKind(file) {
      if (file.kind && KINDS[file.kind]) return file.kind;
      const ext = String(file.name || "").split(".").pop().toLowerCase();
      if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].indexOf(ext) >= 0) return "image";
      if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].indexOf(ext) >= 0) return "audio";
      if (ext === "pdf") return "pdf";
      if (["txt", "md", "js", "css", "html", "json", "csv", "log", "xml", "yml", "yaml", "ts", "jsx", "tsx"].indexOf(ext) >= 0) return "text";
      return "unknown";
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

    const previewBody = make("div", "file-preview-body");

    preview.appendChild(previewHead);
    preview.appendChild(previewBody);

    app.appendChild(toolbar);
    app.appendChild(list);
    app.appendChild(preview);
    body.appendChild(app);

    const path = [data.root];
    let blobUrl = "";
    let viewToken = 0;
    let bigEl = null;

    function releaseBlob() {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = "";
      }
    }

    function hideBig() {
      if (bigEl && bigEl.parentNode) bigEl.parentNode.removeChild(bigEl);
      bigEl = null;
    }

    function openBig(file, url) {
      hideBig();

      const kind = fileKind(file);
      const box = make("div", "file-big");
      const panel = make("div", "file-big-panel");
      const head = make("div", "file-big-head");
      head.appendChild(make("span", "file-big-name", file.name || "файл"));

      const close = make("button", "preview-close", "закрыть");
      close.type = "button";
      close.addEventListener("click", hideBig);
      head.appendChild(close);
      panel.appendChild(head);

      const content = make("div", "file-big-content");

      if (kind === "image") {
        const img = make("img", "file-preview-image");
        img.src = url;
        img.alt = file.name || "картинка";
        content.appendChild(img);
      } else if (kind === "audio") {
        const audio = make("audio", "file-preview-audio");
        audio.controls = true;
        audio.autoplay = true;
        audio.src = url;
        content.appendChild(audio);
      } else if (kind === "pdf") {
        const frame = make("iframe", "file-preview-pdf");
        frame.src = url;
        frame.title = file.name || "pdf";
        content.appendChild(frame);
      } else {
        content.appendChild(make("pre", "file-preview-text", file.content !== undefined ? String(file.content) : "(пусто)"));
      }

      panel.appendChild(content);
      box.appendChild(panel);
      box.addEventListener("click", function (e) {
        if (e.target === box) hideBig();
      });

      app.appendChild(box);
      bigEl = box;
    }

    function hidePreview() {
      viewToken++;
      hideBig();
      releaseBlob();
      preview.hidden = true;
      previewBody.innerHTML = "";
      previewName.textContent = "";
    }

    function addActions(file, url) {
      const actions = make("div", "file-preview-actions");

      const open = make("button", "preview-action", "открыть");
      open.type = "button";
      open.addEventListener("click", function () {
        openBig(file, url);
      });

      const save = make("a", "preview-action", "скачать");
      save.href = url;
      save.download = file.name || "файл";

      actions.appendChild(open);
      actions.appendChild(save);
      previewBody.appendChild(actions);
    }

    function showFile(file) {
      const kind = fileKind(file);
      const token = ++viewToken;
      releaseBlob();
      previewName.textContent = file.name || "файл";
      previewBody.innerHTML = "";
      preview.hidden = false;

      if (kind === "text") {
        const text = file.content !== undefined ? String(file.content) : "(пусто)";
        previewBody.appendChild(make("pre", "file-preview-text", text || "(пусто)"));
        blobUrl = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        addActions(file, blobUrl);
        return;
      }

      if (kind === "unknown") {
        const box = make("div", "file-unknown");
        box.setAttribute("role", "alert");
        box.appendChild(make("strong", "file-unknown-title", "формат не поддерживается"));
        box.appendChild(make("p", "file-unknown-text", "файл «" + (file.name || "без имени") + "» нельзя показать в окне, но можно скачать."));
        previewBody.appendChild(box);

        if (file.src) {
          fetch(file.src).then(function (response) { return response.blob(); }).then(function (blob) {
            if (token !== viewToken) return;
            blobUrl = URL.createObjectURL(blob);
            addActions(file, blobUrl);
          }).catch(function () {
            if (token === viewToken) previewBody.appendChild(make("p", "empty-note", "не удалось открыть файл."));
          });
        } else if (file.content) {
          blobUrl = URL.createObjectURL(new Blob([String(file.content)], { type: "application/octet-stream" }));
          addActions(file, blobUrl);
        }
        return;
      }

      const src = file.src || "";
      if (!src) {
        previewBody.appendChild(make("p", "empty-note", "файл не прикреплён."));
        return;
      }

      fetch(src).then(function (response) { return response.blob(); }).then(function (blob) {
        if (token !== viewToken) return;
        blobUrl = URL.createObjectURL(blob);

        if (kind === "image") {
          const img = make("img", "file-preview-image");
          img.src = blobUrl;
          img.alt = file.name || "картинка";
          img.addEventListener("error", function () {
            if (token !== viewToken) return;
            img.remove();
            previewBody.insertBefore(make("p", "empty-note", "картинка не открылась."), previewBody.firstChild);
          });
          previewBody.appendChild(img);
        } else if (kind === "audio") {
          const audio = make("audio", "file-preview-audio");
          audio.controls = true;
          audio.autoplay = true;
          audio.src = blobUrl;
          previewBody.appendChild(audio);
        } else if (kind === "pdf") {
          const frame = make("iframe", "file-preview-pdf");
          frame.src = blobUrl;
          frame.title = file.name || "pdf";
          previewBody.appendChild(frame);
        }

        addActions(file, blobUrl);
      }).catch(function () {
        if (token !== viewToken) return;
        previewBody.appendChild(make("p", "empty-note", "не удалось открыть файл."));
      });
    }

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
        const kind = isFolder ? "folder" : fileKind(child);
        const info = KINDS[kind] || KINDS.unknown;
        const row = make("button", "file-row" + (isFolder ? " is-folder" : ""));
        row.type = "button";

        const glyph = make("span", "file-glyph");
        glyph.innerHTML = isFolder ? DATA.icons.files : (DATA.icons[info.icon] || DATA.icons.files);
        row.appendChild(glyph);
        row.appendChild(make("span", "file-name", child.name || "без имени"));
        row.appendChild(make("span", "file-meta", isFolder ? "папка" : info.label));

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

    const cleanup = new MutationObserver(function () {
      if (!document.body.contains(app)) {
        viewToken++;
        releaseBlob();
        cleanup.disconnect();
      }
    });
    cleanup.observe(document.body, { childList: true, subtree: true });

    render();

    return {
      onHide: function () {
        hidePreview();
      },
      onDestroy: function () {
        viewToken++;
        hideBig();
        releaseBlob();
        cleanup.disconnect();
      }
    };
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

    const items = [];

    const coverflow = make("div", "music-coverflow");
    const stage = make("div", "music-coverflow-stage");

    tracks.forEach(function (track, index) {
      const item = make("button", "cf-item");
      item.type = "button";
      item.setAttribute("aria-label", (track.title || "трек") + ", " + (track.artist || ""));

      const auto = !track.cover;
      const autoIndex = index % 4;
      const art = make("img", "cf-art");
      if (data.coverMode === "accent") art.classList.add("is-accent");
      art.alt = "";
      if (auto) {
        item.classList.add("cf-auto");
        item.style.setProperty("--cf-hue", [152, 82, 230, -24][autoIndex] + "deg");
        item.style.setProperty("--cf-a", [[96, 150, 196], [104, 168, 116], [156, 122, 196], [200, 132, 96]][autoIndex].join(", "));
        item.style.setProperty("--cf-b", [[52, 92, 132], [58, 108, 72], [96, 68, 130], [130, 74, 48]][autoIndex].join(", "));
      } else {
        art.addEventListener("load", function () {
          paintCoverColors(item, art);
        });
      }
      art.addEventListener("error", function () {
        art.classList.add("is-missing");
      });
      art.src = track.cover || data.cover || "";
      if (!auto && art.complete && art.naturalWidth) paintCoverColors(item, art);

      const name = make("span", "cf-name", track.title || "без названия");
      item.appendChild(art);
      item.appendChild(name);

      item.addEventListener("click", function () {
        selectTrack(index, false);
        showSingle(true);
      });

      items.push(item);
      stage.appendChild(item);
    });

    coverflow.appendChild(stage);
    coverflow.title = "листай ← → или j / k, a / d";
    app.appendChild(coverflow);

    const single = make("div", "music-card");

    const back = make("button", "music-back", "← все треки");
    back.type = "button";
    back.addEventListener("click", function () {
      pause();
      showSingle(false);
    });
    single.appendChild(back);

    const cover = make("img", "music-cover");
    if (data.coverMode === "accent") cover.classList.add("is-accent");
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

    single.appendChild(cover);
    single.appendChild(meta);
    single.appendChild(progress);
    single.appendChild(controls);
    single.appendChild(make("div", "music-note", data.note || "звука нет — только визуальный прогресс."));
    app.appendChild(single);
    body.appendChild(app);

    let current = 0;
    let elapsed = 0;
    let playing = false;
    let timer = null;
    let lastTick = 0;

    function showSingle(on) {
      app.classList.toggle("is-single", on);

      if (!on) {
        const active = items[current];
        if (active && active.scrollIntoView) {
          active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
        }
      }
    }

    function formatTime(seconds) {
      const safe = Math.max(0, Math.floor(seconds || 0));
      return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
    }

    function trackLength(track) {
      if (track && track.src && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        return audio.duration;
      }
      return Math.max(1, (track && track.seconds) || 1);
    }

    function paint() {
      const track = tracks[current];
      const duration = trackLength(track);
      const percent = Math.min(1000, Math.round((elapsed / duration) * 1000));

      trackTitle.textContent = track.title || "без названия";
      trackArtist.textContent = (track.artist || "неизвестный исполнитель") + " • " + (data.album || "");
      range.value = String(percent);
      range.setAttribute("aria-valuetext", formatTime(elapsed) + " из " + formatTime(duration));
      elapsedText.textContent = formatTime(elapsed);
      totalText.textContent = formatTime(duration);
      play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      play.setAttribute("aria-label", playing ? "пауза" : "играть");

      items.forEach(function (item, index) {
        item.classList.toggle("is-active", index === current);
      });
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

        const duration = trackLength(tracks[current]);

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
      stopTimer();

      if (audio) {
        audio.pause();
        if (tracks[current].src) {
          audio.src = tracks[current].src;
          if (autoplay) audio.play().catch(function () {});
        } else {
          audio.removeAttribute("src");
        }
      }

      paint();

      if (autoplay) {
        playing = true;
        if (!tracks[current].src) {
          lastTick = Date.now();
          startTimer();
        }
        paint();
      }
    }

    const audio = document.createElement("audio");
    audio.preload = "none";
    if (tracks[0] && tracks[0].src) audio.src = tracks[0].src;

    audio.addEventListener("timeupdate", function () {
      if (audio.duration > 0) elapsed = audio.currentTime;
      paint();
    });

    audio.addEventListener("ended", function () {
      current = (current + 1) % tracks.length;
      elapsed = 0;
      selectTrack(current, true);
    });

    audio.addEventListener("play", function () {
      playing = true;
      lastTick = Date.now();
      paint();
    });

    audio.addEventListener("pause", function () {
      playing = false;
      paint();
    });

    play.addEventListener("click", function () {
      if (!tracks[current].src) return togglePlay();
      if (audio.paused) audio.play().catch(function () {});
      else audio.pause();
    });

    prev.addEventListener("click", function () {
      selectTrack(current - 1, playing);
    });

    next.addEventListener("click", function () {
      selectTrack(current + 1, playing);
    });

    range.addEventListener("input", function () {
      const duration = trackLength(tracks[current]);
      elapsed = (Number(range.value) / 1000) * duration;
      if (tracks[current].src && audio.duration > 0) audio.currentTime = elapsed;
      paint();
    });

    function onMusicKey(e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (app.classList.contains("is-single") || !app.isConnected) return;

      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" || target.isContentEditable)) return;

      const win = body.closest ? body.closest(".window") : null;
      if (!win || !win.classList.contains("is-focused") ||
        win.classList.contains("is-minimized") || win.classList.contains("is-closing")) return;

      const key = e.key;
      let step = 0;
      if (key === "ArrowLeft" || key === "a" || key === "A" || key === "j" || key === "J") step = -1;
      else if (key === "ArrowRight" || key === "d" || key === "D" || key === "k" || key === "K") step = 1;
      if (!step) return;

      e.preventDefault();
      selectTrack(current + step, false);
      if (items[current] && items[current].scrollIntoView) {
        items[current].scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      }
    }

    document.addEventListener("keydown", onMusicKey);

    paint();

    if (items[current] && items[current].scrollIntoView) {
      items[current].scrollIntoView({ inline: "center", block: "nearest" });
    }

    return {
      onHide: pause
    };
  }

  /* ==========================================================
     Настройки
     ========================================================== */

  function renderSettings(body, cfg, ctx) {
    const now = ctx.getSettings();
    const items = (Array.isArray(DATA.settings) ? DATA.settings : []).filter(function (item) {
      return item && !item.hidden && (!item.only || now.style === item.only);
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

      if (item.type === "number") {
        const input = make("input", "setting-select");
        const min = Number.isFinite(Number(item.min)) ? Number(item.min) : 10;
        const max = Number.isFinite(Number(item.max)) ? Number(item.max) : 200;
        const fallback = Number(item.value);
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = "1";
        input.value = String(Number(currentSettings[item.id]) || (Number.isFinite(fallback) ? fallback : min));

        input.addEventListener("input", function () {
          const parsed = parseInt(input.value, 10);
          const value = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min));
          ctx.applySetting(item.id, value);
          currentSettings = ctx.getSettings();
        });

        row.appendChild(input);
        return row;
      }

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

    const tabs = make("div", "settings-tabs");
    const panel = make("div", "settings-panel");
    let activeGroup = groups[0] || "";

    function fillGroup() {
      panel.textContent = "";
      items.filter(function (item) {
        return (item.group || "") === activeGroup;
      }).forEach(function (item) {
        panel.appendChild(settingRow(item));
      });
      tabs.querySelectorAll(".settings-tab").forEach(function (btn) {
        btn.classList.toggle("is-active", btn.dataset.group === activeGroup);
        btn.setAttribute("aria-selected", btn.dataset.group === activeGroup ? "true" : "false");
      });
    }

    groups.forEach(function (groupName) {
      const btn = make("button", "settings-tab", groupName || "основное");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.dataset.group = groupName;
      btn.addEventListener("click", function () {
        activeGroup = groupName;
        fillGroup();
      });
      tabs.appendChild(btn);
    });

    if (groups.length) {
      app.appendChild(tabs);
      app.appendChild(panel);
      fillGroup();
    }

    const reset = make("button", "settings-reset", "сбросить настройки");
    reset.type = "button";
    reset.addEventListener("click", function () {
      [
        "desktop-settings-v1",
        "desktop-accent-v1",
        "desktop-theme-accent-v1",
        "desktop-wallpaper-v1",
        "desktop-project-v1",
        "desktop-window-positions-v1",
        "desktop-window-state-v1",
        "desktop-clock-pos-v1"
      ].forEach(function (key) {
        try {
          localStorage.removeItem(key);
        } catch (err) {
          /* хранилище может быть запрещено */
        }
      });
      window.location.reload();
    });
    app.appendChild(reset);

    const watermark = make("div", "settings-watermark");
    watermark.innerHTML = 'конструктор разработан <a href="https://qualbyy.github.io" target="_blank" rel="noopener">qualbyy</a> · 1.2.1';
    app.appendChild(watermark);

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
