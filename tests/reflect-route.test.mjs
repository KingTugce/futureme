// Mocked route regression tests only: no environment files, live auth/database,
// or provider requests. Concurrency below does not prove PostgreSQL atomicity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function compile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const routeCode = compile('../src/app/api/reflect/route.ts');
const bodyCode = compile('../src/lib/read-json.ts');
const user = { id: '00000000-0000-4000-8000-000000000002' };
const entry = {
  id: '00000000-0000-4000-8000-000000000001',
  content_text: 'Fictional RC test: Alex finished a paper kite.',
};
const reflection = 'Fictional reflection: Enjoy the care you put into your kite.';
const allowed = { allowed: true, retry_after_seconds: 0 };

function harness(options = {}) {
  const calls = { events: [], queries: [], reservations: [], providerOptions: [], completions: [], inserts: [] };
  const globals = { AbortSignal, TextDecoder, Uint8Array, console: { error() {} } };
  const bodyExports = {};
  vm.runInNewContext(bodyCode, { ...globals, exports: bodyExports });

  const supabase = {
    auth: {
      async getUser() {
        calls.events.push('verify-user');
        return { data: { user: options.anonymous ? null : user }, error: options.authError ?? null };
      },
    },
    from(table) {
      const query = { table, filters: [] };
      calls.queries.push(query);
      const chain = {
        select(columns) { query.columns = columns; return chain; },
        eq(column, value) { query.filters.push([column, value]); return chain; },
        order(column, order) { query.order = [column, order]; return chain; },
        async limit(limit) {
          query.limit = limit;
          return { data: options.history ?? [], error: options.historyError ?? null };
        },
        async single() {
          calls.events.push('fetch-owned-entry');
          return { data: options.noEntry ? null : { ...entry, ...options.entry }, error: options.entryError ?? null };
        },
        async insert(value) {
          calls.events.push('persist-reflection');
          calls.inserts.push(JSON.parse(JSON.stringify(value)));
          return { error: options.saveError ?? null };
        },
      };
      return chain;
    },
    rpc(name, args) {
      calls.events.push('reserve-quota');
      calls.reservations.push({ name, args: JSON.parse(JSON.stringify(args)) });
      return {
        abortSignal(signal) {
          assert.ok(signal instanceof AbortSignal);
          if (options.rejectLimiter) return Promise.reject(new Error('Mock unavailable limiter'));
          if (options.reserve) return options.reserve();
          return Promise.resolve({
            data: Object.hasOwn(options, 'usage') ? options.usage : allowed,
            error: options.usageError ?? null,
          });
        },
      };
    },
  };

  class MockOpenAI {
    constructor(config) {
      calls.events.push('construct-provider');
      calls.providerOptions.push(config);
      this.chat = {
        completions: {
          async create(params) {
            calls.events.push('call-provider');
            calls.completions.push(params);
            if (options.providerError) throw new Error('Mock provider failure');
            return { choices: [{ message: { content: options.output ?? reflection } }] };
          },
        },
      };
    }
  }

  const exports = {};
  vm.runInNewContext(routeCode, {
    ...globals,
    exports,
    process: { env: options.noKey ? {} : { OPENAI_API_KEY: 'mock-only-not-a-credential' } },
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: Response.json.bind(Response) } };
      if (name === 'openai') return { default: MockOpenAI };
      if (name === '@/lib/supabase/server') return { supabaseServer: async () => supabase };
      if (name === '@/lib/read-json') return bodyExports;
      throw new Error(`Unexpected mock module: ${name}`);
    },
  });
  return { ...exports, calls };
}

