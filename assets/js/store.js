/* Shared content storage + cross-window messaging for the game and /admin. */
(function () {
  'use strict';
  const F = (window.FEUD = window.FEUD || {});

  F.KEYS = {
    content: 'seedsFeud.content.v1',
    game: 'seedsFeud.game.v1'
  };

  F.clone = (o) => JSON.parse(JSON.stringify(o));
  F.uid = () => 'q' + Math.random().toString(36).slice(2, 9);

  const HEX = /^#[0-9a-f]{6}$/i;
  const color = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
  const str = (v, fallback) => (typeof v === 'string' ? v : fallback);

  F.normalize = function (raw) {
    const d = F.clone(window.FEUD_DEFAULTS);
    const c = raw && typeof raw === 'object' ? raw : {};
    const b = c.branding || {};
    const t = c.theme || {};
    const s = c.settings || {};
    const teams = Array.isArray(c.teams) ? c.teams : [];

    const out = {
      version: 1,
      branding: {
        title: str(b.title, d.branding.title),
        edition: str(b.edition, d.branding.edition),
        tagline: str(b.tagline, d.branding.tagline),
        surveyLabel: str(b.surveyLabel, d.branding.surveyLabel),
        logo: ['horizontal', 'vertical', 'custom', 'none'].includes(b.logo) ? b.logo : d.branding.logo,
        customLogo: str(b.customLogo, '')
      },
      theme: {
        bg: color(t.bg, d.theme.bg),
        surface: color(t.surface, d.theme.surface),
        accent: color(t.accent, d.theme.accent),
        accentLight: color(t.accentLight, d.theme.accentLight)
      },
      teams: [0, 1].map((i) => ({
        name: str((teams[i] || {}).name, d.teams[i].name),
        color: color((teams[i] || {}).color, d.teams[i].color)
      })),
      settings: {
        sound: typeof s.sound === 'boolean' ? s.sound : d.settings.sound,
        strikes: Math.min(5, Math.max(1, Math.round(+s.strikes) || d.settings.strikes)),
        showPoints: typeof s.showPoints === 'boolean' ? s.showPoints : d.settings.showPoints
      },
      questions: Array.isArray(c.questions) ? c.questions : d.questions
    };

    out.questions = out.questions.map((q) => ({
      id: str(q && q.id, '') || F.uid(),
      text: str(q && q.text, ''),
      multiplier: [1, 2, 3].includes(+(q && q.multiplier)) ? +q.multiplier : 1,
      answers: (Array.isArray(q && q.answers) ? q.answers : []).slice(0, 8).map((a) => ({
        text: str(a && a.text, ''),
        points: Math.max(0, Math.min(999, Math.round(+(a && a.points)) || 0))
      }))
    }));
    return out;
  };

  /* Load order: this device's saved edits → published content.json → built-in defaults. */
  F.loadContent = async function (base) {
    try {
      const raw = localStorage.getItem(F.KEYS.content);
      if (raw) return F.normalize(JSON.parse(raw));
    } catch (e) { /* fall through */ }
    try {
      const res = await fetch((base || '') + 'content.json', { cache: 'no-store' });
      if (res.ok) return F.normalize(await res.json());
    } catch (e) { /* fall through */ }
    return F.normalize(null);
  };

  F.saveContent = function (content) {
    localStorage.setItem(F.KEYS.content, JSON.stringify(content));
    F.post({ type: 'content' });
  };

  F.clearContent = function () {
    localStorage.removeItem(F.KEYS.content);
    F.post({ type: 'content' });
  };

  /* Answers as they appear on the board: non-empty, ranked by points, max 8. */
  F.answersFor = (q) =>
    (q ? q.answers : [])
      .filter((a) => a.text.trim())
      .map((a, i) => ({ ...a, _i: i }))
      .sort((a, b) => b.points - a.points || a._i - b._i)
      .slice(0, 8);

  F.logoSrc = function (content, base) {
    const b = content.branding;
    if (b.logo === 'none') return '';
    if (b.logo === 'custom' && b.customLogo) return b.customLogo;
    return (base || '') + (b.logo === 'vertical' ? 'assets/img/logo-v.png' : 'assets/img/logo-h.png');
  };

  F.applyTheme = function (content) {
    const r = document.documentElement.style;
    const t = content.theme;
    r.setProperty('--bg', t.bg);
    r.setProperty('--surface', t.surface);
    r.setProperty('--accent', t.accent);
    r.setProperty('--accent-2', t.accentLight);
    r.setProperty('--team-a', content.teams[0].color);
    r.setProperty('--team-b', content.teams[1].color);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.bg);
  };

  F.channel = 'BroadcastChannel' in window ? new BroadcastChannel('seedsFeud') : null;
  F.post = function (msg) {
    try { if (F.channel) F.channel.postMessage(msg); } catch (e) { /* ignore */ }
  };

  F.escape = (s) =>
    String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
})();
