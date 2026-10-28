// Mocked production-browser regression. Run against localhost:3100 with Node 24.
// Native CDP, isolated Chrome profile, no packages or real accounts. All auth,
// journal and AI responses are fictional: this does not prove provider security,
// email delivery or persistence. Never print requests, tokens, authentication
// URLs, page text or console output. Unknown external traffic is blocked.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const origin = 'http://127.0.0.1:3100';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const draft = 'Fictional RC test: Alex finished a paper kite.';
const newerDraft = 'Fictional newer draft: Alex painted a paper moon.';
const accounts = {
  a: { id: '11111111-1111-4111-8111-111111111111', email: 'fictional-alpha@example.invalid' },
  b: { id: '22222222-2222-4222-8222-222222222222', email: 'fictional-beta@example.invalid' },
};
const fictionalPassword = 'Fictional-test-password-42!';
const profile = await mkdtemp('/private/tmp/futureme-release-browser-');
const browser = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-sync', '--disable-component-update', '--disable-extensions',
  '--disable-domain-reliability', '--no-pings', '--metrics-recording-only',
  '--disable-search-engine-choice-screen', '--disable-features=MediaRouter,OptimizationHints',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
  'about:blank',
], { stdio: 'ignore' });
let processFailed = false;
browser.on('error', () => { processFailed = true; });
let failed = false;
let stage = 'browser_start';
const connections = [];

function check(label, pass) {
  console.log(JSON.stringify({ label, pass: Boolean(pass) }));
  if (!pass) failed = true;
}

async function until(predicate, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await delay(75);
  }
  return false;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('connection_failed')), { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id) {
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      clearTimeout(callback.timer);
      if (message.error) callback.reject(new Error('command_failed'));
      else callback.resolve(message.result);
    } else if (handlers.has(message.method)) {
      Promise.resolve(handlers.get(message.method)(message.params)).catch(() => { failed = true; });
    }
  });
  const cdp = {
    command(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('command_timeout')); }, 12000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on: (method, handler) => handlers.set(method, handler),
    close() {
      for (const callback of pending.values()) clearTimeout(callback.timer);
      pending.clear();
      ws.close();
    },
  };
  connections.push(cdp);
  return cdp;
}