function request(body = JSON.stringify({ entryId: entry.id })) {
  return new Request('http://localhost/api/reflect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  });
}

function noProvider(calls) {
  assert.equal(calls.providerOptions.length, 0);
  assert.equal(calls.completions.length, 0);
  assert.equal(calls.inserts.length, 0);
}

test('anonymous and unverified sessions reject before input, database, quota, or provider access', async () => {
  for (const options of [{ anonymous: true }, { authError: { message: 'Mock expired session' } }]) {
    const api = harness(options);
    assert.equal((await api.POST(request('{invalid'))).status, 401);
    assert.equal(api.calls.queries.length, 0);
    assert.equal(api.calls.reservations.length, 0);
    noProvider(api.calls);
  }
});

test('malformed JSON, absent IDs, and invalid ID types reject with 400', async () => {
  for (const body of ['{invalid', 'null', '[]', '{}', '{"entryId":4}', '{"entryId":"invalid"}']) {
    const api = harness();
    assert.equal((await api.POST(request(body))).status, 400);
    assert.equal(api.calls.queries.length, 0);
    assert.equal(api.calls.reservations.length, 0);
    noProvider(api.calls);
  }
});

test('request bytes are capped even without a Content-Length header', async () => {
  const api = harness();
  const oversized = request(JSON.stringify({ entryId: entry.id, padding: 'x'.repeat(1024) }));
  assert.equal(oversized.headers.get('Content-Length'), null);
  assert.equal((await api.POST(oversized)).status, 413);
  assert.equal(api.calls.queries.length, 0);
  noProvider(api.calls);
});

test('missing or foreign entries reject with 404 and ownership is explicitly filtered', async () => {
  for (const options of [{ noEntry: true }, { entryError: { message: 'Mock denied row' } }]) {
    const api = harness(options);
    assert.equal((await api.POST(request())).status, 404);
    assert.equal(api.calls.queries[0].table, 'entries');
    assert.deepEqual(api.calls.queries[0].filters, [['id', entry.id], ['user_id', user.id]]);
    assert.equal(api.calls.reservations.length, 0);
    noProvider(api.calls);
  }
});

test('stored content must be nonempty text within 20,000 characters', async () => {
  for (const content_text of [null, 4, '', '   ', 'x'.repeat(20001)]) {
    const api = harness({ entry: { content_text } });
    assert.equal((await api.POST(request())).status, 400);
    assert.equal(api.calls.reservations.length, 0);
    noProvider(api.calls);
  }
});

test('missing provider configuration fails closed without consuming quota', async () => {
  const api = harness({ noKey: true });
  assert.equal((await api.POST(request())).status, 503);
  assert.equal(api.calls.reservations.length, 0);
  noProvider(api.calls);
});

test('limiter errors, missing configuration, and rejected promises fail closed', async () => {
  for (const options of [{ usageError: { message: 'Mock missing RPC' } }, { usage: null }, { rejectLimiter: true }]) {
    const api = harness(options);
    assert.equal((await api.POST(request())).status, 503);
    assert.equal(api.calls.reservations.length, 1);
    noProvider(api.calls);
  }
});

test('malformed and contradictory quota replies fail closed', async () => {
  for (const usage of [
    true, [], {}, { allowed: 'true', retry_after_seconds: 0 },
    { allowed: true, retry_after_seconds: '0' },
    { allowed: true, retry_after_seconds: -1 },
    { allowed: false, retry_after_seconds: 86401 },
    { allowed: false, retry_after_seconds: 0.5 },
    { allowed: true, retry_after_seconds: 60 },
    { allowed: false, retry_after_seconds: 0 },
  ]) {
    const api = harness({ usage });
    assert.equal((await api.POST(request())).status, 503);
    noProvider(api.calls);
  }
});

test('exhausted quota returns 429 and Retry-After without provider access', async () => {
  const api = harness({ usage: { allowed: false, retry_after_seconds: 60 } });
  const response = await api.POST(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  noProvider(api.calls);
});

test('one verified reservation precedes exactly one bounded provider request and persistence', async () => {
  const api = harness({ entry: { content_text: 'x'.repeat(20000) } });
  const response = await api.POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: reflection });
  assert.deepEqual(api.calls.events, [
    'verify-user', 'fetch-owned-entry', 'reserve-quota', 'construct-provider', 'call-provider', 'persist-reflection',
  ]);
  assert.deepEqual(api.calls.reservations, [{ name: 'reserve_reflection_usage', args: { p_entry_id: entry.id } }]);
  assert.equal(api.calls.providerOptions.length, 1);
  assert.equal(api.calls.providerOptions[0].timeout, 20000);
  assert.equal(api.calls.providerOptions[0].maxRetries, 0);
  assert.equal(api.calls.completions.length, 1);
  assert.equal(api.calls.completions[0].max_tokens, 140);
  assert.equal(api.calls.completions[0].messages[1].content.length, 20000);
  assert.deepEqual(api.calls.inserts, [{ entry_id: entry.id, user_id: user.id, content: reflection }]);
  assert.equal(api.calls.queries.filter(query => query.table === 'entries').length, 1);
});

