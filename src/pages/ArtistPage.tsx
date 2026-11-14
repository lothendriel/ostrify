import { useEffect, useMemo, useState } from "react";
import { Clock, Music2, Play, Pause, BadgeCheck, Radio } from "lucide-react";
import { useLocation, useParams } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { useSeoMeta } from "@unhead/react";
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

function PopularTrackRow({ track, index, queue }: { track: Track; index: number; queue: Track[] }) {
  const player = usePlayer();
  const current = player.current?.id === track.id;
  return <button type="button" onClick={() => player.playQueue(queue, index)} className="group grid w-full grid-cols-[2.25rem_2.75rem_minmax(0,1fr)_3.5rem] items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[2.25rem_2.75rem_minmax(0,1fr)_minmax(5rem,0.4fr)_3.5rem]">
    <span className="text-center text-sm tabular-nums text-muted-foreground group-hover:text-foreground">{current ? <Play className="mx-auto size-4 fill-current text-primary" /> : index + 1}</span>
    <span className="size-11 overflow-hidden rounded bg-secondary">{sanitizeUrl(track.image) ? <img src={sanitizeUrl(track.image)} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center"><Play className="size-4" /></span>}</span>
    <span className="min-w-0"><span className="block truncate text-sm font-medium">{track.title}</span><span className="block truncate text-xs text-muted-foreground">{track.artist || track.album || 'Audio'}</span></span>
    <span className="hidden truncate text-xs text-muted-foreground sm:block">{track.source === 'wavlake' ? 'Wavlake' : track.topics[0] ? `#${track.topics[0]}` : track.kind === 'podcast' ? 'Podcast' : 'Nostr'}</span>
    <span className="flex items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground"><Clock className="size-3.5 sm:hidden" />{track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : '—'}</span>
  </button>;
}

function TrackSections({ tracks, heading, popular = false }: { tracks: Track[]; heading: string; popular?: boolean }) {
  const { albums, singles } = useMemo(() => groupIntoAlbums(tracks), [tracks]);
  const [showAll, setShowAll] = useState(false);
  if (!tracks.length) return null;
  const popularTracks = tracks.slice(0, showAll ? tracks.length : 5);
  return <section className="space-y-5">
    {heading && <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">{heading}</h2>{popular && tracks.length > 5 && <button type="button" onClick={() => setShowAll(value => !value)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{showAll ? 'Show less' : 'See more'}</button>}</div>}
    {popular && <div className="space-y-1">{popularTracks.map((track, index) => <PopularTrackRow key={track.id} track={track} index={tracks.indexOf(track)} queue={tracks} />)}</div>}
    {!popular && <>
      {albums.map((album) => <section key={album.title} id={`album-${album.title ?? ''}`} className="space-y-3 scroll-mt-4 border-t border-white/10 pt-5">
        <h3 className="text-xl font-semibold tracking-tight">{album.title}</h3>
        <TrackList tracks={album.tracks} />
      </section>)}
      {singles.length > 0 && <section className="space-y-3 border-t border-white/10 pt-5"><h3 className="text-xl font-semibold">{albums.length > 0 ? "Singles and EPs" : "Tracks"}</h3><TrackList tracks={singles} playTrackOnSelect /></section>}
    </>}
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
  const isThisArtist = (track: Track) => track.artistPubkey === pubkey;
  const artistPublisherTracks = publisherTracks.filter(isThisArtist);
  const otherPublisherTracks = publisherTracks.filter((track) => track.kind === 'music' && !isThisArtist(track));
  const artistPublishedTracks = (artistTracks.data ?? []).filter((track) => track.pubkey !== pubkey && (!track.artistPubkey || track.artistPubkey === pubkey));
  const tracks = [...new Map([...artistPublisherTracks, ...artistPublishedTracks].map((track) => [track.id, track])).values()].sort((a, b) => b.createdAt - a.createdAt);
  const isLoading = publisherTrackQuery.isLoading || artistTracks.isLoading;
  const isError = publisherTrackQuery.isError && artistTracks.isError;
  const publishedMusicTracks = publisherTracks.filter(track => track.kind === 'music');
  const featuredTracks = tracks.length > 0 ? tracks : publishedMusicTracks;
  const { albums, singles } = useMemo(() => groupIntoAlbums(publishedMusicTracks), [publishedMusicTracks]);
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
          <div className="min-w-0 pb-1 text-white"><div className="flex items-center gap-1.5 text-sm font-medium">{verified &&             <BadgeCheck aria-label="Nostr profile verification" className="size-4 text-primary" />} Nostr artist & publisher</div><h1 className="mt-1 break-words text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl">{name}</h1><p className="mt-3 text-sm text-white/85">{isLoading ? 'Loading…' : `${publishedMusicTracks.length} published track${publishedMusicTracks.length === 1 ? '' : 's'}`}</p></div>
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
        {isLoading ? <div className="space-y-2 pb-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-3 px-3 py-2"><Skeleton className="size-10 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div></div>)}</div> : isError ? <div role="alert" className="rounded-lg border border-dashed border-white/15 px-6 py-12 text-center"><p className="mx-auto max-w-sm text-sm text-muted-foreground">Couldn’t load this publisher’s audio from your configured read relays. Check relay settings and try again.</p><Button type="button" variant="outline" className="mt-4" onClick={() => { void publisherTrackQuery.refetch(); void artistTracks.refetch(); }}>Try again</Button></div> : tracks.length === 0 && publishedMusicTracks.length === 0 ? <div className="rounded-lg border border-dashed border-white/15 px-6 py-12 text-center"><p className="mx-auto max-w-sm text-sm text-muted-foreground">No music found for this artist yet. The publisher may use event kinds or relays that Ostrify isn’t currently reading.</p></div> : <>
        {featuredTracks.length > 0 && <div className="space-y-6 pb-5"><TrackSections tracks={featuredTracks} heading="Popular" popular /></div>}
        {albums.length > 0 && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Discography</h2><span className="text-xs text-muted-foreground">{albums.length} releases</span></div><div className="mb-3 flex flex-wrap gap-2 text-xs">{['Popular releases', 'Albums', 'Singles and EPs', 'Compilations'].map((label, index) => <span key={label} className={index === 0 ? 'rounded-full bg-white px-3 py-2 font-medium text-black' : 'rounded-full bg-white/10 px-3 py-2 text-muted-foreground'}>{label}</span>)}</div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{albums.map(album => <div key={album.title} className="min-w-0 rounded-lg bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.1]"><button type="button" onClick={() => player.playQueue(album.tracks)} className="block w-full text-left"><div className="aspect-square overflow-hidden rounded-md bg-secondary">{sanitizeUrl(album.image) ? <img src={sanitizeUrl(album.image)} alt="" loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-800"><Music2 className="size-10 text-white/70" /></div>}</div><h3 className="mt-3 truncate text-sm font-semibold">{album.title}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{Math.max(...album.tracks.map(track => track.createdAt)) > 0 ? new Date(Math.max(...album.tracks.map(track => track.createdAt)) * 1000).getFullYear() : 'Nostr'} · Album</p></button></div>)}</div></section>}
        {singles.length > 0 && <section className="space-y-4 border-t border-white/10 py-5"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Singles and EPs</h2><TrackList tracks={singles} playTrackOnSelect /></section>}
        {artistPublisherTracks.length > 0 && <section className="space-y-4 border-t border-white/10 py-5"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">All tracks</h2><TrackList tracks={artistPublisherTracks} /></section>}
        {otherPublisherTracks.length > 0 && <section className="space-y-4 border-t border-white/10 py-5"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Other music published by this account</h2><p className="text-sm text-muted-foreground">These tracks are published by this account but credited to a different artist.</p><TrackList tracks={otherPublisherTracks} /></section>}
      </>}
      </div>
    </div>
  );
}
