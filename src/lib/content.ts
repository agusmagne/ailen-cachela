import { parse } from 'yaml';
import { z } from 'astro/zod';
import raw from '../content/site.yaml?raw';
import { siteSchema, type SiteContent, type Localized } from './schema';

export type Lang = 'es' | 'en';
export const LANGS: Lang[] = ['es', 'en'];

function load(): SiteContent {
  const result = siteSchema.safeParse(parse(raw));
  if (!result.success) {
    throw new Error(`site.yaml inválido:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const site = load();

export const pick = (value: Localized, lang: Lang): string => value[lang];

/** Texto de interfaz; falla en build si falta la clave. */
export function t(key: string, lang: Lang, vars: Record<string, string | number> = {}): string {
  const entry = site.ui[key];
  if (!entry) throw new Error(`Falta la clave de interfaz "${key}" en site.yaml (ui)`);
  return entry[lang].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Prefijo de publicación sin barra final ('' en la raíz del dominio). */
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');
/** Antepone el prefijo de publicación a una ruta interna que empieza con '/'. */
export const withBase = (path: string) => `${BASE}${path}`;

export const homePath = (lang: Lang) => withBase(lang === 'es' ? '/' : '/en/');

export function absolute(path: string, origin: URL | string): string {
  return new URL(path, origin).toString();
}

export function formatDate(iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-GB', { timeZone: 'UTC', ...opts }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

export const link = (id: string) => site.links.find((l) => l.id === id);
