import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMessages } from './messageSearch.js';

const message = (overrides = {}) => ({
  _id: crypto.randomUUID(),
  decryptedText: 'Nội dung thử nghiệm',
  sender: { _id: 'user-1' },
  type: 'text',
  createdAt: new Date(2026, 8, 22, 12).toISOString(),
  isDeleted: false,
  ...overrides,
});

test('keeps text search case-insensitive and excludes recalled messages', () => {
  const messages = [
    message({ decryptedText: 'Xin CHÀO bạn' }),
    message({ decryptedText: 'Xin chào đã thu hồi', isDeleted: true }),
    message({ decryptedText: 'Không khớp' }),
  ];

  assert.deepEqual(searchMessages(messages, 'chào').map(item => item.decryptedText), ['Xin CHÀO bạn']);
});

test('filters without a text query and combines sender with message type', () => {
  const expected = message({ sender: { _id: 'user-2' }, type: 'poll' });
  const messages = [expected, message({ sender: { _id: 'user-1' }, type: 'poll' }), message({ sender: { _id: 'user-2' } })];

  assert.deepEqual(searchMessages(messages, '', { senderId: 'user-2', type: 'poll' }), [expected]);
});

test('includes the full local end date', () => {
  const first = message({ createdAt: new Date(2026, 8, 22, 0, 0, 0).toISOString() });
  const last = message({ createdAt: new Date(2026, 8, 22, 23, 59, 59, 999).toISOString() });
  const nextDay = message({ createdAt: new Date(2026, 8, 23, 0, 0, 0).toISOString() });

  assert.deepEqual(searchMessages([first, last, nextDay], '', {
    startDate: '2026-09-22', endDate: '2026-09-22',
  }), [first, last]);
});

test('attachment filter includes image, audio and file messages only', () => {
  const image = message({ type: 'image' });
  const audio = message({ type: 'audio' });
  const file = message({ type: 'file' });

  assert.deepEqual(
    searchMessages([message(), image, audio, file, message({ type: 'poll' })], '', { hasAttachment: true }),
    [image, audio, file]
  );
});

test('combines text, sender, type and date filters', () => {
  const expected = message({ decryptedText: 'Báo cáo tháng chín', sender: 'user-2', type: 'file' });
  const messages = [
    expected,
    message({ decryptedText: 'Báo cáo tháng chín', sender: 'user-1', type: 'file' }),
    message({ decryptedText: 'Báo cáo tháng chín', sender: 'user-2', type: 'text' }),
  ];

  assert.deepEqual(searchMessages(messages, 'báo cáo', {
    senderId: 'user-2', type: 'file', startDate: '2026-09-01', endDate: '2026-09-30',
  }), [expected]);
});
