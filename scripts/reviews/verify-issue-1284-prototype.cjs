/**
 * Non-shipping verification harness for the Issue #1284 context-rail review
 * prototype. Exercises the static artifact in headless Chromium and asserts the
 * behaviors that gate human review: no horizontal overflow, clean console,
 * mobile controls/navigation below 1024px, single authoritative blocked-state
 * action, disabled-with-reason recompute, recompute lifecycle, and a visible
 * focus ring on the dark rail.
 *
 * This script touches no production path. It reads the prototype HTML only.
 *
 * Usage: node scripts/reviews/verify-issue-1284-prototype.js
 * Requires a Chromium-capable Playwright install (PLAYWRIGHT_BROWSERS_PATH may
 * point at a preinstalled browser). Exit code 0 = all checks passed.
 */
'use strict';

const path = require('path');

function loadChromium() {
  const candidates = ['playwright', 'playwright-core'];
  for (const name of candidates) {
    try {
      return require(name).chromium;
    } catch {
      /* try next */
    }
  }
  // Fall back to a global install location.
  try {
    return require('/opt/node22/lib/node_modules/playwright').chromium;
  } catch {
    throw new Error(
      'Playwright not found. Install with `npm i -D playwright` or provide a global install.'
    );
  }
}

const FILE =
  'file://' +
  path.resolve(
    __dirname,
    '../../docs/design/references/2026-08-08-preferred-uiux/issue-1284-context-rail-prototype.html'
  );

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '820x1180', width: 820, height: 1180 },
  { name: '390x844', width: 390, height: 844 },
];

const failures = [];
function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS: ${name}`);
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

(async () => {
  const chromium = loadChromium();
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const consoleMsgs = [];
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type()))
        consoleMsgs.push(`${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => consoleMsgs.push(`pageerror: ${err.message}`));

    await page.goto(FILE);
    await page.waitForTimeout(150);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    check(
      `[${vp.name}] no horizontal overflow`,
      overflow.scrollWidth <= overflow.clientWidth + 1,
      `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`
    );
    check(`[${vp.name}] clean console`, consoleMsgs.length === 0, consoleMsgs.join('; '));

    if (vp.width < 1024) {
      const controls = await page.evaluate(() => {
        const visible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
        };
        const reviewBtn = Array.from(document.querySelectorAll('.command-header .button')).find(
          (b) => b.textContent.includes('Review 2 gaps')
        );
        return {
          navToggle: visible(document.getElementById('mobileNavToggle')),
          reviewAction: visible(reviewBtn),
          vehicleToggle: visible(document.getElementById('toggleContext')),
        };
      });
      check(`[${vp.name}] mobile nav toggle visible`, controls.navToggle);
      check(`[${vp.name}] primary action reachable`, controls.reviewAction);
      check(`[${vp.name}] vehicle-state control reachable`, controls.vehicleToggle);

      await page.click('#mobileNavToggle');
      const navOpen = await page.evaluate(() => {
        const nav = document.getElementById('mobileNav');
        const toggle = document.getElementById('mobileNavToggle');
        return {
          open: !nav.hasAttribute('hidden'),
          expanded: toggle.getAttribute('aria-expanded'),
          links: nav.querySelectorAll('a').length,
        };
      });
      check(
        `[${vp.name}] off-canvas nav opens with links`,
        navOpen.open && navOpen.expanded === 'true' && navOpen.links === 5,
        JSON.stringify(navOpen)
      );
    }
    await page.close();
  }

  // Interaction + accessibility pass at desktop width.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleMsgs = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) consoleMsgs.push(`${msg.type()}: ${msg.text()}`);
  });
  await page.goto(FILE);

  // De-emphasis must not use opacity.
  await page.click('button[data-preset="gp"]');
  const deemphasis = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.analyst-detail'));
    return { opacity: s.opacity, borderStyle: s.borderStyle };
  });
  check(
    'preset de-emphasis avoids opacity',
    deemphasis.opacity === '1' && deemphasis.borderStyle.includes('dashed'),
    JSON.stringify(deemphasis)
  );

  // Blocked state: single authoritative next action + disabled recompute.
  await page.click('#toggleContext');
  const blocked = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 0;
    };
    const nextChips = Array.from(document.querySelectorAll('.status-line .chip'))
      .filter((c) => c.textContent.trim().startsWith('Next ·'))
      .filter(visible)
      .map((c) => c.textContent.trim());
    return {
      nextChips,
      recomputeDisabled: document.getElementById('recomputeButton').disabled,
    };
  });
  check(
    'blocked state has one authoritative next action',
    blocked.nextChips.length === 1 && blocked.nextChips[0].includes('Resolve vehicle context'),
    JSON.stringify(blocked.nextChips)
  );
  check('blocked recompute disabled', blocked.recomputeDisabled === true);
  await page.click('#toggleContext'); // restore

  // Ready state: exactly one authoritative next action.
  const ready = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 0;
    };
    return Array.from(document.querySelectorAll('.status-line .chip'))
      .filter((c) => c.textContent.trim().startsWith('Next ·'))
      .filter(visible)
      .map((c) => c.textContent.trim());
  });
  check(
    'ready state has one authoritative next action',
    ready.length === 1 && ready[0].includes('Review 2 gaps'),
    JSON.stringify(ready)
  );

  // Recompute lifecycle.
  await page.click('#recomputeButton');
  const mid = await page.evaluate(() =>
    document.getElementById('recomputeButton').textContent.trim()
  );
  await page.waitForTimeout(1000);
  const done = await page.evaluate(() =>
    document.getElementById('recomputeButton').textContent.trim()
  );
  await page.waitForTimeout(1000);
  const reset = await page.evaluate(() =>
    document.getElementById('recomputeButton').textContent.trim()
  );
  check(
    'recompute lifecycle progresses',
    mid.includes('Recomputing') &&
      done.includes('no change') &&
      reset.includes('Recompute from latest'),
    JSON.stringify({ mid, done, reset })
  );

  // Focus ring visible on dark rail.
  await page.keyboard.press('Tab');
  let landed = null;
  for (let i = 0; i < 6; i++) {
    landed = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? { cls: el.className } : null;
    });
    if (landed && landed.cls && landed.cls.includes('rail-link')) break;
    await page.keyboard.press('Tab');
  }
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return { color: s.outlineColor, width: s.outlineWidth, style: s.outlineStyle };
  });
  check(
    'dark-rail focus ring is light and visible',
    landed && landed.cls.includes('rail-link') && outline.color.includes('255, 255, 255'),
    JSON.stringify(outline)
  );

  check('interaction pass clean console', consoleMsgs.length === 0, consoleMsgs.join('; '));

  await page.close();
  await browser.close();

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
