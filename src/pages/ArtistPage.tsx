import { useEffect, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { useSeoMeta } from "@unhead/react";
import { Play, Pause, BadgeCheck, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthor } from "@/hooks/useAuthor";
import { usePlayer } from "@/hooks/usePlayer";
import { useRadio } from "@/hooks/useRadio";
import { useArtistTracks, groupIntoAlbums } from "@/hooks/useArtistTracks";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, type Track } from "@/lib/music";
import { genUserName, sanitizeUrl } from "@/lib/sanitize";
import { TrackList } from "@/components/music/TrackList";
import { FollowButton } from "@/components/music/FollowButton";

function TrackSections({ tracks, heading }: { tracks: Track[]; heading: string }) {
  const { albums, singles } = useMemo(() => groupIntoAlbums(tracks), [tracks]);
  if (!tracks.length) return null;
  return <section className="space-y-5">
    {heading && <h2 className="text-2xl font-bold tracking-tight">{heading}</h2>}
    {albums.map((album) => <section key={album.title} id={`album-${album.title ?? ''}`} className="space-y-3 scroll-mt-4">
      <h3 className="text-xl font-semibold tracking-tight">{album.title}</h3>
      <TrackList tracks={album.tracks} />
    </section>)}
    {singles.length > 0 && <section className="space-y-3"><h3 className="text-xl font-semibold">{albums.length > 0 ? "Singles" : "Tracks"}</h3><TrackList tracks={singles} playTrackOnSelect /></section>}
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
  const radio = useRadio();

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
    <div className="min-h-full w-full pb-10">
      <header className="relative isolate flex min-h-[320px] flex-col justify-end gap-5 overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-[#121212] px-5 pb-7 pt-12 sm:min-h-[340px] sm:flex-row sm:items-end sm:gap-6 sm:px-6 sm:pb-7">
        {banner && <img src={banner} alt="" className="absolute inset-0 z-0 size-full object-cover opacity-40" />}
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#121212]/70 via-emerald-950/25 to-black/5" aria-hidden="true" />
        <div className="relative z-20 flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="size-36 shrink-0 overflow-hidden rounded-full bg-emerald-950 shadow-2xl ring-1 ring-white/15 sm:size-52">{picture ? <img src={picture} alt={name} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-4xl font-bold text-white sm:text-6xl">{name.slice(0, 2).toUpperCase()}</div>}</div>
          <div className="min-w-0 pb-1 text-white"><div className="flex items-center gap-1.5 text-sm font-medium">{verified &&             <BadgeCheck aria-label="Nostr profile verification" className="size-4 text-primary" />} Nostr artist & publisher</div><h1 className="mt-1 break-words text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl">{name}</h1><p className="mt-3 text-sm text-white/85">{isLoading ? 'Loading…' : `${tracks.length + otherPublisherTracks.length} track${tracks.length + otherPublisherTracks.length === 1 ? '' : 's'}`}</p></div>
        </div>
      </header>
      <div className="min-h-[calc(100vh-9rem)] bg-gradient-to-b from-[#3b2727] via-[#201919] to-[#121212] px-4 sm:px-6 lg:px-7">
      <div className="flex flex-wrap items-center gap-4 py-4 sm:py-5">
        <Button
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
          size="icon"
          className="size-14 rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 disabled:opacity-40"
          aria-label={isThisPlaying ? "Pause" : "Play all"}
        >
          {isThisPlaying ? (
            <Pause className="size-7 fill-current" />
          ) : (
            <Play className="size-7 fill-current ml-0.5" />
          )}
        </Button>
        <FollowButton pubkey={pubkey} />
        <Button
          type="button"
          variant="outline"
          className="rounded-full gap-2"
          disabled={tracks.length === 0}
          onClick={() => radio.startArtistRadio(pubkey, tracks)}
        >
          <Radio className="size-4" /> Start artist radio
        </Button>
      </div>

      {metadata?.about && <p className="mb-5 max-w-4xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{metadata.about}</p>}
      <div className="px-0 space-y-8 pb-4">
        {artistPublisherTracks.length > 0 && <section className="space-y-4 border-t border-white/10 pt-5"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Tracks</h2><TrackSections tracks={artistPublisherTracks} heading="" /></section>}
        {otherPublisherTracks.length > 0 && <section className="space-y-3 border-t border-white/10 pt-5"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Other music published by this account</h2><p className="text-sm text-muted-foreground">These tracks are published by this account but credited to a different artist.</p><TrackList tracks={otherPublisherTracks} /></section>}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="size-10 rounded-md" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
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
    </div>
  );
}
