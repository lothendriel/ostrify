import { useMemo, useState } from "react";
import { useNostr } from "@nostrify/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { ChevronDown, Disc3, Music2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackList } from "@/components/music/TrackList";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useArtistTracks, groupIntoAlbums } from "@/hooks/useArtistTracks";
import { useAppContext } from "@/hooks/useAppContext";
import { usePublishMusicEvent, type MusicVisibility } from "@/hooks/usePublishMusicEvent";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";
import { genUserName, sanitizeUrl } from "@/lib/sanitize";
import { captureDiscoveredAudioEvents } from "@/lib/audioCatalogCapture";
import { getUserDataReadRelays } from "@/lib/appRelays";
import { RESULTS_PER_PAGE } from "@/lib/pagination";

export function MyUploadsManager() {
  const { user, metadata } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const publish = usePublishMusicEvent();
  const [message, setMessage] = useState<string>();
  const authorTracks = useArtistTracks(user?.pubkey);
  const ownReadRelays = getUserDataReadRelays(config.appRelayMetadata, config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', config.excludedUserRelayUrls, config.excludedUserRelayPubkey);
  const identifiedTracks = useQuery({
    queryKey: ["my-upload-identified-tracks", user?.pubkey ?? "", ownReadRelays.join("|")],
    enabled: !!user,
    queryFn: async ({ signal }): Promise<Track[]> => {
      if (!user) return [];
      const filters = [
        { kinds: [...MUSIC_TRACK_KINDS], "#p": [user.pubkey], limit: 500 },
        { kinds: [...MUSIC_TRACK_KINDS], "#artist_pubkey": [user.pubkey], limit: 500 },
        { kinds: [...MUSIC_TRACK_KINDS], "#artist_npub": [user.pubkey], limit: 500 },
      ];
      const events = await nostr.query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), relays: ownReadRelays });
      captureDiscoveredAudioEvents(nostr, events, user.pubkey);
      return [...new Map(events.map(eventToTrack).filter((track): track is Track => !!track && track.kind === "music" && isTrackVisibleInOstrify(track, user.pubkey, user.pubkey)).map(track => [track.id, track])).values()];
    },
  });

  const allOwnedTracks = useMemo(() => {
    const merged = new Map<string, Track>();
    for (const track of [...(authorTracks.data ?? []), ...(identifiedTracks.data ?? [])]) {
      if (track.kind !== "music" || track.event?.kind !== 36787 || track.pubkey !== user?.pubkey || !isTrackVisibleInOstrify(track, user?.pubkey, user?.pubkey)) continue;
      const identity = track.event?.kind === 36787 && track.addressableId ? `${track.event.kind}:${track.pubkey}:${track.addressableId}` : track.id;
      const current = merged.get(identity);
      if (!current || track.createdAt > current.createdAt) merged.set(identity, track);
    }
    return [...merged.values()].sort((left, right) => right.createdAt - left.createdAt);
  }, [authorTracks.data, identifiedTracks.data, user?.pubkey]);

  const albums = useMemo(() => groupIntoAlbums(allOwnedTracks).albums
    .map(album => ({ ...album, tracks: album.tracks.filter(track => track.event?.kind === 36787 && track.pubkey === user?.pubkey) }))
    .filter(album => album.tracks.length > 0), [allOwnedTracks, user?.pubkey]);
  const ownerName = metadata?.display_name || metadata?.name || (user ? genUserName(user.pubkey) : "your profile");
  const isLoading = !!user && (authorTracks.isLoading || identifiedTracks.isLoading);
  const hasError = authorTracks.isError && identifiedTracks.isError && allOwnedTracks.length === 0;
  const visibleAlbumCount = albums.filter(album => album.tracks.some(track => track.visibility !== "hidden")).length;
  const [expandedAlbumId, setExpandedAlbumId] = useState<string>();
  useSeoMeta({ title: `My uploads — ${ownerName} — Ostrify` });

  const invalidateTrackQueries = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["artist-tracks"] }),
    queryClient.invalidateQueries({ queryKey: ["my-upload-identified-tracks"] }),
    queryClient.invalidateQueries({ queryKey: ["tracks"] }),
    queryClient.invalidateQueries({ queryKey: ["home-tracks"] }),
    queryClient.invalidateQueries({ queryKey: ["fresh-nostr-tracks"] }),
    queryClient.invalidateQueries({ queryKey: ["category-tracks"] }),
  ]);

  const updateVisibility = async (track: Track, visibility: MusicVisibility) => {
    if (!track.event) throw new Error("The signed track event is unavailable. Reload uploads and try again.");
    const result = await publish.mutateAsync({
      kind: track.event.kind,
      content: track.event.content,
      tags: track.event.tags,
      visibility,
      removeFromDrops: visibility === "hidden" && track.visibility !== "hidden",
    });
    await invalidateTrackQueries();
    if (result.dropsError) {
      setMessage(`“${track.title}” was updated in your relays, but DROPS may still retain the prior public copy: ${result.dropsError}`);
    } else {
      setMessage(visibility === "hidden" ? `“${track.title}” is hidden in Ostrify. It remains public on your configured relays.` : `“${track.title}” is visible in Ostrify and shared to DROPS.`);
    }
  };

  const saveAlbumVisibility = async (albumTracks: Track[], visibility: MusicVisibility) => {
    const results = await Promise.allSettled(albumTracks.map(track => updateVisibility(track, visibility)));
    const succeeded = results.filter(result => result.status === "fulfilled").length;
    setMessage(succeeded === albumTracks.length ? `Updated visibility for all ${succeeded} album tracks.` : `Updated ${succeeded} of ${albumTracks.length} album tracks. Failed updates can be retried individually in the track list.`);
  };

  if (!user) return <div className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-3xl font-bold">My uploads</h1><div className="rounded-xl border border-dashed p-8 text-center"><p className="text-muted-foreground">Log in to manage tracks and albums you have published.</p></div></div>;

  return <div className="space-y-8 p-4 sm:p-6">
    <header className="rounded-xl bg-gradient-to-br from-emerald-950 via-teal-950 to-card p-6 sm:p-8"><p className="text-sm font-semibold uppercase tracking-wider text-emerald-200">Your music</p><h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">My uploads</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Manage how your published tracks and album releases appear in Ostrify. Hidden means hidden in Ostrify only—not private on Nostr.</p><p className="mt-2 text-sm text-muted-foreground">{allOwnedTracks.length} tracks · {visibleAlbumCount} visible albums</p><Link to="/my-profile" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">Back to your profile</Link></header>

    <section aria-labelledby="uploaded-albums-heading" className="space-y-4">
      <div><h2 id="uploaded-albums-heading" className="text-2xl font-bold">Albums</h2><p className="text-sm text-muted-foreground">Album visibility controls apply only to tracks you published. Mixed-visibility albums are marked visible if at least one of your tracks is visible.</p></div>
      {isLoading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-3 rounded-lg p-3"><Skeleton className="aspect-square rounded-md" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-8 w-full" /></div>)}</div> : albums.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{albums.map(album => {
        const publicCount = album.tracks.filter(track => track.visibility !== "hidden").length;
        const visibility: MusicVisibility = publicCount === 0 ? "hidden" : "public";
        const cover = sanitizeUrl(album.image);
        const albumTitle = album.title ?? "Untitled album";
        const expanded = expandedAlbumId === album.id;
        return <article key={album.id} className="min-w-0 rounded-lg bg-white/[0.04] p-3"><button type="button" aria-expanded={expanded} onClick={() => setExpandedAlbumId(current => current === album.id ? undefined : album.id)} className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-primary"><div className="aspect-square overflow-hidden rounded-md bg-secondary">{cover ? <img src={cover} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Disc3 className="size-10 text-white/60" /></div>}</div><h3 className="mt-3 truncate text-sm font-semibold">{albumTitle}</h3><p className="mt-1 text-xs text-muted-foreground">{album.tracks.length} uploaded tracks · {visibility === "hidden" ? "Hidden in Ostrify" : "Visible on Ostrify"}</p></button><div className="mt-3 flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={publish.isPending || !album.tracks.every(track => track.event?.kind === 36787)} className="min-w-0 flex-1" onClick={() => { void saveAlbumVisibility(album.tracks, visibility === "hidden" ? "public" : "hidden"); }}>{visibility === "hidden" ? "Show album" : "Hide album"}</Button><Button type="button" size="icon" variant="ghost" aria-label={expanded ? `Collapse ${albumTitle}` : `Show tracks in ${albumTitle}`} onClick={() => setExpandedAlbumId(current => current === album.id ? undefined : album.id)}><ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} /></Button></div>{expanded && <ul className="mt-3 space-y-2 border-t border-white/10 pt-3">{album.tracks.map(track => <li key={track.id} className="flex min-w-0 items-center gap-2 text-xs"><Music2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{track.trackNumber ? `${track.trackNumber}. ` : ""}{track.title}</span><span className="shrink-0 text-muted-foreground">{track.visibility === "hidden" ? "Hidden" : "Visible"}</span></li>)}</ul>}</article>;
      })}</div> : !isLoading && !hasError ? <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No uploaded album groups found. Albums are grouped from Ostrify’s album tags; standalone uploads appear in Tracks below.</div> : null}
    </section>

    <section aria-labelledby="uploaded-tracks-heading" className="space-y-4">
      <div><h2 id="uploaded-tracks-heading" className="text-2xl font-bold">Tracks</h2><p className="text-sm text-muted-foreground">Your uploaded tracks, 20 per page. Use the visibility button on a track to update it.</p></div>
      {hasError && <p role="alert" className="text-sm text-destructive">Couldn’t load your uploads from your read relays or DROPS. <button type="button" className="underline" onClick={() => { void authorTracks.refetch(); void identifiedTracks.refetch(); }}>Try again</button></p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <TrackList tracks={allOwnedTracks} isLoading={isLoading} bulkSelect={false} pageSize={RESULTS_PER_PAGE} emptyMessage="No uploaded tracks were found on your read relays or DROPS." renderTrailingAction={track => <div className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:inline">{track.visibility === "hidden" ? "Hidden in Ostrify" : "Visible on Ostrify"}</span><Button type="button" size="sm" variant="outline" disabled={publish.isPending || track.event?.kind !== 36787} onClick={() => { void updateVisibility(track, track.visibility === "hidden" ? "public" : "hidden").catch(error => setMessage(error instanceof Error ? error.message : "Could not update track visibility.")); }}>{track.visibility === "hidden" ? "Show" : "Hide"}</Button></div>} />
    </section>
  </div>;
}
