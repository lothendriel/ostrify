import { useSyncExternalStore } from 'react';
import { sanitizeUrl } from '@/lib/sanitize';

const STORAGE_KEY = 'ostrify-audiobook-library-v1';

export type AudiobookSource = 'librivox' | 'gutenberg';

export interface SavedAudiobook {
  /** Source-qualified key, e.g. `librivox:123` or `gutenberg:archive-id`. */
  id: string;
  source?: AudiobookSource;
  catalogId?: string;
  title: string;
  author: string;
  covers: string[];
  language?: string;
  duration?: number;
  sectionCount: number;
}

export interface AudiobookCollection {
  id: string;
  title: string;
  audiobookIds: string[];
}

interface AudiobookLibraryState {
  books: Record<string, SavedAudiobook>;
  favoriteIds: string[];
  collections: AudiobookCollection[];
}

const EMPTY_LIBRARY: AudiobookLibraryState = { books: {}, favoriteIds: [], collections: [] };
const EMPTY_SAVED_BOOKS: SavedAudiobook[] = [];
const listeners = new Set<() => void>();

function parseLibrary(value: string | null): AudiobookLibraryState {
  if (!value) return EMPTY_LIBRARY;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return EMPTY_LIBRARY;
    const source = parsed as Partial<AudiobookLibraryState>;
    const books: Record<string, SavedAudiobook> = {};
    const legacyBookKeys = new Map<string, string>();
    if (source.books && typeof source.books === 'object') {
      for (const [id, value] of Object.entries(source.books)) {
        if (!value || typeof value !== 'object') continue;
        const book = value as SavedAudiobook;
        const bookSource: AudiobookSource = book.source === 'gutenberg' || id.startsWith('gutenberg:') ? 'gutenberg' : 'librivox';
        const catalogId = typeof book.catalogId === 'string' ? book.catalogId : bookSource === 'librivox' ? id.replace(/^librivox:/, '') : id.replace(/^gutenberg:/, '');
        if (bookSource === 'librivox' ? !/^\d{1,12}$/.test(catalogId) : !/^[a-z0-9_-]{1,160}$/i.test(catalogId)) continue;
        if (typeof book.title !== 'string' || typeof book.author !== 'string') continue;
        const key = `${bookSource}:${catalogId}`;
        legacyBookKeys.set(id, key);
        books[key] = {
          id: key,
          source: bookSource,
          catalogId,
          title: book.title,
          author: book.author,
          covers: Array.isArray(book.covers) ? book.covers.map(url => sanitizeUrl(url)).filter((url): url is string => !!url) : [],
          language: typeof book.language === 'string' ? book.language : undefined,
          duration: typeof book.duration === 'number' && Number.isFinite(book.duration) ? book.duration : undefined,
          sectionCount: typeof book.sectionCount === 'number' && Number.isFinite(book.sectionCount) ? book.sectionCount : 0,
        };
      }
    }
    const favoriteIds = Array.isArray(source.favoriteIds) ? source.favoriteIds.flatMap(id => {
      if (typeof id !== 'string') return [];
      const key = legacyBookKeys.get(id) ?? (books[id] ? id : undefined);
      return key ? [key] : [];
    }) : [];
    const collections = Array.isArray(source.collections) ? source.collections.flatMap(collection => {
      if (!collection || typeof collection.id !== 'string' || typeof collection.title !== 'string' || !Array.isArray(collection.audiobookIds)) return [];
      return [{
        id: collection.id,
        title: collection.title,
        audiobookIds: collection.audiobookIds.flatMap(id => {
          if (typeof id !== 'string') return [];
          const key = legacyBookKeys.get(id) ?? (books[id] ? id : undefined);
          return key ? [key] : [];
        }),
      }];
    }) : [];
    return { books, favoriteIds, collections };
  } catch {
    return EMPTY_LIBRARY;
  }
}

