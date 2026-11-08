# Для ИИ-агентов и разработчиков

Короткая памятка по скелетону рабочего стола. Без сборки, без пакетов:
чистые html, css и js.

## Запуск

    python3 -m http.server 6767

и открыть http://localhost:6767. Двойной клик по index.html тоже работает,
но сохранение в папку и чтение исходников требуют сервер.

## Файлы

| файл | роль |
| --- | --- |
| index.html | точка входа, подключает css и js по порядку |
| data.js | весь контент и список окон (единственный файл для правок контента) |
| apps.js | отрисовка окон, регистрация в `window.APP_RENDERERS` |
| shell.js | окна, док, тема, настройки, `window.WindowManager` |
| shell.css | каркас, док, окна, тема |
| apps.css | содержимое окон |
| editor.css / editor.js | конструктор (в готовый сайт не попадает) |

Порядок подключения: data.js → apps.js → shell.js → editor.js.
`editor.js` добавляет отрисовщик `editor` в тот же реестр.

## Как устроено

- `data.js` задаёт `window.DATA`.
- `shell.js` на старте строит окна и док из `DATA.windows`.
- `apps.js` регистрирует отрисовщики: `window.APP_RENDERERS[тип] = { render }`.
  `render(body, cfg, ctx)` получает контейнер, конфиг окна и контекст.
- `ctx` умеет: `open`, `close`, `minimize`, `toggle`, `focus`,
  `applySetting`, `getTheme`, `getSettings`, `getWindow`.
- Кнопки окон, перетаскивание и жизненный цикл — в `shell.js`.

## Схема data.js

- `meta` — название сайта, имя пользователя, подпись.
- `icons` — svg-строки по ключам.
- `windows` — `{ id, type, title, label, iconKey, width, open?, pinned? }`.
  Порядок = порядок иконок в доке. `pinned: true` делает окно главным:
  в готовом сайте остаётся только оно, без дока и управления.
- `notes` — `{ date, title, mode, text, html, links }`.
- `pdf` — `{ title, pages: [{ title, mode, text, html, links }] }`.
- `browser.tabs` — `{ id, title, url, heading, mode, text, html, links }`.
- `terminal.paths` — команды: `{ label, desc, action, ... }`,
  `action`: `text` | `open` | `link` | `code`.
- `photos` — `{ src, title, note }`.
- `music` — `{ note?, tracks: [{ title, artist, seconds, cover?, src? }] }`.
- `files` — дерево файлового окна:
  `{ name, type: "file", kind, src?, content? }`.
  `kind`: `text` | `image` | `audio` | `pdf` | `unknown`.
  Текст живёт в `content`, медиа — в `src` (data-url или путь).
  Если `kind` нет, он определяется по расширению.
- `settings` — пункты окна настроек:
  `{ id, type, group, label, hint, value, options?, min?, max? }`,
  `type`: `select` | `toggle` | `number` | `wallpaper`.
- `theme` — `{ accent, presets: [{ id, label, color }] }`.
- Замки: `item.hidden` убирает пункт из окна настроек,
  `item.locked: ["dark"]` запрещает выбирать вариант,
  `theme.locked: ["sand"]` убирает цвет из палитры,
  `theme.lockedCustom: true` убирает пипетку.
  `applySetting` в `shell.js` игнорирует заблокированные значения.

### Оформление, док и главное окно

- `style` — `desktop` | `win98` | `aero` | `hypr` | `glass`. Меняет только CSS
  через `body[data-style]`; ключевой цвет не трогает. `glass` включает Liquid Glass
  (iOS/macOS 26) с преломлением света через SVG-фильтр `feDisplacementMap`.
- `dockmode` — `float` | `iphone`, `docksize` — 28–64.
  Выставляются как `body[data-dockmode]` и `--dock-size`.
- `pinned` включает режим одного окна только когда в `DATA.windows`
  нет окна `type: "editor"`. Так исходник остаётся редактируемым.
- В готовом сайте главное окно нельзя закрыть, свернуть, тянуть и
  менять размер; док и панель хоткеев скрыты.
- В `hypr` хоткеи `alt+1…9` открывают окна по порядку `DATA.windows`;
  в полях ввода они не срабатывают.

### Два режима содержимого

