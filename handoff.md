# HANDOFF: DeepSeek -> Antigravity

- **Status**: шаги 1, 2, 2.5, 3 готовы. Открытых шагов нет.
- **Target Files**: `editor.js` (пресеты `presetsBlock`, `showPresetNotice`, `renderEditor`, appsTab `addPage`), `editor.css` (`.ed-save-*`), `shell.js` (`WindowManager.sync`), `data.js`.
- **Contract / Types**:
  - Окна: `DATA.windows` = `{id,type,title,label,iconKey,width,pinned,page?}`; id терминала — `"term"` (не `"terminal"`).
  - Пресеты: `p.apply()` меняет `draft`, затем `applyDraft()` → `commit()` → `WindowManager.sync()` (сам перерисовывает тела окон и настройки).
  - Плашка пресета: `noticeActive` глушит `setStatus`, пока она видна.
- **Done**:
  1. `noticeActive` + `setStatus` guard (`editor.js` ~L17–L70), `showPresetNotice` держит флаг, клик пресета всегда делает `saveDraft()+renderPanel()`.
  2. «сохранить сайт» — меню `<details class="ed-save-menu">` (`editor.js` ~L2920), стили `.ed-save-*` (`editor.css` ~L113).
  3. Пресеты: убран `window.confirm` (браузер его блокировал — клик молчал), сохранение синхронное, id терминала исправлен на `"term"`.
  4. Вкладка «приложения»: «+ своё приложение», подписи «приложение N», «текст и содержимое приложения:»; удалён дублирующий блок «содержимое своих страниц» (давал вторую карточку «страница документа»).
- **Шаг 3 (сверка сброса и экспорта)**: все ключи localStorage из `shell.js` (settings, accent, wallpaper, positions, state, clock-pos) чистятся в `resetAll`; `syncLocalStorageWithDraft` пишет только id настроек и цвет акцента — ровно то, что читает `loadSettings`/`themeColor`; `project.json` = `{format:"desktop-project", version:1, savedAt, data}` без окна `type:"editor"`; оба пути сохранения делают `commit()` до сборки. Добавлен `restoreDefaultLayout()` — после сброса и пресета «по умолчанию» окна открываются/закрываются как в `data.js` (`open: true`).
- **Next Step**: нет; следующий запрос пользователя.
- **Verification**: `node --check editor.js && node --check apps.js && node --check shell.js`
