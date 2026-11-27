import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useMatch } from "react-router-dom";
import { Home, Search, Library, Plus, Heart, Music, Mic, Users, BookOpen, BarChart3, Play, Pause, LoaderCircle, ChevronDown, Video, Radio } from "lucide-react";
import { useAudiobookLibrary, type SavedAudiobook } from "@/hooks/useAudiobookLibrary";
import { useLibriVoxBook } from "@/hooks/useLibriVox";
import { useGutenbergAudiobook } from "@/hooks/useGutenbergAudiobooks";
import { useFountainRssEpisodes, useFountainShow, useNostrPodcastEpisodesForShow, usePodcastFavorites, usePodcastIndexEpisodes, usePodcastIndexFeed, type PodcastFavorite } from "@/hooks/usePodcasts";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { usePlayer } from "@/hooks/usePlayer";
import { useDecember } from "@/hooks/useDecember";
import { useRadioFavorites } from '@/hooks/useRadioFavorites';
import { useToast } from "@/hooks/useToast";
import type { Track } from "@/lib/music";
import { cn } from "@/lib/utils";
import { sanitizeUrl } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LIKED_SONGS_ID, usePlaylists, type Playlist } from "@/hooks/usePlaylists";
import { TUNESTR_FAVORITES_IDENTIFIER } from '@/lib/musicPlaylists';
import { useTunestrPlayer } from '@/components/music/TunestrPlayer';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { parseN94Stream, parseTunestrStreamEvent } from '@/hooks/useTunestrStreams';
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";
import { useSavedAlbums } from '@/hooks/useSavedAlbums';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/music", label: "Music", icon: Music },
  { to: "/radio", label: "Radio", icon: Radio },
  { to: "/podcasts", label: "Podcasts", icon: Mic },
  { to: "/audiobooks", label: "Audiobooks", icon: BookOpen },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const libraryRowClass = (active: boolean) => cn(
  "flex items-center gap-3 rounded-xl p-2 transition-colors",
  active ? "bg-brand-surface text-foreground shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-brand-surface",
);

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useCurrentUser();
  const isDecember = useDecember();
  const { data: playlists, isLoading } = usePlaylists();
  const audiobookLibrary = useAudiobookLibrary();
  const podcastFavorites = usePodcastFavorites();
  const savedAlbums = useSavedAlbums();
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const savedBookIds = new Set([
    ...audiobookLibrary.favoriteBooks.map(book => book.id),
    ...audiobookLibrary.collections.flatMap(collection => collection.audiobookIds),
  ]);
  const savedAudiobooks = audiobookLibrary.savedBooks.filter(book => savedBookIds.has(book.id));
  const liked = playlists?.find((p) => p.isLiked);
  const likedPlaylist = liked ?? { id: LIKED_SONGS_ID, title: "Liked Songs", trackIds: [] };
  const tunestrFavorites = playlists?.find(playlist => playlist.isTunestrFavorites) ?? { id: TUNESTR_FAVORITES_IDENTIFIER, title: 'TuneStr Recordings', trackIds: [] };
  const regular = (playlists ?? []).filter((p) => !p.isLiked && !p.isTunestrFavorites);

  return (
    <nav className="flex h-full min-h-0 w-64 flex-col gap-2 overflow-hidden" aria-label="Primary">
      <NavLink
        to="/"
        end
        onClick={onNavigate}
        aria-label="Ostrify home"
        className="ostrify-logo-link relative mx-2 flex items-center gap-3 rounded-xl px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative size-11 shrink-0">
          <img src="/ostrify-logo-512.webp?v=opt-1" alt="" className="size-full rounded-full object-contain" />
          {isDecember && <img src="/images/december-hat.webp" alt="" aria-hidden="true" className="pointer-events-none absolute -top-3 left-1/2 z-10 size-6 -translate-x-1/2 object-contain" />}
        </span>
        <span className="min-w-0"><span className="block text-xl font-black tracking-tight">Ostrify<span aria-hidden="true" className="text-brand-violet">.</span></span><span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Open protocol audio</span></span>
      </NavLink>

      <Collapsible open={menuOpen} onOpenChange={setMenuOpen} className="ostrify-sidebar-panel mx-2 shrink-0 overflow-hidden rounded-2xl">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="group flex h-11 w-full justify-between px-4 text-sm font-semibold text-foreground hover:bg-accent/50" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}>
            <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-primary" /> Menu</span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", menuOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="space-y-0.5 px-2 pb-2">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate?.();
                }}
                className={({ isActive }) => cn(
                  "flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-brand-surface text-foreground shadow-[inset_3px_0_0_var(--primary)]" : "text-muted-foreground hover:bg-brand-surface hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                {label}
              </NavLink>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="ostrify-sidebar-panel mx-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-muted-foreground font-semibold text-sm">
            <Library className="size-5 text-brand-violet" />
            Your Library
          </div>
          {user && <Button variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setCreateOpen(true)} aria-label="Create playlist"><Plus className="size-5" /></Button>}
        </div>

        <ScrollArea type="always" className="flex-1 min-h-0 px-2 pb-2">
          <div className="space-y-1">
            <RadioFavoritesLibraryItem onNavigate={onNavigate} />
            {!user ? <p className="px-3 py-4 text-sm text-muted-foreground">Log in to create playlists and like songs.</p> : <>
              <NavLink to="/artists" onClick={onNavigate} className={({ isActive }) => cn(libraryRowClass(isActive), "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
                <div className="size-11 rounded-md bg-gradient-to-br from-sky-500 to-primary flex items-center justify-center shrink-0"><Users className="size-5 text-white" /></div>
                <div className="min-w-0"><div className="font-medium text-sm truncate">Followed Artists</div><div className="text-xs text-muted-foreground">Artists</div></div>
              </NavLink>
              <PlaylistLibraryItem playlist={likedPlaylist} liked albumCount={savedAlbums.albums.length} onNavigate={onNavigate} />
              <TunestrLibraryItem playlist={tunestrFavorites} onNavigate={onNavigate} />
              <AudiobookLibraryItem books={savedAudiobooks} favoriteCount={audiobookLibrary.favoriteBooks.length} collectionCount={audiobookLibrary.collections.length} onNavigate={onNavigate} />
              <PodcastLibraryItem favorites={podcastFavorites.data} onNavigate={onNavigate} />
              {isLoading && <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>}
              {regular.map(playlist => <PlaylistLibraryItem key={playlist.id} playlist={playlist} onNavigate={onNavigate} />)}
            </>}
          </div>
        </ScrollArea>
      </div>

      <a href="https://shakespeare.diy" target="_blank" rel="noreferrer" className="px-5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">Vibed with Shakespeare</a>
      <CreatePlaylistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </nav>
  );
}

function RadioFavoritesLibraryItem({ onNavigate }: { onNavigate?: () => void }) {
  const { favorites } = useRadioFavorites();
  return <NavLink to="/radio-favorites" onClick={onNavigate} className={({ isActive }) => cn(libraryRowClass(isActive), 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
    <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-800 text-white"><Radio className="size-5" /></div>
    <div className="min-w-0"><div className="truncate text-sm font-medium">Favorite Radio</div><div className="text-xs text-muted-foreground">{favorites.length} {favorites.length === 1 ? 'station' : 'stations'}</div></div>
  </NavLink>;
}

function PlaylistLibraryItem({ playlist, liked = false, albumCount = 0, onNavigate }: { playlist: Pick<Playlist, "id" | "title" | "trackIds" | "image">; liked?: boolean; albumCount?: number; onNavigate?: () => void }) {
  const location = useLocation();
  const isActive = liked ? location.pathname === '/liked' || location.pathname === '/saved-albums' : location.pathname === `/playlist/${playlist.id}`;
  const player = usePlayer();
  const { toast } = useToast();
  const [shouldLoad, setShouldLoad] = useState(false);
  const callbacks = useRef({ onNavigate, toast, player, title: playlist.title });
  callbacks.current = { onNavigate, toast, player, title: playlist.title };
  const tracksQuery = useTracksByIds(playlist.trackIds, liked || location.pathname === `/playlist/${playlist.id}` || shouldLoad);
  const tracks = tracksQuery.data?.tracks ?? [];
  const isQueue = tracks.length > 0 && player.queue.length === tracks.length && player.queue.every((track, index) => track.id === tracks[index]?.id);
  const isPlayingHere = isQueue && player.isPlaying;
  useEffect(() => {
    if (!shouldLoad || tracksQuery.isLoading) return;
    setShouldLoad(false);
    if (tracks.length) {
      callbacks.current.player.playQueue(tracks);
      callbacks.current.onNavigate?.();
    } else {
      callbacks.current.toast({ title: `No playable tracks in ${callbacks.current.title}`, description: "Check your relay connections or try again later." });
    }
  }, [shouldLoad, tracks, tracksQuery.isLoading]);
  const handlePlay = () => {
    if (isQueue) {
      player.togglePlay();
      onNavigate?.();
    } else if (tracks.length) {
      player.playQueue(tracks);
      onNavigate?.();
    } else if (playlist.trackIds.length) {
      setShouldLoad(true);
    } else {
      toast({ title: `No playable tracks in ${playlist.title}`, description: "Add songs to this playlist first." });
    }
  };
  const image = sanitizeUrl(playlist.image);
  const Icon = liked ? Heart : image ? undefined : Music;
  return <div className={libraryRowClass(isActive)}>
    <Button type="button" variant="ghost" size="icon" className={cn("group relative size-11 shrink-0 rounded-md text-white hover:brightness-110 hover:text-white focus-visible:ring-2 focus-visible:ring-ring", liked ? "bg-gradient-to-br from-violet-500 to-primary" : "overflow-hidden bg-secondary")} onClick={handlePlay} disabled={shouldLoad && tracksQuery.isLoading} aria-label={isPlayingHere ? `Pause ${playlist.title}` : `Play ${playlist.title}`} title={isPlayingHere ? `Pause ${playlist.title}` : `Play ${playlist.title}`}>
      {image && !liked ? <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover opacity-70 group-hover:opacity-30" /> : !isPlayingHere && Icon && <Icon className={cn("size-5 group-hover:hidden", liked && "fill-white")} />}
      {isPlayingHere ? <Pause className="relative z-10 size-5 fill-current" /> : <Play className="absolute z-10 hidden size-5 fill-current group-hover:block" />}
    </Button>
    <NavLink to={liked ? "/liked" : `/playlist/${playlist.id}`} onClick={onNavigate} className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="truncate text-sm font-medium">{liked ? 'Saved Music' : playlist.title}</div>
      <div className="text-xs text-muted-foreground">{playlist.trackIds.length} songs{liked && ` · ${albumCount} ${albumCount === 1 ? 'album' : 'albums'}`}</div>
    </NavLink>
  </div>;
}

function TunestrLibraryItem({ playlist, onNavigate }: { playlist: Pick<Playlist, 'trackIds'>; onNavigate?: () => void }) {
  const location = useLocation();
  const isActive = !!useMatch('/tunestr-library');
  const player = usePlayer();
  const { toast } = useToast();
  const { openStream } = useTunestrPlayer();
  const [shouldLoad, setShouldLoad] = useState(false);
  const tracksQuery = useTracksByIds(playlist.trackIds, location.pathname === '/tunestr-library' || shouldLoad);
  const tracks = tracksQuery.data?.tracks ?? [];
  const streams = tracks.flatMap(track => {
    if (!track.event) return [];
    const stream = track.event.kind === 1053 ? parseN94Stream(track.event) : parseTunestrStreamEvent(track.event);
    return stream ? [stream] : [];
  });
  const isPlayingHere = !!streams.length && player.current?.id === streams[0]?.track.id && player.isPlaying;

  useEffect(() => {
    if (!shouldLoad || tracksQuery.isLoading) return;
    setShouldLoad(false);
    const stream = streams[0];
    if (stream) openStream(stream);
    else toast({ title: 'No saved TuneStr recordings', description: 'The recordings may be unavailable from your current relays.' });
  }, [openStream, shouldLoad, streams, toast, tracksQuery.isLoading]);

  const handlePlay = () => {
    if (streams.length) openStream(streams[0]!);
    else if (playlist.trackIds.length) setShouldLoad(true);
    else toast({ title: 'No saved TuneStr recordings', description: 'Save a TuneStr recording first.' });
  };

  return <div className={libraryRowClass(isActive)}>
    <Button type="button" variant="ghost" size="icon" className="group relative size-11 shrink-0 rounded-md bg-gradient-to-br from-rose-500 to-violet-700 text-white hover:text-white" onClick={handlePlay} disabled={shouldLoad && tracksQuery.isLoading} aria-label={isPlayingHere ? 'Pause TuneStr Recordings' : 'Play TuneStr Recordings'} title="Play TuneStr Recordings">
      {isPlayingHere ? <Pause className="size-5 fill-current" /> : <><Video className="size-5 group-hover:hidden" /><Play className="absolute hidden size-5 fill-current group-hover:block" /></>}
    </Button>
    <NavLink to="/tunestr-library" onClick={onNavigate} className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="truncate text-sm font-medium">TuneStr Recordings</div>
      <div className="text-xs text-muted-foreground">{playlist.trackIds.length} saved</div>
    </NavLink>
  </div>;
}

function AudiobookLibraryItem({ books, favoriteCount, collectionCount, onNavigate }: { books: SavedAudiobook[]; favoriteCount: number; collectionCount: number; onNavigate?: () => void }) {
  const isActive = !!useMatch({ path: '/audiobook-library', end: false });
  const player = usePlayer();
  const { toast } = useToast();
  const [selectedBook, setSelectedBook] = useState<SavedAudiobook>();
  const [loading, setLoading] = useState(false);
  const callbacks = useRef({ onNavigate, toast, player });
  callbacks.current = { onNavigate, toast, player };
  const isAudiobookQueue = !!player.current && player.current.kind === "audiobook" && books.some(book => {
    const source = book.source ?? "librivox";
    const catalogId = book.catalogId ?? book.id.replace(/^(librivox|gutenberg):/, "");
    return player.current?.id.startsWith(`${source}:${catalogId}:`);
  });
  const isAudiobookPlaying = isAudiobookQueue && player.isPlaying;
  const handlePlay = () => {
    if (isAudiobookQueue) {
      player.togglePlay();
      return;
    }
    if (!books.length) {
      toast({ title: "No saved audiobooks", description: "Favorite an audiobook to add it to your library." });
      return;
    }
    const book = books[Math.floor(Math.random() * books.length)];
    if (book) {
      setLoading(true);
      setSelectedBook(book);
    }
  };
  return <>
    <div className={libraryRowClass(isActive)}>
      <Button type="button" variant="ghost" size="icon" className="group size-11 shrink-0 rounded-md bg-gradient-to-br from-rose-500 to-violet-700 text-white hover:brightness-110 hover:text-white focus-visible:ring-2 focus-visible:ring-ring" onClick={handlePlay} disabled={loading} aria-label={isAudiobookPlaying ? "Pause Saved Audiobooks" : "Play Saved Audiobooks"} title="Play a random saved audiobook">
        {loading ? <LoaderCircle className="size-5 animate-spin" /> : isAudiobookPlaying ? <Pause className="size-5 fill-current" /> : <><BookOpen className="size-5 group-hover:hidden" /><Play className="hidden size-5 fill-current group-hover:block" /></>}
      </Button>
      <NavLink to="/audiobook-library" onClick={onNavigate} className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="truncate text-sm font-medium">Saved Audiobooks</div>
        <div className="text-xs text-muted-foreground">{favoriteCount} favorites · {collectionCount} collections</div>
      </NavLink>
    </div>
    {selectedBook && <AudiobookQueueLoader book={selectedBook} onLoaded={tracks => { callbacks.current.player.playQueue(tracks); setLoading(false); setSelectedBook(undefined); callbacks.current.onNavigate?.(); }} onError={message => { setLoading(false); setSelectedBook(undefined); callbacks.current.toast({ title: "Could not load audiobook", description: message }); }} />}
  </>;
}

function AudiobookQueueLoader({ book, onLoaded, onError }: { book: SavedAudiobook; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  const source = book.source ?? "librivox";
  const identifier = book.catalogId ?? book.id.replace(/^(librivox|gutenberg):/, "");
  const librivox = useLibriVoxBook(source === "librivox" ? identifier : undefined);
  const gutenberg = useGutenbergAudiobook(source === "gutenberg" ? identifier : undefined);
  const data = source === "gutenberg" ? gutenberg.data : librivox.data;
  const error = source === "gutenberg" ? gutenberg.error : librivox.error;
  const isError = source === "gutenberg" ? gutenberg.isError : librivox.isError;
  const callbacks = useRef({ onLoaded, onError });
  callbacks.current = { onLoaded, onError };
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    if (data?.chapters.length) {
      handled.current = true;
      callbacks.current.onLoaded(data.chapters);
    } else if (isError) {
      handled.current = true;
      callbacks.current.onError(error instanceof Error ? error.message : "Chapter recordings could not be loaded.");
    }
  }, [data, error, isError]);
  return null;
}

function PodcastLibraryItem({ favorites, onNavigate }: { favorites: PodcastFavorite[]; onNavigate?: () => void }) {
  const isActive = !!useMatch('/podcast-library');
  const player = usePlayer();
  const { toast } = useToast();
  const [selectedShow, setSelectedShow] = useState<PodcastFavorite>();
  const [loading, setLoading] = useState(false);
  const callbacks = useRef({ onNavigate, toast, player });
  callbacks.current = { onNavigate, toast, player };
  const location = useLocation();
  const shows = favorites.filter(favorite => !favorite.episode);
  const currentShow = player.current?.showId;
  const isSavedShowQueue = !!currentShow && !!player.current && shows.some(show => show.identity === currentShow || show.id === currentShow || (show.source === "nostr" && `nostr:${show.pubkey}` === currentShow) || (show.source === "fountain" && `fountain:show:id:${show.feedGuid}` === currentShow) || (show.source === "podcast-index" && `podcast-index:${show.feedId}` === currentShow)) && player.queue.every(track => track.showId === currentShow);
  const isSavedShowPlaying = isSavedShowQueue && player.isPlaying;
  const isPlayingHere = location.pathname === "/podcast-library" && isSavedShowPlaying;
  const handlePlay = () => {
    if (isSavedShowQueue) {
      player.togglePlay();
      return;
    }
    if (!shows.length) {
      toast({ title: "No saved podcast shows", description: "Save a podcast show to your library to play its latest episode." });
      return;
    }
    const show = shows[Math.floor(Math.random() * shows.length)];
    if (show) {
      setLoading(true);
      setSelectedShow(show);
    }
  };
  return <>
    <div className={libraryRowClass(isActive)}>
      <Button type="button" variant="ghost" size="icon" className="group size-11 shrink-0 rounded-md bg-gradient-to-br from-fuchsia-600 to-purple-700 text-white hover:brightness-110 hover:text-white focus-visible:ring-2 focus-visible:ring-ring" onClick={handlePlay} disabled={loading} aria-label={isSavedShowPlaying ? "Pause Saved Podcasts" : "Play Saved Podcasts"} title="Play a random saved podcast show">
        {loading ? <LoaderCircle className="size-5 animate-spin" /> : isSavedShowPlaying ? <Pause className="size-5 fill-current" /> : <><Mic className="size-5 group-hover:hidden" /><Play className="hidden size-5 fill-current group-hover:block" /></>}
      </Button>
      <NavLink to="/podcast-library" onClick={onNavigate} className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="truncate text-sm font-medium">Saved Podcasts</div>
        <div className="text-xs text-muted-foreground">{shows.length} shows · {favorites.filter(item => item.episode).length} episodes</div>
      </NavLink>
    </div>
    {selectedShow && <PodcastQueueLoader show={selectedShow} onLoaded={tracks => { callbacks.current.player.playQueue(tracks); setLoading(false); setSelectedShow(undefined); callbacks.current.onNavigate?.(); }} onError={message => { setLoading(false); setSelectedShow(undefined); callbacks.current.toast({ title: "Could not load podcast episodes", description: message }); }} />}
  </>;
}

function PodcastQueueLoader({ show, onLoaded, onError }: { show: PodcastFavorite; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  if (show.source === "nostr" && show.pubkey) return <NostrShowQueueLoader show={show} onLoaded={onLoaded} onError={onError} />;
  if (show.source === "fountain") return <FountainShowQueueLoader show={show} onLoaded={onLoaded} onError={onError} />;
  return <PodcastIndexShowQueueLoader show={show} onLoaded={onLoaded} onError={onError} />;
}

function NostrShowQueueLoader({ show, onLoaded, onError }: { show: PodcastFavorite; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  const query = useNostrPodcastEpisodesForShow(show.pubkey);
  const tracks = (query.data ?? []).map(track => ({ ...track, showId: `nostr:${show.pubkey}` }));
  return <PodcastTracksLoader tracks={tracks} loading={query.isLoading} error={query.isError ? "Saved show episodes could not be loaded from your relays." : undefined} onLoaded={onLoaded} onError={onError} />;
}

function FountainShowQueueLoader({ show, onLoaded, onError }: { show: PodcastFavorite; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  const details = useFountainShow(show.feedGuid);
  const episodes = useFountainRssEpisodes(details.data);
  return <PodcastTracksLoader tracks={episodes.data ?? []} loading={details.isLoading || episodes.isLoading} error={details.isError || episodes.isError ? "Saved Fountain show episodes could not be loaded." : undefined} onLoaded={onLoaded} onError={onError} />;
}

function PodcastIndexShowQueueLoader({ show, onLoaded, onError }: { show: PodcastFavorite; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  const feed = usePodcastIndexFeed(show.feedUrl && !show.feedId ? show.feedUrl : undefined);
  const feedId = show.feedId ?? feed.data?.feedId;
  const feedUrl = show.feedUrl ?? feed.data?.feedUrl;
  const episodes = usePodcastIndexEpisodes(feedId, feedUrl, show.title);
  const tracks = (episodes.data ?? []).map(track => ({ ...track, showId: track.showId ?? (feedId ? `podcast-index:${feedId}` : show.identity ?? show.id) }));
  return <PodcastTracksLoader tracks={tracks} loading={(!show.feedId && !!show.feedUrl && feed.isLoading) || episodes.isLoading} error={feed.isError || episodes.isError ? "Saved podcast episodes could not be loaded." : undefined} onLoaded={onLoaded} onError={onError} />;
}

function PodcastTracksLoader({ tracks, loading, error, onLoaded, onError }: { tracks: Track[]; loading: boolean; error?: string; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  const callbacks = useRef({ onLoaded, onError });
  callbacks.current = { onLoaded, onError };
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || loading) return;
    handled.current = true;
    if (tracks.length) callbacks.current.onLoaded(tracks);
    else callbacks.current.onError(error ?? "No playable episodes were found for this saved show.");
  }, [error, loading, tracks]);
  return null;
}
