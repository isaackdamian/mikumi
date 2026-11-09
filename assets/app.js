(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SECRET = window.MIKUMI_SECRET || {};

  /* ---------- personal link: #n=Name&k=key ---------- */
  const params = new URLSearchParams(location.hash.slice(1));
  const guest = (params.get('n') || '').trim().slice(0, 40);
  const key = params.get('k') || '';
  const fam = params.get('f') === 'c' ? 'c' : 'i';                 // c = Cecilia's family, i = Isaack's family
  // short form for greetings: first name, but keep a title with it ("Mama Neema", "Dr. Juma")
  const TITLES = /^(mama|baba|bi\.?|bw\.?|bwana|dr\.?|prof\.?|mzee|bibi|babu|shangazi|mjomba|anko|ankal|uncle|aunt|aunty|auntie|dada|kaka|mr\.?|mrs\.?|ms\.?|miss|pastor|mch\.?|mchungaji|rev\.?|fr\.?|padre|sister|sr\.?|eng\.?|hon\.?|mhe\.?|mheshimiwa)$/i;
  const short = (() => { const w = guest.split(/\s+/); return w.length > 1 && TITLES.test(w[0]) ? w[0] + ' ' + w[1] : w[0] || ''; })();
  if (guest) {
    $('#greet').textContent = 'Dear ' + short;
    $('#greet').hidden = false;
    document.querySelectorAll('.rsvp-name').forEach((e) => { e.textContent = short + ', '; });
    $('#hello-name').textContent = guest; $('#hello').hidden = false;
    document.querySelectorAll('#tk-name').forEach((e) => { e.textContent = guest; });
    document.querySelectorAll('.sw .rsvp-ask').forEach((e) => { e.textContent = 'tunaomba'; });
    document.querySelectorAll('.en .rsvp-ask').forEach((e) => { e.textContent = 'we kindly ask you'; });
  }
  const b64u = (s) => {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  };
  (async function unlockGroup() {
    const S = SECRET[fam];
    if (!key || !window.crypto || !crypto.subtle || !S) return;
    try {
      const k = await crypto.subtle.importKey('raw', b64u(key), 'AES-GCM', false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u(S.iv) }, k, b64u(S.ct));
      const url = new TextDecoder().decode(pt);
      if (!/^https:\/\/chat\.whatsapp\.com\//.test(url)) return;
      $('#group-btn').href = url;
      $('#group-btn').hidden = false;
      $('#group-note').hidden = true;
    } catch (e) { /* no valid key: button stays hidden */ }
  })();

  /* ---------- language (sections below the stage) ---------- */
  function setLang(l) {
    html.dataset.lang = l; html.lang = l;
    document.querySelectorAll('#lang button').forEach((b) => b.classList.toggle('on', b.dataset.l === l));
    try { localStorage.setItem('mikumi-lang', l); } catch (e) {}
  }
  let lang = params.get('l');
  if (!lang) { try { lang = localStorage.getItem('mikumi-lang'); } catch (e) {} }
  setLang(lang === 'en' ? 'en' : 'sw');
  document.querySelectorAll('#lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.l)));
  const onScroll = () => html.classList.toggle('past-stage', window.scrollY > window.innerHeight * 0.55);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- music: gapless loop through Web Audio, fades in on the first touch ---------- */
  const musicBtn = $('#music');
  const LOOP = { start: 0.5, end: 15.92 };                         // the file carries one extra second so this window repeats seamlessly
  const ACtx = window.AudioContext || window.webkitAudioContext;
  let actx = null, gain = null, mState = 'idle';                    // idle -> loading -> on / off
  const musicBytes = fetch('assets/muziki.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  function decode(ab) { return new Promise((res, rej) => { const p = actx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); }
  function startMusic() {
    if (mState !== 'idle' || !ACtx) return;
    mState = 'loading';
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}   // iPhone: play even with the silent switch on
    actx = new ACtx(); actx.resume();
    musicBytes.then((ab) => {
      if (!ab) { mState = 'none'; return null; }
      return decode(ab.slice(0));
    }).then((buf) => {
      if (!buf) return;
      const src = actx.createBufferSource();
      src.buffer = buf; src.loop = true; src.loopStart = LOOP.start; src.loopEnd = Math.min(LOOP.end, buf.duration);
      gain = actx.createGain();
      const t = actx.currentTime; gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(level(), t + 3);
      src.connect(gain); gain.connect(actx.destination); src.start();
      actx.onstatechange = () => {
        if (actx.state === 'running' && mState === 'on') {
          const t3 = actx.currentTime; gain.gain.cancelScheduledValues(t3); gain.gain.setValueAtTime(0, t3); gain.gain.linearRampToValueAtTime(level(), t3 + 2.5);
        }
      };
      mState = 'on'; musicBtn.hidden = false; musicBtn.classList.remove('off');
    }).catch(() => { mState = 'none'; });
  }
  // if the glitter was blown away (no tap), the first touch anywhere starts the music
  // iPhone only lets sound start on a finished touch (touchend / click), not on pointerdown,
  // so every kind of touch either starts the music or wakes a context that is still suspended
  function wakeMusic() {
    if (mState === 'idle') startMusic();
    if (actx && actx.state !== 'running' && (mState === 'loading' || mState === 'on')) actx.resume();
  }
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, wakeMusic, { capture: true, passive: true }));
  musicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!actx || !gain) return;
    const t = actx.currentTime;
    if (mState === 'on') {
      gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, t + 0.6);
      setTimeout(() => actx.suspend(), 650); mState = 'off'; musicBtn.classList.add('off');
    } else if (mState === 'off') {
      actx.resume().then(() => { const t2 = actx.currentTime; gain.gain.cancelScheduledValues(t2); gain.gain.setValueAtTime(0, t2); gain.gain.linearRampToValueAtTime(Math.max(level(), 0.35), t2 + 1.2); });
      mState = 'on'; musicBtn.classList.remove('off');
    }
  });
  // the music belongs to the stage: it fades out as the page covers the stage and returns when scrolling back up
  function level() { const h = window.innerHeight, k = 1 - (window.scrollY - h * 0.25) / (h * 0.65); return 0.7 * Math.min(1, Math.max(0, k)); }
  window.addEventListener('scroll', () => {
    if (mState !== 'on' || !gain) return;
    const t = actx.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setTargetAtTime(level(), t, 0.25);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!actx || mState !== 'on') return; if (document.hidden) actx.suspend(); else actx.resume(); });

  /* ---------- glitter: blown in from the left, blown away to the right ---------- */
  const intro = $('#intro');
  const cv = $('#glitter'), ctx = cv.getContext('2d');
  const fx = $('#fx'), fctx = fx.getContext('2d');
  const bar = $('#bar'), subEl = $('#sub'), blowEl = $('.copy .blow'), track = $('.copy .track');
  // brightness of the glitter field (8 rows x 6 columns), sampled from the reference: dark top-left, lit from the right
  const GL = [[23,25,27,31,35,46],[26,27,28,34,44,58],[30,35,41,53,66,80],[32,38,46,60,70,86],
              [33,42,50,64,74,87],[30,34,40,50,64,79],[26,36,30,39,50,59],[25,25,30,37,45,61]];
  const lightAt = (x, y) => {                                        // bilinear, 0..1
    const gx = Math.min(4.999, Math.max(0, x * 6 - 0.5)), gy = Math.min(6.999, Math.max(0, y * 8 - 0.5));
    const i = gx | 0, j = gy | 0, fx_ = gx - i, fy = gy - j;
    const v = (GL[j][i] * (1 - fx_) + GL[j][i + 1] * fx_) * (1 - fy) + (GL[j + 1][i] * (1 - fx_) + GL[j + 1][i + 1] * fx_) * fy;
    return v / 87;
  };
  const LEVELS = 12;
  const RED = Array.from({ length: LEVELS }, (_, k) => `hsl(${349 + k * 0.4},${62 + k * 1.5}%,${7 + k * 3.3}%)`);
  const WHITE = ['#ffffff', '#ffd6dc', '#ff9eab'];
  let W = 0, H = 0, DPR = 1, N = 0, NB = 0;
  let tx, ty, px, py, vx, vy, sz, tIn, dIn, ox, oy, tOut, mode, landed;
  let groups = [];                                                   // [start, end, style, isBokeh]
  let baseC = null, sprites = {};
  let twinkles = [];
  let state = 'in';                                                  // in -> idle -> out -> done
  let tLoad = performance.now(), fallT0 = 0, lastT = 0, pile = null;
  const PILE_COL = 3;

  function size_() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    [cv, fx].forEach((c) => { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); });
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function sprite(col, r) {                                          // soft out-of-focus disc
    const k = col + r; if (sprites[k]) return sprites[k];
    const c = document.createElement('canvas'), d = Math.ceil(r * 2 * DPR) + 2; c.width = c.height = d;
    const g = c.getContext('2d'), gr = g.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
    gr.addColorStop(0, col); gr.addColorStop(0.55, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.85; g.fillStyle = gr; g.fillRect(0, 0, d, d);
    return (sprites[k] = c);
  }
  function build() {
    // smooth lighting for the dark background: a tiny 6x8 image stretched with smoothing
    const s = document.createElement('canvas'); s.width = 6; s.height = 8;
    const sg = s.getContext('2d'), id = sg.createImageData(6, 8);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 6; i++) {
      const v = GL[j][i], o = (j * 6 + i) * 4;
      id.data[o] = v * 1.0; id.data[o + 1] = v * 0.13; id.data[o + 2] = v * 0.22; id.data[o + 3] = 255;
    }
    sg.putImageData(id, 0, 0);
    baseC = document.createElement('canvas'); baseC.width = cv.width; baseC.height = cv.height;
    const bg = baseC.getContext('2d'); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    bg.drawImage(s, 0, 0, baseC.width, baseC.height);

    // clumps and dark patches: two octaves of smooth noise
    const mk = (cell) => { const gw = Math.ceil(W / cell) + 3, gh = Math.ceil(H / cell) + 3, v = new Float32Array(gw * gh);
      for (let i = 0; i < v.length; i++) v[i] = Math.random(); return { cell, gw, v }; };
    const smp = (G, x, y) => { const fx2 = x / G.cell, fy = y / G.cell, i = fx2 | 0, j = fy | 0, a = fx2 - i, b = fy - j;
      const sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b), k = j * G.gw + i, v = G.v;
      return (v[k] * (1 - sa) + v[k + 1] * sa) * (1 - sb) + (v[k + G.gw] * (1 - sa) + v[k + G.gw + 1] * sa) * sb; };
    const big = mk(110), mid = mk(38);
    const shade = (x, y) => Math.min(1, Math.max(0, (smp(big, x, y) * 0.6 + smp(mid, x, y) * 0.4 - 0.2) / 0.6));
    // darken the background in the same patches
    const sw2 = 48, sh2 = Math.ceil(48 * H / W), shC = document.createElement('canvas'); shC.width = sw2; shC.height = sh2;
    const shg = shC.getContext('2d'), sid = shg.createImageData(sw2, sh2);
    for (let j = 0; j < sh2; j++) for (let i = 0; i < sw2; i++) {
      const v = Math.round(255 * (0.66 + 0.4 * shade((i + 0.5) * W / sw2, (j + 0.5) * H / sh2))), o = (j * sw2 + i) * 4;
      sid.data[o] = sid.data[o + 1] = sid.data[o + 2] = Math.min(255, v); sid.data[o + 3] = 255;
    }
    shg.putImageData(sid, 0, 0);
    bg.globalCompositeOperation = 'multiply';
    bg.drawImage(shC, 0, 0, baseC.width, baseC.height);
    bg.globalCompositeOperation = 'destination-out';                 // the stage edge shows below the glitter
    const fade = bg.createLinearGradient(0, baseC.height * 0.952, 0, baseC.height * 0.966);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    bg.fillStyle = fade; bg.fillRect(0, baseC.height * 0.952, baseC.width, baseC.height * 0.048);
    bg.globalCompositeOperation = 'source-over';

    const area = W * H;
    const q = window.__GQ || 1;
    const nDots = Math.min(26000, Math.floor(area / 13 * q)), nBok = Math.min(9000, Math.floor(area / 38 * q));
    N = nDots + nBok; NB = nBok;
    tx = new Float32Array(N); ty = new Float32Array(N); px = new Float32Array(N); py = new Float32Array(N);
    vx = new Float32Array(N); vy = new Float32Array(N); sz = new Float32Array(N); tIn = new Float32Array(N); dIn = new Float32Array(N);
    ox = new Float32Array(N); oy = new Float32Array(N); tOut = new Float32Array(N); mode = new Uint8Array(N); landed = new Uint8Array(N);
    // decide every particle, then sort by style so each group is one fillStyle / sprite
    const tmp = [];
    for (let i = 0; i < N; i++) {
      let x, y, sh, tries = 0;
      do { x = Math.random() * W; y = Math.random() * H * 0.955; sh = shade(x, y); } while (Math.random() > (0.5 + 0.6 * sh) * (0.35 + 0.75 * lightAt(x / W, y / H)) && ++tries < 10);
      const L = lightAt(x / W, y / H) * (0.75 + 0.4 * sh), bok = i >= nDots;
      let style;
      const white = Math.random() < (bok ? 0.012 + 0.06 * L * L : 0.06 + 0.06 * L);
      if (white) style = 'w' + (Math.random() * 3 | 0);
      else style = 'r' + Math.max(0, Math.min(LEVELS - 1, Math.round((0.3 + 1.15 * Math.pow(Math.random(), bok ? 1.6 : 2.2)) * L * (LEVELS - 1))));
      const r = bok ? (white ? 1.3 + Math.random() * 2.2 : 1.8 + Math.random() * 3.4) : (white ? 0.6 + Math.random() * 1.0 : 0.7 + Math.random() * 1.0);
      tmp.push({ x, y, style, bok, r });
    }
    tmp.sort((a, b) => (a.bok - b.bok) || (a.style < b.style ? -1 : a.style > b.style ? 1 : 0));
    groups = [];
    tmp.forEach((p, i) => {
      tx[i] = p.x; ty[i] = p.y; sz[i] = p.r;
      // blown in from the left: start off-screen left, arrive with a soft ease
      ox[i] = -40 - Math.random() * W * 0.9; oy[i] = p.y + (Math.random() - 0.35) * H * 0.18;
      tIn[i] = Math.random() * 0.55 + (p.x / W) * 0.15; dIn[i] = 0.85 + Math.random() * 0.65;
      px[i] = ox[i]; py[i] = oy[i];
      // blown away to the right: a front sweeps across from the left
      const dc = Math.hypot((p.x - W / 2) / W, (p.y - H * 0.48) / H) / 0.62;   // 0 at the centre, ~1 at the corners
      tOut[i] = 0.04 + dc * 1.15 + Math.random() * 0.55;
      mode[i] = Math.random() < 0.84 ? 0 : 1;                          // 0 = blown, 1 = drops onto the stage
      oy[i] = 0.922 + Math.random() * 0.045;                            // where on the stage top it settles (reused after the entrance)
      const g = groups[groups.length - 1];
      if (!g || g[2] !== p.style || g[3] !== p.bok) groups.push([i, i + 1, p.style, p.bok]); else g[1] = i + 1;
    });
    pile = new Float32Array(Math.ceil(W / PILE_COL) + 2);
    twinkles = Array.from({ length: Math.floor(area / 1500) }, () => ({
      x: Math.random() * W, y: Math.random() * H * 0.92, p: Math.random() * 6.28, sp: 1 + Math.random() * 2.2, r: 1.4 + Math.random() * 2.4,
    }));
  }
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  function styleOf(st) { return st[0] === 'w' ? WHITE[+st[1]] : RED[+st.slice(1)]; }
  function drawParticles(alphaFn) {
    for (const [s0, s1, st, bok] of groups) {
      const col = styleOf(st);
      if (!bok) ctx.fillStyle = col;
      for (let i = s0; i < s1; i++) {
        const a = alphaFn(i);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a * (bok ? (st[0] === 'w' ? 0.9 : 0.5) : 0.92);
        if (bok) { const r = sz[i], sp = sprite(col, r); ctx.drawImage(sp, px[i] - r, py[i] - r, r * 2, r * 2); }
        else ctx.fillRect(px[i], py[i], sz[i], sz[i]);
      }
    }
    ctx.globalAlpha = 1;
  }
  let reflC = null;
  function drawReflection(a) {                                        // glossy stage edge mirroring the glitter, softly
    if (a <= 0) return;
    const y0 = H * 0.963, hh = H - y0;
    if (!reflC) { reflC = document.createElement('canvas'); reflC.width = Math.max(8, Math.round(W / 7)); reflC.height = 3; }
    const rg = reflC.getContext('2d');
    rg.clearRect(0, 0, reflC.width, 3);
    rg.drawImage(cv, 0, Math.round(H * 0.9 * DPR), cv.width, Math.round(H * 0.045 * DPR), 0, 0, reflC.width, 3);
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, y0, 0, H);                  // the lit band itself
    g.addColorStop(0, 'rgba(78,46,52,.95)'); g.addColorStop(0.35, 'rgba(56,30,35,.95)'); g.addColorStop(1, 'rgba(30,14,17,.95)');
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, hh);
    ctx.globalAlpha = 0.55 * a;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(reflC, 0, 0, reflC.width, 3, 0, y0, W, hh);          // soft vertical streaks
    const sh = ctx.createLinearGradient(0, y0 - 4, 0, y0 + 6);          // soft top edge
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); sh.addColorStop(0.5, 'rgba(20,6,9,.5)');
    ctx.globalAlpha = a; ctx.fillStyle = sh; ctx.fillRect(0, y0 - 4, W, 10);
    ctx.restore();
  }
  function drawBase(a, frontX, open) {
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.drawImage(baseC, 0, 0, W, H);
    ctx.globalAlpha = 1;
    if (open) {                                                      // a hole opens from the centre and spreads outwards
      const R = Math.hypot(W, H) * 0.62 * Math.min(1.25, open), cx = W / 2, cy = H * 0.48;
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, R));
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* trigger: tap anywhere, or blow */
  let progress = 0;
  function setProgress(p) { progress = Math.min(1, p); bar.style.transform = 'scaleX(' + progress + ')'; }
  function setCopy(blow, sub) {
    if (blowEl.textContent === blow && subEl.textContent === sub) return;
    subEl.classList.add('swap');
    setTimeout(() => { blowEl.textContent = blow; subEl.textContent = sub; subEl.classList.remove('swap'); }, 380);
  }
  intro.addEventListener('pointerdown', () => { startMusic(); if (mic && mic.ac.state === 'suspended') mic.ac.resume(); startFall(); });
  const idleTimer = setTimeout(() => startFall(), 45000);

  let mic = null;
  async function askMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || state === 'out') { setCopy('Touch the glitter', 'and watch it fall away'); return; }
    const pending = setTimeout(() => { if (!mic && state !== 'out') setCopy('Touch the glitter', 'and watch it fall away'); }, 900);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      clearTimeout(pending);
      if (state === 'out' || state === 'done') { stream.getTracks().forEach((t) => t.stop()); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const an = ac.createAnalyser(); an.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(an);
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      mic = { stream, ac, an, buf: new Float32Array(an.fftSize) };
      setCopy('Blow on the glitter', 'one gentle breath is enough');
      track.classList.add('on');
    } catch (err) {
      clearTimeout(pending);
      setCopy('Touch the glitter', 'and watch it fall away');
    }
  }
  function micStep() {
    if (!mic || (state !== 'idle' && state !== 'in')) return;
    mic.an.getFloatTimeDomainData(mic.buf);
    let s = 0;
    for (let i = 0; i < mic.buf.length; i++) s += mic.buf[i] * mic.buf[i];
    const rms = Math.sqrt(s / mic.buf.length);
    if (rms > 0.045) setProgress(progress + Math.min(0.07, (rms - 0.045) * 0.6));
    if (progress >= 1) { startMusic(); startFall(); }
  }
  function stopMic() {
    if (!mic) return;
    mic.stream.getTracks().forEach((t) => t.stop());
    try { mic.ac.close(); } catch (e) {}
    mic = null;
  }

  function startFall() {
    if (state === 'out' || state === 'done') return;
    state = 'out';
    clearTimeout(idleTimer);
    stopMic();
    setProgress(1);
    intro.classList.add('falling');
    fallT0 = performance.now(); lastT = fallT0;
    for (let i = 0; i < N; i++) {                                    // velocities for the gust
      // a breath from the centre: everything is pushed outwards, mostly sideways and down, rarely up
      let dx = px[i] - W / 2, dy = py[i] - H * 0.48;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      if (dy < 0) dy *= Math.random() < 0.18 ? 0.8 : 0.22;
      dy += 0.35;
      const sp = (mode[i] === 0 ? 160 : 40) + Math.random() * (mode[i] === 0 ? 420 : 90);
      vx[i] = dx * sp * (0.85 + Math.random() * 0.3) + (Math.random() - 0.5) * 40;
      vy[i] = dy * sp * (0.85 + Math.random() * 0.3);
    }
    if (reduce) { endFall(); return; }
    ensureCurtain();
    beginStageSequence();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
    fctx.clearRect(0, 0, W, H);
    if (state === 'in' || state === 'idle') {
      const t = (now - tLoad) / 1000;
      micStep();
      if (state === 'in') {
        let moving = false;
        for (let i = 0; i < N; i++) {
          const k = Math.min(1, Math.max(0, (t - tIn[i]) / dIn[i]));
          if (k < 1) moving = true;
          const e = easeOut(k);
          px[i] = ox[i] + (tx[i] - ox[i]) * e;
          py[i] = oy[i] + (ty[i] - oy[i]) * e + Math.sin(k * Math.PI) * 14;
        }
        ctx.clearRect(0, 0, W, H);
        drawBase(Math.min(1, t / 1.1));
        drawParticles((i) => Math.min(1, Math.max(0, (t - tIn[i]) / dIn[i]) * 2.5));
        drawReflection(Math.min(1, t / 1.1));
        if (!moving) { state = 'idle'; ctx.clearRect(0, 0, W, H); drawBase(1); drawParticles(() => 1); drawReflection(1); }
      }
      if (state === 'idle') {
        const tt = now / 1000;
        for (const s of twinkles) {
          const a = Math.max(0, Math.sin(tt * s.sp + s.p)) ** 8;
          if (a < 0.05) continue;
          fctx.globalAlpha = a; fctx.fillStyle = '#fff';
          const r = s.r * (0.5 + a * 0.7);
          fctx.beginPath();
          fctx.moveTo(s.x, s.y - r); fctx.quadraticCurveTo(s.x, s.y, s.x + r, s.y);
          fctx.quadraticCurveTo(s.x, s.y, s.x, s.y + r); fctx.quadraticCurveTo(s.x, s.y, s.x - r, s.y);
          fctx.quadraticCurveTo(s.x, s.y, s.x, s.y - r); fctx.fill();
        }
        fctx.globalAlpha = 1;
      }
    } else if (state === 'out') {
      const t = (now - fallT0) / 1000;
      const floorY = H * 0.915;
      for (let i = 0; i < N; i++) {
        if (t < tOut[i] || landed[i]) continue;
        if (mode[i] === 0) {                                          // blown outwards, slowing in the air while gravity takes over
          const drag = Math.exp(-0.9 * dt); vx[i] *= drag; vy[i] = vy[i] * drag + 260 * dt;
          px[i] += vx[i] * dt; py[i] += vy[i] * dt;
        } else {                                                      // falls onto the stage
          const fl = H * oy[i];
          vy[i] += 700 * dt; px[i] += vx[i] * dt; py[i] += vy[i] * dt;
          if (py[i] >= fl) { py[i] = fl; landed[i] = 1; }
        }
      }
      ctx.clearRect(0, 0, W, H);
      drawBase(1, null, Math.max(0, (t - 0.05) / 1.9));
      drawParticles((i) => {
        if (t < tOut[i]) return 1;
        const age = t - tOut[i];
        if (mode[i] === 1) return landed[i] ? 0.55 * Math.max(0, 1 - Math.max(0, t - 1.6) / 1.2) : Math.max(0, 1 - Math.max(0, age - 0.9) / 0.6);
        if (px[i] < -8 || px[i] > W + 8 || py[i] > H + 8) return 0;
        return Math.max(0, 1 - Math.max(0, age - 0.45) / 1.1);
      });
      drawReflection(Math.max(0, 1 - t / 1.4));
      if (t > 3.5) endFall();
    }
    if (state !== 'done') requestAnimationFrame(frame);
  }
  function endFall() {
    state = 'done';
    intro.classList.add('gone');
    setTimeout(() => intro.remove(), 1000);
  }

  /* ---------- stage sequence (timed from the tap) ---------- */
  const stage = $('#stage');
  const curtains = $('.curtains');
  const at = (sec, fn) => setTimeout(fn, reduce ? 0 : sec * 1000);
  function beginStageSequence() {
    startSparks(); startResidue();
    at(1.2, () => { curtains.classList.add('lit'); drawCurtain(openP); });
    at(2.6, () => stage.classList.add('s1'));          // Together with their families
    at(2.6, openCurtains);                              // curtains slide apart (5.2 s)
    at(3.3, () => stage.classList.add('s2'));          // Cecilia (handwritten)
    at(4.1, () => stage.classList.add('s3'));          // &
    at(4.5, () => stage.classList.add('s4'));          // Isaack (handwritten)
    at(5.8, () => stage.classList.add('s5'));          // invite line
    at(6.2, () => stage.classList.add('s6'));          // date
    at(6.6, () => stage.classList.add('s7'));          // venue
    at(7.4, () => { stage.classList.add('s8'); html.classList.remove('locked'); });
  }

  /* ---------- velvet curtains (rendered once, then gathered to the sides) ---------- */
  const cc = $('#curtain'), cctx = cc.getContext('2d');
  let tex = [null, null], cW = 0, cH = 0, cD = 1, openP = 0, opening = false;
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  // stage light on the closed curtains (8 rows x 6 columns), fitted to the reference frame by frame
  const CURT = window.__CG || [[0.03,0.05,0.07,0.05,0.08,0.04],[0.05,0.10,0.25,0.14,0.17,0.10],[0.12,0.20,0.43,0.28,0.36,0.22],
    [0.13,0.24,0.72,0.32,0.49,0.33],[0.10,0.20,0.47,0.30,0.51,0.33],[0.07,0.11,0.27,0.17,0.30,0.24],[0.04,0.06,0.13,0.07,0.13,0.15],[0.035,0.05,0.11,0.06,0.11,0.13]];
  function curtLight(x, y) {
    const gx = Math.min(4.999, Math.max(0, x * 6 - 0.5)), gy = Math.min(6.999, Math.max(0, y * 8 - 0.5));
    const i = gx | 0, j = gy | 0, a = gx - i, b = gy - j, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b);
    return (CURT[j][i] * (1 - sa) + CURT[j][i + 1] * sa) * (1 - sb) + (CURT[j + 1][i] * (1 - sa) + CURT[j + 1][i + 1] * sa) * sb;
  }
  function velvet(w, h, seed, side) {
    // side: 0 = left half, 1 = right half. Dark, slightly mottled velvet with narrow black valleys.
    const r = rng(seed), c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), im = g.createImageData(w, h), px = im.data;
    const N = 8 + r() * 1.2;                                     // folds across the half
    const a1 = r() * 6.28, a2 = r() * 6.28, a3 = r() * 6.28, b1 = r() * 6.28;
    const hemY = h * 0.917;
    // value noise for the velvet mottling (small blotches + broad patches)
    const grid = (cw, ch) => { const gw = Math.ceil(w / cw) + 2, gh = Math.ceil(h / ch) + 2, v = new Float32Array(gw * gh);
      for (let i = 0; i < v.length; i++) v[i] = r(); return { cw, ch, gw, v }; };
    const sample = (G, x, y) => { const fx = x / G.cw, fy = y / G.ch, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), i = iy * G.gw + ix, v = G.v;
      return (v[i] * (1 - sx) + v[i + 1] * sx) * (1 - sy) + (v[i + G.gw] * (1 - sx) + v[i + G.gw + 1] * sx) * sy; };
    const fine = grid(5 * cD, 14 * cD), broad = grid(38 * cD, 150 * cD);
    const toS = (x) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, x)), 1 / 2.2));
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const uu = 0.5 + (u - 0.5) * (0.84 + 0.16 * v);
        const ph = 6.2832 * N * uu + 1.1 * Math.sin(6.2832 * 1.7 * uu + a1) + 0.55 * Math.sin(6.2832 * 3.3 * uu + a2) + 0.3 * Math.sin(6.2832 * 5.9 * uu + a3)
                 + 0.45 * Math.sin(2.6 * v + b1) * Math.sin(6.2832 * 0.9 * uu + a3) + 0.9 * v * Math.sin(6.2832 * 0.45 * uu + b1);
        const sn = Math.sin(ph);
        const crest = Math.pow(sn * 0.5 + 0.5, 0.9);               // broad crest, narrow black valley
        const valley = Math.pow(Math.max(0, -sn), 6);
        const fi = ph / 6.2832, foldMod = 0.75 + 0.45 * (0.5 + 0.5 * Math.sin(fi * 2.39 + a1) * Math.sin(fi * 1.13 + a2 + v * 1.7));
        const mott = 0.72 + 0.5 * sample(fine, x, y) * (0.6 + 0.8 * sample(broad, x, y));
        const gx = side === 0 ? u * 0.5 : 0.5 + u * 0.5;          // position across the whole stage
        const low = Math.min(1, Math.max(0, (v - 0.8) / 0.115)), lowS = low * low * (3 - 2 * low);
        const L = curtLight(gx, v) * (0.88 + 0.24 * sample(broad, x, y)) * foldMod * mott * (1 - 0.9 * valley * (1 - 0.75 * lowS)) * (1 + 0.1 * lowS);
        const cr = crest + (0.62 - crest) * 0.6 * lowS;
        let R = (0.004 + 0.16 * cr) * L, G = (0.0004 + 0.0045 * cr) * L, B = (0.0012 + 0.0075 * cr) * L;
        const hem = hemY + h * (0.0008 * sn + 0.0022 * Math.sin(gx * 19 + a2) + 0.0014 * Math.sin(gx * 47 + a3) + 0.0008 * Math.sin(gx * 113 + a1));
        if (y > hem - h * 0.015) { const k = Math.max(0.4, 1 - 0.6 * (y - (hem - h * 0.015)) / (h * 0.015)); R *= k; G *= k; B *= k; }
        const alpha = y < hem ? 1 : Math.max(0, 1 - (y - hem) / 2);
        const i = (y * w + x) * 4;
        px[i] = toS(R); px[i + 1] = toS(G); px[i + 2] = toS(B); px[i + 3] = Math.round(alpha * 255);
      }
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  function buildCurtain() {
    const r = stage.getBoundingClientRect();
    cD = Math.min(2, window.devicePixelRatio || 1);
    cW = Math.round(r.width * cD); cH = Math.round(r.height * cD);
    cc.width = cW; cc.height = cH;
    const hw = Math.ceil(cW / 2) + 2;
    tex = [velvet(hw + Math.round(6 * cD), cH, 9137, 0), velvet(hw + Math.round(6 * cD), cH, 4421, 1)];
    buildFloor();
    drawCurtain(openP);
  }
  let floorTex = null;
  function buildFloor() {
    // oval stage seen from the front: mauve top band between the hem and a curved front edge,
    // the edge curling back up on the left, wine-dark front face below
    const y0 = Math.round(cH * 0.9), h = cH - y0, w = cW, r = rng(771);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), im = g.createImageData(w, h), px = im.data;
    const grid = (cell) => { const gw = Math.ceil(w / cell) + 3, gh = Math.ceil(h / cell) + 3, v = new Float32Array(gw * gh);
      for (let i = 0; i < v.length; i++) v[i] = r(); return { cell, gw, v }; };
    const smp = (G, x, y) => { const fx2 = x / G.cell, fy = y / G.cell, i = fx2 | 0, j = fy | 0, a = fx2 - i, b = fy - j;
      const sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b), k = j * G.gw + i, v = G.v;
      return (v[k] * (1 - sa) + v[k + 1] * sa) * (1 - sb) + (v[k + G.gw] * (1 - sa) + v[k + G.gw + 1] * sa) * sb; };
    const n1 = grid(26 * cD), n2 = grid(8 * cD), n3 = grid(60 * cD);
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const px1 = 1 / cH;
    for (let y = 0; y < h; y++) {
      const v = (y0 + y) / cH;
      for (let x = 0; x < w; x++) {
        const xb = x / w;
        const edge = 0.967 - 0.004 * ((xb - 0.66) / 0.34) ** 2 - 0.25 * Math.pow(Math.max(0, 0.33 - xb), 1.3) + 0.0015 * (smp(n3, x, 0) - 0.5);   // front edge, curling up on the left
        const lightX = 0.5 + 0.5 * Math.exp(-((xb - 0.62) ** 2) / 0.12);                  // pool of light, centre-right
        const leftDim = sm(0.12, 0.42, xb);
        let R, G, B;
        if (v < edge - 1.5 * px1) {                                    // top surface
          const mott = 0.82 + 0.26 * smp(n1, x, y) + 0.12 * smp(n2, x, y);
          const nearEdge = 0.85 + 0.15 * sm(edge - 0.03, edge - 0.004, v);
          const k = lightX * (0.3 + 0.7 * leftDim) * mott * nearEdge;
          R = 62 * k; G = 36 * k; B = 41 * k;
        } else if (v < edge + 1.5 * px1) {                             // thin worn lip catching the light
          const k = (0.55 + 0.45 * lightX) * (0.7 + 0.3 * leftDim);
          R = 66 * k; G = 40 * k; B = 45 * k;
        } else {                                                        // front face / floor in front
          const d = sm(edge, 1.02, v);
          const k = (0.45 + 0.65 * lightX) * (0.62 + 0.38 * leftDim) * (0.9 + 0.2 * smp(n1, x, y)) * (1 - 0.15 * d);
          R = 33 * k; G = 16 * k; B = 19 * k;
        }
        const i = (y * w + x) * 4;
        px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    floorTex = { c, y0 };
  }
  function drawFloor(a) {
    if (a <= 0 || !floorTex) return;
    cctx.globalAlpha = a;
    cctx.drawImage(floorTex.c, 0, floorTex.y0);
    cctx.globalAlpha = 1;
  }
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let residue = null, resT0 = 0, resOn = false;
  function startResidue() {
    if (reduce || resOn) return; resOn = true;
    const r = rng(5150), n = 7500, pal = ['#9a1222', '#c01a2c', '#d8283c', '#ee4a58', '#ff7a84', '#ffffff', '#ffe9e9'];
    residue = Array.from({ length: n }, () => {
      const x = r(), y = r() * 0.9, white = r() < 0.12;
      const clump = 0.5 + 0.5 * Math.sin(x * 9 + y * 5) * Math.sin(x * 4 - y * 7);   // patchy clearing
      return { x, y, s: (white ? 0.9 + r() * 1.4 : 0.5 + r() * 1.2), c: white ? pal[5 + (r() * 2 | 0)] : pal[r() * 5 | 0],
        tf: 1.4 + 4.2 * Math.min(1, Math.hypot(x - 0.5, (y - 0.48) * 0.7) / 0.55) * (0.6 + 0.4 * clump) + r() * 1.4 + (white ? 0.8 : 0), tw: r() * 6.28, white };
    });
    residue.sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : 0));          // one fillStyle per colour
    resT0 = performance.now();
    const loop = (now) => {
      const t = (now - resT0) / 1000;
      if (!opening) drawCurtain(openP);
      if (t < 8.4) requestAnimationFrame(loop); else { residue = null; if (!opening) drawCurtain(openP); }
    };
    requestAnimationFrame(loop);
  }
  function drawResidue() {
    if (!residue) return;
    const t = (performance.now() - resT0) / 1000, half = cW / 2;
    const e = ease(openP), shift = (half - cW * 0.085) * e;
    for (const g of residue) {
      const k = 1 - Math.min(1, Math.max(0, (t - g.tf + 0.6) / 0.6));
      if (k <= 0) continue;
      let x = g.x * cW; x += x < half ? -shift : shift;               // specks ride on the parting curtains
      const y = g.y * cH + Math.max(0, t - g.tf + 0.6) * 40 * cD;      // and slip down as they fade
      const tw = g.white ? 0.45 + 0.55 * Math.max(0, Math.sin(t * 7 + g.tw)) : 1;
      cctx.globalAlpha = k * tw * (g.white ? 0.95 : 0.8);
      if (cctx.fillStyle !== g.c) cctx.fillStyle = g.c;
      const sz = g.s * cD;
      cctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    cctx.globalAlpha = 1;
  }
  function drawCurtain(p) {
    if (!tex[0]) return;
    cctx.clearRect(0, 0, cW, cH);
    const e = ease(p), half = cW / 2;           // a narrow strip stays at each side as a frame
    drawFloor(1 - Math.min(1, Math.max(0, (p - 0.5) / 0.4)));
    // light spilling under the parting before it opens
    if (curtains.classList.contains('lit') && p < 0.6) {
      const gl = cctx.createRadialGradient(half, cH * 0.93, 0, half, cH * 0.93, cW * 0.16);
      gl.addColorStop(0, `rgba(255,140,160,${0.22 * (1 - p / 0.6)})`); gl.addColorStop(1, 'rgba(255,140,160,0)');
      cctx.fillStyle = gl; cctx.fillRect(0, cH * 0.8, cW, cH * 0.2);
    }
    const bands = 80, bh = cH / bands, swing = Math.sin(Math.PI * Math.min(1, p));
    if (p === 0) {                                                     // closed: draw each half in one go
      cctx.drawImage(tex[0], -(tex[0].width - half), 0);
      cctx.drawImage(tex[1], half, 0);
      drawResidue();
      return;
    }
    for (let side = 0; side < 2; side++) {
      const t = tex[side], tw = t.width;
      for (let b = 0; b < bands; b++) {
        const v = (b + 0.5) / bands;
        const keep = cW * (0.15 - 0.065 * Math.pow(v, 1.4));             // tied back: wider at the top, narrower at the floor
        const shift = Math.max(0, (half - keep) * e - cW * 0.075 * swing * v * v);   // the hem trails a little behind the top
        const x = side === 0 ? -shift - (tw - half) : half + shift;
        cctx.drawImage(t, 0, b * bh, tw, bh + 1, x, b * bh, tw, bh + 1);
        if (e > 0.3 && v < 0.912) { cctx.fillStyle = `rgba(4,0,1,${0.28 * (e - 0.3) / 0.7})`; cctx.fillRect(side === 0 ? x + tw - half : x, b * bh, half, bh + 1); }
        if (e > 0.002) {
          const ex = side === 0 ? x + tw : x, dir = side === 0 ? 1 : -1;
          // soft shadow cast onto the stage, and a pink rim of stage light on the edge
          const sh = cctx.createLinearGradient(ex, 0, ex + dir * 26 * cD, 0);
          sh.addColorStop(0, `rgba(0,0,0,${0.55 * Math.min(1, e * 3)})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
          cctx.fillStyle = sh; cctx.fillRect(side === 0 ? ex : ex - 26 * cD, b * bh, 26 * cD, bh + 1);
          const rim = cctx.createLinearGradient(ex, 0, ex - dir * 10 * cD, 0);
          rim.addColorStop(0, `rgba(255,140,160,${0.30 * Math.min(1, e * 3) * (0.4 + v)})`); rim.addColorStop(1, 'rgba(255,140,160,0)');
          cctx.fillStyle = rim; cctx.fillRect(side === 0 ? ex - 10 * cD : ex, b * bh, 10 * cD, bh + 1);
        }
      }
    }
    drawResidue();
  }
  function openCurtains() {
    curtains.classList.add('open');
    if (reduce) { openP = 1; drawCurtain(1); return; }
    if (opening || openP >= 1) return; opening = true;
    const t0 = performance.now(), dur = 5200;
    const step = (now) => {
      openP = Math.min(1, (now - t0) / dur);
      drawCurtain(openP);
      if (openP < 1) requestAnimationFrame(step); else opening = false;
    };
    requestAnimationFrame(step);
  }
  let curtainReady = false;
  function ensureCurtain() { if (!curtainReady) { curtainReady = true; buildCurtain(); } }
  let cRs = 0;
  window.addEventListener('resize', () => { clearTimeout(cRs); cRs = setTimeout(() => { if (curtainReady) buildCurtain(); }, 250); });

  /* ---------- stage: glitter shower + light line (drawn in image coordinates, 1024 x 1536) ---------- */
  const frameEl = $('#stage .frame');
  const sp = $('#sparks'), sctx = sp.getContext('2d');
  const IW = 1024, IH = 1536;
  const lineX = (y) => 2 + 0.586 * y;            // bright edge of the light beam in the photo
  const LINE_END = 790, STREAK_END = 980;
  let settle = [], settleT0 = 0, dots = [], streaks = [], sparkOn = false, sparkVisible = true, k = 1, last = 0, lineA = 0;
  const SDPR = Math.min(2, DPR);
  function sizeSparks() {
    const r = frameEl.getBoundingClientRect();
    sp.width = Math.round(r.width * SDPR); sp.height = Math.round(r.height * SDPR);
    k = r.width / IW;
    sctx.setTransform(SDPR * k, 0, 0, SDPR * k, 0, 0);
    dots = Array.from({ length: 120 }, () => newDot(true));
    settle = Array.from({ length: 260 }, () => {                     // the last of the blown glitter, still drifting down
      const white = Math.random() < 0.22;
      return { x: 60 + Math.random() * 904, y: -250 - Math.random() * 2300, vy: 90 + Math.random() * 140, sw: Math.random() * 6.28,
        r: white ? 1.4 + Math.random() * 2 : 1.6 + Math.random() * 2.8, c: white ? '255,250,248' : (Math.random() < 0.5 ? '214,40,60' : '160,18,34'), p: Math.random() * 6.28 };
    });
    settleT0 = performance.now();
    streaks = Array.from({ length: 120 }, () => newStreak(true));
  }
  function newDot(anywhere) {
    return { x: 120 + Math.random() * 800, y: anywhere ? Math.random() * IH : -20 - Math.random() * 200,
      vy: 22 + Math.random() * 60, sw: Math.random() * 6.28, r: 1.1 + Math.random() * 2.4, p: Math.random() * 6.28,
      c: Math.random() < 0.7 ? '255,255,255' : '255,214,200' };
  }
  function newStreak(anywhere) {
    // falls straight down; only visible where it crosses the beam
    const y0 = anywhere ? Math.random() * 1200 : -40 - Math.random() * 300;
    const yc = Math.max(0, y0 + 80 + Math.random() * 600);           // point where it will cross the beam
    return { x: lineX(yc) - Math.random() * (30 + 0.12 * yc), y: y0, vy: 260 + Math.random() * 360,
      len: 14 + Math.random() * 30, a: 0.35 + Math.random() * 0.55 };
  }
  function startSparks() {
    if (reduce || sparkOn) return;
    sparkOn = true; sizeSparks();
    const io = new IntersectionObserver((en) => {
      sparkVisible = en[0].isIntersecting;
      if (sparkVisible) { last = 0; requestAnimationFrame(sparkFrame); }
    });
    io.observe(stage);
    requestAnimationFrame(sparkFrame);
  }
  function sparkFrame(now) {
    if (!sparkVisible) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    sctx.clearRect(0, 0, IW, IH);
    sctx.globalCompositeOperation = 'lighter';

    // sharp light line from the top-left corner down to the ring
    lineA = Math.min(1, lineA + dt * 0.5);
    const g = sctx.createLinearGradient(0, 0, lineX(LINE_END), LINE_END);
    g.addColorStop(0, 'rgba(255,240,230,0)');
    g.addColorStop(0.2, `rgba(255,236,226,${0.55 * lineA})`);
    g.addColorStop(0.7, `rgba(255,214,200,${0.4 * lineA})`);
    g.addColorStop(1, 'rgba(255,200,190,0)');
    sctx.strokeStyle = g; sctx.lineWidth = 2.2;
    sctx.shadowColor = 'rgba(255,220,210,.8)'; sctx.shadowBlur = 10 * k * SDPR;
    sctx.beginPath(); sctx.moveTo(lineX(0), 0); sctx.lineTo(lineX(LINE_END), LINE_END); sctx.stroke();
    sctx.shadowBlur = 0;

    // glitter streaks catching the beam
    sctx.lineCap = 'round';
    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i];
      s.y += s.vy * dt;
      const d = lineX(s.y) - s.x;                       // >0 means the streak is left of the edge line (inside the beam)
      const half = 26 + 0.11 * s.y;
      if (s.y > STREAK_END || d > half * 2.2) { streaks[i] = newStreak(false); continue; }
      if (d < -6) continue;
      const inside = Math.exp(-Math.pow((d - half * 0.45) / half, 2));
      const alpha = s.a * inside * (1 - s.y / STREAK_END);
      if (alpha < 0.02) continue;
      sctx.strokeStyle = `rgba(255,236,228,${alpha})`; sctx.lineWidth = 1.5;
      sctx.beginPath(); sctx.moveTo(s.x, s.y - s.len); sctx.lineTo(s.x, s.y); sctx.stroke();
    }

    // leftover glitter settling for the first seconds after the curtains part
    if (settle.length) {
      const st = (now - settleT0) / 1000, fadeAll = Math.max(0, 1 - Math.max(0, st - 7) / 3);
      sctx.globalCompositeOperation = 'source-over';
      for (let i = settle.length - 1; i >= 0; i--) {
        const s = settle[i];
        s.vy = Math.max(38, s.vy * Math.exp(-0.25 * dt)); s.y += s.vy * dt; s.x += Math.sin(now / 900 + s.sw) * 14 * dt;
        if (s.y > IH - 150 || fadeAll <= 0) { settle.splice(i, 1); continue; }
        if (s.y < 0) continue;
        const tw = 0.55 + 0.45 * Math.sin(now / 260 + s.p);
        sctx.fillStyle = `rgba(${s.c},${(0.85 * tw * fadeAll).toFixed(3)})`;
        sctx.fillRect(s.x, s.y, s.r, s.r * 1.6);
      }
      sctx.globalCompositeOperation = 'lighter';
    }
    // drifting sparkles over the whole stage, a little brighter near the couple
    for (let i = 0; i < dots.length; i++) {
      const s = dots[i];
      s.y += s.vy * dt; s.x += Math.sin(now / 1300 + s.sw) * 6 * dt;
      if (s.y > IH - 120) { dots[i] = newDot(false); continue; }
      const tw = Math.max(0, Math.sin(now / 420 + s.p));
      const near = Math.exp(-Math.pow((s.y - 1000) / 520, 2));
      const alpha = (0.18 + 0.75 * tw) * (0.45 + 0.55 * near);
      sctx.fillStyle = `rgba(${s.c},${alpha})`;
      sctx.beginPath(); sctx.arc(s.x, s.y, s.r * (0.6 + 0.5 * tw), 0, Math.PI * 2); sctx.fill();
      if (tw > 0.93 && s.r > 2.4) {                    // the odd star-glint
        sctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;
        sctx.fillRect(s.x - s.r * 3, s.y - 0.5, s.r * 6, 1); sctx.fillRect(s.x - 0.5, s.y - s.r * 3, 1, s.r * 6);
      }
    }
    sctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(sparkFrame);
  }

  /* dancing-couple video (added once the clip exists: <video data-src="assets/stage.mp4">) */
  const bgv = $('#bgv');
  if (bgv && bgv.dataset.src && !reduce) {
    bgv.addEventListener('playing', () => bgv.classList.add('on'), { once: true });
    bgv.muted = true; bgv.defaultMuted = true; bgv.setAttribute('muted', '');
    bgv.preload = 'auto';
    const mp4 = bgv.dataset.src, webm = mp4.replace(/\.mp4$/, '.webm');
    bgv.src = bgv.canPlayType('video/mp4; codecs="avc1.640020"') ? mp4 : webm; bgv.load();
    const tryPlay = () => bgv.play().catch(() => {});
    tryPlay(); document.addEventListener('pointerdown', tryPlay, { once: true });
  }

  /* ---------- countdown ---------- */
  const target = Date.parse('2026-11-29T11:00:00+03:00');
  function tick() {
    let ms = target - Date.now();
    if (ms <= 0) { document.querySelector('.cdbig').hidden = true; $('#today').hidden = false; return; }
    const d = Math.floor(ms / 864e5); ms -= d * 864e5;
    const h = Math.floor(ms / 36e5); ms -= h * 36e5;
    const m = Math.floor(ms / 6e4); ms -= m * 6e4;
    const s = Math.floor(ms / 1e3);
    $('#cd-d').textContent = d; $('#cd-h').textContent = String(h).padStart(2, '0');
    $('#cd-m').textContent = String(m).padStart(2, '0'); $('#cd-s').textContent = String(s).padStart(2, '0');
  }
  tick(); setInterval(tick, 1000);

  /* ---------- handoff: dithered seam gradient, drifting glitter, stage dimming ---------- */
  (function handoff() {
    const bgc = $('#seam-bg'), dc = $('#seam-dust'), dimEl = $('#stage-dim'), seamEl = $('.seam');
    if (!bgc) return;
    const bctx = bgc.getContext('2d'), dctx = dc.getContext('2d');
    // colour stops (sRGB) and opacity along the seam, top to bottom
    const STOPS = [[0, [26, 6, 10], 0], [0.16, [28, 7, 12], 0.72], [0.32, [36, 10, 15], 1], [0.56, [112, 64, 68], 1], [0.8, [206, 182, 178], 1], [1, [236, 232, 227], 1]];
    const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const toS = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    // monotone cubic interpolation per channel (no flat plateaus at the stops, no overshoot)
    function mono(xs, ys) {
      const n = xs.length, d = [], m = new Array(n);
      for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
      m[0] = d[0]; m[n - 1] = d[n - 2];
      for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
      for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
        const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
        if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
      }
      return (x) => {
        let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
        const hh = xs[i + 1] - xs[i], t = (x - xs[i]) / hh, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * m[i + 1];
      };
    }
    const xs = STOPS.map((s) => s[0]);
    const fr = mono(xs, STOPS.map((s) => toLin(s[1][0]))), fg = mono(xs, STOPS.map((s) => toLin(s[1][1]))),
          fb = mono(xs, STOPS.map((s) => toLin(s[1][2]))), fa = mono(xs, STOPS.map((s) => s[2]));
    let SW = 0, SH = 0, sd = 1;
    function paintSeam() {
      const r = seamEl.getBoundingClientRect();
      sd = Math.min(2, window.devicePixelRatio || 1); SW = r.width; SH = r.height;
      const w = Math.round(SW * sd), h = Math.round(SH * sd);
      bgc.width = w; bgc.height = h; dc.width = w; dc.height = h;
      dctx.setTransform(sd, 0, 0, sd, 0, 0);
      const im = bctx.createImageData(w, h), px = im.data;
      for (let y = 0; y < h; y++) {
        const t = y / (h - 1);
        const R = toS(fr(t)), G = toS(fg(t)), B = toS(fb(t)), A = Math.min(1, Math.max(0, fa(t))) * 255;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4, n = Math.random() + Math.random() - 1;      // triangular dither, ±1 level
          px[i] = R + n; px[i + 1] = G + n; px[i + 2] = B + n; px[i + 3] = A + n * 1.5;
        }
      }
      bctx.putImageData(im, 0, 0);
      seedDust();
    }
    let dust = [];
    // falling glitter lands on the top edge of the countdown box and stays there, twinkling
    let landY = SH, lx0 = 0, lx1 = 0, settled = [];
    function measureLand() {
      const sr = seamEl.getBoundingClientRect(), br = document.querySelector('.cdbig').getBoundingClientRect();
      landY = br.top - sr.top; lx0 = br.left - sr.left; lx1 = br.right - sr.left;
    }
    function seedDust() { measureLand(); settled = []; dust = Array.from({ length: Math.round(SW * 0.45) }, () => newD(true)); }
    function newD(any) {
      const r = Math.random();
      return { x: Math.random() * SW, y: any ? Math.random() * landY * 0.95 : -6, v: 7 + Math.random() * 24, r: 0.5 + Math.random() * 1.7, p: Math.random() * 6.28,
        c: r < 0.34 ? '255,255,255' : r < 0.72 ? '255,150,162' : '220,186,128' };
    }
    let seamOn = false, lastD = 0;
    function dustFrame(t) {
      if (!seamOn) { lastD = 0; return; }
      const dt = lastD ? Math.min(0.05, (t - lastD) / 1000) : 0.016; lastD = t;
      dctx.clearRect(0, 0, SW, SH);
      for (let i = 0; i < dust.length; i++) {
        const s = dust[i];
        if (!reduce) { s.y += s.v * dt; s.x += Math.sin(t / 1400 + s.p) * 6 * dt; }
        if (s.y >= landY) {
          if (s.x > lx0 && s.x < lx1 && settled.length < 220) settled.push({ x: s.x, y: landY - 0.5 - Math.random() * 1.5, r: s.r * 0.8, c: s.c, p: s.p, born: t });
          dust[i] = newD(false); continue;
        }
        const fade = s.x > lx0 && s.x < lx1 ? 1 : Math.max(0, 1 - Math.pow(s.y / landY, 1.5)), tw = 0.35 + 0.65 * Math.max(0, Math.sin(t / 380 + s.p));
        dctx.fillStyle = `rgba(${s.c},${(fade * tw).toFixed(3)})`;
        dctx.beginPath(); dctx.arc(s.x, s.y, s.r, 0, 6.283); dctx.fill();
      }
      for (const g of settled) {
        const tw = 0.45 + 0.55 * Math.max(0, Math.sin(t / 300 + g.p)), grow = Math.min(1, (t - g.born) / 400);
        dctx.fillStyle = `rgba(${g.c},${(tw * grow).toFixed(3)})`;
        dctx.beginPath(); dctx.arc(g.x, g.y, g.r, 0, 6.283); dctx.fill();
        if (tw > 0.97 && g.r > 1) { dctx.fillStyle = 'rgba(255,255,255,.8)'; dctx.fillRect(g.x - 4, g.y - 0.4, 8, 0.8); dctx.fillRect(g.x - 0.4, g.y - 4, 0.8, 8); }
      }
      requestAnimationFrame(dustFrame);
    }
    new IntersectionObserver((en) => {
      const v = en[0].isIntersecting;
      if (v && !seamOn) { seamOn = true; requestAnimationFrame(dustFrame); } else if (!v) seamOn = false;
    }).observe(seamEl);
    // the page covers the stage: dim it, then stop drawing it once it is fully hidden
    const vid = $('#bgv');
    let hidden = false;
    function onCover() {
      const k = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.9)));
      dimEl.style.opacity = (k * 0.8).toFixed(3);
      const covered = window.scrollY > window.innerHeight + SH * 0.4;
      if (covered !== hidden) {
        hidden = covered;
        stage.style.visibility = covered ? 'hidden' : '';
        if (vid && vid.src) { if (covered) vid.pause(); else vid.play().catch(() => {}); }
        if (covered) sparkVisible = false; else if (sparkOn && !sparkVisible) { sparkVisible = true; last = 0; requestAnimationFrame(sparkFrame); }
      }
    }
    window.addEventListener('scroll', onCover, { passive: true });
    paintSeam(); onCover();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLand);
    let rs = 0; window.addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(paintSeam, 200); });
  })();

  /* ---------- map: settles from a slight tilt as it scrolls into view ---------- */
  (function mapTilt() {
    const m = $('#mapart'); if (!m || reduce) return;
    const tilt = m.querySelector('.tilt');
    const upd = () => {
      const r = m.getBoundingClientRect(), vh = window.innerHeight;
      const k = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.55)));     // 0 entering, 1 settled by mid-screen
      tilt.style.setProperty('--mt', (18 * (1 - k)).toFixed(2) + 'deg');
      tilt.style.setProperty('--ms', (0.94 + 0.06 * k).toFixed(3));
    };
    window.addEventListener('scroll', upd, { passive: true }); upd();
  })();

  /* ---------- forms: shuttle confirmation and notes (Google Sheet via Apps Script) ---------- */
  (function forms() {
    const URL_ = window.MIKUMI_FORM || '';
    const T = (sw, en) => (html.dataset.lang === 'en' ? en : sw);
    const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
    document.querySelectorAll('.form-sec').forEach((sec) => {
      const form = sec.querySelector('form'), done = sec.querySelector('.done'), closed = sec.querySelector('.closed'),
            nokey = sec.querySelector('[data-when="nokey"]'), err = sec.querySelector('.err');
      const type = sec.id === 'shuttle' ? 'shuttle' : 'note', skey = 'mikumi-' + type + '-' + fam + '-' + (guest || '').toLowerCase();
      const isClosed = Date.now() > Date.parse(sec.dataset.deadline);
      const show = (w) => { form.hidden = w !== 'form'; done.hidden = w !== 'done'; closed.hidden = w !== 'closed'; nokey.hidden = w !== 'nokey'; };
      if (!key || !URL_) { show('nokey'); return; }
      const nameIn = form.querySelector('[name="name"]'); if (guest) nameIn.value = guest;
      // stepper and counters

      const msg = form.querySelector('#nt-msg'), cnt = form.querySelector('#nt-cnt');
      if (msg) msg.addEventListener('input', () => { cnt.textContent = msg.value.length + ' / 300'; });
      const own = () => { const p = form.querySelector('[name="pickup"]:checked'); return p && p.value === 'Usafiri wangu'; };
      form.querySelectorAll('[name="pickup"]').forEach((r) => r.addEventListener('change', () => {
        const o = own(); const el = form.querySelector('#sh-ret-f'); if (el) el.disabled = o;
      }));
      function fill(d) {
        if (!d) return;
        if (d.name) nameIn.value = d.name;
        if (type === 'shuttle') {
          form.querySelector('#sh-phone').value = d.phone || '';
          form.querySelectorAll('[name="pickup"]').forEach((r) => { r.checked = r.value === d.pickup; r.dispatchEvent(new Event('change')); });
          form.querySelectorAll('[name="ret"]').forEach((r) => { r.checked = r.value === d.ret; });
          const pk = d.pickup === 'Usafiri wangu' ? T('Usafiri wako mwenyewe', 'Your own transport') : d.pickup;
          $('#sh-sum').textContent = d.pickup === 'Usafiri wangu' ? pk : `${pk} · ${T('kurudi', 'return')}: ${d.ret === 'Ndiyo' ? T('ndiyo', 'yes') : T('hapana', 'no')}`;
        } else {
          msg.value = d.msg || ''; cnt.textContent = msg.value.length + ' / 300';
          $('#nt-sum').textContent = `“${d.msg}” — ${d.name}`;
        }
      }
      const saved = store(skey);
      if (saved) { fill(saved); show(isClosed ? 'done' : 'done'); } else show(isClosed ? 'closed' : 'form');
      if (isClosed) { const a = done.querySelector('.again'); if (a) a.hidden = true; }
      // pick up an answer given on another phone
      if (!saved && guest) {
        fetch(`${URL_}?type=${type}&k=${encodeURIComponent(key)}&f=${fam}&n=${encodeURIComponent(guest)}`).then((r) => r.json()).then((r) => {
          if (!r || !r.found) return;
          const v = r.row, d = type === 'shuttle' ? { name: v[1], phone: v[3], pickup: v[4], count: v[5], ret: v[6] } : { name: v[1], msg: v[3] };
          store(skey, d); fill(d); show('done'); if (isClosed) { const a = done.querySelector('.again'); if (a) a.hidden = true; }
        }).catch(() => {});
      }
      done.querySelector('.again').addEventListener('click', () => { show('form'); err.hidden = true; });
      form.addEventListener('submit', (e) => {
        e.preventDefault(); err.hidden = true;
        const fd = new FormData(form);
        const d = { type, k: key, n: guest || '', f: fam, website: fd.get('website') || '', name: (fd.get('name') || '').trim() };
        if (!d.name) return fail(T('Tafadhali andika jina lako.', 'Please enter your name.'));
        if (type === 'shuttle') {
          d.phone = (fd.get('phone') || '').trim(); d.pickup = fd.get('pickup');
          if (!d.pickup) return fail(T('Tafadhali chagua utapanda wapi.', 'Please choose where you will board.'));
          if (d.phone && !/^[+0-9 ]{9,16}$/.test(d.phone)) return fail(T('Tafadhali andika namba sahihi ya WhatsApp.', 'Please enter a valid WhatsApp number.'));
          d.count = own() ? 0 : 1; d.ret = own() ? '-' : fd.get('ret');
        } else {
          d.msg = (fd.get('msg') || '').trim();
          if (d.msg.length < 2) return fail(T('Tafadhali andika ujumbe.', 'Please write a note.'));
        }
        const btn = form.querySelector('button[type="submit"]'); btn.disabled = true; btn.classList.add('busy');
        fetch(URL_, { method: 'POST', body: JSON.stringify(d) }).then((r) => r.json()).then((r) => {
          btn.disabled = false; btn.classList.remove('busy');
          if (r && r.ok) { delete d.k; delete d.website; store(skey, d); fill(d); show('done'); done.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          else if (r && r.err === 'closed') show('closed');
          else fail(T('Imeshindikana kutuma. Jaribu tena.', 'Could not send. Please try again.'));
        }).catch(() => { btn.disabled = false; btn.classList.remove('busy'); fail(T('Hakuna mtandao. Jaribu tena.', 'No connection. Please try again.')); });
        function fail(t) { err.textContent = t; err.hidden = false; return false; }
      });
      function fail(t) { err.textContent = t; err.hidden = false; }
    });
  })();

  /* ---------- boot ---------- */
  // the glitter is on screen from the first frame; the heavier curtain texture is prepared right after
  size_(); build();
  state = 'idle'; for (let i = 0; i < N; i++) { px[i] = tx[i]; py[i] = ty[i]; }
  drawBase(1); drawParticles(() => 1); drawReflection(1);
  tLoad = performance.now(); lastT = tLoad;
  requestAnimationFrame(frame);
  requestAnimationFrame(() => intro.classList.add('in'));
  setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(ensureCurtain, { timeout: 1200 }) : ensureCurtain()), 350);
  setTimeout(askMic, reduce ? 0 : 1400);
  window.addEventListener('orientationchange', () => setTimeout(() => {
    if (state === 'idle') { size_(); build(); for (let i = 0; i < N; i++) { px[i] = tx[i]; py[i] = ty[i]; } ctx.clearRect(0, 0, W, H); drawBase(1); drawParticles(() => 1); drawReflection(1); }
    if (sparkOn) sizeSparks();
  }, 300));
})();