function readStoredLibrary(): AudiobookLibraryState {
  try {
    return typeof localStorage === 'undefined' ? EMPTY_LIBRARY : parseLibrary(localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_LIBRARY;
  }
}

let snapshot = readStoredLibrary();

function getSnapshot(): AudiobookLibraryState {
  return snapshot;
}

function getServerSnapshot(): AudiobookLibraryState {
  return EMPTY_LIBRARY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      snapshot = event.key === null ? EMPTY_LIBRARY : parseLibrary(event.newValue);
      listeners.forEach(notify => notify());
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function audiobookPath(book: Pick<SavedAudiobook, 'id' | 'source' | 'catalogId'>): string {
  const source = book.source ?? 'librivox';
  const id = book.catalogId ?? book.id.replace(/^(librivox|gutenberg):/, '');
  return source === 'gutenberg' ? `/audiobooks/gutenberg/${encodeURIComponent(id)}` : `/audiobooks/${encodeURIComponent(id)}`;
}

function libraryKey(book: SavedAudiobook): string {
  const source = book.source ?? 'librivox';
  const catalogId = book.catalogId ?? book.id.replace(/^(librivox|gutenberg):/, '');
  return `${source}:${catalogId}`;
}

function updateLibrary(updater: (current: AudiobookLibraryState) => AudiobookLibraryState): void {
  snapshot = updater(snapshot);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Keep the current session state usable if browser storage is unavailable.
  }
  listeners.forEach(listener => listener());
}

export function useAudiobookLibrary() {
  const library = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleFavorite(book: SavedAudiobook): void {
    const key = libraryKey(book);
    updateLibrary(current => {
      const favoriteIds = current.favoriteIds.includes(key)
        ? current.favoriteIds.filter(id => id !== key)
        : [...current.favoriteIds, key];
      return { ...current, books: { ...current.books, [key]: { ...book, id: key, source: book.source ?? 'librivox', catalogId: book.catalogId ?? book.id } }, favoriteIds };
    });
  }

  function createCollection(title: string): string {
    const id = `audiobook-collection-${crypto.randomUUID()}`;
    updateLibrary(current => ({ ...current, collections: [...current.collections, { id, title: title.trim(), audiobookIds: [] }] }));
    return id;
  }

  function toggleInCollection(collectionId: string, book: SavedAudiobook): void {
    const key = libraryKey(book);
    updateLibrary(current => ({
      ...current,
      books: { ...current.books, [key]: { ...book, id: key, source: book.source ?? 'librivox', catalogId: book.catalogId ?? book.id } },
      collections: current.collections.map(collection => collection.id !== collectionId ? collection : {
        ...collection,
        audiobookIds: collection.audiobookIds.includes(key)
          ? collection.audiobookIds.filter(id => id !== key)
          : [...collection.audiobookIds, key],
      }),
    }));
  }

  function removeFromCollection(collectionId: string, bookId: string): void {
    updateLibrary(current => ({
      ...current,
      collections: current.collections.map(collection => collection.id === collectionId
        ? { ...collection, audiobookIds: collection.audiobookIds.filter(id => id !== bookId) }
        : collection),
    }));
  }

  function deleteCollection(collectionId: string): void {
    updateLibrary(current => ({ ...current, collections: current.collections.filter(collection => collection.id !== collectionId) }));
  }

  const favoriteBooks = library.favoriteIds.map(id => library.books[id]).filter((book): book is SavedAudiobook => !!book);

  return {
    favoriteBooks,
    savedBooks: Object.values(library.books).length ? Object.values(library.books) : EMPTY_SAVED_BOOKS,
    collections: library.collections,
    getBook: (id: string) => library.books[id.includes(':') ? id : `librivox:${id}`],
    isFavorite: (id: string) => library.favoriteIds.includes(id.includes(':') ? id : `librivox:${id}`),
    isInCollection: (collectionId: string, bookId: string) => !!library.collections.find(collection => collection.id === collectionId)?.audiobookIds.includes(bookId.includes(':') ? bookId : `librivox:${bookId}`),
    booksInCollection: (collectionId: string) => {
      const collection = library.collections.find(item => item.id === collectionId);
      return (collection?.audiobookIds ?? []).map(id => library.books[id]).filter((book): book is SavedAudiobook => !!book);
    },
    toggleFavorite,
    createCollection,
    toggleInCollection,
    removeFromCollection,
    deleteCollection,
  };
}
