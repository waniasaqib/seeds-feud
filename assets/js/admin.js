/* Game Studio: edit every piece of game content. Saves to this browser automatically. */
(async function () {
  'use strict';
  const F = window.FEUD;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = F.escape;

  let content = await F.loadContent('../');
  F.applyTheme(content);

  const ICON = {
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" style="stroke-width:2.6"><path d="M12 5v14M5 12h14"/></svg>',
    sort: '<svg viewBox="0 0 24 24"><path d="M7 4v16M3 16l4 4 4-4M14 6h7M14 12h5M14 18h3"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  const SWATCHES = ['#4FB06D', '#8AD09B', '#F4C95D', '#5BC0EB', '#FF7A59', '#FF5C8A', '#A78BFA', '#FFFFFF'];
  const THEME_FIELDS = [
    ['bg', 'Background', 'Page colour'],
    ['surface', 'Surface', 'Tiles & cards'],
    ['accent', 'Accent', 'Revealed answers'],
    ['accentLight', 'Highlight', 'Numbers & labels']
  ];

  /* ---------- Saving ---------- */
  let saveTimer;
  const saveState = $('#saveState');
  function save(now) {
    saveState.classList.add('saving');
    saveState.querySelector('span').textContent = 'Saving…';
    clearTimeout(saveTimer);
    const go = () => {
      try {
        F.saveContent(content);
        saveState.classList.remove('saving');
        saveState.querySelector('span').textContent = 'All changes saved';
      } catch (e) {
        saveState.querySelector('span').textContent = 'Could not save — storage full?';
        toast('Could not save. Try a smaller logo image.');
      }
      F.applyTheme(content);
      refreshPreviewSelect();
    };
    if (now) go(); else saveTimer = setTimeout(go, 350);
  }

  /* ---------- Generic bindings (data-bind="section.key") ---------- */
  function getPath(path) { return path.split('.').reduce((o, k) => o[k], content); }
  function setPath(path, v) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], content)[last] = v;
  }
  function fillBindings() {
    $$('[data-bind]').forEach((inp) => {
      const v = getPath(inp.dataset.bind);
      if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v;
    });
  }
  $$('[data-bind]').forEach((inp) => {
    inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
      setPath(inp.dataset.bind, inp.type === 'checkbox' ? inp.checked : inp.value);
      save();
    });
  });

  /* ---------- Tabs ---------- */
  function showTab(name) {
    if (!$('[data-panel="' + name + '"]')) name = 'questions';
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $$('.panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === name));
    history.replaceState(null, '', '#' + name);
  }
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) { showTab(b.dataset.tab); b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
  });

  /* ---------- Questions ---------- */
  const qList = $('#qList');

  function blankQuestion() {
    return { id: F.uid(), text: '', multiplier: 1, answers: Array.from({ length: 5 }, () => ({ text: '', points: 0 })) };
  }

  function questionHTML(q, qi, total) {
    const rows = q.answers.map((a, ai) =>
      '<li class="ans-row" data-ai="' + ai + '">' +
        '<span class="ans-rank">' + (ai + 1) + '</span>' +
        '<input type="text" class="a-text" value="' + esc(a.text) + '" placeholder="Answer ' + (ai + 1) + '" maxlength="40" aria-label="Answer ' + (ai + 1) + '">' +
        '<span class="pts-wrap"><input type="number" class="a-pts" inputmode="numeric" min="0" max="999" value="' + (a.points || '') + '" placeholder="0" aria-label="Points for answer ' + (ai + 1) + '"></span>' +
        '<button type="button" class="ans-del" data-act="delAns" title="Remove answer" aria-label="Remove answer">' + ICON.x + '</button>' +
      '</li>').join('');
    return '<article class="q-card" data-qi="' + qi + '">' +
      '<div class="q-top">' +
        '<span class="q-num">' + (qi + 1) + '</span>' +
        '<textarea class="q-text" rows="2" maxlength="160" placeholder="Name something people…" aria-label="Question ' + (qi + 1) + '">' + esc(q.text) + '</textarea>' +
        '<div class="q-tools">' +
          '<button type="button" data-act="play" title="Play this question now" aria-label="Play this question">' + ICON.play + '</button>' +
          '<button type="button" data-act="peek" title="Preview on the right" aria-label="Preview this question">' + ICON.eye + '</button>' +
          '<button type="button" data-act="up" title="Move up" aria-label="Move up"' + (qi === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
          '<button type="button" data-act="down" title="Move down" aria-label="Move down"' + (qi === total - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
          '<button type="button" data-act="dup" title="Duplicate" aria-label="Duplicate">' + ICON.copy + '</button>' +
          '<button type="button" data-act="del" class="del" title="Delete question" aria-label="Delete question">' + ICON.trash + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="q-meta">' +
        '<span class="meta-label">Points</span>' +
        '<div class="mult-seg" role="group" aria-label="Point multiplier">' +
          [1, 2, 3].map((m) => '<button type="button" data-act="mult" data-m="' + m + '" class="' + (q.multiplier === m ? 'on' : '') + '">' + (m === 1 ? 'Normal' : m === 2 ? 'Double' : 'Triple') + '</button>').join('') +
        '</div>' +
        '<span class="q-badges"></span>' +
      '</div>' +
      '<ol class="ans-list">' + rows + '</ol>' +
      '<div class="q-foot">' +
        '<button type="button" class="chip-btn green" data-act="addAns"' + (q.answers.length >= 8 ? ' disabled' : '') + '>' + ICON.plus + ' Add answer</button>' +
        '<button type="button" class="chip-btn" data-act="sort">' + ICON.sort + ' Sort by points</button>' +
      '</div>' +
    '</article>';
  }

  function grow(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 3 + 'px';
  }
  addEventListener('resize', () => $$('.q-text', qList).forEach(grow));

  function updateBadges(card) {
    const q = content.questions[+card.dataset.qi];
    const filled = q.answers.filter((a) => a.text.trim());
    const n = filled.length;
    const total = filled.reduce((s, a) => s + (a.points || 0), 0);
    let html = '';
    if (!q.text.trim()) html += '<span class="badge warn">Needs a question</span>';
    if (n < 5) html += '<span class="badge warn">' + n + ' of 5 answers — add ' + (5 - n) + ' more</span>';
    else html += '<span class="badge ok">✓ ' + n + ' answers</span>';
    html += '<span class="badge info">' + total + ' pts total</span>';
    card.querySelector('.q-badges').innerHTML = html;
  }

  function renderQuestions(focus) {
    const total = content.questions.length;
    qList.innerHTML = total
      ? content.questions.map((q, i) => questionHTML(q, i, total)).join('')
      : '<div class="empty">No questions yet. Add your first survey question!</div>';
    $$('.q-card', qList).forEach(updateBadges);
    $$('.q-text', qList).forEach(grow);
    $('#qCount').textContent = total;
    if (focus) {
      const card = qList.querySelector('[data-qi="' + focus.qi + '"]');
      if (card) {
        card.classList.add('flash');
        const target = focus.ai != null ? card.querySelectorAll('.a-text')[focus.ai] : focus.text ? card.querySelector('.q-text') : null;
        if (target) target.focus({ preventScroll: true });
        if (focus.scroll) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  qList.addEventListener('input', (e) => {
    const card = e.target.closest('.q-card');
    if (!card) return;
    const q = content.questions[+card.dataset.qi];
    if (e.target.matches('.q-text')) { q.text = e.target.value; grow(e.target); }
    else {
      const row = e.target.closest('.ans-row');
      if (!row) return;
      const a = q.answers[+row.dataset.ai];
      if (e.target.matches('.a-text')) a.text = e.target.value;
      if (e.target.matches('.a-pts')) a.points = Math.max(0, Math.min(999, Math.round(+e.target.value) || 0));
    }
    updateBadges(card);
    save();
  });

  // Enter in an answer field jumps to the next one (or adds a row).
  qList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('.a-text, .a-pts')) return;
    e.preventDefault();
    const card = e.target.closest('.q-card');
    const inputs = $$('.a-text, .a-pts', card);
    const idx = inputs.indexOf(e.target);
    if (inputs[idx + 1]) inputs[idx + 1].focus();
    else {
      const qi = +card.dataset.qi;
      const q = content.questions[qi];
      if (q.answers.length < 8) { q.answers.push({ text: '', points: 0 }); save(); renderQuestions({ qi, ai: q.answers.length - 1 }); }
    }
  });

  qList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const card = b.closest('.q-card');
    const qi = +card.dataset.qi;
    const qs = content.questions;
    const q = qs[qi];
    switch (b.dataset.act) {
      case 'mult':
        q.multiplier = +b.dataset.m;
        $$('.mult-seg button', card).forEach((x) => x.classList.toggle('on', x === b));
        save();
        break;
      case 'addAns':
        if (q.answers.length >= 8) return;
        q.answers.push({ text: '', points: 0 });
        save(); renderQuestions({ qi, ai: q.answers.length - 1 });
        break;
      case 'delAns': {
        const ai = +b.closest('.ans-row').dataset.ai;
        q.answers.splice(ai, 1);
        save(); renderQuestions({ qi });
        break;
      }
      case 'sort':
        q.answers.sort((a, c) => (c.points || 0) - (a.points || 0) || (a.text.trim() ? 0 : 1) - (c.text.trim() ? 0 : 1));
        save(); renderQuestions({ qi }); toast('Sorted by points');
        break;
      case 'up': case 'down': {
        const to = b.dataset.act === 'up' ? qi - 1 : qi + 1;
        if (to < 0 || to >= qs.length) return;
        [qs[qi], qs[to]] = [qs[to], qs[qi]];
        save(); renderQuestions({ qi: to, scroll: true });
        break;
      }
      case 'dup': {
        const copy = F.clone(q);
        copy.id = F.uid();
        qs.splice(qi + 1, 0, copy);
        save(); renderQuestions({ qi: qi + 1, scroll: true }); toast('Question duplicated');
        break;
      }
      case 'del':
        ask('Delete question ' + (qi + 1) + '?', q.text ? '“' + q.text + '” and its answers will be removed.' : 'This question will be removed.', 'Delete', () => {
          qs.splice(qi, 1); save(); renderQuestions(); toast('Question deleted');
        });
        break;
      case 'peek':
        setPreview(String(qi));
        if (innerWidth <= 1100) $('.a-preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'play':
        playFrom(qi);
        break;
    }
  });

  function addQuestion() {
    content.questions.push(blankQuestion());
    save();
    showTab('questions');
    renderQuestions({ qi: content.questions.length - 1, text: true, scroll: true });
  }
  $('#addQ').addEventListener('click', addQuestion);
  $('#addQ2').addEventListener('click', addQuestion);

  function playFrom(qi) {
    save(true);
    let prev = {};
    try { prev = JSON.parse(localStorage.getItem(F.KEYS.game)) || {}; } catch (e) { /* ignore */ }
    const game = {
      phase: 'faceoff', round: qi, scores: Array.isArray(prev.scores) ? prev.scores : [0, 0], bank: 0,
      revealed: [], unscored: [], strikes: 0, control: null, roundWinner: null, stolen: false, stealFailed: false, awarded: 0, v: (prev.v || 0) + 1
    };
    localStorage.setItem(F.KEYS.game, JSON.stringify(game));
    F.post({ type: 'state', game });
    location.href = '../';
  }

  /* ---------- Teams ---------- */
  function renderTeams() {
    $('#teamEditors').innerHTML = content.teams.map((t, i) =>
      '<div class="team-editor" data-t="' + i + '" style="--tc:' + t.color + '">' +
        '<div class="t-label"><i></i>Team ' + (i + 1) + '</div>' +
        '<input type="text" class="t-name" value="' + esc(t.name) + '" maxlength="28" placeholder="Team ' + (i + 1) + '" aria-label="Team ' + (i + 1) + ' name">' +
        '<div class="swatches">' +
          SWATCHES.map((c) => '<button type="button" class="swatch' + (c.toLowerCase() === t.color.toLowerCase() ? ' on' : '') + '" style="--c:' + c + '" data-c="' + c + '" aria-label="Colour ' + c + '"></button>').join('') +
          '<label class="swatch-custom" title="Pick any colour"><input type="color" class="t-color" value="' + t.color + '" aria-label="Custom colour"></label>' +
        '</div>' +
        '<div class="t-preview"><b>' + esc(t.name || 'Team ' + (i + 1)) + '</b><span>120</span></div>' +
      '</div>').join('');
  }
  function setTeamColor(i, c) {
    content.teams[i].color = c;
    const ed = $('.team-editor[data-t="' + i + '"]');
    ed.style.setProperty('--tc', c);
    $$('.swatch', ed).forEach((s) => s.classList.toggle('on', s.dataset.c.toLowerCase() === c.toLowerCase()));
    save();
  }
  $('#teamEditors').addEventListener('input', (e) => {
    const ed = e.target.closest('.team-editor');
    const i = +ed.dataset.t;
    if (e.target.matches('.t-name')) {
      content.teams[i].name = e.target.value;
      ed.querySelector('.t-preview b').textContent = e.target.value || 'Team ' + (i + 1);
      save();
    } else if (e.target.matches('.t-color')) setTeamColor(i, e.target.value);
  });
  $('#teamEditors').addEventListener('click', (e) => {
    const s = e.target.closest('.swatch');
    if (s) setTeamColor(+s.closest('.team-editor').dataset.t, s.dataset.c);
  });

  /* ---------- Look & feel ---------- */
  function renderLogo() {
    $$('input[name="logo"]').forEach((r) => (r.checked = r.value === content.branding.logo));
    const prev = $('#customLogoPrev');
    prev.innerHTML = content.branding.customLogo ? '<img src="' + esc(content.branding.customLogo) + '" alt="">' : '<em>Upload</em>';
  }
  $('#logoChoices').addEventListener('change', (e) => {
    if (e.target.name !== 'logo') return;
    if (e.target.value === 'custom' && !content.branding.customLogo) { $('#logoFile').click(); renderLogo(); return; }
    content.branding.logo = e.target.value;
    save();
  });
  $('#customLogoPrev').addEventListener('click', (e) => {
    if (content.branding.customLogo && content.branding.logo === 'custom') { e.preventDefault(); $('#logoFile').click(); }
  });
  $('#logoFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) return toast('That image is over 1.5 MB — try a smaller one');
    const reader = new FileReader();
    reader.onload = () => {
      content.branding.customLogo = reader.result;
      content.branding.logo = 'custom';
      renderLogo();
      save();
      toast('Logo uploaded');
    };
    reader.readAsDataURL(file);
  });

  function renderColors() {
    $('#themeColors').innerHTML = THEME_FIELDS.map(([k, label, sub]) =>
      '<label class="color-field"><input type="color" data-k="' + k + '" value="' + content.theme[k] + '"><span><b>' + label + '</b><small>' + content.theme[k] + '</small><br><small style="text-transform:none;font-family:inherit">' + sub + '</small></span></label>').join('');
  }
  $('#themeColors').addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    content.theme[k] = e.target.value;
    e.target.closest('.color-field').querySelector('small').textContent = e.target.value;
    save();
  });
  $('#resetColors').addEventListener('click', () => {
    content.theme = F.clone(window.FEUD_DEFAULTS.theme);
    renderColors();
    save();
    toast('Congress palette restored');
  });

  /* ---------- Rules ---------- */
  function renderStrikes() {
    $('#strikeSeg').innerHTML = [1, 2, 3, 4, 5].map((n) => '<button type="button" data-n="' + n + '" class="' + (content.settings.strikes === n ? 'on' : '') + '">' + n + '</button>').join('');
  }
  $('#strikeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-n]');
    if (!b) return;
    content.settings.strikes = +b.dataset.n;
    renderStrikes();
    save();
  });
  $('#resetGame').addEventListener('click', () => ask('Reset the current game?', 'Scores go back to zero and the game returns to the title screen.', 'Reset game', () => {
    localStorage.removeItem(F.KEYS.game);
    const game = { phase: 'intro', round: 0, scores: [0, 0], bank: 0, revealed: [], unscored: [], strikes: 0, control: null, roundWinner: null, stolen: false, stealFailed: false, awarded: 0, v: Date.now() };
    localStorage.setItem(F.KEYS.game, JSON.stringify(game));
    F.post({ type: 'state', game });
    toast('Game reset');
  }));

  /* ---------- Save & share ---------- */
  function exportJSON() { return JSON.stringify(content, null, 2); }
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'content.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Downloaded content.json');
  });
  $('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(exportJSON()); toast('Copied to clipboard'); }
    catch (e) { openPaste(exportJSON()); toast('Select all and copy the text'); }
  });
  function loadFrom(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { toast('That doesn’t look like valid game content'); return false; }
    if (!data || typeof data !== 'object' || !Array.isArray(data.questions)) { toast('No questions found in that file'); return false; }
    content = F.normalize(data);
    save(true);
    renderAll();
    toast('Loaded ' + content.questions.length + ' questions');
    return true;
  }
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) file.text().then(loadFrom);
  });
  function openPaste(text) {
    $('#pasteArea').value = text || '';
    $('#pasteModal').classList.add('show');
    setTimeout(() => { $('#pasteArea').focus(); if (text) $('#pasteArea').select(); }, 60);
  }
  $('#pasteBtn').addEventListener('click', () => openPaste(''));
  $('#pasteGo').addEventListener('click', () => { if (loadFrom($('#pasteArea').value)) $('#pasteModal').classList.remove('show'); });
  $('#pasteCancel').addEventListener('click', () => $('#pasteModal').classList.remove('show'));
  $('#resetAll').addEventListener('click', () => ask('Discard all your edits?', 'Questions, teams and colours go back to the published version. Download a backup first if you might want them later.', 'Discard edits', async () => {
    F.clearContent();
    content = await F.loadContent('../');
    renderAll();
    F.applyTheme(content);
    refreshPreviewSelect();
    toast('Back to the published content');
  }));

  /* ---------- Live preview ---------- */
  const frame = $('#preview');
  const previewSel = $('#previewQ');
  let previewTarget = 'intro';
  function refreshPreviewSelect() {
    const opts = [['intro', 'Title screen']].concat(content.questions.map((q, i) => [String(i), 'Q' + (i + 1) + ' · ' + (q.text || 'Untitled').slice(0, 34)]), [['gameOver', 'Winner screen']]);
    if (!opts.some((o) => o[0] === previewTarget)) previewTarget = 'intro';
    previewSel.innerHTML = opts.map(([v, l]) => '<option value="' + v + '"' + (v === previewTarget ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  }
  function setPreview(target) {
    previewTarget = target;
    refreshPreviewSelect();
    try { frame.contentWindow.postMessage({ type: 'preview', target }, location.origin); } catch (e) { /* ignore */ }
  }
  previewSel.addEventListener('change', () => setPreview(previewSel.value));
  frame.addEventListener('load', () => setPreview(previewTarget));
  function scalePreview() {
    const w = frame.parentElement.clientWidth;
    frame.style.transform = 'scale(' + w / 1280 + ')';
  }
  if ('ResizeObserver' in window) new ResizeObserver(scalePreview).observe(frame.parentElement);
  scalePreview();

  /* ---------- Modals / toast ---------- */
  let confirmCb = null;
  function ask(title, text, yes, cb) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = yes;
    confirmCb = cb;
    $('#confirm').classList.add('show');
  }
  $('#confirmYes').addEventListener('click', () => { $('#confirm').classList.remove('show'); if (confirmCb) confirmCb(); confirmCb = null; });
  $('#confirmNo').addEventListener('click', () => { $('#confirm').classList.remove('show'); confirmCb = null; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal.show').forEach((m) => m.classList.remove('show')); });
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); }));

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  // Edits made in another tab (e.g. sound toggled from the host menu)
  addEventListener('storage', async (e) => {
    if (e.key !== F.KEYS.content || document.activeElement.matches('input, textarea')) return;
    content = await F.loadContent('../');
    renderAll();
  });

  function renderAll() {
    fillBindings();
    renderQuestions();
    renderTeams();
    renderLogo();
    renderColors();
    renderStrikes();
    refreshPreviewSelect();
  }

  renderAll();
  showTab(location.hash.slice(1) || 'questions');
})();
