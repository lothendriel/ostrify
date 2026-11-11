import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Disc3, Mic, Music2, Search, UserRound, X } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { Track } from '@/lib/music';
import { audiobookPath, useAudiobookLibrary, type SavedAudiobook } from '@/hooks/useAudiobookLibrary';
import { usePlayer } from '@/hooks/usePlayer';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SuggestionKind = 'Song' | 'Podcast episode' | 'Audiobook' | 'Artist' | 'User' | 'Publisher';
interface Suggestion {
  id: string;
  title: string;
  subtitle: string;
  kind: SuggestionKind;
  image?: string;
  searchText?: string;
  track?: Track;
  href?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTrack(value: unknown): value is Track {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.title === 'string' &&
    typeof value.url === 'string' && (value.kind === 'music' || value.kind === 'podcast' || value.kind === 'audiobook');
}

function cachedTracks(value: unknown): Track[] {
  if (Array.isArray(value)) return value.flatMap(item => {
    if (isTrack(item)) return [item];
    if (isRecord(item) && isTrack(item.track)) return [item.track];
    return [];
  });
  if (!isRecord(value)) return [];
  if (Array.isArray(value.tracks)) return value.tracks.filter(isTrack);
  if (Array.isArray(value.pages)) return value.pages.flatMap(page => cachedTracks(page));
  return [];
}

function cachedProfileName(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.metadata)) return undefined;
  const metadata = value.metadata;
  return (typeof metadata.display_name === 'string' && metadata.display_name.trim()) ||
    (typeof metadata.name === 'string' && metadata.name.trim()) || undefined;
}

function asNpub(pubkey: string): string | undefined {
  try { return nip19.npubEncode(pubkey); } catch { return undefined; }
}

function trackSuggestion(track: Track): Suggestion {
  return {
    id: `track:${track.id}`,
    title: track.title,
    subtitle: track.artist || track.album || (track.source ? `${track.source} catalog` : 'Recently loaded audio'),
    searchText: `${track.album ?? ''} ${track.topics.join(' ')}`,
    kind: track.kind === 'podcast' ? 'Podcast episode' : track.kind === 'audiobook' ? 'Audiobook' : 'Song',
    image: track.image,
    track,
  };
}

function matches(suggestion: Suggestion, query: string): boolean {
  const text = `${suggestion.title} ${suggestion.subtitle} ${suggestion.kind} ${suggestion.searchText ?? ''}`.toLocaleLowerCase();
  return query.split(/\s+/).every(part => text.includes(part));
}

const ICONS = {
  Song: Music2,
  'Podcast episode': Mic,
  Audiobook: BookOpen,
  Artist: Disc3,
  User: UserRound,
  Publisher: UserRound,
};

