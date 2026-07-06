import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeVenue, dayMs, indexSkeleton, ROUND_KEY, isKnockoutEvent, bindEvents, outcome, resolveDef, buildModel } from '../js/bracket-model.js';

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

test('VENUE_ALIASES resolves renamed venues so all 32 matches bind', () => {
  const idx = indexSkeleton(skeleton);
  const bound = bindEvents(idx, espnEvents);

  assert.equal(bound.size, 32);
  // The four previously-unbound matches (Estadio Banorte / GEHA Field renames):
  for (const n of [79, 87, 92, 100]) assert.ok(bound.has(n), `M${n} should bind`);
});

test('outcome uses the winner flag, so penalty results resolve correctly', () => {
  const bound = bindEvents(indexSkeleton(skeleton), espnEvents);
  // M74 Germany v Paraguay ended on penalties; Paraguay carries winner:true.
  const o = outcome(74, bound);
  assert.equal(o.winner, 'Paraguay');
  assert.equal(o.loser, 'Germany');
});

test('resolveDef advances winners one level and placeholders the unplayed', () => {
  const bound = bindEvents(indexSkeleton(skeleton), espnEvents);
  const played = resolveDef('Winner Match 74', bound);
  assert.equal(played.teamName, 'Paraguay');
  assert.equal(played.resolved, true);

  const unplayed = resolveDef('Winner Match 101', bound); // SF, not in fixture window
  assert.equal(unplayed.teamName, null);
  assert.equal(unplayed.resolved, false);
  assert.equal(unplayed.label, 'Winner M101');

  const group = resolveDef('Group E winners', bound);
  assert.equal(group.resolved, false);
  assert.equal(group.label, 'Group E winners');
});

test('buildModel resolves 32 matches; winner flag drives isWinner', () => {
  const model = buildModel(skeleton, espnEvents);
  assert.equal(model.byNumber.size, 32);

  const m74 = model.byNumber.get(74);
  // Bound match renders its own event competitors; Paraguay is the winner.
  const winners = [m74.home, m74.away].filter(s => s.isWinner).map(s => s.teamName);
  assert.deepEqual(winners, ['Paraguay']);

  // The final is unplayed → both slots are feed placeholders.
  const m104 = model.byNumber.get(104);
  assert.equal(m104.home.label, 'Winner M101');
  assert.equal(m104.away.label, 'Winner M102');
  assert.equal(m104.home.resolved, false);

  // order passes through for the renderer.
  assert.deepEqual(model.order.left.r32, [74, 77, 73, 75, 83, 84, 81, 82]);
});

test('buildModel is deterministic — identical output on repeat (drift guard)', () => {
  const project = m => [...m.byNumber.entries()]
    .map(([n, r]) => [n, r.home.label, r.away.label, r.status]);
  const a = project(buildModel(skeleton, espnEvents));
  const b = project(buildModel(skeleton, espnEvents));
  assert.deepEqual(a, b);
});
