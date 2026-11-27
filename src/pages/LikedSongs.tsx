import { useMemo, useState } from "react";
import { useSeoMeta } from "@unhead/react";
import { ArrowDownAZ, Disc3, Heart, Search, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import SavedAlbumsPage from "./SavedAlbumsPage";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { LIKED_SONGS_ID, usePlaylist, usePlaylistActions } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { useToast } from "@/hooks/useToast";
import { CollectionHeader, LibrarySyncStatus } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { LoginArea } from "@/components/auth/LoginArea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PlaylistSort = "original" | "title" | "artist";

const LikedSongs = () => {
  const { user } = useCurrentUser();
  const { data: playlist, isPartial, isFetching: isFetchingLibrary, isError: isLibraryError, hasReadRelays, refetch: refetchLibrary } = usePlaylist(LIKED_SONGS_ID);
  const { data, isLoading, isFetching, refetch } = useTracksByIds(playlist?.trackIds);
  const tracks = data?.tracks ?? [];
  const { reorderPlaylist } = usePlaylistActions();
  const { toast } = useToast();
  const [sort, setSort] = useState<PlaylistSort>("original");
  const [filter, setFilter] = useState("");
  const sortedTracks = useMemo(() => {
    if (sort === "original") return tracks;
    return [...tracks].sort((left, right) => {
      const primary = sort === "title"
        ? left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true })
        : (left.artist ?? "").localeCompare(right.artist ?? "", undefined, { sensitivity: "base", numeric: true });
      return primary || left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true });
    });
  }, [sort, tracks]);
  const visibleTracks = useMemo(() => {
    const normalizedFilter = filter.trim().toLocaleLowerCase();
    if (!normalizedFilter) return sortedTracks;
    return sortedTracks.filter(track => `${track.title} ${track.artist ?? ""}`.toLocaleLowerCase().includes(normalizedFilter));
  }, [filter, sortedTracks]);

  const handleReorder = (orderedTracks: typeof tracks) => {
    if (!playlist || reorderPlaylist.isPending) return;
    const resolvedIds = new Set(tracks.map(track => track.id));
    const orderedResolvedIds = orderedTracks.map(track => track.id);
    const nextTrackIds: string[] = [];
    let resolvedIndex = 0;
    for (const id of playlist.trackIds) {
      if (resolvedIds.has(id)) {
        const nextId = orderedResolvedIds[resolvedIndex];
        if (nextId) nextTrackIds.push(nextId);
        resolvedIndex += 1;
      } else {
        nextTrackIds.push(id);
      }
    }
    if (nextTrackIds.length !== playlist.trackIds.length || nextTrackIds.every((id, index) => id === playlist.trackIds[index])) return;
    reorderPlaylist.mutate({ playlistId: playlist.id, trackIds: nextTrackIds, expectedEventId: playlist.event.id }, {
      onSuccess: () => toast({ title: "Liked Songs order saved" }),
      onError: error => toast({ title: "Could not reorder Liked Songs", description: error.message, variant: "destructive" }),
    });
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 py-24 px-6">
        <Heart className="size-12 text-primary" />
        <h2 className="text-2xl font-bold">Your Liked Songs live here</h2>
        <p className="text-muted-foreground max-w-sm">
          Log in with Nostr to save tracks to your public library across devices.
        </p>
        <LoginArea className="max-w-60" />
      </div>
    );
  }

  return (
    <div>
        <CollectionHeader
          headingLevel={2}
          subtitle="Playlist"
        title="Liked Songs"
        description="Your favorite tracks on Nostr"
        gradient="linear-gradient(to bottom, hsl(262 60% 35%), transparent)"
        icon={<Heart className="size-16 text-white fill-white" />}
        tracks={sortedTracks}
      />
      <div className="px-3 sm:px-6">
        <div className="mb-4"><LibrarySyncStatus name="Liked Songs" hasReadRelays={hasReadRelays} isFetching={isFetchingLibrary} isError={isLibraryError} isPartial={isPartial} onRetry={() => void refetchLibrary()} /></div>
        {tracks.length > 1 && <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={filter} onChange={event => setFilter(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setFilter(""); }} placeholder="Filter by title or artist" aria-label="Filter liked songs by title or artist" maxLength={120} className="h-9 pl-9 pr-9" />
              {filter && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-7 -translate-y-1/2" onClick={() => setFilter("")} aria-label="Clear liked songs filter"><X className="size-4" /></Button>}
            </div>
            <ArrowDownAZ className="size-4 text-muted-foreground" aria-hidden="true" />
            <Label htmlFor="liked-songs-sort" className="text-xs text-muted-foreground">Sort by</Label>
            <Select value={sort} onValueChange={value => setSort(value as PlaylistSort)}>
              <SelectTrigger id="liked-songs-sort" className="h-8 w-40" aria-label="Sort liked songs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original order</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="artist">Artist</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(filter.trim() || sort !== "original")
            ? <p className="text-xs text-muted-foreground">View only · saved Liked Songs order is unchanged.</p>
            : <p className="text-xs text-muted-foreground">Drag rows or use the up/down controls to save a new order.</p>}
        </div>}
        {!!data?.unavailable && <p role="status" className="mb-4 text-sm text-muted-foreground">{data.unavailable} saved track(s) could not be loaded right now. They remain in your library. <button type="button" className="text-primary underline disabled:opacity-50" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Retrying…' : 'Try again'}</button></p>}
        {filter.trim() && visibleTracks.length === 0 && !isLoading
          ? <div className="rounded-lg border border-dashed px-6 py-10 text-center">
              <p className="text-muted-foreground">No tracks match “{filter.trim()}”.</p>
              <Button type="button" variant="link" onClick={() => setFilter("")}>Clear filter</Button>
            </div>
          : <TrackList
              tracks={visibleTracks}
              isLoading={isLoading}
              onReorder={sort === "original" && !filter.trim() ? handleReorder : undefined}
              emptyMessage={isPartial ? "Your Liked Songs may not be fully loaded from your relays yet." : data?.unavailable ? "Your saved songs couldn't be loaded. Try again in a moment." : "Songs you like will show up here. Tap the heart on any track."}
            />}
      </div>
    </div>
  );
};

export default function SavedMusicPage({ section = 'songs' }: { section?: 'songs' | 'albums' }) {
  useSeoMeta({ title: `${section === 'songs' ? 'Liked Songs' : 'Saved Albums'} · Saved Music — Ostrify` });
  return <div>
    <div className="px-4 pt-6 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your library</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Saved Music</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your liked songs and saved albums, together in one place.</p>
      <nav aria-label="Saved music sections" className="mt-5 flex gap-2 border-b border-border pb-3">
        <NavLink to="/liked" end style={({ isActive }) => isActive ? { backgroundColor: '#5b21b6', color: '#ffffff' } : undefined} className={({ isActive }) => cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !isActive && 'bg-secondary text-muted-foreground hover:text-foreground')}><Heart className="size-4" /> Liked Songs</NavLink>
        <NavLink to="/saved-albums" end style={({ isActive }) => isActive ? { backgroundColor: '#5b21b6', color: '#ffffff' } : undefined} className={({ isActive }) => cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !isActive && 'bg-secondary text-muted-foreground hover:text-foreground')}><Disc3 className="size-4" /> Saved Albums</NavLink>
      </nav>
    </div>
    {section === 'songs' ? <LikedSongs /> : <SavedAlbumsPage />}
  </div>;
}