export function GlobalSearch() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const player = usePlayer();
  const audiobookLibrary = useAudiobookLibrary();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const suggestions = useMemo(() => {
    const allTracks = client.getQueryCache().getAll().flatMap(entry => {
      const key = entry.queryKey;
      const isAudioQuery = key[0] === 'tracks' || key[0] === 'podcast-episodes' || (key[0] === 'wavlake' && key[1] === 'catalog') ||
        key[0] === 'fountain-rss-episodes' || (key[0] === 'podcast-index' && (key[1] === 'episodes' || key[1] === 'feed')) ||
        key[0] === 'librivox-catalog' || key[0] === 'gutenberg-audiobook-catalog';
      return isAudioQuery ? cachedTracks(entry.state.data) : [];
    });
    const seenTracks = new Set<string>();
    const tracks = allTracks.filter(track => {
      if (seenTracks.has(track.id)) return false;
      seenTracks.add(track.id);
      return true;
    });
    const candidates: Suggestion[] = tracks.map(trackSuggestion);
    for (const entry of client.getQueryCache().getAll()) {
      if (entry.queryKey[0] === 'wavlake' && entry.queryKey[1] === 'search' && Array.isArray(entry.state.data)) {
        for (const item of entry.state.data) {
          if (!isRecord(item) || item.type !== 'artist' || typeof item.id !== 'string' || typeof item.title !== 'string') continue;
          candidates.push({ id: `wavlake-artist:${item.id}`, title: item.title, subtitle: 'Wavlake artist', kind: 'Artist', image: typeof item.image === 'string' ? item.image : undefined, href: `/wavlake/artist/${encodeURIComponent(item.id)}` });
        }
      }
    }
    for (const entry of client.getQueryCache().getAll()) {
      if (entry.queryKey[0] === 'podcast-shows') {
        const shows = cachedShowResults(entry.state.data);
        for (const show of shows) {
          if (typeof show.title !== 'string') continue;
          const npub = typeof show.pubkey === 'string' ? asNpub(show.pubkey) : undefined;
          const feedGuid = typeof show.feedGuid === 'string' ? show.feedGuid : undefined;
          candidates.push({
            id: `podcast-show:${String(show.id ?? show.title)}`, title: show.title,
            subtitle: typeof show.publisher === 'string' ? show.publisher : `${typeof show.source === 'string' ? show.source : 'Nostr'} podcast`,
            kind: 'Publisher', image: typeof show.image === 'string' ? show.image : undefined,
            searchText: typeof show.description === 'string' ? show.description : '',
            href: feedGuid ? `/podcasts/fountain/${encodeURIComponent(feedGuid)}` : npub ? `/artist/${npub}` : '/podcasts',
          });
          if (typeof show.publisher === 'string' && show.publisher.trim()) {
            candidates.push({ id: `podcast-publisher:${show.id}`, title: show.publisher, subtitle: `Publisher of ${show.title}`, kind: 'Publisher', searchText: show.title, href: '/podcasts' });
          }
        }
      }
      if (entry.queryKey[0] === 'podcast-index' && entry.queryKey[1] === 'search' && Array.isArray(entry.state.data)) {
        for (const show of entry.state.data) {
          if (!isRecord(show) || typeof show.title !== 'string' || typeof show.id !== 'string') continue;
          candidates.push({
            id: `podcast-publisher:${show.id}`, title: show.title,
            subtitle: typeof show.publisher === 'string' ? show.publisher : 'Podcast show',
            kind: 'Publisher', image: typeof show.image === 'string' ? show.image : undefined,
            searchText: typeof show.description === 'string' ? show.description : '',
            href: '/podcasts?source=directory',
          });
          if (typeof show.publisher === 'string' && show.publisher.trim()) {
            candidates.push({
              id: `podcast-publisher-name:${show.id}`, title: show.publisher, subtitle: `Publisher of ${show.title}`,
              kind: 'Publisher', image: typeof show.image === 'string' ? show.image : undefined,
              searchText: show.title, href: '/podcasts?source=directory',
            });
          }
        }
      }
    }

    const artists = new Map<string, Suggestion>();
    const publishers = new Map<string, Suggestion>();
    for (const track of tracks) {
      if (track.artist?.trim()) {
        const key = track.artistId ? `wavlake:${track.artistId}` : track.artistPubkey ? `nostr:${track.artistPubkey}` : `name:${track.artist.toLocaleLowerCase()}`;
        const href = track.artistId
          ? `/wavlake/artist/${encodeURIComponent(track.artistId)}`
          : track.artistPubkey
            ? `/artist/${asNpub(track.artistPubkey)}`
            : `/search?q=${encodeURIComponent(track.artist)}`;
        if (!href.includes('/undefined')) artists.set(key, {
          id: `artist:${key}`, title: track.artist, subtitle: track.artistId ? 'Wavlake artist' : 'Artist in loaded audio',
          searchText: `${track.album ?? ''} ${track.topics.join(' ')}`,
          kind: 'Artist', image: track.image, href,
        });
      }
      if (track.pubkey && /^[0-9a-f]{64}$/i.test(track.pubkey)) {
        const key = track.pubkey.toLowerCase();
        const profileEntry = client.getQueryCache().find({ queryKey: ['nostr', 'author', key] });
        const name = cachedProfileName(profileEntry?.state.data) ?? `User ${key.slice(0, 8)}`;
        const npub = asNpub(key);
        publishers.set(key, {
          id: `publisher:${key}`, title: name, subtitle: 'Publisher of loaded audio', kind: 'Publisher',
          searchText: key,
          href: npub ? `/artist/${npub}` : undefined,
        });
        candidates.push({ id: `user:${key}`, title: name, subtitle: 'Known publisher profile', kind: 'User', href: npub ? `/${npub}` : undefined, searchText: key });
      }
    }
    candidates.push(...artists.values(), ...publishers.values());

    const profileCache = client.getQueryCache().getAll().filter(entry => entry.queryKey[0] === 'nostr' && entry.queryKey[1] === 'author');
    for (const entry of profileCache) {
      const pubkey = entry.queryKey[2];
      if (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(pubkey)) continue;
      const name = cachedProfileName(entry.state.data);
      const npub = asNpub(pubkey);
      if (!name || !npub) continue;
      candidates.push({ id: `user:${pubkey}`, title: name, subtitle: 'Known Nostr profile', kind: 'User', href: `/${npub}` });
    }

    const directory = client.getQueryCache().getAll().find(entry => entry.queryKey[0] === 'ostrify-directory');
    if (Array.isArray(directory?.state.data)) {
      for (const person of directory.state.data) {
        if (!isRecord(person) || typeof person.pubkey !== 'string' || typeof person.name !== 'string') continue;
        const npub = asNpub(person.pubkey);
        if (npub) candidates.push({ id: `directory:${person.pubkey}`, title: person.name, subtitle: 'Ostrify directory', kind: 'User', href: `/${npub}`, image: typeof person.picture === 'string' ? person.picture : undefined });
      }
    }

    for (const book of audiobookLibrary.savedBooks) {
      candidates.push({ id: `book:${book.id}`, title: book.title, subtitle: book.author, kind: 'Audiobook', image: book.covers[0], href: audiobookPath(book) });
    }
    const cachedBooksById = new Set<string>();
    for (const book of audiobookLibrary.savedBooks) cachedBooksById.add(book.id);
    for (const entry of client.getQueryCache().getAll()) {
      if (entry.queryKey[0] !== 'librivox-catalog' && entry.queryKey[0] !== 'gutenberg-audiobook-catalog') continue;
      for (const book of cachedBooks(entry.state.data)) {
        if (cachedBooksById.has(book.id)) continue;
        cachedBooksById.add(book.id);
        candidates.push({ id: `book:${book.id}`, title: book.title, subtitle: book.author, kind: 'Audiobook', image: book.covers[0], href: audiobookPath(book) });
      }
    }

    const q = debouncedQuery.toLocaleLowerCase();
    if (q.length < 2) return [];
    const unique = new Map<string, Suggestion>();
    for (const item of candidates) if (matches(item, q) && !unique.has(item.id)) unique.set(item.id, item);
    const order: SuggestionKind[] = ['Song', 'Podcast episode', 'Audiobook', 'Artist', 'User', 'Publisher'];
    const queryStart = q.split(/\s+/)[0];
    const ordered = [...unique.values()].sort((a, b) => {
      const aTitleStarts = a.title.toLocaleLowerCase().startsWith(queryStart) ? 0 : 1;
      const bTitleStarts = b.title.toLocaleLowerCase().startsWith(queryStart) ? 0 : 1;
      return aTitleStarts - bTitleStarts || order.indexOf(a.kind) - order.indexOf(b.kind) || a.title.localeCompare(b.title);
    });
    const selected = new Map<string, Suggestion>();
    for (const item of ordered) {
      if ((item.kind === 'Song' || item.kind === 'Podcast episode' || item.kind === 'Audiobook') && [...selected.values()].filter(value => value.kind === item.kind).length >= 3) continue;
      if (selected.size >= 8) break;
      selected.set(item.id, item);
    }
    return [...selected.values()];
  // cacheVersion intentionally causes a fresh read of already-cached queries when they update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, debouncedQuery, audiobookLibrary.savedBooks]);

  const showDropdown = open && query.trim().length >= 2;
  const activeOptionId = activeIndex < 0 ? undefined : activeIndex < suggestions.length ? `global-search-option-${activeIndex}` : 'global-search-all-results';

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || !showDropdown) return;
    const updatePosition = () => {
      const rect = input.getBoundingClientRect();
      const compact = window.innerWidth < 640;
      const width = compact ? Math.max(rect.width, window.innerWidth - 24) : rect.width;
      const left = compact ? Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) : rect.left;
      setDropdownStyle({ position: 'fixed', top: rect.bottom + 8, left, width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showDropdown]);

  function openSuggestion(suggestion: Suggestion) {
    if (suggestion.track) player.playTrack(suggestion.track);
    else if (suggestion.href) navigate(suggestion.href);
    setOpen(false);
    setQuery('');
  }

  function searchAll() {
    const term = query.trim();
    if (!term) return;
    navigate(`/search?q=${encodeURIComponent(term)}`);
    setOpen(false);
  }

  function activateSelectedSuggestion() {
    const focusedOption = document.activeElement?.closest<HTMLElement>('[role="option"]');
    const optionIndex = focusedOption?.id.startsWith('global-search-option-')
      ? Number(focusedOption.id.slice('global-search-option-'.length))
      : focusedOption?.id === 'global-search-all-results' ? suggestions.length : activeIndex;
    if (optionIndex >= 0 && optionIndex < suggestions.length && suggestions[optionIndex]) openSuggestion(suggestions[optionIndex]);
    else searchAll();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && showDropdown) {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, suggestions.length));
    } else if (event.key === 'ArrowUp' && showDropdown) {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (showDropdown) activateSelectedSuggestion();
      else searchAll();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative min-w-0 w-full max-w-xl" onBlur={event => {
      const next = event.relatedTarget;
      if (next instanceof Node && document.getElementById('global-search-suggestions')?.contains(next)) return;
      if (!event.currentTarget.contains(next)) setOpen(false);
    }}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search songs, podcasts, books, artists, people…"
          aria-label="Search Ostrify"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="global-search-suggestions"
          aria-activedescendant={showDropdown ? activeOptionId : undefined}
          role="combobox"
          maxLength={120}
          className="h-10 rounded-full bg-secondary pl-9 pr-9 text-sm"
          ref={inputRef}
        />
        {query && <button type="button" onClick={() => { setQuery(''); setDebouncedQuery(''); setOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" aria-label="Clear search"><X className="size-4" /></button>}
      </div>
      {showDropdown && createPortal(<div id="global-search-suggestions" role="listbox" aria-label="Quick search suggestions" className="fixed z-[100] max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl" style={dropdownStyle}>
        {suggestions.map((suggestion, index) => {
          const Icon = ICONS[suggestion.kind];
          const groupHeading = index === 0 || suggestion.kind !== suggestions[index - 1]?.kind;
          return <div key={suggestion.id}>
            {groupHeading && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{suggestion.kind}s</p>}
            <button
            id={`global-search-option-${index}`}
            type="button"
            role="option"
            aria-selected={activeIndex === index}
            onMouseDown={event => event.preventDefault()}
            onFocus={() => setActiveIndex(index)}
            onClick={() => openSuggestion(suggestion)}
            className={cn('flex w-full min-w-0 items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary', activeIndex === index && 'bg-accent')}
          >
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary">{suggestion.image ? <img src={suggestion.image} alt="" className="size-full object-cover" /> : <Icon className="size-5 text-muted-foreground" />}</div>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{suggestion.title}</span><span className="block truncate text-xs text-muted-foreground">{suggestion.subtitle}</span></span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{suggestion.kind}</span>
            </button>
          </div>;
        })}
        {suggestions.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">No matches in the data Ostrify has loaded so far.</p>}
        <button id="global-search-all-results" type="button" role="option" aria-selected={activeIndex === suggestions.length} onMouseDown={event => event.preventDefault()} onFocus={() => setActiveIndex(suggestions.length)} onClick={searchAll} className={cn('mt-1 flex w-full items-center gap-3 rounded-lg border-t border-border px-3 py-3 text-left text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary', activeIndex === suggestions.length && 'bg-accent')}>
          <Search className="size-4" /> See all results for “{query.trim()}”
        </button>
      </div>, document.body)}
    </div>
  );
}

function cachedShowResults(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value) || !Array.isArray(value.pages)) return [];
  return value.pages.flatMap(page => isRecord(page) && Array.isArray(page.shows) ? page.shows.filter(isRecord) : []);
}

function cachedBooks(value: unknown): SavedAudiobook[] {
  if (!isRecord(value) || !Array.isArray(value.pages)) return [];
  return value.pages.flatMap(page => {
    if (!isRecord(page) || !Array.isArray(page.books)) return [];
    return page.books.filter((book): book is SavedAudiobook => isRecord(book) && typeof book.id === 'string' && typeof book.title === 'string' && typeof book.author === 'string' && Array.isArray(book.covers));
  });
}
