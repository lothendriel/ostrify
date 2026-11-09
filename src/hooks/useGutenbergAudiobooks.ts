import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Track } from '@/lib/music';
import type { SavedAudiobook } from '@/hooks/useAudiobookLibrary';
import { sanitizeUrl } from '@/lib/sanitize';

const ARCHIVE_SEARCH = 'https://archive.org/advancedsearch.php';
const ARCHIVE_ITEM = 'https://archive.org/metadata';
const COLLECTION_QUERY = 'collection:gutenberg-audiobooks AND format:MP3';
const PAGE_SIZE = 24;

export interface GutenbergAudiobook extends SavedAudiobook {
  source: 'gutenberg';
  catalogId: string;
}

export interface GutenbergAudiobookDetails extends GutenbergAudiobook {
  chapters: Track[];
  rights?: string;
  sourceUrl?: string;
}

type JsonRecord = Record<string, unknown>;
interface SearchPage {
  books: GutenbergAudiobook[];
  total: number;
  fetchedCount: number;
}

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const values = value.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim());
    if (values.length) return values.join(', ');
  }
  return undefined;
}

function parseLength(value: unknown): number | undefined {
  const seconds = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function validIdentifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,159}$/i.test(value);
}

async function fetchJson(url: URL, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    response = await fetch(`https://proxy.shakespeare.diy/?url=${encodeURIComponent(url.href)}`, { signal });
  }
  if (!response.ok) throw new Error(`Internet Archive returned ${response.status}.`);
  return response.json();
}

function makeAudiobook(identifier: string, title: string, creator: string, language?: string): GutenbergAudiobook {
  const cover = sanitizeUrl(`https://archive.org/services/img/${encodeURIComponent(identifier)}`);
  return {
    id: `gutenberg:${identifier}`,
    source: 'gutenberg',
    catalogId: identifier,
    title,
    author: creator,
    covers: cover ? [cover] : [],
    language,
    sectionCount: 1,
  };
}

export function useGutenbergAudiobookCatalog(query: string, searchBy: 'title' | 'author') {
  const normalizedQuery = query.trim();
  return useInfiniteQuery({
    queryKey: ['gutenberg-audiobook-catalog', normalizedQuery, searchBy],
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async ({ pageParam, signal }): Promise<SearchPage> => {
      const url = new URL(ARCHIVE_SEARCH);
      const field = searchBy === 'title' ? 'title' : 'creator';
      const searchTerms = normalizedQuery.split(/\s+/).filter(Boolean).map(term => `${field}:${JSON.stringify(`*${term.replace(/[\\"\\\\]/g, '\\\\$&')}*`)}`);
      const searchClause = searchTerms.join(' AND ');
      url.searchParams.set('q', `${COLLECTION_QUERY}${normalizedQuery ? ` AND ${searchClause}` : ''}`);
      url.searchParams.set('fl[]', 'identifier,title,creator,language');
      url.searchParams.set('rows', String(PAGE_SIZE));
      url.searchParams.set('start', String(pageParam));
      url.searchParams.set('output', 'json');
      url.searchParams.set('sort[]', 'publicdate desc');
      const result = record(await fetchJson(url, AbortSignal.any([signal, AbortSignal.timeout(15000)])));
      const response = record(result?.response);
      if (!Array.isArray(response?.docs)) throw new Error('Unexpected search response from Internet Archive.');
      const books = response.docs.flatMap((value): GutenbergAudiobook[] => {
        const item = record(value);
        const id = cleanText(item?.identifier);
        const title = cleanText(item?.title);
        const creator = cleanText(item?.creator) ?? 'Unknown author';
        if (!id || !validIdentifier(id) || !title || title === '[]' || /^Nc[a-f0-9]{10,}$/i.test(creator)) return [];
        return [makeAudiobook(id, title, creator, cleanText(item?.language))];
      });
      const total = typeof response.numFound === 'number' && Number.isFinite(response.numFound) ? response.numFound : pageParam + books.length;
      const fetchedCount = response.docs.length;
      return { books, total, fetchedCount };
    },
    getNextPageParam: (lastPage, pages) => {
      const scanned = pages.reduce((count, page) => count + page.fetchedCount, 0);
      return scanned < lastPage.total && lastPage.fetchedCount > 0 ? scanned : undefined;
    },
  });
}

export function useGutenbergAudiobook(identifier: string | undefined) {
  return useQuery({
    queryKey: ['gutenberg-audiobook', identifier],
    enabled: !!identifier && validIdentifier(identifier),
    staleTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }): Promise<GutenbergAudiobookDetails | null> => {
      if (!identifier || !validIdentifier(identifier)) throw new Error('Invalid Internet Archive item ID.');
      const url = new URL(`${ARCHIVE_ITEM}/${encodeURIComponent(identifier)}`);
      const result = record(await fetchJson(url, AbortSignal.any([signal, AbortSignal.timeout(20000)])));
      const metadata = record(result?.metadata);
      if (!metadata) return null;
      const title = cleanText(metadata.title);
      if (!title) return null;
      const author = cleanText(metadata.creator) ?? 'Unknown author';
      const base = makeAudiobook(identifier, title, author, cleanText(metadata.language));
      const files = Array.isArray(result?.files) ? result.files : [];
      const audioFiles = files.flatMap((value): { name: string; duration?: number }[] => {
        const file = record(value);
        const name = cleanText(file?.name);
        if (!name || !/\.mp3$/i.test(name) || file?.source === 'derivative') return [];
        return [{ name, duration: parseLength(file?.length) }];
      }).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
      const chapters: Track[] = audioFiles.map((file, index) => ({
        id: `gutenberg:${identifier}:${file.name}`,
        source: 'gutenberg',
        kind: 'audiobook',
        title: audioFiles.length === 1 ? 'Full audiobook' : file.name.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' '),
        artist: author,
        album: title,
        image: base.covers[0],
        url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`,
        mimeType: 'audio/mpeg',
        pubkey: '',
        duration: file.duration,
        topics: [],
        createdAt: index,
      }));
      if (!chapters.length) throw new Error('No MP3 audio files were found for this item.');
      const duration = chapters.reduce((total, chapter) => total + (chapter.duration ?? 0), 0) || undefined;
      return {
        ...base,
        duration,
        sectionCount: chapters.length,
        chapters,
        rights: cleanText(metadata.rights),
        sourceUrl: sanitizeUrl(cleanText(metadata.source)),
      };
    },
  });
}
