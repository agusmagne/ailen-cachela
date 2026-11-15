import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boothLayout, VIEW, type GearInput } from '../src/lib/booking/booth.ts';

const g = (kind: GearInput['kind'], qty = 1, model = 'X', confirm = false): GearInput => ({ kind, qty, model, confirm });
const inside = (u: { x: number; y: number; w: number; h: number }) => u.x >= 0 && u.y >= 0 && u.x + u.w <= VIEW.w && u.y + u.h <= VIEW.h;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const RIGS: Record<string, GearInput[]> = {
  two: [g('deck', 2, 'CDJ-3000X'), g('mixer', 1, 'DJM-V10'), g('monitor', 2, 'Monitores', true)],
  four: [g('deck', 4, 'CDJ-3000X'), g('mixer', 1, 'DJM-V10'), g('monitor', 2, 'Monitores', true)],
  vinyl: [g('turntable', 2, 'PLX-1000'), g('mixer', 1, 'DJM-S11'), g('monitor', 2, 'Monitores', true)],
  laptop: [g('deck', 2, 'CDJ-3000X'), g('mixer', 1, 'DJM-S11'), g('laptop', 1, 'Laptop', true), g('monitor', 2, 'M', true)],
  live: [g('synth', 2, 'S', true), g('drum', 1, 'D', true), g('interface', 1, 'I', true), g('mixer', 1, 'Mixer', true), g('monitor', 2, 'M', true), g('mic', 1, 'Mic', true)],
  hybrid: [g('deck', 2, 'CDJ-3000X'), g('mixer', 1, 'DJM-V10'), g('drum', 1, 'D', true), g('fx', 1, 'FX', true), g('monitor', 4, 'M', true)],
  alone: [g('mixer', 1, 'DJM-A9')],
  empty: [],
};

test('una cabina de 2 reproductores y mixer dibuja 2 decks, 1 mixer y 2 monitores, con el mixer en el medio', () => {
  const L = boothLayout(RIGS.two);
  const kinds = (k: string) => L.units.filter((u) => u.kind === k);
  assert.equal(kinds('deck').length, 2);
  assert.equal(kinds('mixer').length, 1);
  assert.equal(kinds('monitor').length, 2);
  const [d1, d2] = kinds('deck');
  const m = kinds('mixer')[0];
  assert.ok(d1.x + d1.w <= m.x && m.x + m.w <= d2.x, 'decks a los costados del mixer');
  assert.equal(Math.round(d1.x + (d2.x + d2.w - d1.x) / 2), Math.round(m.x + m.w / 2), 'centrado');
  assert.deepEqual(L.counts, { deck: 2, mixer: 1, monitor: 2 });
});

test('cuatro reproductores: dos a cada lado del mixer', () => {
  const L = boothLayout(RIGS.four);
  const decks = L.units.filter((u) => u.kind === 'deck');
  const m = L.units.find((u) => u.kind === 'mixer')!;
  assert.equal(decks.length, 4);
  assert.equal(decks.filter((d) => d.x < m.x).length, 2);
  assert.equal(decks.filter((d) => d.x > m.x).length, 2);
});

test('todas las configuraciones: dentro del viewBox, sin solapar y numeradas de 1 a n', () => {
  for (const [name, gear] of Object.entries(RIGS)) {
    const L = boothLayout(gear);
    assert.deepEqual(L.units.map((u) => u.n), L.units.map((_, i) => i + 1), name);
    for (const u of L.units) assert.ok(inside(u), `${name}: ${u.id} fuera del viewBox`);
    for (let i = 0; i < L.units.length; i++)
      for (let j = i + 1; j < L.units.length; j++) assert.ok(!overlap(L.units[i], L.units[j]), `${name}: ${L.units[i].id} solapa con ${L.units[j].id}`);
    const total = gear.reduce((n, x) => n + (x.kind === 'mixer' ? Math.min(x.qty, 1) : x.kind === 'monitor' ? Math.min(x.qty, 4) : x.kind === 'mic' ? Math.min(x.qty, 1) : x.qty), 0);
    assert.equal(L.units.length, total, name);
  }
});

test('es determinista: misma entrada, misma geometría', () => {
  assert.deepEqual(boothLayout(RIGS.hybrid), boothLayout(RIGS.hybrid));
});

test('el modelo verificado se escribe en la pieza; el "a confirmar" no', () => {
  const L = boothLayout(RIGS.two);
  assert.equal(L.units.find((u) => u.kind === 'deck')!.short, 'CDJ-3000X');
  assert.equal(L.units.find((u) => u.kind === 'monitor')!.short, null);
  assert.equal(L.units.find((u) => u.kind === 'monitor')!.confirm, true);
});

test('cables: audio a la sala desde el mixer y bus de Pro DJ Link solo con 2 o más reproductores', () => {
  assert.deepEqual(boothLayout(RIGS.two).cables.map((c) => c.kind).sort(), ['audio', 'link']);
  assert.deepEqual(boothLayout(RIGS.alone).cables.map((c) => c.kind), ['audio']);
  assert.deepEqual(boothLayout(RIGS.empty).cables, []);
});

test('live: los instrumentos van a los costados del mixer y los accesorios, en la fila de adelante', () => {
  const L = boothLayout(RIGS.live);
  const m = L.units.find((u) => u.kind === 'mixer')!;
  const inst = L.units.filter((u) => u.row === 'A' && u.kind !== 'mixer');
  assert.equal(inst.length, 3);
  assert.ok(inst.some((u) => u.x < m.x) && inst.some((u) => u.x > m.x));
  assert.equal(L.units.filter((u) => u.row === 'B').length, 1);
  assert.equal(L.units.filter((u) => u.kind === 'mic').length, 1);
});
