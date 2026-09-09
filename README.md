# Suno AI Automation Skill for AI Agents — Claude Code, Cursor, and any browser-driving LLM

**Teach your AI agent to create music in Suno AI by itself — filling the real form on suno.com and pressing Create — without screenshots, without vision, and without paying for a separate API.**

This repository contains a ready-to-drop **agent skill**: a verified DOM map of the Suno web app plus a JavaScript helper library. Give it to Claude Code (or any agent that can run JavaScript in a browser tab) and it will open `suno.com/create`, paste lyrics into the Lexical editor, fill the style prompt, set exclude-styles, title and duration, submit the song, and confirm the generation actually started — all through text, in seconds.

> **Author:** Andrii Shramko · Open to collaboration — see [Work with me](#work-with-me).

---

## Why this exists

I generate a lot of music for 360° drone videos. Every time I asked Claude to do it, the same thing happened: it opened a browser, **took a screenshot, squinted at the pixels, guessed where a button was, clicked, took another screenshot to check whether it had hit it** — over and over. Slow, expensive in tokens, and wrong about half the time. A five-second task became a five-minute one.

That is a silly way to use a computer. The browser already knows exactly where everything is — the agent just has to ask the DOM instead of looking at a picture of it.

So I had Claude reverse-engineer the Suno web app properly, in one painful session: which selectors are stable, which input tricks the React and Lexical layers actually accept, which ones silently do nothing. Then I froze that knowledge into a skill, so no agent ever has to rediscover it. **Now the whole flow is text in, text out — no screenshots at all.**

I am publishing it because every person automating a modern web app with an AI agent hits exactly these walls.

---

## Questions this repository answers

- **How do I make Claude use Suno AI without screenshots?**
- **Can an AI agent generate music in Suno automatically, using my existing subscription instead of a paid API?**
- **How do I paste multi-line song lyrics into a Lexical contenteditable editor from JavaScript?** (`execCommand` loses your line breaks — the fix is here.)
- **Why does `.click()` not work on a React button, and what does?**
- **Why does `new ClipboardEvent('paste', {clipboardData})` do nothing in Chrome?**
- **Why do my synthetic key presses on an ARIA slider only register once?**
- **Why do browser-extension clicks silently fail when a tab is not visible?**
- **Is there a Claude Code skill for Suno AI?** Yes — this one.

---

## What is inside

```
skill/
├── SKILL.md                       # the procedure the agent follows
└── reference/
    ├── suno-dom-map.md            # verified selectors, limits, and every dead end mapped
    └── suno-helpers.js            # window.__suno — install once per tab, then call functions
```

### Install for Claude Code

```bash
git clone https://github.com/AndriiShramko/suno-ai-agent-automation-skill
cp -r suno-ai-agent-automation-skill/skill ~/.claude/skills/suno
```

Then just ask: *"make me a calm ambient track in Suno with these lyrics"* — the skill triggers on its own.

### Use with any other agent

Paste `skill/reference/suno-dom-map.md` into your agent's context and give it a tool that can execute JavaScript in a logged-in browser tab. That is the entire requirement. The skill assumes no vision, no OCR, and no coordinate clicking.

---

## The core findings (short version)

These are the things that cost hours to discover. Full detail, including everything that **does not** work, is in [`skill/reference/suno-dom-map.md`](skill/reference/suno-dom-map.md).

**Lyrics — a Lexical editor.** The only reliable way to set multi-line text:

```js
ed.focus();
const sel = getSelection(), r = document.createRange();
r.selectNodeContents(ed);
sel.removeAllRanges(); sel.addRange(r);
document.dispatchEvent(new Event('selectionchange'));   // Lexical must be told about the selection
const dt = new DataTransfer(); dt.setData('text/plain', text);
const ev = new Event('paste', {bubbles:true, cancelable:true});
Object.defineProperty(ev, 'clipboardData', {value: dt});  // Chrome ignores the constructor argument
ed.dispatchEvent(ev);
```

**React-controlled inputs.** Assigning `.value` is invisible to React. Call the prototype's native setter, then dispatch `input` and `change`.

**The submit button.** `.click()` and a full synthetic pointer/mouse sequence both reach the element and both do nothing. Reading the React props off the DOM node and invoking `onClick` directly works:

```js
const k = Object.keys(btn).find(x => x.startsWith('__reactProps$'));
btn[k].onClick({preventDefault(){}, stopPropagation(){}, nativeEvent:{}, currentTarget:btn, target:btn, type:'click'});
```

**ARIA sliders.** Pointer events are ignored. Synthetic `keydown` works, but `aria-valuenow` updates asynchronously — one press per render frame, ~200 ms apart. A synchronous loop moves the slider exactly one step and then spins uselessly.

**Hidden tabs.** When the browser window is not in front, `document.hidden === true`: extension-driven clicks and key presses never reach the page at all, and timers get throttled hard enough to blow a 45-second CDP timeout. Drive everything from JavaScript and keep each call short.

**Verify, do not assume.** A submitted song shows up as `POST /api/generate/v2-web/ → 200` in the network log. If you only see `billing/*` calls, nothing was generated — no matter how convincing the UI looked.

---

## Scope and honesty

- Works with **your own Suno subscription**, in your own logged-in browser. It automates the UI you already pay for; it does not unlock anything or bypass limits.
- Read-only account calls (`billing/info`, `feed/v2`) are used only to confirm results.
- Verified on **2026-09-09** against Suno web, model v5.5 (`chirp-fenix`). Web apps change — if a selector breaks, the reconnaissance snippet in the DOM map regenerates the whole picture in one call, and the skill instructs the agent to update this repo when it does.
- Not affiliated with or endorsed by Suno. "Suno" is the trademark of its owner.

---

## Work with me

I am Andrii Shramko. I work on 360°/VR capture, 3D Gaussian Splatting, drone cinematography, and AI agent tooling — and I am genuinely excited about agents that operate real software instead of describing it. **I am open to collaboration, partnership, licensing, funding, and to building or leading a team around this kind of work.**

If you are building agent tooling, automating creative pipelines, or working on 3DGS/4DGS and immersive video — get in touch.

- **LinkedIn:** https://www.linkedin.com/in/andrii-shramko/
- **Book a call:** https://calendar.app.google/Ff729HqGk4RpzPNDA
- **Email:** zmei116@gmail.com
- **GitHub:** https://github.com/AndriiShramko

Contributions welcome: if you map another part of the Suno UI (Personas, Extend, Cover, Studio), open a pull request.

---

## License

[CC BY 4.0](LICENSE) — use it commercially, modify it, build on it. Just keep the attribution to **Andrii Shramko**.
