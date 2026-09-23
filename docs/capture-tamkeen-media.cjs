/**
 * Capture EMS production screenshots + short videos for Tamkeen six companies.
 * Uses session injection (no password) via Admin profile API.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.EMS_BASE_URL || 'http://151.50.1.38';
const OUT = path.join(__dirname, 'tamkeen-media');
const ADMIN_EMAIL = 'ems_admin@almoayyedcg.com';

const entities = [
  {
    key: 'aluminium',
    label: 'Almoayyed Aluminium',
    division: 'Almoayyed Aluminium',
    reqNos: ['134', '34', '18'],
    quoteSearch: 'ACA',
    quoteAlt: '134',
  },
  {
    key: 'landscapes',
    label: 'Almoayyed Landscapes and Pools',
    division: 'Landscape Maint',
    divisionAlt: 'Landscape Project',
    reqNos: ['1044', '1045', '1034'],
    quoteSearch: 'ALP/',
  },
  {
    key: 'security',
    label: 'Guardus Security Co. W.L.L.',
    division: 'Security Project',
    reqNos: ['1057', '1049', '1031'],
    quoteSearch: 'ASD/ALS',
  },
  {
    key: 'simplex',
    label: 'Simplex Almoayyed',
    division: 'Simplex Project',
    reqNos: ['1059', '994', '929'],
    quoteSearch: 'SMA/SXP',
  },
  {
    key: 'interiors',
    label: 'Almoayyed Interiors',
    division: 'Interiors Project',
    reqNos: ['820', '886', '839'],
    quoteSearch: 'AIN/INP',
  },
  {
    key: 'camair',
    label: 'CAMAIR',
    division: 'Direct Sales - CamAir',
    reqNos: ['1050', '1048', '880'],
    quoteSearch: 'ACG/DS',
  },
];

async function injectAdmin(page, profile) {
  const user = {
    id: profile.ID,
    name: profile.FullName,
    email: profile.EmailId,
    EmailId: profile.EmailId,
    role: 'Admin',
    Roles: 'Admin',
    Department: profile.Department || 'Admin',
    Designation: profile.Designation || 'Admin',
    RequestNo: profile.RequestNo,
    ProfileImage: profile.ProfileImage,
    MobileNumber: profile.MobileNumber,
  };
  await page.addInitScript(({ user, email }) => {
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    sessionStorage.setItem('currentUserEmail', email);
    localStorage.setItem('emsRememberMe', '1');
    localStorage.setItem('emsRememberedEmail', email);
  }, { user, email: ADMIN_EMAIL });
}

async function clickNav(page, label) {
  const sel = `[data-ems-main-nav-id="${label}"]`;
  const el = page.locator(sel).first();
  if (await el.count()) {
    await el.click({ timeout: 8000 });
    return true;
  }
  // fallback: text in header
  const byText = page.locator('nav, .navbar, .header, .ems-header, body').getByText(label, { exact: true }).first();
  if (await byText.count()) {
    await byText.click({ timeout: 5000 }).catch(() => {});
    return true;
  }
  return false;
}

async function openEnquiryByReq(page, reqNo) {
  await page.evaluate((rn) => {
    sessionStorage.setItem('ems_enquiryToOpen', String(rn));
    sessionStorage.setItem('ems_activeTab', 'Enquiry');
  }, reqNo);
  // Force reload active view by clicking Enquiry
  await clickNav(page, 'Enquiry');
  await page.waitForTimeout(1500);
  // Try Modify Enquiry / Load
  const modify = page.getByText(/Modify Enquiry/i).first();
  if (await modify.count()) {
    await modify.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  const enquiryNo = page.locator('input.form-control').filter({ has: page.locator('xpath=..') });
  // Prefer labeled Enquiry No
  const inputs = page.locator('input.form-control');
  const count = await inputs.count();
  for (let i = 0; i < Math.min(count, 12); i++) {
    const ph = ((await inputs.nth(i).getAttribute('placeholder')) || '').toLowerCase();
    const nearby = await inputs.nth(i).evaluate((el) => {
      const label = el.closest('.mb-3, .form-group, .col, div')?.innerText || '';
      return label.slice(0, 80);
    }).catch(() => '');
    if (ph.includes('enquiry') || /enquiry\s*no/i.test(nearby) || ph.includes('request')) {
      await inputs.nth(i).fill(String(reqNo));
      break;
    }
  }
  const loadBtn = page.getByRole('button', { name: /Load/i }).first();
  if (await loadBtn.count()) {
    await loadBtn.click().catch(() => {});
  }
  await page.waitForTimeout(2500);
}

async function searchEnquiry(page, reqNo) {
  await clickNav(page, 'Enquiry');
  await page.waitForTimeout(800);
  const searchTab = page.getByText(/Search Enquiry/i).first();
  if (await searchTab.count()) await searchTab.click().catch(() => {});
  await page.waitForTimeout(800);
  const search = page.locator('#globalSearchInput');
  if (await search.count()) {
    await search.fill(String(reqNo));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const row = page.locator('.enquiry-search-row-open, .enquiry-results-table-root tr').filter({ hasText: String(reqNo) }).first();
    if (await row.count()) {
      await row.click().catch(() => {});
      await page.waitForTimeout(2500);
      return true;
    }
  }
  return false;
}

async function setDivisionSelect(page, division) {
  // Try common select patterns
  const selects = page.locator('select');
  const n = await selects.count();
  for (let i = 0; i < n; i++) {
    const s = selects.nth(i);
    const label = await s.evaluate((el) => {
      const aria = el.getAttribute('aria-label') || '';
      const prev = el.previousElementSibling?.textContent || '';
      const parent = el.closest('div')?.innerText?.slice(0, 60) || '';
      return `${aria} ${prev} ${parent}`.toLowerCase();
    }).catch(() => '');
    if (label.includes('division')) {
      const options = await s.locator('option').allTextContents();
      const match = options.find((o) => o.trim() === division) ||
        options.find((o) => o.toLowerCase().includes(division.toLowerCase().slice(0, 12)));
      if (match) {
        await s.selectOption({ label: match }).catch(async () => {
          await s.selectOption({ value: match }).catch(() => {});
        });
        await page.waitForTimeout(1500);
        return true;
      }
    }
  }
  return false;
}

async function shot(page, file) {
  await page.screenshot({ path: file, fullPage: false });
  console.log('SHOT', file);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = { base: BASE, capturedAt: new Date().toISOString(), entities: {} };

  const profileRes = await fetch(`${BASE}/api/auth/profile?email=${encodeURIComponent(ADMIN_EMAIL)}`);
  if (!profileRes.ok) throw new Error('Profile fetch failed ' + profileRes.status);
  const profile = await profileRes.json();
  console.log('Admin profile OK', profile.FullName);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  for (const ent of entities) {
    console.log('\n====', ent.label, '====');
    const dir = path.join(OUT, ent.key);
    fs.mkdirSync(dir, { recursive: true });
    const files = {};

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: path.join(dir, 'video-tmp'), size: { width: 1280, height: 720 } },
    });
    const page = await context.newPage();
    await injectAdmin(page, profile);

    try {
      await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);

      // If still on login, inject again and reload
      const onLogin = await page.locator('#email, .login-container').count();
      if (onLogin) {
        await page.evaluate(({ user, email }) => {
          sessionStorage.setItem('currentUser', JSON.stringify(user));
          sessionStorage.setItem('currentUserEmail', email);
        }, {
          user: {
            id: profile.ID,
            name: profile.FullName,
            email: profile.EmailId,
            EmailId: profile.EmailId,
            role: 'Admin',
            Roles: 'Admin',
            Department: profile.Department,
          },
          email: ADMIN_EMAIL,
        });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
      }

      files.dashboard = path.join(dir, '01-dashboard.png');
      await shot(page, files.dashboard);

      // Enquiry search / open
      const opened = await searchEnquiry(page, ent.reqNos[0]);
      if (!opened) {
        await openEnquiryByReq(page, ent.reqNos[0]);
      }
      files.enquiry = path.join(dir, '02-enquiry.png');
      await shot(page, files.enquiry);

      // Second enquiry via search for video motion
      await searchEnquiry(page, ent.reqNos[1] || ent.reqNos[0]);
      await page.waitForTimeout(1000);

      // Quotes
      await clickNav(page, 'Quote');
      await page.waitForTimeout(800);
      const b2b = page.getByText(/^B2B$/i).first();
      if (await b2b.count()) await b2b.click().catch(() => {});
      await page.waitForTimeout(1500);
      await setDivisionSelect(page, ent.division);
      if (ent.divisionAlt) await setDivisionSelect(page, ent.divisionAlt).catch(() => false);

      // Try search quote box
      const qSearch = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
      if (await qSearch.count()) {
        await qSearch.fill(ent.quoteSearch.replace('/', '')).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(1500);
      }
      files.quotes = path.join(dir, '03-quotes.png');
      await shot(page, files.quotes);

      // Sales Report
      await clickNav(page, 'Sales Report');
      await page.waitForTimeout(2000);
      await setDivisionSelect(page, ent.division);
      await page.waitForTimeout(2000);
      files.report = path.join(dir, '04-sales-report.png');
      await shot(page, files.report);

      // Probability
      await clickNav(page, 'Probability');
      await page.waitForTimeout(1500);
      await setDivisionSelect(page, ent.division);
      await page.waitForTimeout(1500);
      files.probability = path.join(dir, '05-probability.png');
      await shot(page, files.probability);

    } catch (e) {
      console.error('Capture error', ent.key, e.message);
      files.error = e.message;
      try {
        files.errorShot = path.join(dir, 'error.png');
        await shot(page, files.errorShot);
      } catch {}
    }

    await context.close(); // finalizes video
    // Move video
    const vtmp = path.join(dir, 'video-tmp');
    if (fs.existsSync(vtmp)) {
      const vids = fs.readdirSync(vtmp).filter((f) => f.endsWith('.webm'));
      if (vids.length) {
        const dest = path.join(dir, `${ent.key}-walkthrough.webm`);
        fs.renameSync(path.join(vtmp, vids[0]), dest);
        files.video = dest;
        console.log('VIDEO', dest);
      }
      try { fs.rmSync(vtmp, { recursive: true, force: true }); } catch {}
    }

    manifest.entities[ent.key] = { label: ent.label, files };
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nDone. Manifest written.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
