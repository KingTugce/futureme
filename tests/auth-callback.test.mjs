// Mocked callback contract tests only: no live auth, cookies, or token values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function compile(relativePath) {
  return ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}

const callbackCode = compile('../src/app/auth/confirm/callback.ts');
const routeCode = compile('../src/app/auth/confirm/route.ts');
const callbackExports = {};
vm.runInNewContext(callbackCode, {
  exports: callbackExports,
  URLSearchParams,
});

function harness(options = {}) {
  const calls = { server: 0, verify: [] };
  const supabase = {
    auth: {
      async verifyOtp(params) {
        calls.verify.push({ ...params });
        return { error: options.verifyError ?? null };
      },
    },
  };
  const exports = {};

  vm.runInNewContext(routeCode, {
    exports,
    Response,
    URL,
    require(name) {
      if (name === 'next/server') {
        return {
          NextResponse: {
            redirect(url, init) {
              const status = typeof init === 'number' ? init : (init?.status ?? 307);
              return new Response(null, {
                status,
                headers: { Location: String(url) },
              });
            },
          },
        };
      }
      if (name === '@/lib/supabase/server') {
        return {
          async supabaseServer() {
            calls.server += 1;
            if (options.serverError) throw new Error('Mock server failure');
            return supabase;
          },
        };
      }
      if (name === './callback') return callbackExports;
      throw new Error(`Unexpected mock module: ${name}`);
    },
  });

  return { ...exports, calls };
}

function request(path) {
  const url = new URL(path, 'https://futureme.example');
  return { nextUrl: url, url: url.toString() };
}

function locationPath(response) {
  const location = new URL(response.headers.get('Location'));
  return `${location.pathname}${location.search}`;
}

function assertPrivateRedirect(response) {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('Pragma'), 'no-cache');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
}

test('typeless token hashes preserve email verification and ignore unrelated query fields', async () => {
  const api = harness();
  const response = await api.GET(
    request('/auth/confirm?token_hash=fictional-email-token&utm_source=test'),
  );

  assertPrivateRedirect(response);
  assert.equal(locationPath(response), '/journal');
  assert.equal(api.calls.server, 1);
  assert.equal(api.calls.verify.length, 1);
  assert.equal(api.calls.verify[0].token_hash, 'fictional-email-token');
  assert.equal(api.calls.verify[0].type, 'email');
  assert.equal(response.headers.get('Location').includes('fictional-email-token'), false);
});

test('explicit email and signup confirmations lead only to journal', async () => {
  for (const type of ['email', 'signup']) {
    const api = harness();
    const response = await api.GET(
      request(`/auth/confirm?token_hash=fictional-${type}-token&type=${type}&next=%2Fjournal`),
    );
    assert.equal(locationPath(response), '/journal');
    assert.equal(api.calls.verify[0].type, type);
  }
});

test('recovery verifies as recovery and leads only to password update', async () => {
  const api = harness();
  const response = await api.GET(
    request('/auth/confirm?token_hash=fictional-recovery-token&type=recovery&next=%2Fauth%2Fupdate'),
  );

  assertPrivateRedirect(response);
  assert.equal(locationPath(response), '/auth/update');
  assert.equal(api.calls.verify.length, 1);
  assert.equal(api.calls.verify[0].type, 'recovery');
});

test('missing, duplicate, unknown, and mismatched callback fields reject before verification', async () => {
  const invalidPaths = [
    '/auth/confirm',
    '/auth/confirm?token_hash=',
    '/auth/confirm?token_hash=%20fictional-token',
    '/auth/confirm?token_hash=a&token_hash=b',
    '/auth/confirm?token_hash=a&type=email&type=recovery',
    '/auth/confirm?token_hash=a&next=%2Fjournal&next=%2Fauth%2Fupdate',
    '/auth/confirm?token_hash=a&type=magiclink',
    '/auth/confirm?token_hash=a&type=toString',
    '/auth/confirm?token_hash=a&type=email&next=%2Fauth%2Fupdate',
    '/auth/confirm?token_hash=a&type=recovery&next=%2Fjournal',
    '/auth/confirm?token_hash=a&type=recovery&next=https%3A%2F%2Fevil.example',
  ];

  for (const path of invalidPaths) {
    const api = harness();
    const response = await api.GET(request(path));
    assertPrivateRedirect(response);
    assert.equal(locationPath(response), '/auth?error=invalid_link');
    assert.equal(api.calls.server, 0);
    assert.equal(api.calls.verify.length, 0);
  }
});

test('verification and server failures use a generic clean redirect', async () => {
  for (const options of [
    { verifyError: { message: 'Fictional private provider detail' } },
    { serverError: true },
  ]) {
    const api = harness(options);
    const response = await api.GET(
      request('/auth/confirm?token_hash=fictional-sensitive-token&type=recovery'),
    );
    assertPrivateRedirect(response);
    assert.equal(locationPath(response), '/auth?error=verification_failed');
    assert.equal(response.headers.get('Location').includes('fictional-sensitive-token'), false);
    assert.equal(response.headers.get('Location').includes('provider'), false);
  }
});
