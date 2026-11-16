/**
 * Unit tests for the security helpers that do not need a database.
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, passwordProblem, safeEqual, sha256, verifyPassword } from '../src/lib/server/security.ts';
import { cleanRichText, cleanText, cleanUrl } from '../src/lib/server/sanitize.ts';
import { validateValue, clearedSeoFields } from '../src/lib/server/validate.ts';
import { csvCell } from '../src/lib/server/enquiries.ts';
import { can } from '../src/lib/cms/permissions.ts';
import { RESOURCES } from '../src/lib/cms/resources.ts';

test('passwords are hashed with a salt and verified', async () => {
  const a = await hashPassword('correct horse battery staple');
  const b = await hashPassword('correct horse battery staple');
  assert.match(a, /^scrypt\$/);
  assert.notEqual(a, b, 'two hashes of the same password differ (random salt)');
  assert.equal(await verifyPassword('correct horse battery staple', a), true);
  assert.equal(await verifyPassword('wrong password here!', a), false);
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
});

test('weak passwords are refused', () => {
  assert.ok(passwordProblem('short'));
  assert.ok(passwordProblem('password1234'));
  assert.ok(passwordProblem('jane.doe@example.org', { email: 'jane.doe@example.org' }));
  assert.equal(passwordProblem('Quiet-harbour-violin-58'), null);
});

test('constant-time comparison and hashing', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(sha256('x').length, 64);
});

test('rich text is sanitised against XSS', () => {
  const dirty = '<p onclick="alert(1)">Hi<script>alert(1)</script><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)><iframe src="https://evil"></iframe></p>';
  const clean = cleanRichText(dirty);
  assert.doesNotMatch(clean, /script|onclick|onerror|javascript:|iframe/i);
  assert.match(clean, /<p>Hi/);
  const link = cleanRichText('<a href="https://example.org" target="_blank">x</a>');
  assert.match(link, /rel="noopener noreferrer"|rel="noopener"/);
});

test('plain text and URLs are cleaned', () => {
  // Plain text keeps characters as typed (pages escape it when rendering) but loses control characters.
  assert.equal(cleanText('  <b>Hello</b>\u0000 '), '<b>Hello</b>');
  assert.equal(cleanUrl('javascript:alert(1)'), null);
  assert.equal(cleanUrl('https://example.org/a'), 'https://example.org/a');
  assert.equal(cleanUrl('/contact/'), '/contact/');
  assert.equal(cleanUrl('/contact/', { allowRelative: false }), null);
});

test('field validation enforces types and limits', () => {
  assert.deepEqual(validateValue({ name: 't', label: 'T', type: 'text', required: true }, '', {})[1] !== null, true);
  assert.equal(validateValue({ name: 's', label: 'S', type: 'slug' }, 'Bad Slug!', {})[1] !== null, true);
  assert.equal(validateValue({ name: 'e', label: 'E', type: 'email' }, 'not-an-email', {})[1] !== null, true);
  assert.equal(validateValue({ name: 'd', label: 'D', type: 'date' }, '2026-02-30x', {})[1] !== null, true);
  assert.equal(validateValue({ name: 'n', label: 'N', type: 'number', min: 1, max: 7 }, 9, {})[1] !== null, true);
  const [v, err] = validateValue({ name: 't', label: 'T', type: 'text', max: 5 }, 'abcdef', {});
  assert.ok(err || String(v).length <= 5);
});

test('clearing essential SEO fields is detected', () => {
  const fields = RESOURCES.news.fields;
  const cleared = clearedSeoFields(fields, { seo_title: 'Old', seo_description: 'Old description' }, { seo_title: '', seo_description: 'Old description' });
  assert.deepEqual(cleared, ['SEO title']);
});

test('CSV export neutralises spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell('+1'), `'+1`);
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
});

test('roles limit what each administrator can do', () => {
  const editor = { id: '1', role: 'editor' as const, modules: [] };
  const cm = { id: '2', role: 'content_manager' as const, modules: ['news'] };
  const sa = { id: '3', role: 'super_admin' as const, modules: [] };
  assert.equal(can(sa, 'admins', 'delete'), true);
  assert.equal(can(editor, 'admins'), false);
  assert.equal(can(editor, 'settings'), false);
  assert.equal(can(editor, 'news', 'delete'), true);
  assert.equal(can(cm, 'news', 'publish'), true);
  assert.equal(can(cm, 'news', 'delete'), false);
  assert.equal(can(cm, 'events'), false);
  assert.equal(can(cm, 'enquiries'), false);
  assert.equal(can(cm, 'media', 'create'), true);
  assert.equal(can(cm, 'media', 'delete'), false);
  assert.equal(can(null, 'dashboard'), false);
});