`mode: "text"` — показываются абзацы из `text` и список `links`.
`mode: "html"` — показывается `html` как есть.
Старые записи без `mode` считаются html, если есть `html`
(заметки — текст из `body`).

### Команды терминала

- `text` — показать текст или html;
- `open` + `target` — открыть окно по id;
- `link` + `url` — открыть ссылку в новой вкладке;
- `code` + `code` — выполнить javascript.

Свой код выполняется через `new Function` и получает:
`print(значение)`, `open("id")`, `close("id")`, `link("адрес")`,
`data` (весь `DATA`). Ошибки перехватываются и печатаются в терминал.
Режим `all` не запускает код и не открывает окна.

## Добавить окно

1. `data.js` → `icons` новый svg и запись в `windows`.
2. `apps.js` → функция `renderX(body, cfg)`.
3. `apps.js` → `renderers.x = { render: renderX }`.
4. При необходимости стили в `apps.css`.

## Конструктор

- Черновик: `localStorage` ключ `desktop-project-v1`.
- «применить» → меняет поля `DATA` и вызывает `WindowManager.sync()`.
- `WindowManager.sync()` пересобирает окна и док из `DATA.windows`.
- `WindowManager.remove(id)` удаляет окно, `refresh(id)` перерисовывает.
- Экспорт фильтрует окно с `type: "editor"`.
- «сохранить сайт в папку» пишет index.html, data.js, css/js, README.md,
  project.json через File System Access API (Chrome/Edge/Opera).
- Без этого API — скачивание data.js и project.json.
- Файлы исходников читаются через `fetch`, поэтому нужен сервер.

Вкладки: проект, заметки, документы, браузер, файлы, фото, музыка,
настройки, терминал, приложения, гайд.

Вкладка «настройки» правит `DATA.settings` и `DATA.theme`:
значение по умолчанию, запрет вариантов (`locked`), скрытие пункта
(`hidden`), запрет цветов и пипетки. Всё это попадает в `data.js`
при экспорте и действует сразу после «применить».

## Правила разметки qplate

Это правила именно qplate, а не общий гайд по вёрстке.

- Цвета — только переменные: `--accent`, `--text`, `--text-dim`,
  `--surface-*`, `--border`, `--border-dark`, `--sand-dark`, `--dock-*`.
  Свои hex-цвета не писать.
- Шрифт наследуется от `body` (`--font-mono`), новые не подключать.
- Форма: окно 8 px, карточки 8–10 px, кнопки 6–8 px.
- Отступы: 12, 16, 20, 24 px. Корень приложения — `class="app-page"`.
- Кнопки: `:hover`, `:focus-visible`, `:disabled`.
- Анимации 0.15–0.3 с; при `body.no-motion` выключаются.
- Телефон — 390 px, прокрутка через `.window-body`.
- Тёмная тема — без хардкода белого и чёрного фона.
- Контент — в `data.js`, отрисовщик только показывает.
- Запрещено: библиотеки, сборка, глобальные селекторы, `z-index` > 900,
  инлайновые стили, ключи `localStorage` без префикса, `// TODO`.

Готовые классы: `.app-page`, `.content-heading`, `.empty-note`,
`.icon-btn`, `.window-body`, `.setting-row`, `.file-row`.
Классы `.ed-*` — только конструктор.

Пошаговый рецепт — `skills/qplate-app/SKILL.md` и вкладка «гайд».

## Правила правок

- Не заменять объект `DATA`, только его поля: отрисовщики держат ссылку.
- После изменения `DATA` вызывать `WindowManager.sync()`.
- Держать `.bak` копию до правки.
- Не добавлять библиотеки и сборку без явной просьбы.
- Не оставлять заглушек `// TODO` в рабочем коде.
- Не удалять рабочие отрисовщики и команды.

## Ограничения

- Плеер музыки играет mp3 из конструктора; без файла показывает только прогресс.
- Картинки из конструктора хранятся как data-url (сжимаются до 1400 px).
- Аудио и pdf из конструктора хранятся как data-url; большой файл может
  не поместиться в localStorage. Конструктор предупреждает после ~2 МБ.
- PDF из окна «файлы» показывает встроенный просмотрщик браузера;
  окно «документ» по-прежнему листает страницы из `data.pdf`.
- Лимит localStorage может закончиться на очень больших фото.
- Позиции окон хранятся в localStorage, если включён пункт «запоминать окна».
