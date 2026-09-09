---
name: suno
description: Создать музыку в Suno AI полностью автоматически — зайти на suno.com/create, заполнить Lyrics/Styles/Exclude/Title/Duration и нажать Create через DOM-автоматизацию, БЕЗ скриншотов и БЕЗ платного API. Вызывать при любой задаче «сделай трек в Suno», «сгенерируй музыку», «залей текст песни в Suno».
version: 1.0.0
---

# /suno — генерация музыки в Suno AI без скриншотов

Ты управляешь Suno через `mcp__claude-in-chrome__javascript_tool`. **Скриншоты запрещены** — всё состояние читается из DOM текстом. Правило Андрея: «надоело, что Claude работает через скриншоты».

Полная карта DOM и все рабочие/нерабочие приёмы: `reference/suno-dom-map.md` (в этой же папке). **Прочитай её перед первой генерацией в сессии.**

## Быстрый путь

1. `mcp__claude-in-chrome__navigate` → `https://suno.com/create`
2. Установить хелперы: содержимое `reference/suno-helpers.js` выполнить через `javascript_tool` (один вызов). Он создаёт `window.__suno`.
3. `await window.__suno.openAdvanced()` — вкладка Advanced + раскрыть More Options.
4. `window.__suno.fill({lyrics, styles, exclude, title})` — вернёт длины полей. **Сверь их с ожидаемыми.**
5. Включить сетевой лог: `mcp__claude-in-chrome__read_network_requests` (первый вызов инициализирует трекинг).
6. `window.__suno.create()` — жмёт Create через React props.
7. Проверить: `read_network_requests` → должен быть `POST /api/generate/v2-web/` со статусом **200**. Без этой строки генерация НЕ запущена — не докладывай об успехе (правило #12).
8. Проверить результат: `await window.__suno.feed()` → массив клипов; статус идёт `streaming` → `complete`.

## Что НЕ работает (не трать на это время)

| Приём | Результат |
|---|---|
| `computer.left_click` / `computer.key` из расширения | Не доходит до страницы, если `document.hidden === true` (окно Chrome не на переднем плане). Лог событий пуст. |
| `.click()` на кнопке Create | Событие доходит, генерация НЕ стартует. Нужен React `onClick` из `__reactProps$*`. |
| `execCommand('insertText')` для Lyrics | Вставляет, но **склеивает все строки** — разметка `[Verse]` ломается. |
| `execCommand('selectAll'/'delete')` в Lyrics | Lexical игнорирует, старый текст остаётся, новый дописывается в конец. |
| `new ClipboardEvent('paste',{clipboardData})` | Chrome игнорирует clipboardData в конструкторе. Только `Object.defineProperty`. |
| `navigator.clipboard.writeText()` | `NotAllowedError` без пользовательского жеста. |
| Pointer-события на слайдерах | Значение не меняется. Только клавиатура. |
| Прямой `POST` на `studio-api-prod.suno.com/api/generate/...` | Блокируется классификатором Claude Code. Читающие `GET` (billing, feed) проходят. |

## Слайдеры (Duration / Weirdness / Style Influence)

Двигаются **только** синтетическим `keydown` ArrowLeft/ArrowRight с паузой ≥200 мс между нажатиями — по одному нажатию на кадр рендера.

**Ловушка:** в скрытой вкладке (`document.hidden`) Chrome троттлит таймеры, и длинный проход даёт CDP-таймаут 45 с. Поэтому `nudgeSlider` делает **не более 8 шагов за вызов** — вызывай его повторно, пока `reached !== true`.

Дефолты Weirdness 50 / Style Influence 50 приемлемы. Если ставить — для спокойной серии Weirdness ≈ 25, Style Influence ≈ 75.

Duration: сначала `window.__suno.durationCustom()`, потом `nudgeSlider('Duration', секунды)`. Диапазон 10–360 с, шаг 5.

## Правило самообновления знаний (обязательно)

Если что-то из карты DOM не сошлось — селектор не найден, приём перестал работать, появилось новое поле, изменились лимиты:

1. Выясни новый факт через DOM-разведку (см. раздел «Разведка» в `reference/suno-dom-map.md`).
2. **Сразу обнови** `reference/suno-dom-map.md` и, если менялась процедура, этот `SKILL.md`. Проставь дату проверки.
3. Запушь обновление в публичное зеркало: `https://github.com/AndriiShramko/suno-ai-agent-automation-skill` (папка `skill/`).
4. Скажи Андрею одной строкой, что именно изменилось на сайте.

Не спрашивай разрешения на обновление — это действие по умолчанию.

## Верификация перед докладом

Никогда не говори «трек создан», пока не выполнено ОБА:
- в сетевом логе есть `POST /api/generate/v2-web/` → 200;
- `window.__suno.feed()` вернул клипы с нужным `title`.

Если проверить нечем — скажи прямо «отправил, но не подтвердил».
