import type { APIRoute } from 'astro';
import { mixesFeed } from '../../../lib/disco/feed-build';

export const GET: APIRoute = ({ site }) =>
  new Response(mixesFeed('en', site ?? 'https://ailencachela.com'), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
