# Для ИИ-агентов и разработчиков

Короткая памятка по скелетону рабочего стола. Без сборки, без пакетов:
чистые html, css и js.

## Запуск

    python3 -m http.server 8000

и открыть http://localhost:8000. Двойной клик по index.html тоже работает,
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
- `windows` — `{ id, type, title, label, iconKey, width, open? }`.
  Порядок = порядок иконок в доке.
- `notes` — `{ date, title, mode, text, html, links }`.
- `pdf` — `{ title, pages: [{ title, mode, text, html, links }] }`.
- `browser.tabs` — `{ id, title, url, heading, mode, text, html, links }`.
- `terminal.paths` — команды: `{ label, desc, action, ... }`,
  `action`: `text` | `open` | `link` | `code`.
- `photos` — `{ src, title, note }`.
- `music` — `{ cover, album, tracks: [{ title, artist, seconds }] }`.
- `files` — дерево файлового окна.
- `settings` — пункты окна настроек:
  `{ id, type, group, label, hint, value, options? }`,
  `type`: `select` | `toggle` | `wallpaper`.
- `theme` — `{ accent, presets: [{ id, label, color }] }`.
- Замки: `item.hidden` убирает пункт из окна настроек,
  `item.locked: ["dark"]` запрещает выбирать вариант,
  `theme.locked: ["sand"]` убирает цвет из палитры,
  `theme.lockedCustom: true` убирает пипетку.
  `applySetting` в `shell.js` игнорирует заблокированные значения.

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

Вкладки: проект, заметки, документы, браузер, фото, музыка,
настройки, терминал, приложения.

Вкладка «настройки» правит `DATA.settings` и `DATA.theme`:
значение по умолчанию, запрет вариантов (`locked`), скрытие пункта
(`hidden`), запрет цветов и пипетки. Всё это попадает в `data.js`
при экспорте и действует сразу после «применить».

## Правила правок

- Не заменять объект `DATA`, только его поля: отрисовщики держат ссылку.
- После изменения `DATA` вызывать `WindowManager.sync()`.
- Держать `.bak` копию до правки.
- Не добавлять библиотеки и сборку без явной просьбы.
- Не оставлять заглушек `// TODO` в рабочем коде.
- Не удалять рабочие отрисовщики и команды.

## Ограничения

- Плеер музыки показывает треки, но не проигрывает файлы.
- Картинки из конструктора хранятся как data-url (сжимаются до 1400 px).
- Лимит localStorage может закончиться на очень больших фото.
- Позиции окон хранятся в localStorage, если включён пункт «запоминать окна».
