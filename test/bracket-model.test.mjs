import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeVenue, dayMs, indexSkeleton, ROUND_KEY } from '../js/bracket-model.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const skeleton = JSON.parse(readFileSync(join(__dir, '../data/knockout-bracket.json'), 'utf8'));

test('normalizeVenue strips punctuation, diacritics, and the word stadium', () => {
  assert.equal(normalizeVenue('SoFi Stadium'), 'sofi');
  assert.equal(normalizeVenue('AT&T Stadium'), 'att');
  assert.equal(normalizeVenue('Estadio Azteca'), 'estadioazteca');
  assert.equal(normalizeVenue('Estadio BBVA'), 'estadiobbva');
});

test('dayMs returns UTC midnight and ignores time-of-day', () => {
  assert.equal(dayMs('2026-06-29'), dayMs('2026-06-29T20:30Z'));
  assert.equal(dayMs('2026-06-30T01:00Z') - dayMs('2026-06-29'), 86400000);
});

test('indexSkeleton indexes all 32 matches with short round keys', () => {
  const { byNumber, venueIndex } = indexSkeleton(skeleton);
  assert.equal(byNumber.size, 32);
  assert.equal(byNumber.get(74).round, 'r32');
  assert.equal(byNumber.get(74).stadium, 'Gillette Stadium');
  assert.equal(byNumber.get(74).homeDef, 'Group E winners');
  assert.equal(byNumber.get(89).round, 'r16');
  assert.equal(byNumber.get(89).homeDef, 'Winner Match 74');
  assert.equal(byNumber.get(104).round, 'final');
  assert.equal(ROUND_KEY['round-of-32'], 'r32');
  assert.equal(venueIndex.length, 32);
});