test('failed provider calls are not retried or refunded and do not save a reflection', async () => {
  const api = harness({ providerError: true });
  assert.equal((await api.POST(request())).status, 500);
  assert.equal(api.calls.reservations.length, 1);
  assert.equal(api.calls.completions.length, 1);
  assert.equal(api.calls.inserts.length, 0);
});

test('empty and oversized provider outputs are rejected before persistence', async () => {
  for (const output of ['', '   ', 'x'.repeat(4001)]) {
    const api = harness({ output });
    assert.equal((await api.POST(request())).status, 502);
    assert.equal(api.calls.reservations.length, 1);
    assert.equal(api.calls.completions.length, 1);
    assert.equal(api.calls.inserts.length, 0);
  }
});

test('reflection persistence failures stay failures without repeating provider or journal insertion', async () => {
  const api = harness({ saveError: { message: 'Mock storage failure' } });
  const response = await api.POST(request());
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /save reflection/);
  assert.equal(api.calls.reservations.length, 1);
  assert.equal(api.calls.completions.length, 1);
  assert.equal(api.calls.inserts.length, 1);
  assert.equal(api.calls.queries.at(-1).table, 'replies');
});

test('mock concurrent quota responses permit only one provider call; not a database atomicity test', async () => {
  let remaining = 1;
  const api = harness({
    reserve: async () => {
      await Promise.resolve();
      return { data: remaining-- > 0 ? allowed : { allowed: false, retry_after_seconds: 60 }, error: null };
    },
  });
  const responses = await Promise.all(Array.from({ length: 4 }, () => api.POST(request())));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 429, 429, 429]);
  assert.equal(api.calls.reservations.length, 4);
  assert.equal(api.calls.completions.length, 1);
  assert.equal(api.calls.inserts.length, 1);
});

test('saved reflections load without a provider key and remain filtered to the verified owner', async () => {
  const history = [{ entry_id: entry.id, content: reflection, created_at: '2026-10-22T12:00:00Z' }];
  const api = harness({ noKey: true, history });
  const response = await api.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reflections: history });
  assert.equal(api.calls.queries[0].table, 'replies');
  assert.deepEqual(api.calls.queries[0].filters, [['user_id', user.id]]);
  assert.equal(api.calls.queries[0].limit, 200);
  assert.equal(api.calls.reservations.length, 0);
  noProvider(api.calls);
});

test('reflection history rejects anonymous sessions and reports storage errors', async () => {
  const anonymous = harness({ anonymous: true });
  assert.equal((await anonymous.GET()).status, 401);
  assert.equal(anonymous.calls.queries.length, 0);
  noProvider(anonymous.calls);
  const failed = harness({ historyError: { message: 'Mock storage error' } });
  assert.equal((await failed.GET()).status, 500);
  noProvider(failed.calls);
});

test('disabled legacy AI endpoints return 410 without loading auth, database, or providers', async () => {
  for (const path of ['sentiment', 'reflection-letter']) {
    const exports = {};
    vm.runInNewContext(compile(`../src/app/api/${path}/route.ts`), {
      exports,
      require(name) {
        assert.equal(name, 'next/server');
        return { NextResponse: { json: Response.json.bind(Response) } };
      },
    });
    assert.equal((await exports.POST(request())).status, 410);
  }
});