function user(account) {
  return { ...accounts[account], aud: 'authenticated', role: 'authenticated',
    email_confirmed_at: '2026-10-20T12:00:00.000Z', created_at: '2026-10-20T12:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [] };
}

function session(account) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  // Deliberately invalid signature: usable only with the mocked auth responses.
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: accounts[account].id, aud: 'authenticated', role: 'authenticated', exp: expiresAt, iat: expiresAt - 3600, email: accounts[account].email })}.${Buffer.from('fictional-not-a-valid-signature').toString('base64url')}`;
  return { access_token: accessToken, refresh_token: 'fictional-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: user(account) };
}

try {
  let port;
  if (!await until(async () => {
    if (processFailed) return false;
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      return Number.isInteger(port) && port > 0;
    } catch { return false; }
  })) throw new Error('browser_start_failed');
  const devtools = `http://127.0.0.1:${port}`;
  const browserInfo = await fetch(`${devtools}/json/version`).then(response => response.json());
  const browserCdp = await connect(browserInfo.webSocketDebuggerUrl);

  async function page(pathname) {
    const { browserContextId } = await browserCdp.command('Target.createBrowserContext');
    const { targetId } = await browserCdp.command('Target.createTarget', { url: 'about:blank', browserContextId });
    const targets = await fetch(`${devtools}/json/list`).then(response => response.json());
    const cdp = await connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
    const state = {
      account: null, authMode: 'success', authGate: null, saveMode: 'network', saveGate: null,
      userMode: 'success', userGate: null,
      reflectMode: 'unavailable', entriesGate: null, entriesHeld: 0,
      passwords: 0, passwordGrantOnly: true, otp: 0, recoveries: 0, updates: 0, logouts: 0,
      signups: 0, userGets: 0, logoutLocal: false,
      saves: 0, entryGets: 0, reflections: 0, reflectedIds: [], dialogs: 0,
      forbidden: 0, documents: 0, order: [], entries: { a: [], b: [] },
    };
    cdp.on('Page.javascriptDialogOpening', async () => {
      state.dialogs += 1;
      await cdp.command('Page.handleJavaScriptDialog', { accept: true });
    });
    cdp.on('Fetch.requestPaused', async ({ requestId, request, resourceType }) => {
      const url = new URL(request.url);
      const abort = () => cdp.command('Fetch.failRequest', { requestId, errorReason: 'Failed' });
      const reply = (responseCode, payload) => cdp.command('Fetch.fulfillRequest', {
        requestId, responseCode, responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: origin },
          { name: 'Access-Control-Allow-Credentials', value: 'true' },
          { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,OPTIONS,DELETE' },
          { name: 'Access-Control-Allow-Headers', value: 'authorization,apikey,content-type,x-client-info,x-supabase-api-version' },
        ], body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      });
      if (url.origin !== origin) {
        if (!url.pathname.startsWith('/auth/v1/')) return abort();
        if (request.method === 'OPTIONS') return reply(200, {});
        if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
          if (url.searchParams.get('grant_type') === 'refresh_token' && state.account) return reply(200, session(state.account));
          state.passwords += 1;
          state.passwordGrantOnly &&= url.searchParams.get('grant_type') === 'password';
          if (state.authGate) await state.authGate.promise;
          if (state.authMode === 'invalid') return reply(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
          const body = JSON.parse(request.postData ?? '{}');
          state.account = body.email === accounts.b.email ? 'b' : 'a';
          state.order.push('password');
          return reply(200, session(state.account));
        }
        if (url.pathname === '/auth/v1/signup' && request.method === 'POST') {
          state.signups += 1;
          return reply(200, { user: user('a') });
        }
        if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
          state.userGets += 1;
          if (state.userGate) await state.userGate.promise;
          if (state.userMode === 'unavailable') return reply(503, { code: 'unexpected_failure', msg: 'Fictional verification outage' });
          return state.account ? reply(200, user(state.account)) : reply(401, { code: 'session_not_found', msg: 'Fictional session missing' });
        }
        if (url.pathname === '/auth/v1/user' && request.method === 'PUT') {
          state.updates += 1; state.order.push('update');
          return state.account ? reply(200, user(state.account)) : reply(401, {});
        }
        if (url.pathname === '/auth/v1/logout' && request.method === 'POST') {
          state.logouts += 1; state.order.push('logout'); state.account = null;
          state.logoutLocal = url.searchParams.get('scope') === 'local';
          return reply(200, {});
        }
        if (url.pathname === '/auth/v1/recover' && request.method === 'POST') {
          state.recoveries += 1;
          const body = JSON.parse(request.postData ?? '{}');
          return body.email === 'fictional-unknown@example.invalid'
            ? reply(400, { code: 'user_not_found', msg: 'Fictional account absent' })
            : reply(200, {});
        }
        if (url.pathname === '/auth/v1/otp') state.otp += 1;
        state.forbidden += 1;
        return abort();
      }
      if (resourceType === 'Document') state.documents += 1;
      if (url.pathname.startsWith('/api/')) {
        if (request.method === 'POST' && url.pathname === '/api/entries') {
          state.saves += 1;
          const owner = state.account;
          if (state.saveGate) await state.saveGate.promise;
          else await delay(120);
          if (state.saveMode === 'network') return abort();
          if (state.saveMode === 'unauthorized') return reply(401, {});
          if (state.saveMode === 'http') return reply(500, {});
          const body = JSON.parse(request.postData ?? '{}');
          if (Object.keys(body).join(',') !== 'content' || !owner) return reply(400, {});
          const entry = { id: `33333333-3333-4333-8333-${String(state.saves).padStart(12, '0')}`, content_text: body.content, created_at: '2026-10-22T12:00:00.000Z' };
          state.entries[owner].unshift(entry);
          return reply(201, { entry });
        }
        if (request.method === 'POST' && url.pathname === '/api/reflect') {
          state.reflections += 1;
          const body = JSON.parse(request.postData ?? '{}');
          state.reflectedIds.push(body.entryId);
          if (Object.keys(body).join(',') !== 'entryId') return reply(400, {});
          await delay(120);
          if (state.reflectMode === 'unavailable') return reply(503, {});
          if (state.reflectMode === 'quota') return reply(429, {});
          return reply(200, { text: 'Fictional reflection: paper kites take patience.' });
        }
        if (request.method === 'GET' && url.pathname === '/api/entries') {
          state.entryGets += 1;
          const owner = state.account;
          const entries = owner ? [...state.entries[owner]] : [];
          if (state.entriesGate && owner === 'a') { state.entriesHeld += 1; await state.entriesGate.promise; }
          return owner ? reply(200, { entries }) : reply(401, {});
        }
        if (request.method === 'GET' && url.pathname === '/api/reflect') return reply(state.account ? 200 : 401, { reflections: [] });
        if (request.method === 'GET' && url.pathname === '/api/prompts/today') return reply(state.account ? 200 : 401, { text: 'Fictional prompt: what color was your paper kite?' });
        state.forbidden += 1;
        return abort();
      }
      if (!['GET', 'HEAD'].includes(request.method)) { state.forbidden += 1; return abort(); }
      return cdp.command('Fetch.continueRequest', { requestId });
    });
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    const evaluate = async expression => {
      const result = await cdp.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return !result.exceptionDetails && result.result?.value === true;
    };
    const navigate = path => cdp.command('Page.navigate', { url: `${origin}${path}` });
    await navigate(pathname);
    return { state, evaluate, navigate, cdp, close: async () => {
      state.authGate?.resolve(); state.saveGate?.resolve(); state.entriesGate?.resolve(); state.userGate?.resolve();
      await delay(50);
      await browserCdp.command('Target.disposeBrowserContext', { browserContextId });
      cdp.close();
    } };
  }

  const fill = (selector, value) => `(() => { const field = document.querySelector(${JSON.stringify(selector)}); if (!field || !Object.keys(field).some(key => key.startsWith('__reactFiber$'))) return false; Object.getOwnPropertyDescriptor(field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)}); field.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
  const click = (label, twice = false) => `(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); if (!button) return false; button.click(); ${twice ? 'button.click();' : ''} return true; })()`;
  const link = href => `(() => { const anchor = document.querySelector(${JSON.stringify(`a[href="${href}"]`)}); if (!anchor) return false; anchor.click(); return true; })()`;
  const formSubmit = twice => `(() => { const form = document.querySelector('form'); if (!form) return false; form.requestSubmit(); ${twice ? 'form.requestSubmit();' : ''} return true; })()`;
  const draftEquals = (selector, value) => `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`;
  const hasText = text => `Boolean(document.body.textContent.includes(${JSON.stringify(text)}))`;
  const savedEntry = (owner, suffix) => ({ id: `${owner === 'a' ? 'aaaaaaaa' : 'bbbbbbbb'}-4444-4444-8444-444444444444`, content_text: `Fictional account ${owner.toUpperCase()} private fixture ${suffix}.`, created_at: '2026-10-20T12:00:00.000Z' });

  async function credentials(current, account = 'a') {
    if (!await until(() => current.evaluate(fill('input[autocomplete="email"]', accounts[account].email)))) throw new Error('email_field_missing');
    if (!await current.evaluate(fill('input[autocomplete="current-password"]', fictionalPassword))) throw new Error('password_field_missing');
    await delay(75);
  }

  async function signIn(current, account = 'a') {
    await credentials(current, account);
    await current.evaluate(formSubmit(false));
    if (!await until(() => current.evaluate(`Boolean(location.pathname === '/journal' && document.querySelector('header')?.textContent.includes('Logout'))`))) throw new Error('mock_signin_failed');
  }

  stage = 'password_form';
  const auth = await page('/auth');
  await until(() => auth.evaluate(fill('#auth-email', '')));
  await auth.evaluate(formSubmit(false));
  check('mocked_empty_signin_email_has_inline_error_without_request', await until(() => auth.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Enter your email address.'))`)) && auth.state.passwords === 0);
  await auth.evaluate(fill('#auth-email', 'fictional-invalid-email'));
  await delay(75); await auth.evaluate(formSubmit(false));
  check('mocked_malformed_signin_email_has_inline_error_without_request', await until(() => auth.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Enter a valid email address.'))`)) && auth.state.passwords === 0);
  await auth.evaluate(fill('#auth-email', accounts.a.email));
  await delay(75); await auth.evaluate(formSubmit(false));
  check('mocked_empty_signin_password_has_inline_error_without_request', await until(() => auth.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Enter your password.'))`)) && auth.state.passwords === 0);
  await credentials(auth);
  check('mocked_password_form_has_labels_and_autocomplete', await auth.evaluate(`Boolean([...document.querySelectorAll('label')].some(l => l.textContent.includes('Email address') && document.getElementById(l.htmlFor)?.autocomplete === 'email') && [...document.querySelectorAll('label')].some(l => l.textContent.trim() === 'Password' && document.getElementById(l.htmlFor)?.autocomplete === 'current-password'))`));
  await auth.evaluate(`(() => { document.querySelector('button[aria-label="Show password"]')?.click(); return true; })()`);
  check('mocked_password_show_toggle', await until(() => auth.evaluate(`Boolean(document.querySelector('input[autocomplete="current-password"]')?.type === 'text')`)));
  await auth.evaluate(`(() => { document.querySelector('button[aria-label="Hide password"]')?.click(); return true; })()`);
  check('mocked_password_hide_toggle', await until(() => auth.evaluate(`Boolean(document.querySelector('input[autocomplete="current-password"]')?.type === 'password')`)));
  auth.state.authMode = 'invalid'; auth.state.authGate = deferred();
  await auth.evaluate(`(() => { document.querySelector('input[autocomplete="current-password"]').focus(); return true; })()`);
  await auth.cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
  await auth.cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const enterSubmitted = await until(() => auth.state.passwords === 1);
  await auth.evaluate(formSubmit(true));
  await delay(150);
  check('mocked_password_enter_uses_password_method_and_blocks_pending_duplicates', enterSubmitted && auth.state.passwords === 1 && auth.state.passwordGrantOnly && auth.state.otp === 0 && await auth.evaluate(`Boolean(document.querySelector('button[type="submit"]')?.disabled)`));
  auth.state.authGate.resolve(); auth.state.authGate = null;
  check('mocked_wrong_password_displays_inline_error', await until(() => auth.evaluate(`Boolean(document.querySelector('[role="alert"]') && !document.querySelector('button[type="submit"]')?.disabled && location.pathname === '/auth')`)));
  auth.state.authMode = 'success';
  await signIn(auth);
  check('mocked_successful_password_signin_has_no_otp_call', auth.state.passwords === 2 && auth.state.otp === 0 && auth.state.dialogs === 0);
  await auth.close();

  stage = 'auth_alias';
  const alias = await page('/auth/sign-in');
  check('legacy_signin_route_reaches_password_form', await until(() => alias.evaluate(`Boolean(location.pathname === '/auth' && document.querySelector('input[autocomplete="current-password"]'))`)));
  await alias.close();

  stage = 'signup';
  const signup = await page('/auth');
  if (!await until(() => signup.evaluate(click('Create account')))) throw new Error('signup_tab_missing');
  await until(() => signup.evaluate(fill('#auth-email', accounts.a.email)));
  await signup.evaluate(fill('#auth-password', 'short'));
  await signup.evaluate(fill('#auth-password-confirmation', 'short'));
  await delay(75); await signup.evaluate(formSubmit(false));
  check('mocked_short_signup_password_has_inline_error_without_request', await until(() => signup.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Use at least 8 characters.'))`)) && signup.state.signups === 0);
  await signup.evaluate(fill('#auth-password', fictionalPassword));
  await signup.evaluate(fill('#auth-password-confirmation', `${fictionalPassword}different`));
  await delay(75); await signup.evaluate(formSubmit(false));
  check('mocked_signup_confirmation_mismatch_blocks_request', await until(() => signup.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Passwords do not match'))`)) && signup.state.signups === 0);
  await signup.evaluate(fill('#auth-password-confirmation', fictionalPassword));
  await delay(75); await signup.evaluate(formSubmit(true));
  check('mocked_signup_uses_password_signup_and_generic_confirmation', await until(async () => signup.state.signups === 1 && await signup.evaluate(hasText('Check your inbox for confirmation instructions.'))) && signup.state.otp === 0 && signup.state.passwords === 0);
  await signup.close();

  stage = 'reset';
  const reset = await page('/auth/reset');
  await until(() => reset.evaluate(fill('input[type="email"]', '')));
  await reset.evaluate(formSubmit(false));
  check('mocked_empty_reset_email_has_inline_error_without_request', await until(() => reset.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Enter your email address.'))`)) && reset.state.recoveries === 0);
  await reset.evaluate(fill('input[type="email"]', 'fictional-invalid-email'));
  await delay(75); await reset.evaluate(formSubmit(false));
  check('mocked_malformed_reset_email_has_inline_error_without_request', await until(() => reset.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Enter a valid email address.'))`)) && reset.state.recoveries === 0);
  for (const account of ['a', 'unknown']) {
    if (account === 'unknown') await reset.navigate('/auth/reset');
    const email = account === 'a' ? accounts.a.email : 'fictional-unknown@example.invalid';
    if (!await until(() => reset.evaluate(fill('input[type="email"]', email)))) throw new Error('reset_field_missing');
    await delay(75); await reset.evaluate(formSubmit(false));
    check(account === 'a' ? 'mocked_known_email_reset_is_generic' : 'mocked_unknown_email_reset_is_generic', await until(() => reset.evaluate(hasText('If an account exists for that email, we sent password reset instructions.'))));
  }
  check('mocked_reset_uses_recovery_api_without_otp', reset.state.recoveries === 2 && reset.state.otp === 0);
  await reset.close();

  stage = 'password_update';
  const update = await page('/auth/update');
  check('unverified_password_update_is_blocked', await until(() => update.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('invalid or expired') && document.querySelector('a[href="/auth/reset"]') && !document.querySelector('button[type="submit"]'))`)) && update.state.updates === 0);
  await update.navigate('/auth'); await signIn(update);
  const verifiedBeforeUpdate = update.state.userGets;
  await update.navigate('/auth/update');
  if (!await until(() => update.evaluate(fill('#new-password', '')))) throw new Error('update_field_missing');
  await update.evaluate(formSubmit(false));
  check('mocked_empty_update_password_has_inline_error_without_request', await until(() => update.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Enter a password.'))`)) && update.state.updates === 0);
  await update.evaluate(fill('#new-password', 'short'));
  await update.evaluate(fill('#new-password-confirmation', 'short'));
  await delay(75); await update.evaluate(formSubmit(false));
  check('mocked_short_update_password_has_inline_error_without_request', await until(() => update.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('Use at least 8 characters.'))`)) && update.state.updates === 0);
  await update.evaluate(fill('#new-password', fictionalPassword));
  await update.evaluate(`(() => { const input = [...document.querySelectorAll('input[autocomplete="new-password"]')][1]; if (!input) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(fictionalPassword)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await delay(75); await update.evaluate(formSubmit(true));
  check('mocked_verified_password_update_signs_out_before_success', await until(async () => update.state.updates === 1 && update.state.logouts === 1 && await update.evaluate(`Boolean(location.pathname === '/auth' && location.search.includes('password_updated'))`)) && update.state.order.indexOf('update') < update.state.order.indexOf('logout') && update.state.logoutLocal && update.state.userGets >= verifiedBeforeUpdate + 2);
  await update.close();

  stage = 'password_update_identity_change';
  const changed = await page('/auth');
  await signIn(changed); await changed.navigate('/auth/update');
  if (!await until(() => changed.evaluate(fill('#new-password', fictionalPassword)))) throw new Error('update_field_missing');
  await changed.evaluate(fill('#new-password-confirmation', fictionalPassword));
  await delay(75);
  changed.state.account = 'b';
  await changed.evaluate(formSubmit(false));
  check('mocked_password_update_rejects_changed_verified_identity', await until(() => changed.evaluate(`Boolean(document.querySelector('[role="alert"]') && !document.querySelector('button[type="submit"]'))`)) && changed.state.updates === 0);
  await changed.close();

  async function savingCase(kind) {
    stage = `${kind}_saving`;
    const current = await page('/auth');
    await signIn(current);
    if (kind === 'new') await current.navigate('/journal/new');
    if (kind === 'quick' && !await until(() => current.evaluate(click('1:00')))) throw new Error('quick_note_missing');
    const selector = kind === 'main' ? '#journal-content' : kind === 'new' ? 'textarea[aria-label="Your journal entry"]' : 'textarea[aria-label="Your quick journal note"]';
    if (!await until(() => current.evaluate(fill(selector, draft)))) throw new Error('draft_field_missing');
    await delay(75);
    for (const mode of ['network', 'http', 'unauthorized']) {
      current.state.saveMode = mode;
      const expected = current.state.saves + 1;
      await current.evaluate(click('Save', true));
      check(`mocked_${kind}_${mode}_failure_preserves_draft_and_blocks_double_save`, await until(async () => current.state.saves === expected && await current.evaluate(`Boolean(document.querySelector('[role="alert"]') && ${draftEquals(selector, draft)} && !document.querySelector(${JSON.stringify(selector)})?.readOnly && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Save' && !b.disabled))`)));
    }
    current.state.saveMode = 'success'; current.state.saveGate = deferred();
    let expected = current.state.saves + 1;
    const getCount = current.state.entryGets;
    const documents = current.state.documents;
    await current.evaluate(click('Save', true));
    if (!await until(() => current.state.saves === expected)) throw new Error('save_not_started');
    await current.evaluate(fill(selector, newerDraft));
    await delay(75);
    current.state.saveGate.resolve(); current.state.saveGate = null;
    check(`mocked_${kind}_save_preserves_newer_typing`, await until(() => current.evaluate(`Boolean(${draftEquals(selector, newerDraft)} && [...document.querySelectorAll('[role="status"]')].some(n => n.textContent.includes('Saved')))`)));
    check(`mocked_${kind}_save_does_not_reload_refetch_or_call_ai`, current.state.documents === documents && current.state.entryGets === getCount && current.state.reflections === 0 && current.state.saves === expected);
    if (kind !== 'new') check(`mocked_${kind}_returned_entry_appears_immediately`, await until(() => current.evaluate(`Boolean(document.querySelector('ul')?.textContent.includes(${JSON.stringify(draft)}))`)));
    expected += 1;
    await current.evaluate(click('Save', true));
    check(`mocked_${kind}_unchanged_draft_clears_once_and_announces_saved`, await until(async () => current.state.saves === expected && await current.evaluate(`Boolean(${draftEquals(selector, '')} && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Saved ✓' && b.disabled) && [...document.querySelectorAll('[role="status"]')].some(n => n.textContent.includes('Saved ✓')))`)) && current.state.reflections === 0);
    if (kind === 'new') {
      await current.evaluate(link('/journal'));
      check('mocked_new_return_to_history_preserves_returned_entry', await until(() => current.evaluate(`Boolean(location.pathname === '/journal' && document.querySelector('ul')?.textContent.includes(${JSON.stringify(draft)}))`)));
    }
    if (kind === 'quick') {
      const savedId = current.state.entries.a[0].id;
      await current.evaluate(click('Reflect with AI', true));
      check('mocked_explicit_reflection_failure_is_separate_from_saved_entry', await until(async () => current.state.reflections === 1 && await current.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('temporarily unavailable'))`)));
      current.state.reflectMode = 'quota'; await current.evaluate(click('Retry reflection', true));
      check('mocked_explicit_reflection_retry_handles_quota', await until(async () => current.state.reflections === 2 && await current.evaluate(`Boolean(document.querySelector('[role="alert"]')?.textContent.includes('usage limit'))`)));
      current.state.reflectMode = 'success'; await current.evaluate(click('Retry reflection', true));
      check('mocked_reflection_retry_uses_saved_id_without_duplicate_insert', await until(async () => current.state.reflections === 3 && await current.evaluate(hasText('Fictional reflection: paper kites take patience.'))) && current.state.saves === expected && current.state.reflectedIds.every(id => id === savedId));
    }
    check(`mocked_${kind}_saving_has_no_native_dialogs_or_unexpected_calls`, current.state.dialogs === 0 && current.state.forbidden === 0);
    await current.close();
  }
  await savingCase('main'); await savingCase('new'); await savingCase('quick');

  stage = 'account_cache';
  const cache = await page('/auth');
  cache.state.entries.a.push(savedEntry('a', 'visible'));
  cache.state.entries.b.push(savedEntry('b', 'visible'));
  await signIn(cache);
  check('mocked_account_a_history_loads', await until(() => cache.evaluate(hasText('Fictional account A private fixture visible.'))));
  await cache.evaluate(click('Logout'));
  check('mocked_logout_removes_previous_account_history', await until(() => cache.evaluate(`Boolean(!document.body.textContent.includes('Fictional account A private fixture visible.') && !document.querySelector('header')?.textContent.includes('Logout'))`)));
  await cache.navigate('/auth'); await signIn(cache, 'b');
  check('mocked_account_b_does_not_receive_account_a_cache', await until(() => cache.evaluate(`Boolean(document.body.textContent.includes('Fictional account B private fixture visible.') && !document.body.textContent.includes('Fictional account A private fixture visible.'))`)));
  await cache.close();

  stage = 'late_account_response';
  const late = await page('/auth');
  late.state.entries.a.push(savedEntry('a', 'late'));
  late.state.entries.b.push(savedEntry('b', 'current'));
  late.state.entriesGate = deferred();
  await signIn(late);
  if (!await until(() => late.state.entriesHeld === 1)) throw new Error('late_request_not_held');
  const documents = late.state.documents;
  await late.evaluate(link('/'));
  if (!await until(() => late.evaluate(`Boolean(location.pathname === '/' && document.querySelector('a[href="/auth"]'))`))) throw new Error('home_link_missing');
  await late.evaluate(link('/auth'));
  await signIn(late, 'b');
  const bVisible = await until(() => late.evaluate(hasText('Fictional account B private fixture current.')));
  late.state.entriesGate.resolve(); late.state.entriesGate = null;
  await delay(300);
  check('mocked_late_account_a_response_cannot_enter_account_b_cache', bVisible && late.state.documents === documents && await late.evaluate(`Boolean(document.body.textContent.includes('Fictional account B private fixture current.') && !document.body.textContent.includes('Fictional account A private fixture late.'))`));
  await late.close();

  // Simulated persisted pageshow exercises the provider handler. It is not a
  // claim that Chrome actually restored this tab from its back/forward cache.
  const restore = `(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); return true; })()`;
  stage = 'transient_session_verification';
  const transient = await page('/auth');
  await signIn(transient); await transient.navigate('/auth');
  await credentials(transient);
  await transient.evaluate(`(() => { window.__fictionalPasswordNode = document.querySelector('#auth-password'); return true; })()`);
  const passwordsBeforeVerification = transient.state.passwords;
  const verificationBeforeFailure = transient.state.userGets;
  transient.state.userMode = 'unavailable';
  await transient.evaluate(restore);
  check('mocked_transient_verification_failure_has_retry_ui_without_password_loss', await until(() => transient.evaluate(`Boolean(document.querySelector('[data-testid="session-verification-error"]') && [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Retry session check') && document.querySelector('#auth-password') === window.__fictionalPasswordNode && document.querySelector('#auth-password')?.value === ${JSON.stringify(fictionalPassword)} && !document.querySelector('#auth-password')?.checkVisibility())`)));
  await delay(250);
  check('mocked_verification_failure_does_not_loop_logout_or_resubmit_password', transient.state.userGets === verificationBeforeFailure + 1 && transient.state.logouts === 0 && transient.state.passwords === passwordsBeforeVerification);
  transient.state.userMode = 'success'; transient.state.userGate = deferred();
  await transient.evaluate(click('Retry session check'));
  if (!await until(async () => transient.state.userGets === verificationBeforeFailure + 2 && await transient.evaluate(`Boolean(!document.querySelector('[data-testid="session-verification-error"]'))`))) throw new Error('verification_retry_not_started');
  check('mocked_held_verification_has_bounded_timeout_and_retry_ui', await until(() => transient.evaluate(`Boolean(document.querySelector('[data-testid="session-verification-error"]'))`), 12500));
  transient.state.userGate.resolve(); transient.state.userGate = null;
  await delay(150);
  check('mocked_late_timed_out_verification_does_not_reveal_uncertain_session', await transient.evaluate(`Boolean(document.querySelector('[data-testid="session-verification-error"]') && !document.querySelector('#auth-password')?.checkVisibility())`));
  await transient.evaluate(click('Retry session check'));
  check('mocked_verification_retry_restores_same_password_field_without_logout', await until(() => transient.evaluate(`Boolean(!document.querySelector('[data-testid="session-verification-error"]') && document.querySelector('#auth-password') === window.__fictionalPasswordNode && document.querySelector('#auth-password')?.checkVisibility() && document.querySelector('#auth-password')?.value === ${JSON.stringify(fictionalPassword)})`)) && transient.state.logouts === 0 && transient.state.passwords === passwordsBeforeVerification);
  await transient.close();

  stage = 'bfcache_identity_verification';
  const restored = await page('/auth');
  restored.state.entries.a.push(savedEntry('a', 'restored'));
  restored.state.entries.b.push(savedEntry('b', 'restored'));
  await signIn(restored);
  if (!await until(() => restored.evaluate(hasText('Fictional account A private fixture restored.')))) throw new Error('restore_fixture_missing');
  await restored.evaluate(fill('#journal-content', draft));
  await delay(75);
  await restored.evaluate(`(() => { window.__fictionalJournalNode = document.querySelector('#journal-content'); return true; })()`);
  if (!await until(() => restored.evaluate(click('1:00')))) throw new Error('restore_quick_note_missing');
  await until(() => restored.evaluate(fill('textarea[aria-label="Your quick journal note"]', newerDraft)));
  await delay(75);
  await restored.evaluate(`(() => { window.__fictionalQuickNode = document.querySelector('textarea[aria-label="Your quick journal note"]'); return true; })()`);
  const entriesBeforeRestore = restored.state.entryGets;
  restored.state.userGate = deferred();
  await restored.evaluate(restore);
  check('mocked_bfcache_recheck_conceals_uncertain_journal_without_unmounting', await until(() => restored.evaluate(`Boolean(document.querySelector('#journal-content') === window.__fictionalJournalNode && !document.querySelector('#journal-content')?.checkVisibility() && !document.querySelector('ul')?.checkVisibility())`)));
  check('mocked_bfcache_recheck_conceals_quick_note_without_unmounting', await restored.evaluate(`Boolean(document.querySelector('textarea[aria-label="Your quick journal note"]') === window.__fictionalQuickNode && !window.__fictionalQuickNode?.checkVisibility())`));
  restored.state.userGate.resolve(); restored.state.userGate = null;
  check('mocked_same_user_bfcache_restore_preserves_draft_node_and_cache', await until(() => restored.evaluate(`Boolean(document.querySelector('#journal-content') === window.__fictionalJournalNode && document.querySelector('#journal-content')?.checkVisibility() && ${draftEquals('#journal-content', draft)} && document.querySelector('ul')?.textContent.includes('Fictional account A private fixture restored.'))`)) && restored.state.entryGets === entriesBeforeRestore);
  check('mocked_same_user_bfcache_restore_preserves_open_quick_note_draft', await restored.evaluate(`Boolean(document.querySelector('textarea[aria-label="Your quick journal note"]') === window.__fictionalQuickNode && window.__fictionalQuickNode?.checkVisibility() && window.__fictionalQuickNode?.value === ${JSON.stringify(newerDraft)})`));
  restored.state.userGate = deferred(); restored.state.account = 'b';
  await restored.evaluate(restore);
  await until(() => restored.evaluate(`Boolean(!document.querySelector('#journal-content')?.checkVisibility())`));
  restored.state.userGate.resolve(); restored.state.userGate = null;
  check('mocked_different_user_bfcache_restore_discards_prior_draft_and_cache', await until(() => restored.evaluate(`Boolean(document.querySelector('#journal-content') !== window.__fictionalJournalNode && document.querySelector('#journal-content')?.checkVisibility() && ${draftEquals('#journal-content', '')} && !document.querySelector('textarea[aria-label="Your quick journal note"]') && document.querySelector('ul')?.textContent.includes('Fictional account B private fixture restored.') && !document.body.textContent.includes('Fictional account A private fixture restored.'))`)));
  await restored.close();
} catch {
  // Stage names are fixed harness labels, never exception text or browser data.
  check(`mocked_browser_harness_completed_${stage}`, false);
} finally {
  for (const connection of connections) connection.close();
  browser.kill('SIGTERM');
  if (!await until(() => browser.exitCode !== null || browser.signalCode !== null || processFailed, 3000)) browser.kill('SIGKILL');
  await until(() => browser.exitCode !== null || browser.signalCode !== null || processFailed, 2000);
  await rm(profile, { recursive: true, force: true }).catch(() => { failed = true; });
}
process.exitCode = failed ? 1 : 0;
