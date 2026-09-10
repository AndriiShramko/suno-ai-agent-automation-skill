# Suno AI — карта DOM и рабочие приёмы

**Проверено вживую:** 2026-09-10 (первичная карта 2026-09-09), Suno web, модель по умолчанию **v5.5** (`chirp-fenix`), план Pro.
Каждая строка ниже получена экспериментом в браузере, а не из документации.

## 0. Изменения 2026-09-10

- URL теперь несёт режим: `/create?mode=SIMPLE`. Страница может открыться в **Simple**, даже если прошлая сессия была в Advanced.
- **Переключение вкладки режима сломалось для `.click()`.** У `[role="tab"]` больше **нет** `onClick` — только `onKeyDown`, `onMouseDown`, `onPointerDown`. Работает вызов `onPointerDown` с **полными полями pointer-события**:
  ```js
  p.onPointerDown({preventDefault(){},stopPropagation(){},nativeEvent:{},currentTarget:tab,target:tab,
                   type:'pointerdown',button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true});
  ```
  Обрезанный объект `{type:'click'}` не срабатывает.
- Появился четвёртый слайдер — **`Variety`** (наблюдалось значение 1). Назначение не проверялось.
- **Диагностика «я не в Advanced»:** если `setNative` падает с `TypeError: Illegal invocation`, значит `[data-testid="create-form-styles-wrapper"] textarea` вернул не-textarea — страница в Simple. Сначала переключить режим, потом заполнять.
- Кнопка Create по-прежнему работает через `onClick` (у неё он есть, в отличие от табов).

---

## 1. Раскладка страницы `/create`

Вкладки режима — `[role="tab"]` с текстом `Simple` / `Advanced` / `Sounds`.
Активная помечена `aria-selected="true"`. Переключение обычным `.click()` работает.

В режиме **Advanced** левая панель сверху вниз:

| Блок | Селектор | Тип | Лимит |
|---|---|---|---|
| Lyrics | `div[aria-label="Lyrics editor"]` | contenteditable, **Lexical** (`data-lexical-editor="true"`) | 5000 |
| Styles | `[data-testid="create-form-styles-wrapper"] textarea` | textarea | 1000 |
| More Options | `button`, innerText начинается с `More Options` | сворачивается | — |
| ├ Exclude styles | `input[placeholder="Exclude styles"]` | input | 1000 |
| ├ Vocal Gender | кнопки `Male` / `Female` | — | — |
| ├ Duration | кнопки `Auto` / `Custom`; в Custom — `[role="slider"][aria-label="Duration"]` | слайдер | 10–360 с, шаг 5 |
| ├ Weirdness | `[role="slider"][aria-label="Weirdness"]` | слайдер | 0–100, шаг 1 |
| └ Style Influence | `[role="slider"][aria-label="Style Influence"]` | слайдер | 0–100, шаг 1 |
| Song Title | `input[placeholder="Song Title (Optional)"]` (взять видимый — их два в DOM) | input | 100 |
| Create | `button[aria-label="Create song"]` | Base UI button | — |

**Ловушки распознавания:**
- Placeholder поля Lyrics **не постоянен** — Suno ротирует примеры («Light russian pop song about escapism»). Опознавать только по `aria-label="Lyrics editor"`.
- В DOM есть скрытые textarea других режимов (Simple — maxlength 3000, Sounds — 500) с `visibility:hidden`. Не путать со Styles.
- Кнопок с текстом `Create` может быть несколько (навигация слева, «Create new workspace»). Единственный надёжный признак — `aria-label="Create song"`.

---

## 2. Lyrics — единственный работающий способ вставки

Lexical перехватывает ввод, поэтому обычные приёмы ломаются.

```js
const ed = document.querySelector('div[aria-label="Lyrics editor"]');
ed.scrollIntoView({block:'center'});
ed.focus();
const sel = getSelection(), r = document.createRange();
r.selectNodeContents(ed);
sel.removeAllRanges(); sel.addRange(r);
document.dispatchEvent(new Event('selectionchange'));  // ← без этого Lexical не видит выделение
const dt = new DataTransfer(); dt.setData('text/plain', text);
const ev = new Event('paste', {bubbles:true, cancelable:true});
Object.defineProperty(ev, 'clipboardData', {value: dt});  // ← конструктор ClipboardEvent игнорируется Chrome
ed.dispatchEvent(ev);
```

Этот вызов **заменяет** содержимое целиком и сохраняет переносы строк и пустые строки — разметка `[Verse 1]`, `[Instrumental break]` доходит без искажений.

**Проверено нерабочим:**
- `execCommand('insertText', false, text)` — вставляет, но склеивает все строки в одну.
- `execCommand('insertParagraph')` — Lexical игнорирует, параграфы не создаются.
- `execCommand('selectAll')` / `execCommand('delete')` — не очищают, новый текст дописывается в конец.
- `new ClipboardEvent('paste', {clipboardData: dt})` — Chrome отбрасывает clipboardData.
- `navigator.clipboard.writeText()` — `NotAllowedError` (нет пользовательского жеста).
- Range-выделение **без** `dispatchEvent(new Event('selectionchange'))` — вставка идёт в конец, старый текст остаётся.

---

## 3. Styles / Exclude / Title — React-контролируемые поля

Присваивание `el.value` React не заметит. Нужен нативный сеттер прототипа:

