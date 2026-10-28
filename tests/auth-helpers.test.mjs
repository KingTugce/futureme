// Pure auth helper tests only: no environment, browser storage, or remote calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/app/auth/auth-helpers.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const auth = {};
vm.runInNewContext(compiled, { exports: auth });

test('email validation trims ordinary input and rejects malformed or oversized input', () => {
  assert.equal(auth.normalizeEmail('  reader@example.test  '), 'reader@example.test');
  assert.equal(auth.validateEmail(' reader@example.test '), null);
  assert.match(auth.validateEmail('not-an-email'), /valid email/);
  assert.match(auth.validateEmail('x'.repeat(255)), /valid email/);
});

test('new password validation enforces bounded length without changing password text', () => {
  assert.match(auth.validateNewPassword('short'), /at least 8/);
  assert.equal(auth.validateNewPassword('long enough password'), null);
  assert.match(auth.validateNewPassword('x'.repeat(257)), /no more than 256/);
});

test('known auth failures receive useful messages without returning provider text', () => {
  assert.equal(
    auth.safeAuthError('sign-in', {
      code: 'invalid_credentials',
      message: 'Provider detail that should never be shown',
    }),
    'Email or password is incorrect.',
  );
  assert.match(
    auth.safeAuthError('sign-up', { code: 'weak_password', message: 'secret policy' }),
    /stronger password/,
  );
  assert.match(
    auth.safeAuthError('reset', { status: 429, message: 'private rate detail' }),
    /Too many attempts/,
  );
});

test('unknown provider failures are sanitized and cannot be reflected into the UI', () => {
  const providerText = 'private-project-id: do-not-render-this';
  for (const action of ['sign-in', 'sign-up', 'reset', 'update', 'sign-out']) {
    const message = auth.safeAuthError(action, { message: providerText });
    assert.equal(message.includes(providerText), false);
    assert.equal(message.includes('private-project-id'), false);
  }
});

test('reset requests do not disclose unknown or account-specific failures', () => {
  const expected = auth.RESET_REQUEST_CONFIRMATION;
  for (const error of [
    { code: 'user_not_found', message: 'User not found' },
    { code: 'email_not_found', message: 'Email does not exist' },
    { code: 'unknown_provider_error', message: 'Private provider detail' },
  ]) {
    const notice = auth.resetRequestNotice(error);
    assert.equal(notice.kind, 'success');
    assert.equal(notice.text, expected);
  }

  assert.equal(
    auth.resetRequestNotice({ status: 429, message: 'Rate limit reached' }).kind,
    'error',
  );
  assert.equal(
    auth.resetRequestNotice({ message: 'Network request failed' }).kind,
    'error',
  );
});

test('password update identity checks bind a form to its initially verified user', () => {
  assert.equal(auth.isSameVerifiedUser('user-a', { id: 'user-a' }), true);
  assert.equal(auth.isSameVerifiedUser('user-a', { id: 'user-b' }), false);
  assert.equal(auth.isSameVerifiedUser(null, { id: 'user-a' }), false);
  assert.equal(auth.isSameVerifiedUser('user-a', null), false);
});

test('only recognized callback query notices are shown', () => {
  assert.equal(
    auth.authQueryNotice('password_updated', null).text,
    'Password updated. Sign in with your new password.',
  );
  assert.match(auth.authQueryNotice(null, 'invalid_link').text, /invalid or incomplete/);
  assert.match(auth.authQueryNotice(null, 'verification_failed').text, /expired/);
  assert.equal(auth.authQueryNotice('attacker-controlled', 'raw-secret'), null);
});
