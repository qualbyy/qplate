/* ============================================================
   data.js — весь контент скелетона
   Меняешь только этот файл, чтобы получить свой сайт.
   ============================================================ */

window.DATA = {
  meta: {
    title: "рабочий стол • скелетон",
    user: "you",
    name: "твоё имя",
    footer: "скелетон рабочего стола — меняй data.js и собирай свой.",

    /* Превью для ссылок: мессенджеры и соцсети берут заголовок,
       описание и картинку. Правится в конструкторе, вкладка «проект». */
    preview: {
      title: "qplate — рабочий стол в браузере",
      description: "Окна, заметки, музыка, файлы и терминал прямо в браузере. Без сборки и зависимостей.",
      image: "assets/preview.png",
      url: "https://qualbyy.github.io/qplate/"
    }
  },

  /* Векторные иконки для дока и fastfetch (линейный стиль). */
  icons: {
    term: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M6.5 9.5 9.5 12l-3 2.5"/><path d="M12.5 15h5"/></svg>',
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4l4 3 4-3h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"/><path d="M7.5 9.5l1.5 1.5 1.5-1.5"/><path d="M7.5 14h9"/></svg>',
    browser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.6 2.6 3.9 6 3.9 9.5s-1.3 6.9-3.9 9.5C9.4 18.9 8.1 15.5 8.1 12S9.4 5.1 12 2.5Z"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2 2 0 0 1 5 5.5h4.5l2.5 2.5H19a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z"/><path d="M3 10.5h18"/></svg>',
    photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4.5 17.5 9.5 12l3.5 3.5 2.5-2 4 4.5"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17V5.5l11-2.5v11.5"/><circle cx="6" cy="17.5" r="3"/><circle cx="17" cy="14.5" r="3"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    editor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M2.5 8.5h19"/><path d="M6.5 12h6"/><path d="M6.5 15.5h3.5"/><path d="M14.2 17.6l4.2-4.2 1.6 1.6-4.2 4.2-2.2.6.6-2.2Z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z"/><path d="M14 2.5V8h5.5"/><path d="M8.5 13h7"/><path d="M8.5 16.5h4.5"/></svg>'
  },

  /* Список окон. Порядок = порядок иконок в доке.
     open: true — окно открыто при загрузке. */
  windows: [
    { id: "term", type: "terminal", title: "you@shell: ~", label: "терминал", iconKey: "term", width: 700, open: true },
    { id: "notes", type: "notes", title: "заметки", label: "заметки", iconKey: "notes", width: 520 },
    { id: "browser", type: "browser", title: "браузер", label: "браузер", iconKey: "browser", width: 720 },
    { id: "files", type: "files", title: "файлы", label: "файлы", iconKey: "files", width: 640 },
    { id: "photos", type: "photos", title: "фотографии", label: "фото", iconKey: "photos", width: 640 },
    { id: "music", type: "music", title: "плеер", label: "музыка", iconKey: "music", width: 400 },
    { id: "settings", type: "settings", title: "настройки", label: "настройки", iconKey: "settings", width: 440 },
    { id: "pdf", type: "pdf", title: "документ", label: "документ", iconKey: "pdf", width: 620 },
    { id: "editor", type: "editor", title: "конструктор", label: "конструктор", iconKey: "editor", width: 860 }
  ],

  terminal: {
    /* fastfetch берёт всё из этого объекта:
       ascii — картинка слева, rows — строки справа,
       paths — файлы для команды all (id выше = ключ ниже,
       file — имя файла, html — что показать). */
    ascii: [
      "    |\\__/,|   (`\\",
      "  _.|o o  |_   ) )",
      "-(((---(((--------",
      "   z z Z Z . . ."
    ].join("\n"),
    fetchTitle: "you@shell",
    rows: [
      ["name", "твоё имя"],
      ["role", "делаю сайты и ботов"],
      ["city", "твой город"],
      ["stack", "html · css · js"],
      ["status", "открыт к проектам"]
    ],
    hint: "введи \"all\" или жми кнопки выше. \"help\" — список команд.",
    paths: {
      about: {
        file: "about.txt",
        desc: "об этом скелетоне",
        html: `<p>это скелетон личного сайта: рабочий стол, док и восемь готовых окон.</p>
<p>весь текст, ссылки и названия окон лежат в data.js. меняй их — и получится твой проект.</p>
<p>разработано <a class="term-link" href="https://qualbyy.github.io" target="_blank" rel="noopener">qualbyy</a> · сайт конструктора: <a class="term-link" href="https://qualbyy.github.io/qplate" target="_blank" rel="noopener">qualbyy.github.io/qplate</a></p>`
      },
      stack: {
        file: "stack.md",
        desc: "из чего собрано",
        html: `<div class="table-view">
  <div class="table-row"><span class="table-key">разметка</span><span class="table-val">html5</span></div>
  <div class="table-row"><span class="table-key">стили</span><span class="table-val">css3, без библиотек</span></div>
  <div class="table-row"><span class="table-key">логика</span><span class="table-val">javascript (vanilla)</span></div>
  <div class="table-row"><span class="table-key">сборка</span><span class="table-val">не нужна</span></div>
</div>`
      },
      links: {
        file: "links.txt",
        desc: "ссылки и контакты",
        html: `<div class="table-view">
  <div class="table-row"><span class="table-key">telegram</span><span class="table-val"><a class="term-link" href="https://t.me/qualbyyy" target="_blank" rel="noopener">t.me/qualbyyy</a></span></div>
  <div class="table-row"><span class="table-key">почта</span><span class="table-val">qualbyy@gmail.com</span></div>
  <div class="table-row"><span class="table-key">разработано</span><span class="table-val"><a class="term-link" href="https://qualbyy.github.io" target="_blank" rel="noopener">qualbyy</a></span></div>
  <div class="table-row"><span class="table-key">конструктор</span><span class="table-val"><a class="term-link" href="https://qualbyy.github.io/qplate" target="_blank" rel="noopener">qualbyy.github.io/qplate</a></span></div>
</div>`
      }
    },
    /* шутки по командам: cat -> котик, coffee -> латте */
    easterEggs: [
      {
        id: "coffee",
        text: [
          "      (  )   (   )  )",
          "       ) (   )  (  (",
          "       ( )  (    ) )",
          "       _____________",
          "      <_____________> ===[ песочный латте готов ]===",
          "       |           |/",
          "       |   cafe    |",
          "       |___________|"
        ].join("\n")
      },
      {
        id: "cat",
        text: [
          "   /\\_/\\",
          "  ( o.o )  мяу. продолжай вайбкодить.",
          "   > ^ <"
        ].join("\n")
      }
    ],
    footer: "спасибо, что заглянул."
  },

  notes: [
    {
      date: "2026.11.06",
      title: "первая заметка",
      body: "это пример карточки. дата, заголовок и текст берутся из data.js.\nдобавь столько заметок, сколько нужно."
    },
    {
      date: "2026.11.02",
      title: "как менять окна",
      body: "в windows перечислены приложения. убери строку — иконка исчезнет из дока, добавь новую — появится окно."
    },
    {
      date: "2026.10.28",
      title: "без сборки",
      body: "никаких пакетов и терминала: открой index.html двойным кликом или отдай папку любому статическому хостингу."
    }
  ],

  browser: {
    tabs: [
      {
        id: "home",
        title: "главная",
        url: "https://example.com/",
        html: `<div class="demo-page">
  <div class="demo-kicker">твой проект • главная</div>
  <h1 class="demo-title">здесь мог быть твой сайт</h1>
  <p class="demo-lead">окно браузера — такой же готовый вариант, как терминал или заметки. вкладки, адрес и история уже работают.</p>
  <div class="demo-grid">
    <div class="demo-card">
      <span class="demo-card-title">вкладки</span>
      <span class="demo-card-text">добавь свою страницу в browser.tabs — появится новая вкладка.</span>
    </div>
    <div class="demo-card">
      <span class="demo-card-title">история</span>
      <span class="demo-card-text">назад и вперёд ходят по открытым вкладкам, обновление перерисовывает страницу.</span>
    </div>
  </div>
</div>`
      },
      {
        id: "about",
        title: "о проекте",
        url: "https://example.com/about",
        html: `<div class="demo-page">
  <div class="demo-kicker">о проекте</div>
  <h2 class="demo-title">коротко</h2>
  <p class="demo-lead">скелетон собран из одного html-файла, двух файлов стилей и двух файлов логики. всё остальное — контент.</p>
  <ul class="demo-list">
    <li>док с иконками и точками открытых приложений;</li>
    <li>окна перетаскиваются, сворачиваются и центрируются;</li>
    <li>на телефоне открыто одно окно, док уезжает вниз;</li>
    <li>внешние библиотеки и шрифты не используются.</li>
  </ul>
</div>`
      },
      {
        id: "links",
        title: "ссылки",
        url: "https://example.com/links",
        html: `<div class="demo-page">
  <div class="demo-kicker">ссылки</div>
  <h2 class="demo-title">куда идти дальше</h2>
  <p class="demo-lead">замени адреса на свои. ссылки открываются в новой вкладке.</p>
  <ul class="demo-list">
    <li><a class="term-link" href="https://github.com/" target="_blank" rel="noopener">github</a></li>
    <li><a class="term-link" href="https://t.me/" target="_blank" rel="noopener">telegram</a></li>
    <li><a class="term-link" href="https://developer.mozilla.org/" target="_blank" rel="noopener">справочник по вебу</a></li>
  </ul>
</div>`
      }
    ],
    footer: "демо-браузер скелетона"
  },

  files: {
    root: {
      name: "~",
      type: "folder",
      children: [
        {
          name: "проекты",
          type: "folder",
          children: [
            {
              name: "сайт-визитка",
              type: "folder",
              children: [
                { name: "index.html", type: "file", content: "<!doctype html>\n<html lang=\"ru\">\n  <head>\n    <meta charset=\"utf-8\">\n    <title>мой сайт</title>\n  </head>\n  <body>\n    <h1>привет</h1>\n  </body>\n</html>" },
                { name: "style.css", type: "file", content: "body {\n  margin: 0;\n  font-family: monospace;\n  background: #f5f2eb;\n  color: #2f2a24;\n}" },
                { name: "readme.txt", type: "file", content: "маленький пример папки проекта.\nдвойной клик по файлу открывает его текст." }
              ]
            },
            { name: "readme.txt", type: "file", content: "здесь лежат проекты.\nдобавляй папки и файлы прямо в data.js." }
          ]
        },
        {
          name: "заметки",
          type: "folder",
          children: [
            { name: "идеи.txt", type: "file", content: "1. собрать личный сайт\n2. добавить блог\n3. не забыть про мобильную версию" },
            { name: "черновик.txt", type: "file", content: "это черновик. его можно удалить или заменить своим текстом." }
          ]
        },
        { name: "readme.txt", type: "file", content: "это окно файлов.\nпапки открываются кликом, файлы показываются снизу." },
        { name: "схема.svg", type: "file", kind: "image", src: "assets/photo-2.svg" },
        { name: "пустая-папка", type: "folder", children: [] }
      ]
    }
  },

  photos: [
    { src: "assets/photo-1.svg", title: "утро", note: "тёплый свет и линия горизонта" },
    { src: "assets/photo-2.svg", title: "сетка", note: "круги, линии и ничего лишнего" },
    { src: "assets/photo-3.svg", title: "окно", note: "вид из окна на бумажный город" },
    { src: "assets/photo-4.svg", title: "поле", note: "простые формы в песочных цветах" }
  ],

  music: {
    cover: "assets/cover.svg",
    coverMode: "photo",
    album: "демо-альбом",
    note: "звука нет — только визуальный прогресс.",
    tracks: [
      { title: "первый трек", artist: "you", seconds: 187, cover: "assets/cover-1.svg" },
      { title: "второй трек", artist: "you", seconds: 224, cover: "assets/cover-2.svg" },
      { title: "третий трек", artist: "you", seconds: 165, cover: "assets/cover-3.svg" }
    ]
  },

  /* Настройки окна «настройки».
     group — заголовок раздела, type — вид переключателя.
     type: toggle | select | number | wallpaper. */
  settings: [
    { id: "theme", type: "select", group: "вид", label: "тема", hint: "светлая, тёмная или как в системе", value: "dark", options: [["light", "светлая"], ["dark", "тёмная"], ["auto", "как в системе"]] },
    { id: "motion", type: "toggle", group: "вид", label: "анимации окон", hint: "сворачивание и закрытие", value: true },
    { id: "tooltips", type: "toggle", group: "вид", label: "подсказки дока", hint: "названия приложений при наведении", value: true },
    { id: "bigtext", type: "toggle", group: "вид", label: "крупный текст", hint: "чуть больше шрифта во всех окнах", value: false },
    { id: "style", type: "select", group: "вид", label: "стиль интерфейса", hint: "оболочка окон и дока; ключевой цвет не меняется", value: "desktop", options: [["desktop", "по умолчанию"], ["win98", "windows 98"], ["aero", "aero · windows 7"], ["hypr", "hyprland · минимализм"], ["glass", "liquid glass · жидкое стекло"]] },
    { id: "glare", type: "toggle", group: "вид", label: "блик за курсором", hint: "световой отблеск стекла (liquid glass)", value: true, only: "glass" },
    { id: "sounds", type: "toggle", group: "вид", label: "звуки интерфейса", hint: "ретро-щелчки окон и кнопок (win98 / aero / стекло)", value: false },
    { id: "hints", type: "toggle", group: "вид", label: "подсказки хоткеев", hint: "тонкая строка снизу, только в hyprland", value: true },
    { id: "hintsize", type: "number", group: "вид", label: "размер подсказок hypr, точек", hint: "ползунок виден только при стиле hyprland", value: 10, min: 8, max: 16, only: "hypr" },
    { id: "dock", type: "toggle", group: "док", label: "док", hint: "показывать панель приложений на краю экрана", value: true },
    { id: "dockmode", type: "select", group: "док", label: "режим дока", hint: "плавающий или прикреплённый к краю экрана во всю длину", value: "float", options: [["float", "плавающий"], ["iphone", "прикрепленный"]] },
    { id: "dockplace", type: "select", group: "док", label: "сторона дока", hint: "к какому краю экрана прижат док", value: "right", options: [["right", "справа"], ["bottom", "снизу"], ["top", "сверху"], ["left", "слева"]] },
    { id: "docksize", type: "number", group: "док", label: "размер иконок дока", hint: "28–64 точек", value: 44, min: 28, max: 64 },
    { id: "wallpaper", type: "wallpaper", group: "рабочий стол", label: "обои", hint: "узор или своя картинка", value: "dots", options: [["none", "чистый фон"], ["dots", "точки"], ["grid", "сетка"], ["waves", "волны"], ["paper", "бумага"]] },
    { id: "clock", type: "toggle", group: "рабочий стол", label: "часы", hint: "время и дата на рабочем столе", value: true },
    { id: "clockpos", type: "select", group: "рабочий стол", label: "где часы", hint: "угол, центр или своё место", value: "tr", options: [["tl", "слева сверху"], ["tc", "сверху по центру"], ["tr", "справа сверху"], ["bl", "слева снизу"], ["bc", "снизу по центру"], ["br", "справа снизу"], ["center", "по центру"], ["custom", "своё место"]] },
    { id: "clocksize", type: "select", group: "рабочий стол", label: "размер часов", hint: "насколько крупно время", value: "m", options: [["s", "мелкие"], ["m", "обычные"], ["l", "крупные"], ["xl", "очень крупные"], ["custom", "своё"]] },
    { id: "clockfont", type: "number", group: "рабочий стол", label: "свой размер часов, точек", hint: "работает при выборе «своё»", value: 34 },
    { id: "positions", type: "toggle", group: "рабочий стол", label: "сохранять состояние", hint: "какие окна открыты и как они расставлены", value: true }
  ],

  /* Ключевой цвет сайта: пресеты + свой из пипетки. */
  theme: {
    accent: "white",
    presets: [
      { id: "white", label: "белый", color: "#ffffff" },
      { id: "sand", label: "песок", color: "#a07844" },
      { id: "moss", label: "мох", color: "#6f8b52" },
      { id: "ocean", label: "океан", color: "#3d7196" },
      { id: "plum", label: "слива", color: "#8a5580" },
      { id: "coral", label: "коралл", color: "#c4644f" },
      { id: "graphite", label: "графит", color: "#4a5a66" }
    ]
  },

  pdf: {
    title: "заметка.pdf",
    pages: [
      {
        title: "страница 1 — зачем это",
        html: `<p>это окно документа. внутри — обычные страницы с текстом, которые листаются кнопками.</p>
<p>настоящий pdf здесь не рендерится: для этого нужна тяжёлая библиотека. зато кнопка внизу честно скачивает текст документа файлом .txt.</p>
<p>замени страницы в data.pdf.pages на свой текст — и всё.</p>`
      },
      {
        title: "страница 2 — из чего состоит",
        html: `<p>скелетон не требует сборки. файлы лежат рядом и подключаются по порядку:</p>
<p>data.js — контент; apps.js — поведение окон; shell.js — окна и док; shell.css и apps.css — внешний вид.</p>
<p>чтобы добавить новое окно, достаточно новой записи в windows и нового типа в apps.js.</p>`
      },
      {
        title: "страница 3 — как запустить",
        html: `<p>открой index.html двойным кликом. если браузер ограничивает локальные файлы, запусти простой сервер:</p>
<p>python3 -m http.server 8000</p>
<p>и зайди на localhost:8000. для публикации подойдёт любой статический хостинг.</p>`
      }
    ]
  }
};
