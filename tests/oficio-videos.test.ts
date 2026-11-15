import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterVideos, categoryCounts, pickFeatured, durationSeconds, isoDuration, type VideoLike } from '../src/lib/oficio/videos.ts';

const list: VideoLike[] = [
  { id: 'a', category: 'live', year: 2025 },
  { id: 'b', category: 'aftermovie', year: 2026 },
  { id: 'c', category: 'live', year: 2026, featured: true },
  { id: 'd', category: 'visuals', year: 2024 },
];

test('filterVideos conserva el orden y "all" devuelve todo', () => {
  assert.deepEqual(filterVideos(list, 'live').map((v) => v.id), ['a', 'c']);
  assert.deepEqual(filterVideos(list, 'all').map((v) => v.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(filterVideos(list, 'visuals').map((v) => v.id), ['d']);
});

test('categoryCounts: orden fijo y solo categorías con videos', () => {
  assert.deepEqual(categoryCounts(list), [
    { category: 'live', count: 2 },
    { category: 'aftermovie', count: 1 },
    { category: 'visuals', count: 1 },
  ]);
  assert.deepEqual(categoryCounts(list.filter((v) => v.category !== 'aftermovie')).map((c) => c.category), ['live', 'visuals']);
  assert.deepEqual(categoryCounts([]), []);
});

test('pickFeatured: el marcado, si no el más reciente, si no null', () => {
  assert.equal(pickFeatured(list)?.id, 'c');
  assert.equal(pickFeatured(list.map((v) => ({ ...v, featured: false })))?.year, 2026);
  assert.equal(pickFeatured([]), null);
});

test('duraciones', () => {
  assert.equal(durationSeconds('03:48'), 228);
  assert.equal(durationSeconds('1:12:40'), 4360);
  assert.ok(Number.isNaN(durationSeconds('abc')));
  assert.equal(isoDuration('1:12:40'), 'PT1H12M40S');
  assert.equal(isoDuration('03:48'), 'PT3M48S');
  assert.equal(isoDuration('01:00:00'), 'PT1H');
  assert.equal(isoDuration('x'), '');
});
