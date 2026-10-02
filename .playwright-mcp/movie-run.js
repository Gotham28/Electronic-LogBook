async (page) => {
  const MODE = page.__MODE || 'desktop';
  const REDUCED = !!page.__REDUCED;
  const FULL = page.__FULL !== false;
  const TAG = page.__TAG || ('r3-' + MODE + (REDUCED ? '-reduced' : ''));
  const R = page.__R = { done: false, api: [], scenes: {}, checks: {}, errors: [], phase: 'init', mode: MODE, reduced: REDUCED };
  page.removeAllListeners('request'); page.removeAllListeners('pageerror'); page.removeAllListeners('console');
  page.on('request', r => { if (r.url().includes('/api/')) R.api.push(r.method() + ' ' + r.url()); });
  page.on('pageerror', e => R.errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') R.errors.push('console.error: ' + m.text().slice(0, 160)); });
  const SH = 'D:\\Electronic-LogBook-main\\.agents\\runs\\shots\\';
  const sleep = ms => page.waitForTimeout(ms);
  const state = () => page.evaluate(() => { const r = document.querySelector('[data-testid="demo-movie-root"]'); return r ? { scene: r.dataset.sceneId, phase: r.dataset.phase } : null; });
  const rectsFn = () => {
    const q = s => document.querySelector(s);
    const rc = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };
    const skip = q('[data-testid="demo-movie-skip"]');
    const cap = q('[data-testid="demo-movie-root"] [role="status"]');
    const fixedBottom = [...document.querySelectorAll('body *')].filter(e => { if (e.closest('[data-testid="demo-movie-root"]') || e.closest('[data-testid="cookie-consent-banner"]')) return false; if (getComputedStyle(e).position !== 'fixed') return false; const r = e.getBoundingClientRect(); return r.bottom >= innerHeight - 2 && r.width > innerWidth * 0.85; }).map(rc);
    return { pill: rc(skip && skip.parentElement), caption: rc(cap), header: rc(q('header')), headerImgs: [...document.querySelectorAll('header img, header svg')].slice(0, 4).map(rc), roleSelect: rc(q('select[aria-label="Demo role"]')), deptSelect: rc(q('select[aria-label="Demo department"]')), banner: rc(q('aside[aria-label="Demo environment"]')), launcher: rc(q('[data-tour="arogya-launcher"]')), nav: fixedBottom[0] || null, cookie: rc(q('[data-testid="cookie-consent-banner"]')), vh: innerHeight };
  };
  const acceptDisclaimer = async () => { const d = page.getByRole('button', { name: 'I Accept and Agree' }); if (await d.count() > 0) { R.checks.disclaimerSeen = true; await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /I Accept and Agree/.test(x.innerText)); if (!b) return; let root = b; while (root.parentElement && getComputedStyle(root).position !== 'fixed') root = root.parentElement; root.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = e.scrollHeight; }); }); await sleep(400); try { await d.first().click({ timeout: 1500 }); } catch (e) { R.checks.disclaimerBlockedByCookieBanner = true; try { await page.getByRole('button', { name: 'Reject All' }).click({ timeout: 1500 }); } catch (e2) {} } } };
  const waitRoot = async (ms) => { const t = Date.now(); while (Date.now() - t < ms) { await acceptDisclaimer(); if (await state()) return Date.now() - t; await sleep(250); } throw new Error('movie root never appeared'); };
  const coachFn = () => { const m = document.querySelector('[data-tour="arogya-messages"]'); const last = m && m.lastElementChild; let sc = m; while (sc && !(getComputedStyle(sc).overflowY === 'auto' || getComputedStyle(sc).overflowY === 'scroll')) sc = sc.parentElement; const lr = last && last.getBoundingClientRect(); const cr = sc && sc.getBoundingClientRect(); const p = document.querySelector('[data-tour="arogya-panel"]'); const labels = [...(m ? m.querySelectorAll('*') : [])].filter(e => e.children.length === 0 && /Sample AI output/i.test(e.textContent || '')); const lastLabel = labels[labels.length - 1]; const ll = lastLabel && lastLabel.getBoundingClientRect(); return { lastMsgFullyVisible: !!(lr && cr && lr.top >= cr.top - 1 && lr.bottom <= cr.bottom + 1), lastLabelVisible: !!(ll && cr && ll.top >= cr.top - 1 && ll.bottom <= cr.bottom + 1), labelCount: labels.length, scrolledToBottom: sc ? Math.abs(sc.scrollTop + sc.clientHeight - sc.scrollHeight) < 4 : null, panelHasLabel: p ? /Sample AI output/i.test(p.innerText) : null, tipsInDom: m ? (m.innerText.match(/\b[1-3]\. /g) || []).length : 0 }; };
  const play = async (label, opts) => {
    const t0 = Date.now(); const done = {}; const seen = {};
    while (Date.now() - t0 < 150000) {
      await sleep(250);
      const st = await state(); if (!st) continue;
      if (st.phase === 'ended') return { ended: true, ms: Date.now() - t0 };
      const sc = st.scene; if (!seen[sc]) seen[sc] = Date.now();
      const el = Date.now() - seen[sc];
      if (opts.rects) {
        const rs = R.scenes[sc] = R.scenes[sc] || { firstMs: Date.now() - t0 };
        if (el >= 2500 && !done[sc + 'a']) { done[sc + 'a'] = 1; rs.a = await page.evaluate(rectsFn); }
        if (el >= 6000 && !done[sc + 'b']) { done[sc + 'b'] = 1; rs.b = await page.evaluate(rectsFn); }
      }
      if (opts.checks) {
        if (sc === 'scene-01-dashboard' && el >= 2700 && !done.cookie) {
          done.cookie = 1;
          R.checks.cookie = await page.evaluate(() => { const t = document.querySelector('[data-testid="cookie-consent-banner"]'); if (!t) return { present: false }; const b = [...t.querySelectorAll('button')].find(x => /reject all/i.test(x.innerText)); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { present: true, z: getComputedStyle(t).zIndex, btnHit: hit === b || b.contains(hit) }; });
          if (R.checks.cookie.present && R.checks.cookie.btnHit) { try { await page.getByRole('button', { name: 'Reject All' }).click({ timeout: 2000 }); await sleep(300); R.checks.cookie.clickedThenGone = await page.evaluate(() => !document.querySelector('[data-testid="cookie-consent-banner"]')); } catch (e) { R.checks.cookie.clickError = String(e).slice(0, 120); } }
        }
        if (sc === 'scene-02-caselog' && el >= 4600 && !done.kbd && MODE === 'desktop' && !REDUCED) {
          done.kbd = 1;
          const dlg = () => page.evaluate(() => !![...document.querySelectorAll('[role="dialog"]')].find(d => !d.closest('[data-testid="demo-movie-root"]')));
          const act = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute('data-testid') || a.tagName) : null; });
          const k = R.checks.kbd = { dialogOpenBefore: await dlg(), activeBefore: await act() };
          await page.keyboard.press('Tab'); await sleep(800); k.afterTab1 = await act(); k.dialogAfterTab1 = await dlg();
          if (k.afterTab1 !== 'demo-movie-skip') { await page.keyboard.press('Tab'); await sleep(500); k.afterTab2 = await act(); }
        }
        if (sc === 'scene-04-coach' && el >= 7200 && !done.coach) {
          done.coach = 1;
          R.checks.coach = await page.evaluate(coachFn);
          try { await page.screenshot({ path: SH + TAG + '-coach.png' }); R.checks.coachShot = TAG + '-coach.png'; } catch (e) { R.checks.coachShot = String(e).slice(0, 120); }
          if (opts.stopAfterCoach) return { stopped: 'after-coach' };
        }
        if (sc === 'scene-06-appraisal' && el >= 10000 && !done.appr) { done.appr = 1; R.checks.appraisal = await page.evaluate(() => { const t = document.getElementById('appraisal-faculty-remarks'); return { remarksLen: t ? t.value.length : null, label: /Sample AI output/i.test(document.body.innerText) }; }); }
        if (sc === 'scene-09-hod-report' && el >= 9000 && !done.rep) { done.rep = 1; R.checks.report = await page.evaluate(() => ({ label: /Sample AI output/i.test(document.body.innerText) })); }
      }
      if (opts.reviewKey && sc === 'scene-05-review' && el >= 3000 && !done.rev) { done.rev = 1; R.checks[opts.reviewKey] = await page.evaluate(() => !!document.querySelector('[data-tour="review-first-item"]')); if (opts.stopAfterReview) return { stopped: 'after-review-check' }; }
      if (opts.untilScene && sc === opts.untilScene && el >= 500) return { stopped: 'reached ' + sc };
    }
    return { timeout: true };
  };
  const summarize = () => {
    const hit = (a, b) => !!(a && b && a.x < b.r && a.r > b.x && a.y < b.b && a.b > b.y);
    const bad = []; const table = []; let n = 0;
    for (const [sc, v] of Object.entries(R.scenes)) for (const k of ['a', 'b']) { const s = v[k]; if (!s) continue; n++;
      const o = { pillVsHeader: hit(s.pill, s.header), pillVsHeaderImgs: (s.headerImgs || []).some(i => hit(s.pill, i)), pillVsRole: hit(s.pill, s.roleSelect), pillVsDept: hit(s.pill, s.deptSelect), pillVsBanner: hit(s.pill, s.banner), pillVsLauncher: hit(s.pill, s.launcher), pillVsCaption: hit(s.pill, s.caption), capVsCookie: hit(s.caption, s.cookie), pillVsCookie: hit(s.pill, s.cookie), capVsNav: hit(s.caption, s.nav), capVsLauncher: hit(s.caption, s.launcher) };
      const flags = Object.entries(o).filter(([, x]) => x).map(([x]) => x); if (flags.length) bad.push(sc.slice(0, 8) + ':' + k + ' ' + flags.join(','));
      table.push(sc.slice(6, 8) + k + ' capB=' + (s.caption ? s.caption.b : '-') + ' navTop=' + (s.nav ? s.nav.y : '-') + ' launcher=' + (s.launcher ? s.launcher.x + '-' + s.launcher.r + '/' + s.launcher.y + '-' + s.launcher.b : '-') + ' cookieTop=' + (s.cookie ? s.cookie.y : '-')); }
    return { samples: n, overlaps: bad, table };
  };
  (async () => {
    try {
      R.phase = 'login';
      await page.emulateMedia({ reducedMotion: REDUCED ? 'reduce' : 'no-preference' });
      await page.setViewportSize(MODE === 'mobile' ? { width: 375, height: 812 } : { width: 1440, height: 900 });
      await page.goto('http://localhost:5173/');
      await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
      await page.reload(); await sleep(1500);
      const card = page.getByRole('button', { name: /Show demo/ });
      R.checks.demoCardCount = await card.count();
      await card.first().click();
      R.checks.rootAfterOneClickMs = await waitRoot(25000);
      R.checks.loginScreenGoneAfterClick = await page.evaluate(() => !/Sign In to my account/i.test(document.body.innerText));
      R.phase = 'movie1';
      R.checks.movie1 = await play('m1', { rects: FULL, checks: true, reviewKey: 'reviewItemMovie1', stopAfterCoach: !FULL });
      R.summary = summarize();
      R.apiAfterMovie1 = R.api.length;
      if (FULL) {
        await sleep(900);
        try { await page.screenshot({ path: SH + TAG + '-endcard.png' }); } catch (e) {}
        R.checks.flagAfterEnd = await page.evaluate(() => sessionStorage.getItem('elogbook-demo-movie'));
        R.checks.endCardButtons = await page.evaluate(() => ({ replay: !!document.querySelector('[data-testid="demo-movie-replay"]'), explore: !!document.querySelector('[data-testid="demo-movie-explore"]') }));
        if (MODE === 'mobile' || REDUCED) {
          await page.locator('[data-testid="demo-movie-explore"]').click({ timeout: 4000 }); await sleep(900);
          R.checks.endCardGoneAfterExplore = await page.evaluate(() => !document.querySelector('[data-testid="demo-movie-root"]'));
        } else {
          R.phase = 'explore';
          await page.locator('[data-testid="demo-movie-explore"]').click({ timeout: 4000 }); await sleep(900);
          R.checks.endCardGoneAfterExplore = await page.evaluate(() => !document.querySelector('[data-testid="demo-movie-root"]'));
          const roles = [];
          for (const r of ['faculty', 'hod', 'student']) { await page.locator('select[aria-label="Demo role"]').selectOption(r); await sleep(1500); roles.push(await page.evaluate(() => JSON.parse(sessionStorage.getItem('elogbook-user') || '{}').role + ' @ ' + location.pathname)); }
          R.checks.roleSwitch = roles;
          R.phase = 'freeplay-tab';
          await page.evaluate(() => { history.pushState({}, '', '/cases'); window.dispatchEvent(new PopStateEvent('popstate')); }); await sleep(1500);
          try { await page.locator('[data-tour="caselog-add"]').first().click({ timeout: 4000 }); await sleep(900); await page.keyboard.press('Tab'); await sleep(400); R.checks.freePlayTabKeepsDialog = await page.evaluate(() => !!document.querySelector('[role="dialog"]')); await page.keyboard.press('Escape'); } catch (e) { R.checks.freePlayTabError = String(e).slice(0, 140); }
          R.phase = 'reload';
          await page.reload(); await sleep(2500);
          R.checks.movieAbsentAfterReload = await page.evaluate(() => !document.querySelector('[data-testid="demo-movie-root"]') && sessionStorage.getItem('elogbook-demo-movie') === null);
          R.phase = 'replayA';
          await page.getByRole('button', { name: /Replay demo/ }).click({ timeout: 5000 });
          await waitRoot(15000);
          R.checks.replayA = await play('rA', { reviewKey: 'reviewItemReplayA', untilScene: 'scene-06-appraisal' });
          R.phase = 'skip';
          await page.locator('[data-testid="demo-movie-skip"]').click({ timeout: 4000 }); await sleep(900);
          R.checks.skipShowsEndCard = await page.evaluate(() => document.querySelector('[data-testid="demo-movie-root"]')?.dataset.phase === 'ended');
          R.checks.flagAfterSkip = await page.evaluate(() => sessionStorage.getItem('elogbook-demo-movie'));
          R.phase = 'replayB';
          await page.locator('[data-testid="demo-movie-replay"]').click({ timeout: 4000 });
          R.checks.replayB = await play('rB', { reviewKey: 'reviewItemReplayB', stopAfterReview: true });
          await page.locator('[data-testid="demo-movie-skip"]').click({ timeout: 4000 }); await sleep(600);
          await page.reload(); await sleep(2500);
          R.checks.movieAbsentAfterSkipReload = await page.evaluate(() => !document.querySelector('[data-testid="demo-movie-root"]'));
        }
      }
      R.apiTotal = R.api.length; R.phase = 'finished'; R.done = true;
    } catch (e) { R.error = String(e).slice(0, 500); R.done = true; }
  })();
  return 'started';
}
