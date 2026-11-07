import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Track } from '@/lib/music';
import { sanitizeUrl } from '@/lib/sanitize';

const API = 'https://librivox.org/api/feed/audiobooks/';
const PAGE_SIZE = 20;
interface LibriVoxBook {
  id: string;
  title: string;
  author: string;
  language?: string;
  cover?: string;
  duration?: number;
  chapters: Track[];
  sectionCount: number;
}

type Data = Record<string, unknown>;
function record(value: unknown): Data | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : undefined; }
function text(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function numericId(value: unknown): string | undefined { const str = typeof value === 'number' ? String(value) : text(value); return str && /^\d{1,12}$/.test(str) ? str : undefined; }
function seconds(value: unknown): number | undefined { const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN; return Number.isFinite(n) && n > 0 ? n : undefined; }

function parseBook(value: unknown): LibriVoxBook | null {
  const book = record(value);
  const bookId = numericId(book?.id);
  const title = text(book?.title);
  if (!book || !bookId || !title) return null;
  const author = Array.isArray(book.authors) ? book.authors.map(author => {
    const a = record(author);
    return [text(a?.first_name), text(a?.last_name)].filter(Boolean).join(' ');
  }).filter(Boolean).join(', ') || 'Unknown author' : 'Unknown author';
  const cover = sanitizeUrl(text(book.coverart_thumbnail)) || sanitizeUrl(text(book.coverart_jpg));
  const chapters: Track[] = [];
  if (Array.isArray(book.sections)) {
    for (const value of book.sections) {
      const section = record(value);
      const sectionId = numericId(section?.id);
      const url = sanitizeUrl(text(section?.listen_url));
      if (!sectionId || !url) continue;
      const chapterTitle = text(section?.title) || `Chapter ${text(section?.section_number) || chapters.length + 1}`;
      chapters.push({ id: `librivox:${bookId}:${sectionId}`, source: 'librivox', kind: 'audiobook', title: chapterTitle, artist: author, album: title, image: cover, url, pubkey: '', duration: seconds(section?.playtime), topics: [], createdAt: 0 });
    }
  }
  return { id: bookId, title, author, cover, language: text(book.language), duration: seconds(book.totaltimesecs), sectionCount: Number(book.num_sections) || chapters.length, chapters };
}

async function fetchBooks(params: Record<string, string>, signal: AbortSignal): Promise<LibriVoxBook[]> {
  const url = new URL(API);
  url.searchParams.set('format', 'json');
  url.searchParams.set('coverart', '1');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    response = await fetch(`https://proxy.shakespeare.diy/?url=${encodeURIComponent(url.href)}`, { signal });
  }
  // LibriVox responds with HTTP 404 when a catalog search has no matches.
  if (response.status === 404 && (params.title || params.author)) return [];
  if (!response.ok) throw new Error(`LibriVox returned ${response.status}.`);
  const data: unknown = await response.json();
  const result = record(data);
  // LibriVox returns {"error":"not found"} for searches with no matches.
  if (result && result.error === 'not found') return [];
  if (!result || !Array.isArray(result.books)) throw new Error('Unexpected response from LibriVox.');
  return result.books.map(parseBook).filter((book): book is LibriVoxBook => !!book);
}

export function useLibriVoxCatalog(query: string, searchBy: 'title' | 'author') {
  return useInfiniteQuery({
    queryKey: ['librivox-catalog', query, searchBy], initialPageParam: 0, retry: 1, staleTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam, signal }) => {
      const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(pageParam), sort_order: 'desc' };
      if (query) params[searchBy] = `^${query.replace(/^\^/, '')}`;
      return fetchBooks(params, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
    },
    getNextPageParam: (page, pages) => page.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
  });
}

export function useLibriVoxBook(id: string | undefined) {
  return useQuery({
    queryKey: ['librivox-book', id], enabled: !!id && /^\d{1,12}$/.test(id), retry: 1, staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      if (!id || !/^\d{1,12}$/.test(id)) throw new Error('Invalid audiobook ID.');
      const books = await fetchBooks({ id, extended: '1' }, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
      return books.find(book => book.id === id) ?? null;
    },
  });
}

export type { LibriVoxBook };
