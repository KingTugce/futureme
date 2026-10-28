// Mocked HTTP contract tests: no live database, credentials, or AI calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/journal-client.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function client(fetch) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, fetch, AbortSignal });
  return exports;
}

const entry = {
  id: '00000000-0000-4000-8000-000000000001',
  content_text: 'Fictional RC test: Alex finished a paper kite.',
  created_at: '2026-10-22T12:00:00.000Z',
};

test('save uses the authenticated entries endpoint and actual entry response shape', async () => {
  const api = client(async (url, options) => {
    assert.equal(url, '/api/entries');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { content: entry.content_text });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ entry }, { status: 201 });
  });
  const result = await api.saveJournalEntry(`  ${entry.content_text}  `);
  assert.equal(result.id, entry.id);
  assert.equal(result.content_text, entry.content_text);
  assert.equal(result.created_at, entry.created_at);
});

test('save rejects authentication, HTTP, network, and invalid-success responses', async () => {
  const anonymous = client(async () => Response.json({}, { status: 401 }));
  await assert.rejects(anonymous.saveJournalEntry(entry.content_text), /sign in.*draft/);
  const failure = client(async () => Response.json({}, { status: 500 }));
  await assert.rejects(failure.saveJournalEntry(entry.content_text), /draft is still here/);
  const offline = client(async () => { throw new TypeError('Mock network failure'); });
  await assert.rejects(offline.saveJournalEntry(entry.content_text), /Mock network failure/);
  const malformed = client(async () => Response.json({ entry: { id: entry.id } }, { status: 201 }));
  await assert.rejects(malformed.saveJournalEntry(entry.content_text), /check journal history/);
});

test('reflection retry uses the saved ID without another entry save', async () => {
  const calls = [];
  let reflectCalls = 0;
  const api = client(async (url, options) => {
    calls.push(url);
    if (url === '/api/entries') return Response.json({ entry }, { status: 201 });
    assert.deepEqual(JSON.parse(options.body), { entryId: entry.id });
    reflectCalls += 1;
    return reflectCalls === 1
      ? Response.json({}, { status: 503 })
      : Response.json({ text: 'Fictional reflection for the kite test.' });
  });
  const saved = await api.saveJournalEntry(entry.content_text);
  assert.deepEqual(calls, ['/api/entries'], 'saving does not invoke AI');
  await assert.rejects(api.reflectJournalEntry(saved.id), /entry is saved/);
  assert.equal(await api.reflectJournalEntry(saved.id), 'Fictional reflection for the kite test.');
  assert.deepEqual(calls, ['/api/entries', '/api/reflect', '/api/reflect']);
});

test('confirmed entries prepend into history without duplicates or changing the old cache', () => {
  const api = client(() => { throw new Error('No request expected'); });
  const older = { ...entry, id: '00000000-0000-4000-8000-000000000002', content_text: 'Fictional earlier entry.' };
  const current = { entries: [older, { ...entry, content_text: 'Fictional prior cached version.' }] };
  const updated = api.prependSavedEntry(current, entry);
  assert.equal(updated.entries.length, 2);
  assert.equal(updated.entries[0], entry);
  assert.equal(updated.entries[1], older);
  assert.equal(current.entries[0], older);
  assert.equal(current.entries[1].content_text, 'Fictional prior cached version.');
  assert.equal(api.prependSavedEntry(undefined, entry).entries[0], entry);
});

test('confirmed reflections update their entry without losing other saved reflections', () => {
  const api = client(() => { throw new Error('No request expected'); });
  const older = { entry_id: '00000000-0000-4000-8000-000000000002', content: 'Fictional older reflection.' };
  const current = { reflections: [older, { entry_id: entry.id, content: 'Fictional earlier reflection.' }] };
  const updated = api.prependSavedReflection(current, entry.id, 'Fictional replacement reflection.');
  assert.equal(updated.reflections.length, 2);
  assert.equal(updated.reflections[0].entry_id, entry.id);
  assert.equal(updated.reflections[0].content, 'Fictional replacement reflection.');
  assert.equal(updated.reflections[1], older);
  assert.equal(current.reflections[1].content, 'Fictional earlier reflection.');
  assert.equal(api.prependSavedReflection(undefined, entry.id, 'Fictional first reflection.').reflections.length, 1);
});

test('reflection failures distinguish sign-in, quota, unavailable, and malformed responses', async () => {
  for (const [status, message] of [[401, /Sign in again/], [429, /usage limit/], [503, /temporarily unavailable/], [500, /reflection failed/]]) {
    const api = client(async () => Response.json({}, { status }));
    await assert.rejects(api.reflectJournalEntry(entry.id), message);
  }
  const api = client(async () => Response.json({ text: '' }));
  await assert.rejects(api.reflectJournalEntry(entry.id), /response could not be confirmed/);
});
