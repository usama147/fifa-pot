import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeVenue, dayMs, indexSkeleton, ROUND_KEY, isKnockoutEvent, bindEvents } from '../js/bracket-model.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const skeleton = JSON.parse(readFileSync(join(__dir, '../data/knockout-bracket.json'), 'utf8'));
const fixture = JSON.parse(readFileSync(join(__dir, '../data/espn-knockout-fixture.json'), 'utf8'));
const espnEvents = fixture.events || [];

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

test('isKnockoutEvent detects knockout events by season slug', () => {
  const r32 = espnEvents.find(e => (e.season?.slug || '').includes('round-of-32'));
  assert.ok(r32, 'fixture should contain an R32 event');
  assert.equal(isKnockoutEvent(r32), true);
});

test('bindEvents joins events to match numbers by venue + date (±1 day)', () => {
  const idx = indexSkeleton(skeleton);
  const bound = bindEvents(idx, espnEvents);

  // M74 = Gillette Stadium, 2026-06-29 = ESPN Germany v Paraguay
  const m74 = bound.get(74);
  assert.ok(m74, 'M74 should bind');
  const names74 = m74.competitions[0].competitors.map(c => c.team.displayName).sort();
  assert.deepEqual(names74, ['Germany', 'Paraguay']);

  // M75 = Estadio BBVA, 2026-06-29 — but ESPN dates it 2026-06-30T01:00Z (UTC rollover).
  // The ±1 day tolerance must still bind it.
  const m75 = bound.get(75);
  assert.ok(m75, 'M75 should bind across the UTC day boundary');
  const names75 = m75.competitions[0].competitors.map(c => c.team.displayName).sort();
  assert.deepEqual(names75, ['Morocco', 'Netherlands']);
});
