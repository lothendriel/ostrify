import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Track } from '@/lib/music';
import type { SavedAudiobook } from '@/hooks/useAudiobookLibrary';
import { sanitizeUrl } from '@/lib/sanitize';

const ARCHIVE_SEARCH = 'https://archive.org/advancedsearch.php';
const ARCHIVE_ITEM = 'https://archive.org/metadata';
const PAGE_SIZE = 24;

export interface LibriVoxBook extends SavedAudiobook {
  source: 'librivox';
  catalogId: string;
  chapters: Track[];
  unavailableChapterTitles: string[];
}

interface SearchPage {
  books: LibriVoxBook[];
  total: number;
  fetchedCount: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === 'string' && !!item.trim());
    if (values.length) return values.join(', ');
  }
  return undefined;
}

function numeric(value: unknown): number | undefined {
  const result = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(result) && result > 0 ? result : undefined;
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

function makeBook(identifier: string, title: string, author: string, language?: string): LibriVoxBook {
  const cover = sanitizeUrl(`https://archive.org/services/img/${encodeURIComponent(identifier)}`);
  return {
    id: `librivox:${identifier}`,
    source: 'librivox',
    catalogId: identifier,
    title,
    author,
    covers: cover ? [cover] : [],
    language,
    sectionCount: 0,
    chapters: [],
    unavailableChapterTitles: [],
  };
}

export function useLibriVoxCatalog(query: string, searchBy: 'title' | 'author') {
  const normalizedQuery = query.trim();
  return useInfiniteQuery({
    queryKey: ['librivox-catalog', normalizedQuery, searchBy],
    initialPageParam: 0,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam, signal }): Promise<SearchPage> => {
      const url = new URL(ARCHIVE_SEARCH);
      const field = searchBy === 'title' ? 'title' : 'creator';
      const terms = normalizedQuery.split(/\s+/).filter(Boolean).map(term => `${field}:${JSON.stringify(`*${term.replace(/[\\"\\\\]/g, '\\\\$&')}*`)}`);
      url.searchParams.set('q', `collection:librivoxaudio${terms.length ? ` AND ${terms.join(' AND ')}` : ''}`);
      url.searchParams.set('fl[]', 'identifier,title,creator,language');
      url.searchParams.set('rows', String(PAGE_SIZE));
      url.searchParams.set('start', String(pageParam));
      url.searchParams.set('output', 'json');
      url.searchParams.set('sort[]', 'publicdate desc');
      const result = record(await fetchJson(url, AbortSignal.any([signal, AbortSignal.timeout(15000)])));
      const response = record(result?.response);
      if (!Array.isArray(response?.docs)) throw new Error('Unexpected search response from Internet Archive.');
      const books = response.docs.flatMap((value): LibriVoxBook[] => {
        const item = record(value);
        const identifier = text(item?.identifier);
        const title = text(item?.title);
        const author = text(item?.creator) ?? 'Unknown author';
        if (!identifier || !validIdentifier(identifier) || !title || title === '[]' || /^Nc[a-f0-9]{10,}$/i.test(author)) return [];
        return [makeBook(identifier, title, author, text(item?.language))];
      });
      const total = typeof response.numFound === 'number' && Number.isFinite(response.numFound) ? response.numFound : pageParam + response.docs.length;
      return { books, total, fetchedCount: response.docs.length };
    },
    getNextPageParam: (lastPage, pages) => {
      const scanned = pages.reduce((count, page) => count + page.fetchedCount, 0);
      return scanned < lastPage.total && lastPage.fetchedCount > 0 ? scanned : undefined;
    },
  });
}

export function useLibriVoxBook(identifier: string | undefined) {
  return useQuery({
    queryKey: ['librivox-book', identifier],
    enabled: !!identifier && validIdentifier(identifier),
    retry: 1,
    staleTime: 30 * 60 * 1000,
    queryFn: async ({ signal }): Promise<LibriVoxBook | null> => {
      if (!identifier || !validIdentifier(identifier)) throw new Error('Invalid Internet Archive item ID.');
      const url = new URL(`${ARCHIVE_ITEM}/${encodeURIComponent(identifier)}`);
      const result = record(await fetchJson(url, AbortSignal.any([signal, AbortSignal.timeout(20000)])));
      const metadata = record(result?.metadata);
      const title = text(metadata?.title);
      if (!metadata || !title) return null;
      const author = text(metadata.creator) ?? 'Unknown author';
      const book = makeBook(identifier, title, author, text(metadata.language));
      const files = Array.isArray(result?.files) ? result.files : [];
      const chapters: Track[] = files.flatMap((value): { track: Track; filename: string }[] => {
        const file = record(value);
        const filename = text(file?.name);
        if (!filename || !/\.mp3$/i.test(filename) || file?.source === 'derivative' || !file?.length) return [];
        const duration = numeric(file.length);
        const filenameTitle = filename.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').trim();
        const chapterTitle = text(file.title) ?? filenameTitle;
        return [{ filename, track: {
          id: `librivox:${identifier}:${filename}`,
          source: 'librivox',
          kind: 'audiobook',
          title: chapterTitle,
          artist: author,
          album: title,
          image: book.covers[0],
          url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`,
          mimeType: 'audio/mpeg',
          pubkey: '',
          duration,
          topics: [],
          createdAt: 0,
        } }];
      }).sort((left, right) => left.filename.localeCompare(right.filename, undefined, { numeric: true })).map(item => item.track);
      if (!chapters.length) throw new Error('No MP3 chapter files were found for this audiobook.');
      return {
        ...book,
        chapters,
        sectionCount: chapters.length,
        duration: chapters.reduce((total, chapter) => total + (chapter.duration ?? 0), 0) || undefined,
      };
    },
  });
}
