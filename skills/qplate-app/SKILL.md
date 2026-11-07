---
name: qplate-app
description: Добавить своё окно или приложение в qplate в стиле этого сайта — без библиотек и сборки.
---

# qplate-app

Скилл для qplate: как добавить новое окно так, чтобы оно не выбивалось из оболочки. Это правила именно qplate, а не общий гайд по вёрстке.

Когда применять: «добавь окно в qplate», «сделай приложение на этом рабочем столе», «собери страницу в стиле qplate».

## Шаги

1. Добавь иконку в `DATA.icons`, если нужна своя. Иконка — svg-строка с `stroke="currentColor"`.
2. Добавь запись окна в `DATA.windows`. Порядок записей = порядок иконок в доке.
3. Напиши функцию отрисовки в `apps.js`.
4. Зарегистрируй тип: `renderers.имя = { render: renderИмя }`.
5. При необходимости добавь стили в `apps.css` только через переменные qplate.
6. Проверь на 390 px, в тёмной теме и с выключенными анимациями.

## Запись окна

```js
{ id: "guestbook", type: "guestbook", title: "гостевая", label: "гостевая", iconKey: "notes", width: 480, height: 420 }
```

Обязательны `id` и `type`. `open: true` открывает окно при загрузке. `pinned: true` оставляет только это окно в готовом сайте — только для одного окна.

## Отрисовщик

```js
function renderGuestbook(body, cfg, ctx) {
  const app = document.createElement("div");
  app.className = "app-page";
  app.textContent = "здесь будет гостевая.";
  body.appendChild(app);
}

renderers.guestbook = { render: renderGuestbook };
```

`render(body, cfg, ctx)` получает контейнер, запись окна и контекст:

- `ctx.open(id)`, `ctx.close(id)`, `ctx.minimize(id)`, `ctx.toggle(id)`;
- `ctx.focus(id)`, `ctx.center(id)`;
- `ctx.applySetting(id, value)`, `ctx.getSettings()`, `ctx.getWindow(id)`.

Можно вернуть объект с хуками:

```js
return {
  onOpen: function () { /* окно открыли */ },
  onHide: function () { /* свернули или закрыли */ },
  onDestroy: function () { /* окно убрали */ }
};
```

## Правила qplate

- **цвета** — только `var(--accent)`, `var(--text)`, `var(--text-dim)`, `var(--surface-soft)`, `var(--surface-inset)`, `var(--surface-paper)`, `var(--border)`, `var(--border-dark)`, `var(--sand-dark)`, `var(--dock-bg)`. Свои hex не писать.
- **шрифт** — наследуется от `body`, новые шрифты не подключать.
- **форма** — окно 8 px, карточки 8–10 px, кнопки 6–8 px.
- **отступы** — 12, 16, 20 или 24 px; корень приложения — `class="app-page"`.
- **кнопки** — состояния `:hover`, `:focus-visible`, `:disabled`.
- **анимации** — 0.15–0.3 с; при `body.no-motion` выключать.
- **телефон** — проверять на 390 px, прокрутка через `.window-body`.
- **тёмная тема** — не хардкодить белый и чёрный фон.
- **данные** — контент хранить в `data.js`, отрисовщик только показывает.
- **запрещено** — библиотеки, сборка, глобальные селекторы, `z-index` > 900, инлайновые стили, ключи `localStorage` без префикса, `// TODO`.

## Готовые классы

`.app-page` — корень приложения с отступами.
`.content-heading` — заголовок внутри окна.
`.empty-note` — надпись «пусто».
`.icon-btn` — кнопка-иконка.
`.window-body` — прокручиваемая часть окна.
`.setting-row`, `.file-row` — готовые строки настроек и файлов.

Классы `.ed-*` — только для конструктора, в готовом сайте их нет.

## Проверка перед сдачей

- окно открывается из дока и не ломает другие;
- на 390 px ничего не обрезано;
- тёмная тема и крупный текст читаются;
- при выключенных анимациях всё работает;
- экспорт сайта сохраняет новое окно;
- в консоли нет ошибок.

Запуск: `python3 -m http.server 8000`, открыть `http://localhost:8000`.
