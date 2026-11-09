import { useEffect, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { useSeoMeta } from "@unhead/react";
import { Play, Pause, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthor } from "@/hooks/useAuthor";
import { usePlayer } from "@/hooks/usePlayer";
import { useArtistTracks, groupIntoAlbums } from "@/hooks/useArtistTracks";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, type Track } from "@/lib/music";
import { genUserName, sanitizeUrl } from "@/lib/sanitize";
import { TrackCard } from "@/components/music/TrackCard";
import { TrackList } from "@/components/music/TrackList";
import { FollowButton } from "@/components/music/FollowButton";

function TrackSections({ tracks, heading }: { tracks: Track[]; heading: string }) {
  const { albums, singles } = useMemo(() => groupIntoAlbums(tracks), [tracks]);
  if (!tracks.length) return null;
  return <section className="space-y-5">
    {heading && <h2 className="text-2xl font-bold tracking-tight">{heading}</h2>}
    {albums.map((album) => <section key={album.title} id={`album-${album.title ?? ''}`} className="space-y-3 scroll-mt-4">
      <h3 className="text-xl font-semibold tracking-tight">{album.title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">{album.tracks.map((track) => <TrackCard key={track.id} track={track} queue={album.tracks} />)}</div>
    </section>)}
    {singles.length > 0 && <section className="space-y-3"><h3 className="text-xl font-semibold">{albums.length > 0 ? "Singles" : "Tracks"}</h3><TrackList tracks={singles} /></section>}
  </section>;
}

export function ArtistPage({ pubkey: propPubkey }: { pubkey?: string } = {}) {
  const { nip19: identifier } = useParams<{ nip19: string }>();
  let routePubkey: string | undefined;
  if (identifier) {
    try {
      const decoded = nip19.decode(identifier);
      if (decoded.type === "npub") routePubkey = decoded.data;
      else if (decoded.type === "nprofile") routePubkey = decoded.data.pubkey;
    } catch {
      // Invalid profile identifiers leave this route without a pubkey.
    }
  }
  const pubkey = propPubkey ?? routePubkey;
  if (!pubkey) return <p className="p-6 text-muted-foreground">Artist profile not found.</p>;
  return <ArtistProfile pubkey={pubkey} />;
}

function ArtistProfile({ pubkey }: { pubkey: string }) {
  const { nostr } = useNostr();
  const author = useAuthor(pubkey);
  const publisherTrackQuery = useArtistTracks(pubkey);
  const artistTracks = useQuery({
    queryKey: ["artist-identified-tracks", pubkey],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([
        { kinds: [31337, 36787, 32123, 30440, 1063, 1], "#p": [pubkey], limit: 200 },
        { kinds: [31337, 36787, 32123, 30440, 1063, 1], "#artist": [nip19.npubEncode(pubkey)], limit: 200 },
        { kinds: [31337, 36787, 32123, 30440, 1063, 1], "#artist_pubkey": [pubkey], limit: 200 },
        { kinds: [31337, 36787, 32123, 30440, 1063, 1], "#artist_npub": [nip19.npubEncode(pubkey)], limit: 200 },
      ], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
      const tracks = events.map(eventToTrack).filter((track): track is Track => !!track && track.artistPubkey === pubkey);
      return [...new Map(tracks.map((track) => [track.id, track])).values()].sort((a, b) => b.createdAt - a.createdAt);
    },
  });
  const publisherTracks = publisherTrackQuery.data ?? [];
  const metadata = author.data?.metadata;
  const name = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const artistNames = [metadata?.name, metadata?.display_name].filter((value): value is string => !!value).map(value => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
  const isThisArtist = (track: Track) => {
    if (track.artistPubkey) return track.artistPubkey === pubkey;
    const trackArtist = track.artist?.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (trackArtist) return artistNames.includes(trackArtist);
    return track.kind === 'music';
  };
  const artistPublisherTracks = publisherTracks.filter(isThisArtist);
  const otherPublisherTracks = publisherTracks.filter((track) => !isThisArtist(track));
  const artistPublishedTracks = (artistTracks.data ?? []).filter((track) => track.pubkey !== pubkey);
  const tracks = [...new Map([...artistPublisherTracks, ...artistPublishedTracks].map((track) => [track.id, track])).values()].sort((a, b) => b.createdAt - a.createdAt);
  const isLoading = publisherTrackQuery.isLoading || artistTracks.isLoading;
  const player = usePlayer();

  const banner = sanitizeUrl(metadata?.banner);
  const picture = sanitizeUrl(metadata?.picture);
  const verified = !!metadata?.nip05;

  useSeoMeta({ title: `${name} — Ostrify` });

  const { hash } = useLocation();
  useEffect(() => {
    if (!hash || isLoading) return;
    try {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      target?.scrollIntoView({ block: 'start' });
    } catch {
      // Ignore malformed fragments.
    }
  }, [hash, isLoading, tracks]);

  const { albums, singles } = useMemo(() => groupIntoAlbums(tracks), [tracks]);
  const isThisPlaying =
    player.isPlaying && tracks.some((t) => t.id === player.current?.id);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    if (tracks.some((t) => t.id === player.current?.id)) {
      player.togglePlay();
    } else {
      player.playQueue(tracks, 0);
    }
  };

  return (
    <div>
      {/* Hero header */}
      <div className="relative isolate">
        {banner && (
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <img src={banner} alt="" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-transparent" />
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 p-6 pt-12 sm:pt-20">
          <Avatar className="size-32 sm:size-40 shadow-2xl ring-4 ring-background/20">
            <AvatarImage src={picture} alt={name} className="object-cover" />
            <AvatarFallback className="text-4xl">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="text-center sm:text-left min-w-0">
            <div className="flex items-center gap-1.5 justify-center sm:justify-start text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {verified && <BadgeCheck className="size-4 text-primary" />}
              Nostr artist & publisher
            </div>
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight break-words my-2">
              {name}
            </h1>
            {metadata?.about && (
              <p className="text-muted-foreground line-clamp-2 max-w-xl">{metadata.about}</p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              {isLoading ? "Loading…" : `${tracks.length + otherPublisherTracks.length} track${tracks.length + otherPublisherTracks.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </div>

      {/* Play all */}
      <div className="flex items-center gap-4 px-6 py-4">
        <Button
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
          size="icon"
          className={cn(
            "size-14 rounded-full bg-primary text-primary-foreground shadow-xl",
            "hover:scale-105 transition-transform disabled:opacity-40",
          )}
          aria-label={isThisPlaying ? "Pause" : "Play all"}
        >
          {isThisPlaying ? (
            <Pause className="size-7 fill-current" />
          ) : (
            <Play className="size-7 fill-current ml-0.5" />
          )}
        </Button>
        <FollowButton pubkey={pubkey} />
      </div>

      <div className="px-3 sm:px-6 space-y-8 pb-4">
        {artistPublisherTracks.length > 0 && <TrackSections tracks={artistPublisherTracks} heading="" />}
        {otherPublisherTracks.length > 0 && <section className="space-y-3"><div><h2 className="text-2xl font-bold tracking-tight">Other music published by this account</h2><p className="text-sm text-muted-foreground mt-1">These tracks are published by this account but credit a different artist.</p></div><TrackSections tracks={otherPublisherTracks} heading="" /></section>}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 space-y-3">
                <Skeleton className="w-full aspect-square rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-16 px-8 text-center">
            <p className="text-muted-foreground max-w-sm mx-auto">
              No music found for this artist yet. They may publish from relays Ostrify isn't
              reading from — try adding more relays in Settings.
            </p>
          </div>
        ) : (
          <TrackSections tracks={artistPublishedTracks} heading="Tracks identifying this artist" />
        )}
      </div>
    </div>
  );
}
