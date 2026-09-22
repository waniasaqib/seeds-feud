/* Family Feud game engine: state machine, rendering, host controls, board sync. */
(async function () {
  'use strict';
  const F = window.FEUD;
  const S = window.FEUD_SOUND;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = F.escape;

  const params = new URLSearchParams(location.search);
  const IS_BOARD = params.get('view') === 'board';
  const IS_PREVIEW = params.has('preview');
  document.body.classList.toggle('is-board', IS_BOARD);

  const LIVE = ['faceoff', 'play', 'steal'];
  const X_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  let content = await F.loadContent('');
  let game = loadGame();
  const undoStack = [];
  let fxQueue = [];
  let boardAliveAt = 0;
  let pendingFaceoff = null;
  let manualPeek = false;
  let boardKey = '';
  let lastRound = -1;

  /* ---------------- State ---------------- */
  function freshGame() {
    return {
      phase: 'intro', round: 0, scores: [0, 0], bank: 0,
      revealed: [], unscored: [], strikes: 0, control: null,
      roundWinner: null, stolen: false, stealFailed: false, awarded: 0, v: 0
    };
  }
  function loadGame() {
    try {
      const g = JSON.parse(localStorage.getItem(F.KEYS.game));
      if (g && g.phase) return Object.assign(freshGame(), g);
    } catch (e) { /* ignore */ }
    return freshGame();
  }

  const Q = () => content.questions[game.round] || null;
  const answers = () => F.answersFor(Q());
  const teamName = (i) => (content.teams[i] && content.teams[i].name.trim()) || 'Team ' + (i + 1);
  const teamColor = (i) => content.teams[i].color;
  const mult = () => (Q() ? Q().multiplier : 1);
  const strikeLimit = () => content.settings.strikes;
  const other = (t) => 1 - t;

  function snapshot() {
    undoStack.push(JSON.stringify(game));
    if (undoStack.length > 100) undoStack.shift();
  }
  function queue(kind, data) { fxQueue.push({ kind, data: data || {} }); }
  function commit() {
    game.v = (game.v || 0) + 1;
    try { localStorage.setItem(F.KEYS.game, JSON.stringify(game)); } catch (e) { /* ignore */ }
    F.post({ type: 'state', game });
    render();
    const list = fxQueue;
    fxQueue = [];
    list.forEach((f) => { F.post({ type: 'fx', kind: f.kind, data: f.data }); runFx(f.kind, f.data); });
  }

  function setupRound(i) {
    Object.assign(game, {
      round: i, bank: 0, revealed: [], unscored: [], strikes: 0, control: null,
      roundWinner: null, stolen: false, stealFailed: false, awarded: 0, phase: 'faceoff'
    });
  }
  function endRound(winner, stolen) {
    game.roundWinner = winner;
    game.stolen = !!stolen;
    game.awarded = game.bank * mult();
    game.scores[winner] += game.awarded;
    game.phase = 'roundEnd';
    queue('win', { team: winner, pts: game.awarded, stolen: !!stolen, delay: game.stealFailed ? 1100 : 900 });
  }
  const allRevealed = () => answers().every((_, i) => game.revealed[i]);

  /* ---------------- Actions (host) ---------------- */
  const act = {
    start() {
      if (!content.questions.length) return toast('Add questions in the admin page first');
      snapshot();
      game = freshGame();
      setupRound(0);
      queue('round');
      commit();
    },
    reveal(i) {
      const list = answers();
      if (!list[i] || game.revealed[i] || game.phase === 'intro' || game.phase === 'gameOver') return;
      snapshot();
      game.revealed[i] = true;
      if (LIVE.includes(game.phase)) {
        game.bank += list[i].points;
        queue('reveal', { i });
        if (game.phase === 'steal') endRound(other(game.control), true);
        else if (game.phase === 'play' && allRevealed()) endRound(game.control, false);
      } else {
        game.unscored[i] = true;
        queue('reveal', { i, soft: true });
      }
      commit();
    },
    strike() {
      if (game.phase === 'faceoff') {
        queue('strike', { n: 1 });
        const list = fxQueue; fxQueue = [];
        list.forEach((f) => { F.post({ type: 'fx', kind: f.kind, data: f.data }); runFx(f.kind, f.data); });
        return;
      }
      if (game.phase === 'play') {
        snapshot();
        game.strikes = Math.min(strikeLimit(), game.strikes + 1);
        queue('strike', { n: game.strikes });
        if (game.strikes >= strikeLimit()) game.phase = 'steal';
        commit();
        return;
      }
      if (game.phase === 'steal') act.stealFail();
    },
    stealFail() {
      if (game.phase !== 'steal') return;
      snapshot();
      game.stealFailed = true;
      queue('strike', { n: 1 });
      endRound(game.control, false);
      commit();
    },
    faceoffWin(t) {
      if (game.phase !== 'faceoff') return;
      pendingFaceoff = t;
      openPlayPass(t);
    },
    choose(play) {
      if (game.phase !== 'faceoff' || pendingFaceoff === null) return;
      snapshot();
      game.control = play ? pendingFaceoff : other(pendingFaceoff);
      game.phase = 'play';
      closeModal('#playPass');
      pendingFaceoff = null;
      queue('control', { team: game.control });
      if (allRevealed()) endRound(game.control, false);
      commit();
    },
    revealAll() {
      if (game.phase !== 'roundEnd') return;
      const idx = answers().map((_, i) => i).filter((i) => !game.revealed[i]);
      if (!idx.length) return;
      snapshot();
      const round = game.round;
      idx.forEach((i, k) => setTimeout(() => {
        if (game.phase !== 'roundEnd' || game.round !== round || game.revealed[i]) return;
        game.revealed[i] = true;
        game.unscored[i] = true;
        queue('reveal', { i, soft: true });
        commit();
      }, k * 420));
    },
    next() {
      if (game.phase === 'intro') return act.start();
      snapshot();
      if (game.round < content.questions.length - 1) { setupRound(game.round + 1); queue('round'); }
      else { game.phase = 'gameOver'; queue('gameover'); }
      commit();
    },
    jump(i) {
      if (!content.questions[i]) return;
      snapshot();
      setupRound(i);
      queue('round');
      commit();
      closeDrawer();
    },
    finish() {
      snapshot();
      game.phase = 'gameOver';
      queue('gameover');
      commit();
    },
    undo() {
      const s = undoStack.pop();
      if (!s) return toast('Nothing to undo');
      game = Object.assign(freshGame(), JSON.parse(s));
      closeModal('#playPass');
      commit();
      toast('Undone');
    },
    setScore(t, v) {
      v = Math.max(0, Math.round(+v) || 0);
      if (v === game.scores[t]) return;
      snapshot();
      game.scores[t] = v;
      commit();
    },
    awardPot(t) {
      if (!LIVE.includes(game.phase)) return;
      snapshot();
      endRound(t, false);
      commit();
      closeDrawer();
    },
    restart() {
      snapshot();
      game = freshGame();
      commit();
      closeDrawer();
    }
  };

  /* ---------------- Rendering ---------------- */
  const el = {
    logo: $('#brandLogo'), pill: $('#roundPill'), survey: $('#surveyLabel'), q: $('#questionText'),
    status: $('#status'), pot: $('#pot'), potWrap: $('#potWrap'), potMult: $('#potMult'),
    grid: $('#grid'), strikes: $('#strikes'), dockHint: $('#dockHint'), dockBtns: $('#dockBtns'),
    teams: [$('#team0'), $('#team1')]
  };

  function applyContent() {
    F.applyTheme(content);
    const logo = F.logoSrc(content, '');
    const b = content.branding;
    document.title = (b.title || 'Family Feud') + (b.edition ? ' · ' + b.edition : '');
    // Top bar always uses a horizontal lockup unless a custom logo is set.
    const topLogo = b.logo === 'vertical' ? 'assets/img/logo-h.png' : logo;
    if (topLogo) el.logo.src = topLogo; else el.logo.removeAttribute('src');
    const il = $('#introLogo');
    if (logo) il.src = logo; else il.removeAttribute('src');
    il.classList.toggle('vertical', b.logo === 'vertical');
    $('#introEdition').textContent = b.edition;
    $('#introTitle').innerHTML = (b.title || 'Family Feud').trim().split(/\s+/).map((w) => '<span class="w">' + esc(w) + '</span>').join('');
    $('#introTagline').textContent = b.tagline;
    $('#vsA').textContent = teamName(0);
    $('#vsB').textContent = teamName(1);
    const n = content.questions.length;
    $('#introMeta').textContent = n ? n + ' question' + (n === 1 ? '' : 's') + ' · ' + strikeLimit() + ' strikes and you’re out' : 'No questions yet — add some in the admin page';
    el.survey.textContent = b.surveyLabel;
    document.body.classList.toggle('hide-points', !content.settings.showPoints);
  }

  function render() {
    const q = Q();
    const list = answers();
    const phase = game.phase;
    document.body.dataset.phase = phase;

    $('#intro').classList.toggle('show', phase === 'intro');
    $('#gameover').classList.toggle('show', phase === 'gameOver');

    // Round pill
    const total = content.questions.length;
    if (q && phase !== 'intro') {
      let dots = '';
      for (let i = 0; i < total; i++) dots += '<i class="' + (i < game.round ? 'done' : i === game.round ? 'now' : '') + '"></i>';
      el.pill.innerHTML = '<b>Round ' + (game.round + 1) + '</b><span>of ' + total + '</span><span class="dots">' + dots + '</span>' +
        (mult() > 1 ? '<em>' + (mult() === 2 ? 'Double' : 'Triple') + '</em>' : '');
    } else el.pill.innerHTML = '';

    // Question
    const qText = q ? q.text : '';
    if (el.q.textContent !== qText || lastRound !== game.round) {
      el.q.textContent = qText;
      el.q.classList.remove('pop'); void el.q.offsetWidth; el.q.classList.add('pop');
    }
    lastRound = game.round;

    renderStatus();

    // Pot
    tween(el.pot, game.bank);
    el.potMult.textContent = mult() > 1 ? '×' + mult() + ' points' : '';

    // Teams
    el.teams.forEach((node, t) => {
      node.querySelector('.team-tag').textContent = 'Team ' + (t + 1);
      node.querySelector('.team-name').textContent = teamName(t);
      tween(node.querySelector('.team-score'), game.scores[t]);
      const active = phase === 'play' && game.control === t;
      const stealing = phase === 'steal' && other(game.control) === t;
      const winner = phase === 'roundEnd' && game.roundWinner === t;
      node.classList.toggle('is-active', active);
      node.classList.toggle('is-stealing', stealing);
      node.classList.toggle('is-winner', winner);
      const chip = node.querySelector('.team-chip');
      chip.innerHTML = active ? '<span>In control</span>' : stealing ? '<span class="steal">Steal!</span>' : winner ? '<span>+' + game.awarded + '</span>' : '';
    });

    // Strikes
    const lim = strikeLimit();
    let sHtml = '';
    for (let i = 0; i < lim; i++) sHtml += '<span class="strike-slot' + (i < game.strikes ? ' on' : '') + '">' + X_SVG + '</span>';
    el.strikes.innerHTML = sHtml;
    el.strikes.style.visibility = phase === 'faceoff' ? 'hidden' : 'visible';

    renderBoard(list);
    if (!IS_BOARD) { renderDock(list); renderDrawer(); }
    renderGameOver();
    updatePeek();
  }

  function renderStatus() {
    const s = el.status;
    const p = game.phase;
    s.className = 'status';
    s.style.removeProperty('--sc');
    let html = '';
    if (p === 'faceoff') html = '<span class="dot"></span>Face-Off';
    else if (p === 'play') {
      s.classList.add('s-control'); s.style.setProperty('--sc', teamColor(game.control));
      html = '<span class="dot"></span>' + esc(teamName(game.control)) + ' in control';
    } else if (p === 'steal') {
      s.classList.add('s-steal');
      html = esc(teamName(other(game.control))) + ' — steal it!';
    } else if (p === 'roundEnd') {
      s.classList.add('s-win'); s.style.setProperty('--sc', teamColor(game.roundWinner));
      html = '<span class="dot"></span>' + esc(teamName(game.roundWinner)) + (game.stolen ? ' stole ' : ' wins ') + game.awarded + ' points';
    }
    s.innerHTML = html;
  }

  function renderBoard(list) {
    const slots = list.length <= 4 ? 4 : list.length <= 6 ? 6 : 8;
    const key = game.round + '|' + list.map((a) => a.text + ':' + a.points).join('|');
    const grid = el.grid;
    if (key !== boardKey) {
      const animateIn = boardKey.split('|')[0] !== String(game.round);
      boardKey = key;
      grid.style.setProperty('--rows', slots / 2);
      let html = '';
      for (let i = 0; i < slots; i++) {
        const a = list[i];
        if (!a) { html += '<div class="tile blank" style="--i:' + i + '"><div class="tile-inner"><div class="tile-face tile-front"></div></div></div>'; continue; }
        html += '<button class="tile" type="button" data-i="' + i + '" style="--i:' + i + '" aria-label="Answer ' + (i + 1) + '">' +
          '<div class="tile-inner">' +
            '<div class="tile-face tile-front"><span class="tile-num">' + (i + 1) + '</span><span class="tile-hint">Reveal</span><span class="tile-peek">' + esc(a.text) + ' · ' + a.points + '</span></div>' +
            '<div class="tile-face tile-back"><span class="tile-answer">' + esc(a.text) + '</span><span class="tile-pts">' + a.points + '</span></div>' +
          '</div></button>';
      }
      grid.innerHTML = html;
      // Tiles already revealed (e.g. after reload) appear without flipping.
      if (!animateIn) grid.classList.add('no-anim');
      applyTileState(false);
      requestAnimationFrame(() => requestAnimationFrame(() => grid.classList.remove('no-anim')));
      if (!animateIn) grid.querySelectorAll('.tile').forEach((t) => (t.style.animation = 'none'));
    } else applyTileState(true);
  }

  function applyTileState(animate) {
    const canClick = !IS_BOARD && game.phase !== 'intro' && game.phase !== 'gameOver';
    el.grid.querySelectorAll('button.tile').forEach((t) => {
      const i = +t.dataset.i;
      const rev = !!game.revealed[i];
      if (animate && rev && !t.classList.contains('revealed')) {
        t.classList.add('fresh');
        setTimeout(() => t.classList.remove('fresh'), 1800);
      }
      t.classList.toggle('revealed', rev);
      t.classList.toggle('unscored', !!game.unscored[i]);
      t.classList.toggle('clickable', canClick && !rev);
      t.tabIndex = canClick && !rev ? 0 : -1;
      const hint = t.querySelector('.tile-hint');
      if (hint) hint.textContent = game.phase === 'roundEnd' ? 'Show' : 'Reveal';
    });
  }

  function btn(label, cls, onClick, extra) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + cls;
    b.innerHTML = label;
    b.addEventListener('click', onClick);
    if (extra) Object.entries(extra).forEach(([k, v]) => b.style.setProperty(k, v));
    return b;
  }

  function renderDock(list) {
    const p = game.phase;
    const hint = el.dockHint;
    const box = el.dockBtns;
    box.innerHTML = '';
    const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    const ARROW = '<svg viewBox="0 0 24 24" style="fill:none;stroke:currentColor"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

    if (p === 'faceoff') {
      hint.innerHTML = 'Tap each answer the two players give. <b>Higher answer wins the face-off.</b>';
      box.append(btn(X + ' Wrong <kbd>X</kbd>', 'btn-strike', act.strike));
      [0, 1].forEach((t) => box.append(btn('<span class="dot"></span>' + esc(teamName(t)) + ' wins <kbd>' + 'AB'[t] + '</kbd>', 'btn-team', () => act.faceoffWin(t), { '--tc': teamColor(t) })));
    } else if (p === 'play') {
      const left = strikeLimit() - game.strikes;
      hint.innerHTML = '<b>' + esc(teamName(game.control)) + '</b> is guessing. Tap correct answers — ' + left + ' strike' + (left === 1 ? '' : 's') + ' left.';
      box.append(btn(X + ' Strike <kbd>X</kbd>', 'btn-strike', act.strike));
    } else if (p === 'steal') {
      hint.innerHTML = '<b>' + esc(teamName(other(game.control))) + '</b> gets one answer. Tap it if it’s on the board.';
      box.append(btn(X + ' Steal failed <kbd>X</kbd>', 'btn-strike', act.stealFail));
    } else if (p === 'roundEnd') {
      const remaining = list.filter((_, i) => !game.revealed[i]).length;
      const last = game.round >= content.questions.length - 1;
      hint.innerHTML = remaining ? 'Round over. Reveal the rest of the board, then move on.' : 'Round over!';
      if (remaining) box.append(btn('Reveal remaining <kbd>R</kbd>', 'btn-ghost', act.revealAll));
      box.append(btn((last ? 'Final results ' : 'Next question ') + ARROW + ' <kbd>N</kbd>', 'btn-primary', act.next));
    }
  }

  function renderDrawer() {
    const se = $('#scoreEdit');
    if (!se.contains(document.activeElement)) {
      se.innerHTML = [0, 1].map((t) =>
        '<div class="score-row"><b>' + esc(teamName(t)) + '</b><div class="stepper">' +
        '<button type="button" data-t="' + t + '" data-d="-5">−5</button>' +
        '<input type="number" inputmode="numeric" min="0" data-t="' + t + '" value="' + game.scores[t] + '" aria-label="' + esc(teamName(t)) + ' score">' +
        '<button type="button" data-t="' + t + '" data-d="5">+5</button></div></div>').join('');
    }
    const live = LIVE.includes(game.phase);
    $('#potSection').hidden = !live;
    const ab = $('#awardBtns');
    ab.innerHTML = '';
    if (live) [0, 1].forEach((t) => ab.append(btn('<span class="dot"></span>' + esc(teamName(t)) + ' · ' + game.bank * mult(), 'btn-team', () => act.awardPot(t), { '--tc': teamColor(t) })));
    $('#jumpList').innerHTML = content.questions.map((q, i) =>
      '<button type="button" class="jump-btn' + (i === game.round && game.phase !== 'intro' ? ' now' : '') + '" data-q="' + i + '"><i>' + (i + 1) + '</i><span>' + esc(q.text || 'Untitled question') + '</span></button>').join('') +
      '<button type="button" class="jump-btn" data-q="end"><i>★</i><span>Skip to final results</span></button>';
    const snd = $('#toolSound');
    snd.classList.toggle('off', !content.settings.sound);
    snd.querySelector('span').textContent = content.settings.sound ? 'Sound on' : 'Sound off';
  }

  function renderGameOver() {
    if (game.phase !== 'gameOver') return;
    const [a, b] = game.scores;
    const tie = a === b;
    const w = a > b ? 0 : 1;
    $('#goKicker').textContent = tie ? 'After ' + content.questions.length + ' rounds…' : 'And the winner is';
    const gw = $('#goWinner');
    gw.textContent = tie ? 'It’s a tie!' : teamName(w);
    gw.style.setProperty('--wc', tie ? '#fff' : teamColor(w));
    $('#goScores').innerHTML = [0, 1].map((t) =>
      '<div class="go-score' + (!tie && t === w ? ' lead' : '') + '" style="--tc:' + teamColor(t) + '"><b>' + esc(teamName(t)) + '</b><span>' + game.scores[t] + '</span></div>').join('');
  }

  /* Number count-up */
  function tween(node, to) {
    const from = +node.dataset.v || 0;
    node.dataset.v = to;
    if (from === to) { node.textContent = to; return; }
    cancelAnimationFrame(node._raf);
    const t0 = performance.now();
    const dur = Math.min(1400, 400 + Math.abs(to - from) * 6);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      node.textContent = Math.round(from + (to - from) * e);
      if (k < 1) node._raf = requestAnimationFrame(step);
    };
    node._raf = requestAnimationFrame(step);
    if (to > from) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }
  }

  /* ---------------- Effects ---------------- */
  function soundOn() {
    if (!content.settings.sound || IS_PREVIEW) return false;
    if (IS_BOARD) return true;
    return Date.now() - boardAliveAt > 5000; // a connected board display plays the sound instead
  }
  function sfx(name) { if (soundOn()) S[name](); }

  function runFx(kind, d) {
    if (kind === 'reveal') {
      sfx(d.soft ? 'chime' : 'ding');
      if (!d.soft) { el.potWrap.classList.remove('bump'); void el.potWrap.offsetWidth; el.potWrap.classList.add('bump'); }
    } else if (kind === 'strike') {
      showStrikes(d.n || 1);
    } else if (kind === 'win') {
      setTimeout(() => {
        sfx(d.stolen ? 'steal' : 'win');
        showSplash(d.team, d.pts, d.stolen);
        confetti({ count: 140, colors: [teamColor(d.team), '#ffffff', content.theme.accentLight] });
      }, d.delay || 700);
    } else if (kind === 'round') {
      sfx('jingle');
    } else if (kind === 'control') {
      sfx('tick');
    } else if (kind === 'gameover') {
      sfx('fanfare');
      const [a, b] = game.scores;
      const cols = a === b ? [teamColor(0), teamColor(1), '#fff'] : [teamColor(a > b ? 0 : 1), '#ffffff', content.theme.accentLight];
      confetti({ count: 260, colors: cols, rain: true });
    }
  }

  let strikeTimer;
  function showStrikes(n) {
    const o = $('#strikeOverlay');
    let html = '';
    for (let i = 0; i < n; i++) html += '<span class="x" style="--i:' + i + '">' + X_SVG + '</span>';
    o.innerHTML = html;
    o.classList.remove('show'); void o.offsetWidth; o.classList.add('show');
    sfx('buzz');
    clearTimeout(strikeTimer);
    strikeTimer = setTimeout(() => o.classList.remove('show'), 1200);
  }

  let splashTimer;
  function showSplash(team, pts, stolen) {
    const s = $('#splash');
    s.style.setProperty('--sc', teamColor(team));
    s.innerHTML = '<div class="splash-card"><div class="splash-kicker">' + (stolen ? 'Stolen!' : 'Survey says…') + '</div>' +
      '<div class="splash-team">' + esc(teamName(team)) + '</div><div class="splash-pts">+' + pts + '</div></div>';
    s.classList.add('show');
    clearTimeout(splashTimer);
    splashTimer = setTimeout(() => s.classList.remove('show'), 2600);
  }

  /* Confetti */
  const cv = $('#confetti');
  const cx = cv.getContext('2d');
  let parts = [];
  let confettiRaf = 0;
  function sizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvas();
  addEventListener('resize', sizeCanvas);
  function confetti(o) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < o.count; i++) {
      const rain = o.rain && i % 2;
      parts.push({
        x: rain ? Math.random() * W : W / 2 + (Math.random() - 0.5) * 120,
        y: rain ? -20 - Math.random() * H * 0.5 : H * 0.55,
        vx: rain ? (Math.random() - 0.5) * 2 : (Math.random() - 0.5) * 16,
        vy: rain ? 2 + Math.random() * 3 : -8 - Math.random() * 12,
        s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        c: o.colors[i % o.colors.length], shape: i % 3, life: 0
      });
    }
    if (!confettiRaf) confettiRaf = requestAnimationFrame(drawConfetti);
  }
  function drawConfetti() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.y < innerHeight + 40 && p.life < 600);
    parts.forEach((p) => {
      p.life++; p.vy += 0.28; p.vx *= 0.985; p.vy = Math.min(p.vy, 6); p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
      if (p.shape === 0) { cx.beginPath(); cx.arc(0, 0, p.s / 2.4, 0, Math.PI * 2); cx.fill(); }
      else cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / (p.shape === 1 ? 2 : 3.2));
      cx.restore();
    });
    confettiRaf = parts.length ? requestAnimationFrame(drawConfetti) : 0;
    if (!parts.length) cx.clearRect(0, 0, innerWidth, innerHeight);
  }

  /* ---------------- UI plumbing ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function openModal(sel) { $(sel).classList.add('show'); }
  function closeModal(sel) { $(sel).classList.remove('show'); }
  function openPlayPass(t) {
    $('#ppTitle').textContent = teamName(t);
    $('#playPass .modal-card').style.setProperty('--tc', teamColor(t));
    openModal('#playPass');
    setTimeout(() => $('#ppPlay').focus(), 50);
  }
  let confirmCb = null;
  function ask(title, text, yesLabel, cb) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = yesLabel;
    confirmCb = cb;
    openModal('#confirm');
  }

  function openDrawer() { renderDrawer(); document.body.classList.add('drawer-open'); }
  function closeDrawer() { document.body.classList.remove('drawer-open'); }

  function toggleFs() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const r = d.documentElement; (r.requestFullscreen || r.webkitRequestFullscreen || function () {}).call(r); }
  }
  function openDisplay() {
    const w = window.open(location.pathname + '?view=board', 'seedsFeudBoard', 'width=1280,height=760');
    if (!w) toast('Allow pop-ups to open the board display');
    else toast('Drag the new window to the projector & press F11');
  }

  function togglePeek() {
    manualPeek = !manualPeek;
    updatePeek();
    toast(manualPeek ? 'Host peek on — hidden answers shown faintly' : 'Host peek off');
  }

  function updatePeek() {
    const connected = Date.now() - boardAliveAt < 5000;
    document.body.classList.toggle('peek', !IS_BOARD && (manualPeek || connected));
    const ds = $('#displayStatus');
    ds.textContent = !IS_BOARD && connected ? 'Display live' : '';
    const pk = $('#toolPeek');
    if (pk) {
      pk.classList.toggle('off', !manualPeek);
      pk.querySelector('span').textContent = manualPeek ? 'Host peek on' : 'Host peek off';
    }
  }

  /* ---------------- Events ---------------- */
  if (!IS_BOARD) {
    el.grid.addEventListener('click', (e) => {
      const t = e.target.closest('button.tile');
      if (t && t.classList.contains('clickable')) act.reveal(+t.dataset.i);
    });
    $('#startBtn').addEventListener('click', act.start);
    $('#againBtn').addEventListener('click', () => { game = freshGame(); act.start(); });
    $('#undoBtn').addEventListener('click', act.undo);
    $('#fsBtn').addEventListener('click', toggleFs);
    $('#toolFs').addEventListener('click', toggleFs);
    $('#toolPeek').addEventListener('click', togglePeek);
    $('#menuBtn').addEventListener('click', openDrawer);
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerScrim').addEventListener('click', closeDrawer);
    $('#introDisplayBtn').addEventListener('click', openDisplay);
    $('#toolDisplay').addEventListener('click', openDisplay);
    $('#ppPlay').addEventListener('click', () => act.choose(true));
    $('#ppPass').addEventListener('click', () => act.choose(false));
    $('#ppClose').addEventListener('click', () => { closeModal('#playPass'); pendingFaceoff = null; });
    $('#confirmYes').addEventListener('click', () => { closeModal('#confirm'); if (confirmCb) confirmCb(); confirmCb = null; });
    $('#confirmNo').addEventListener('click', () => { closeModal('#confirm'); confirmCb = null; });
    $('#restartBtn').addEventListener('click', () => ask('Restart the game?', 'Scores go back to zero and you return to the title screen.', 'Restart', act.restart));
    $('#toolSound').addEventListener('click', () => {
      content.settings.sound = !content.settings.sound;
      F.saveContent(content);
      renderDrawer();
      toast(content.settings.sound ? 'Sound on' : 'Sound off');
    });
    $('#scoreEdit').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-d]');
      if (!b) return;
      const t = +b.dataset.t;
      act.setScore(t, game.scores[t] + +b.dataset.d);
    });
    $('#scoreEdit').addEventListener('change', (e) => {
      if (e.target.matches('input')) { act.setScore(+e.target.dataset.t, e.target.value); e.target.blur(); }
    });
    $('#jumpList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      if (b.dataset.q === 'end') { closeDrawer(); ask('Skip to final results?', 'The game ends with the current scores.', 'End game', act.finish); }
      else act.jump(+b.dataset.q);
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); act.undo(); }
        return;
      }
      const k = e.key.toLowerCase();
      const ppOpen = $('#playPass').classList.contains('show');
      if (k === 'escape') { closeDrawer(); closeModal('#playPass'); closeModal('#confirm'); pendingFaceoff = null; return; }
      if (ppOpen) { if (k === 'p') act.choose(true); return; }
      if ($('#confirm').classList.contains('show') || document.body.classList.contains('drawer-open')) return;
      if (/^[1-8]$/.test(k)) act.reveal(+k - 1);
      else if (k === 'x' || k === 's') act.strike();
      else if (k === 'a' && game.phase === 'faceoff') act.faceoffWin(0);
      else if (k === 'b' && game.phase === 'faceoff') act.faceoffWin(1);
      else if (k === 'r') act.revealAll();
      else if (k === 'n' || (k === 'enter' && game.phase === 'roundEnd')) act.next();
      else if (k === 'u') act.undo();
      else if (k === 'f') toggleFs();
      else if (k === 'h') togglePeek();
      else if ((k === ' ' || k === 'enter') && game.phase === 'intro') { e.preventDefault(); act.start(); }
    });

    // Unlock audio on first interaction
    const unlock = () => { S.unlock(); };
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('keydown', unlock);
  } else if (!IS_PREVIEW) {
    const gate = $('#soundGate');
    if (content.settings.sound) gate.classList.add('show');
    gate.addEventListener('click', () => { S.unlock(); gate.classList.remove('show'); });
    addEventListener('keydown', (e) => {
      S.unlock(); gate.classList.remove('show');
      if (e.key.toLowerCase() === 'f') toggleFs();
    });
    document.addEventListener('dblclick', toggleFs);
    const beat = () => F.post({ type: 'board-alive' });
    beat();
    setInterval(beat, 2000);
    F.post({ type: 'hello' });
  }

  async function reloadContent() {
    content = await F.loadContent('');
    applyContent();
    boardKey = '';
    render();
  }

  if (F.channel) {
    F.channel.addEventListener('message', (e) => {
      const m = e.data || {};
      if (m.type === 'state' && m.game) {
        game = Object.assign(freshGame(), m.game);
        if (game.phase !== 'faceoff') closeModal('#playPass');
        render();
      } else if (m.type === 'fx') runFx(m.kind, m.data || {});
      else if (m.type === 'content') reloadContent();
      else if (m.type === 'board-alive' && !IS_BOARD) {
        const was = Date.now() - boardAliveAt < 5000;
        boardAliveAt = Date.now();
        if (!was) { updatePeek(); toast('Board display connected'); }
      } else if (m.type === 'hello' && !IS_BOARD) F.post({ type: 'state', game });
    });
  }
  addEventListener('storage', (e) => {
    if (e.key === F.KEYS.content) reloadContent();
    else if (e.key === F.KEYS.game && e.newValue && IS_BOARD) {
      try { game = Object.assign(freshGame(), JSON.parse(e.newValue)); render(); } catch (err) { /* ignore */ }
    }
  });
  if (!IS_BOARD) setInterval(updatePeek, 2500);

  // Clamp a saved game if questions were removed in admin.
  if (game.round >= content.questions.length && game.phase !== 'intro') {
    game = freshGame();
  }

  applyContent();
  render();
})();