```js
const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(proto,'value').set.call(el, value);
el.dispatchEvent(new Event('input',{bubbles:true}));
el.dispatchEvent(new Event('change',{bubbles:true}));
```

---

## 4. Слайдеры

Реагируют **только** на синтетический `keydown` (`ArrowLeft` / `ArrowRight`) при `el.focus()`.
`aria-valuenow` обновляется **асинхронно** — за один тик применяется одно нажатие, поэтому синхронный цикл бесполезен: нужна пауза ≥200 мс между нажатиями.

Не работает: `pointerdown`/`pointermove`/`pointerup`, `mousedown`+`mouseup` по координате трека, подмена `hasPointerCapture`. Элемент `[role="slider"]` — это сам трек шириной ~181 px, а не бегунок.

**Троттлинг:** если `document.hidden === true`, Chrome режет таймеры (intensive throttling), и проход в 20+ нажатий упирается в CDP-таймаут 45 с. Поэтому за один вызов делать **≤8 шагов** и повторять вызов.

Есть также `input[placeholder="Auto"]` (`type=number`, min 1, max 300) — **не связан** со слайдером Duration, менять его бесполезно.

---

## 5. Кнопка Create

```js
const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label')==='Create song');
const k = Object.keys(b).find(x => x.startsWith('__reactProps$'));
b[k].onClick({preventDefault(){}, stopPropagation(){}, nativeEvent:{}, currentTarget:b, target:b, type:'click'});
```

Проверено нерабочим: `.click()`, полная цепочка `pointerover/mousedown/pointerdown/pointerup/mouseup/click` с корректными `clientX/clientY`. События до кнопки доходят (`isTrusted:false` фиксируется слушателем), но генерация не стартует.

`(b.__reactProps$*).disabled === true`, пока форма не заполнена — это надёжный индикатор готовности формы, лучше чем `b.disabled`.

---

## 6. Признак успеха

В сетевом логe (`mcp__claude-in-chrome__read_network_requests`) после нажатия должно появиться:

```
POST https://studio-api-prod.suno.com/api/generate/v2-web/   → 200
POST https://studio-api-prod.suno.com/api/c/check            → 200
```

Если вместо этого только `billing/info`, `usage-plan-*`, `auto-reload/nudge-check` — **генерация не запущена**, сработала проверка биллинга.

URL меняется на `?wid=default` при любом нажатии — это не признак успеха.

---

## 7. Чтение состояния аккаунта (read-only GET, разрешено)

```js
const t = await window.Clerk.session.getToken();
await fetch('https://studio-api-prod.suno.com/api/billing/info/', {headers:{Authorization:'Bearer '+t}}).then(r=>r.json());
await fetch('https://studio-api-prod.suno.com/api/feed/v2?page=0', {headers:{Authorization:'Bearer '+t}}).then(r=>r.json());
```

`billing/info` даёт `total_credits_left`, `monthly_limit`, `monthly_usage`, `models[]`.
`feed/v2` даёт `clips[]` со статусами: `streaming` → `complete`.

Модели (все `can_use: true` на Pro): v5.5 `chirp-fenix` (default), v5 `chirp-crow`, v4.5+ `chirp-bluejay`, v4.5 `chirp-auk`, v4.5-all `chirp-auk-turbo`, v4 `chirp-v4`, v3.5 `chirp-v3-5`.

**Пишущие запросы** (`POST /api/generate/...`) напрямую из `javascript_tool` блокируются классификатором Claude Code. Генерацию запускать только через React onClick.

---

## 8. Ограничения окружения

| Факт | Следствие |
|---|---|
| `document.hidden === true`, когда окно Chrome не на переднем плане | `computer.left_click` и `computer.key` **не доходят до страницы вообще** (слушатель событий пуст). Работать только через `javascript_tool`. |
| Таймеры троттлятся в скрытой вкладке | Держать `await` в скрипте короткими; общий бюджет вызова < 45 с (CDP-таймаут). |
| Координаты `computer` ≠ CSS-пиксели | Коэффициент `k = ширина_скриншота / window.innerWidth` (на машине Андрея 1568/2560 = 0.6125). Нужен только если придётся кликать мышью — обычно не нужен. |

---

## 9. Разведка при поломке селекторов

```js
({
  tabs: [...document.querySelectorAll('[role="tab"]')].map(t=>t.innerText.trim()+':'+t.getAttribute('aria-selected')),
  contentEditable: [...document.querySelectorAll('[contenteditable]')].map(e=>e.getAttribute('aria-label')),
  textareas: [...document.querySelectorAll('textarea')].map(e=>({ph:e.placeholder.slice(0,40), max:e.maxLength, vis:getComputedStyle(e).visibility})),
  inputs: [...document.querySelectorAll('input')].filter(e=>e.placeholder).map(e=>e.placeholder),
  sliders: [...document.querySelectorAll('[role="slider"]')].map(s=>s.getAttribute('aria-label')+' '+s.getAttribute('aria-valuemin')+'-'+s.getAttribute('aria-valuemax')),
  testids: [...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid')),
  ariaButtons: [...document.querySelectorAll('button[aria-label]')].map(b=>b.getAttribute('aria-label')).slice(0,40)
})
```

После находки — обновить этот файл, проставить новую дату проверки и запушить в публичное зеркало.
