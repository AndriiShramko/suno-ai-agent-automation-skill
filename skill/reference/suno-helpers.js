// Suno AI browser helpers — verified 2026-09-09 against Suno web v5.5
// Paste the whole file into mcp__claude-in-chrome__javascript_tool in ONE call.
// Creates window.__suno. No screenshots needed: every function returns readable state.

window.__suno = {
  // ---------- React internals ----------
  rp(el) {
    const k = Object.keys(el).find(x => x.startsWith('__reactProps$'));
    return k ? el[k] : null;
  },
  fire(el, handler, extra) {
    const p = this.rp(el);
    if (!p || typeof p[handler] !== 'function') return false;
    p[handler](Object.assign({
      preventDefault() {}, stopPropagation() {},
      nativeEvent: {}, currentTarget: el, target: el, type: 'click'
    }, extra || {}));
    return true;
  },

  // ---------- controlled inputs (React) ----------
  setNative(el, v) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },

  // ---------- element locators ----------
  lyricsEl()  { return document.querySelector('div[aria-label="Lyrics editor"]'); },
  stylesEl()  { return document.querySelector('[data-testid="create-form-styles-wrapper"] textarea'); },
  excludeEl() { return document.querySelector('input[placeholder="Exclude styles"]'); },
  titleEl()   { return [...document.querySelectorAll('input[placeholder="Song Title (Optional)"]')]
                  .find(e => e.getBoundingClientRect().width > 0); },
  createBtn() { return [...document.querySelectorAll('button')]
                  .find(x => x.getAttribute('aria-label') === 'Create song'); },
  slider(label) { return [...document.querySelectorAll('[role="slider"]')]
                  .find(x => x.getAttribute('aria-label') === label); },

  // ---------- Lyrics: Lexical editor ----------
  // Only working method: real selection + selectionchange + paste Event whose
  // clipboardData is attached via defineProperty (constructor arg is ignored by Chrome).
  setLyrics(text) {
    const ed = this.lyricsEl();
    if (!ed) return false;
    ed.scrollIntoView({ block: 'center' });
    ed.focus();
    const sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(ed);
    sel.removeAllRanges(); sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));   // makes Lexical adopt the selection
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: dt });
    ed.dispatchEvent(ev);
    return true;
  },

  // ---------- form setup ----------
  async openAdvanced() {
    const tab = [...document.querySelectorAll('[role="tab"]')]
      .find(t => t.innerText.trim() === 'Advanced');
    if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    await new Promise(r => setTimeout(r, 1200));
    const mo = [...document.querySelectorAll('button')]
      .find(b => b.innerText.trim().startsWith('More Options'));
    if (mo && !this.excludeEl()) mo.click();
    await new Promise(r => setTimeout(r, 900));
    return {
      advanced: tab ? tab.getAttribute('aria-selected') : null,
      lyrics: !!this.lyricsEl(), styles: !!this.stylesEl(),
      exclude: !!this.excludeEl(), title: !!this.titleEl(), create: !!this.createBtn()
    };
  },

  async fill(cfg) {
    if (cfg.lyrics !== undefined) { this.setLyrics(cfg.lyrics); await new Promise(r => setTimeout(r, 700)); }
    if (cfg.styles  !== undefined) this.setNative(this.stylesEl(),  cfg.styles);
    if (cfg.exclude !== undefined) this.setNative(this.excludeEl(), cfg.exclude);
    if (cfg.title   !== undefined) this.setNative(this.titleEl(),   cfg.title);
    await new Promise(r => setTimeout(r, 800));
    return this.state();
  },

  state() {
    const b = this.createBtn();
    return {
      lyricsLen: this.lyricsEl() ? this.lyricsEl().innerText.length : null,
      stylesLen: this.stylesEl() ? this.stylesEl().value.length : null,
      excludeLen: this.excludeEl() ? this.excludeEl().value.length : null,
      title: this.titleEl() ? this.titleEl().value : null,
      sliders: [...document.querySelectorAll('[role="slider"]')]
        .map(s => s.getAttribute('aria-label') + '=' + s.getAttribute('aria-valuenow')),
      createDisabled: b ? (this.rp(b) || {}).disabled : null,
      hiddenTab: document.hidden
    };
  },

  // ---------- duration ----------
  durationCustom() {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Custom');
    if (btn) { btn.click(); return true; }
    return false;
  },

  // Sliders accept ONLY synthetic keydown, one press per render frame.
  // Max 8 presses per call — a hidden tab throttles timers and long loops hit the 45s CDP timeout.
  async nudgeSlider(label, target, maxSteps = 8) {
    const el = this.slider(label);
    if (!el) return { ok: false, err: 'slider not found: ' + label };
    el.scrollIntoView({ block: 'center' });
    const now = () => +el.getAttribute('aria-valuenow');
    for (let i = 0; i < maxSteps; i++) {
      const cur = now();
      if (cur === target) break;
      const dir = cur < target ? 'ArrowRight' : 'ArrowLeft';
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: dir, code: dir, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 220));
    }
    return { label, value: now(), target, reached: now() === target };
  },

  // ---------- submit ----------
  // .click() and synthetic mouse events do NOT start generation. React onClick does.
  create() {
    const b = this.createBtn();
    if (!b) return { ok: false, err: 'Create song button not found' };
    if ((this.rp(b) || {}).disabled) return { ok: false, err: 'button disabled — form incomplete' };
    return { ok: this.fire(b, 'onClick') };
  },

  // ---------- verification (read-only GETs are allowed) ----------
  async token() { return await window.Clerk.session.getToken(); },

  async feed(n = 6) {
    const t = await this.token();
    const r = await fetch('https://studio-api-prod.suno.com/api/feed/v2?page=0',
      { headers: { Authorization: 'Bearer ' + t } }).then(x => x.json());
    return (r.clips || []).slice(0, n)
      .map(c => ({ title: c.title, status: c.status, created: (c.created_at || '').slice(0, 19) }));
  },

  async billing() {
    const t = await this.token();
    const r = await fetch('https://studio-api-prod.suno.com/api/billing/info/',
      { headers: { Authorization: 'Bearer ' + t } }).then(x => x.json());
    return {
      credits: r.total_credits_left, monthlyLimit: r.monthly_limit,
      monthlyUsage: r.monthly_usage, active: r.is_active,
      models: (r.models || []).map(m => m.name + ':' + m.external_key + (m.is_default_model ? ' (default)' : ''))
    };
  }
};
'suno helpers installed';
