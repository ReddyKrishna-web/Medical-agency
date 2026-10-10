/**
 * End-to-end registration flow test in headless Chrome.
 *
 * Exercises the real UI: 3-step wizard, agency dropdown (populated from
 * /api/public/agencies), country/state dropdowns, city autocomplete with
 * postal auto-fill, submit → role dashboard, then login with the new account.
 *
 * Usage: node scripts/e2e-registration.mjs
 * Requires: dev servers on :5173 and :5010, local Chrome.
 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = 'http://localhost:5173';
const API = 'http://127.0.0.1:5010/api';

const results = [];
const step = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const stamp = Date.now().toString(36).toUpperCase();
const shopEmail = `e2e-shop-${stamp}@test.local`;
const salesmanEmail = `e2e-sales-${stamp}@test.local`;
const PASSWORD = 'E2ePass123!';

const text = (page) => page.evaluate(() => document.body.innerText);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function selectFirstAgency(page) {
  await page.waitForSelector('#agencyId', { visible: true, timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const select = document.querySelector('#agencyId');
      return select && select.options.length > 1;
    },
    { timeout: 15_000 },
  );
  // Pick the second option (first real agency after the placeholder).
  await page.evaluate(() => {
    const select = document.querySelector('#agencyId');
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.focus();
  });
  const agency = await page.$eval('#agencyId', (select) => select.options[1].textContent.trim());
  return agency;
}

async function run() {
  const agenciesResponse = await fetch(`${API}/public/agencies`).then((r) => r.json());
  const agencyName = agenciesResponse.data.rows[0]?.name;
  step('API has at least one agency for the dropdown', Boolean(agencyName), agencyName ?? 'none');

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    const consoleErrors = [];
    const apiCalls = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const url = msg.location()?.url ?? '';
        consoleErrors.push(`${msg.text()} @ ${url}`);
      }
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    page.on('requestfailed', (request) => {
      apiCalls.push(`FAILED ${request.method()} ${request.url()} :: ${request.failure()?.errorText}`);
    });
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/')) apiCalls.push(`${response.status()} ${response.request().method()} ${url.replace(APP, '')}`);
    });

    /* ------------------------------------------------------------ step 1 */
    await page.goto(`${APP}/register`, { waitUntil: 'networkidle2', timeout: 30_000 });
    step('Register page loads', (await text(page)).includes('Create your account'));

    await page.waitForSelector('[role="radio"]', { timeout: 10_000 });
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[role="radio"]')];
      const shop = cards.find((card) => card.textContent.includes('Medical shop'));
      shop.click();
    });
    await sleep(150);
    step('Step 1: Medical shop card selectable', true);

    // Continue → step 2
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Continue'));
      button.click();
    });
    await page.waitForSelector('#agencyId', { visible: true, timeout: 10_000 });

    /* ------------------------------------------------------------ step 2 */
    const selectedAgency = await selectFirstAgency(page);
    step('Step 2: Agency dropdown populated + selectable', selectedAgency.includes(agencyName?.split(' ').slice(0, 2).join(' ') ?? ''), selectedAgency);

    // Shop details
    await page.type('#businessName', 'E2E Test Medicals');
    await page.type('#ownerName', 'E2E Owner');

    // Country: type-to-filter the native select by choosing India via value match
    const countryOptions = await page.$$eval('#country option', (options) => options.map((o) => o.value));
    step('Country dropdown has full country list', countryOptions.length > 150, `${countryOptions.length} countries`);
    await page.select('#country', 'India');

    // State list should populate after country selection
    await page.waitForFunction(() => {
      const select = document.querySelector('#state');
      return select && select.options.length > 5;
    }, { timeout: 10_000 });
    const stateCount = await page.$$eval('#state option', (options) => options.length - 1);
    step('State dropdown populates after country pick', stateCount >= 30, `${stateCount} states`);
    await page.select('#state', 'Maharashtra');

    // City autocomplete: type and wait for Nominatim suggestions
    await page.waitForSelector('#city', { visible: true, timeout: 10_000 });
    await page.click('#city');
    await page.type('#city', 'pune', { delay: 40 });
    let suggestionPicked = false;
    try {
      await page.waitForSelector('#city-suggestion-list li', { timeout: 12_000 });
      const city = await page.$eval('#city-suggestion-list li button', (btn) => btn.textContent.trim());
      await page.click('#city-suggestion-list li button');
      suggestionPicked = true;
      // Postal auto-fill on pick
      await sleep(200);
      const postal = await page.$eval('#postalCode', (input) => input.value);
      step('City autocomplete + postal auto-fill', Boolean(postal), `picked "${city.split('\n')[0]}", postal "${postal}"`);
    } catch {
      step('City autocomplete + postal auto-fill', false, 'suggestion list did not appear (network dependent)');
    }
    if (!suggestionPicked) {
      await page.evaluate(() => document.querySelector('#city').blur());
      await page.type('#postalCode', '411001');
    }

    await page.type('#line1', '12 E2E Street');

    // Continue → step 3
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const button = buttons.filter((b) => b.offsetParent !== null).find((b) => b.textContent.includes('Continue'));
      button.click();
    });

    /* ------------------------------------------------------------ step 3 */
    await page.waitForSelector('#email', { visible: true, timeout: 10_000 });
    step('Step 3: credentials form visible', true);

    await page.type('#name', 'E2E Shop Owner');
    await page.type('#email', shopEmail);
    await page.type('#phone', '+91 90000 77777');
    await page.type('#password', PASSWORD);
    await page.type('#confirmPassword', PASSWORD);
    await page.click('input[type="checkbox"]');
    await sleep(150);

    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Create my account'));
      button.click();
    });

    // Expect redirect to the customer dashboard (ACTIVE, no approval gate)
    try {
      await page.waitForFunction(() => window.location.pathname.startsWith('/customer'), { timeout: 20_000 });
    } catch {
      console.log('--- API calls seen by the browser (last 15) ---');
      apiCalls.slice(-15).forEach((call) => console.log('   ', call));
      console.log('--- Console errors ---');
      consoleErrors.slice(0, 5).forEach((msg) => console.log('   ', msg.slice(0, 200)));
      throw new Error('Redirect to /customer did not happen after submit');
    }
    await sleep(1_200);
    const dashText = await text(page);
    step('Shop registered → landed on customer dashboard', true, page.url());
    step('Dashboard shows authenticated shop UI', /Order|orders|Catalog|Products|Dashboard/i.test(dashText), dashText.slice(0, 80).replace(/\n/g, ' '));

    // Salesman flow runs in a fresh context (clean cookies/session state).
    const context2 = await browser.createBrowserContext();
    const page2 = await context2.newPage();
    await page2.setViewport({ width: 1366, height: 900 });
    const page2Errors = [];
    const page2Calls = [];
    page2.on('console', (msg) => {
      if (msg.type() === 'error') page2Errors.push(msg.text());
    });
    page2.on('pageerror', (err) => page2Errors.push(String(err)));
    page2.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/')) page2Calls.push(`${response.status()} ${response.request().method()} ${url.replace(APP, '')}`);
    });

    /* --------------------------------------------------- salesman signup */
    await page2.goto(`${APP}/register`, { waitUntil: 'networkidle2', timeout: 30_000 });
    await page2.waitForSelector('[role="radio"]', { timeout: 10_000 });
    await page2.evaluate(() => {
      const cards = [...document.querySelectorAll('[role="radio"]')];
      cards.find((card) => card.textContent.includes('Salesman')).click();
    });
    await page2.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Continue'));
      button.click();
    });
    await page2.waitForSelector('#agencyId', { visible: true, timeout: 10_000 });
    await selectFirstAgency(page2);
    await page2.type('#territory', 'E2E Territory West');
    await page2.type('#monthlyTarget', '150000');
    await page2.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const button = buttons.filter((b) => b.offsetParent !== null).find((b) => b.textContent.includes('Continue'));
      button.click();
    });

    await page2.waitForSelector('#email', { visible: true, timeout: 10_000 });
    await page2.type('#name', 'E2E Salesman');
    await page2.type('#email', salesmanEmail);
    await page2.type('#phone', '+91 90000 88888');
    await page2.type('#password', PASSWORD);
    await page2.type('#confirmPassword', PASSWORD);
    await page2.click('input[type="checkbox"]');
    await sleep(200);
    const formState = await page2.evaluate(() => {
      const form = document.querySelector('form');
      const invalid = [...document.querySelectorAll('[aria-invalid="true"]')].map((el) => el.id || el.name);
      const errors = [...document.querySelectorAll('form p')].map((p) => p.textContent.trim()).filter(Boolean);
      const checkbox = document.querySelector('input[type="checkbox"]');
      return {
        formExists: Boolean(form),
        nativeValid: form ? form.checkValidity() : null,
        invalidFields: invalid,
        errorTexts: errors.slice(0, 6),
        checkboxChecked: checkbox?.checked ?? null,
        step3visible: [...document.querySelectorAll('section')].some((s) => !s.className.includes('hidden') && s.querySelector('#email')),
      };
    });
    console.log('--- pre-submit form state:', JSON.stringify(formState));
    const submitInfo = await page2.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Create my account'));
      return {
        found: Boolean(button),
        type: button?.getAttribute('type'),
        disabled: button?.disabled ?? null,
        inForm: button ? Boolean(button.closest('form')) : null,
        formCount: document.querySelectorAll('form').length,
      };
    });
    console.log('--- submit button state:', JSON.stringify(submitInfo));
    await page2.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Create my account'));
      button.click();
    });
    await sleep(2_500);
    console.log('--- salesman URL after submit:', page2.url());
    const salesText = await page2.evaluate(() => document.body.innerText);
    console.log('--- salesman api calls (last 8):', page2Calls.slice(-8).join(' | ') || 'NONE');
    console.log('--- salesman console errors:', page2Errors.slice(0, 3).join(' | ') || 'none');

    await page2.waitForFunction(() => window.location.pathname.startsWith('/salesman'), { timeout: 20_000 });
    await sleep(1_000);
    step('Salesman registered → landed on salesman dashboard', true, page2.url());

    /* ------------------------------------------------------ login re-test */
    const context3 = await browser.createBrowserContext();
    const page3 = await context3.newPage();
    await page3.setViewport({ width: 1366, height: 900 });
    await page3.goto(`${APP}/login`, { waitUntil: 'networkidle2', timeout: 30_000 });
    await page3.type('#email', shopEmail);
    await page3.type('#password', PASSWORD);
    await page3.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Sign in'));
      button.click();
    });
    await page3.waitForFunction(() => window.location.pathname.startsWith('/customer'), { timeout: 20_000 });
    step('Login with the new shop account works', true, page3.url());
    await context3.close();
    await context2.close();

    // The logged-out bootstrap intentionally probes /auth/refresh (401 without
    // a cookie) and the favicon may 404 in dev; anything else is a real error.
    const expectedNoise = (msg) =>
      msg.includes('favicon') ||
      msg.includes('net:: ERR_FAILED') ||
      (msg.includes('401') && msg.includes('auth/refresh'));
    const relevantErrors = consoleErrors.filter((msg) => !expectedNoise(msg));
    step('No unexpected console errors', relevantErrors.length === 0, relevantErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error('E2E crashed:', error.message);
  if (error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
  process.exit(1);
});
