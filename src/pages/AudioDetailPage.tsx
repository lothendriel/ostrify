import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { nip19 } from "nostr-tools";
import { BookOpen, Music2, Pause, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackRow } from "@/components/music/TrackRow";
import { TrackArtwork } from "@/components/music/TrackArtwork";
import { ArtistLink } from "@/components/music/ArtistLink";
import { LikeButton } from "@/components/music/LikeButton";
import { AddToPlaylistMenu } from "@/components/music/AddToPlaylistMenu";
import { QueueActionsMenu } from "@/components/music/QueueActionsMenu";
import { ShareTrackButton } from "@/components/music/ShareTrackButton";
import { usePlayer } from "@/hooks/usePlayer";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { useLibriVoxBook } from "@/hooks/useLibriVox";
import { useGutenbergAudiobook } from "@/hooks/useGutenbergAudiobooks";
import { fetchPodcastIndexEpisodes, fountainTrackUrl, useFountainRssEpisodes, useFountainShow, usePodcastIndexEpisodes, usePodcastIndexFeed } from "@/hooks/usePodcasts";
import { fetchWavlakeTrack, wavlakeTrackUrl } from "@/hooks/useWavlake";
import { fountainShowGuid, formatDuration, sanitizeAudioFallbacks, type Track } from "@/lib/music";
import { sanitizeUrl } from "@/lib/sanitize";
import { DROPS_MUSIC_RELAY } from "@/lib/sources";
import { decodeAudioDetailFallback } from "@/lib/audioDetail";

function resolveTuneStrId(id: string): string {
  if (id.startsWith("tunestr:n94:")) return id.slice("tunestr:n94:".length);
  if (/^tunestr:[0-9a-f]{64}$/i.test(id)) return id.slice("tunestr:".length);
  const coordinate = /^tunestr:([0-9a-f]{64}):(.+)$/i.exec(id);
  return coordinate ? `30311:${coordinate[1].toLowerCase()}:${coordinate[2]}` : id;
}

function isTuneStrReference(id: string): boolean {
  return id.startsWith("tunestr:n94:") || /^tunestr:[0-9a-f]{64}(?::.+)?$/i.test(id);
}

function decodeAudioId(value: string): string | undefined {
  // URLSearchParams already decodes once; decoding again can corrupt IDs that
  // intentionally contain percent-encoded source identifiers.
  return value.length <= 2048 ? value : undefined;
}

function parseAudiobookChapter(id: string, source: "librivox" | "gutenberg") {
  const prefix = `${source}:`;
  if (!id.startsWith(prefix)) return undefined;
  const rest = id.slice(prefix.length);
  const separator = rest.indexOf(":");
  const catalogId = separator < 0 ? rest : rest.slice(0, separator);
  const fileName = separator < 0 ? undefined : rest.slice(separator + 1);
  if (!/^[a-z0-9][a-z0-9_-]{0,159}$/i.test(catalogId) || (separator >= 0 && (!fileName || fileName.length > 512))) return undefined;
  return { catalogId, fileName, isBookLink: separator < 0 };
}

function parseFountainRssId(id: string): { feedGuid: string; expectedId: string } | undefined {
  if (!id.startsWith("fountain-rss:")) return undefined;
  const value = id.slice("fountain-rss:".length);
  const knownPrefix = value.startsWith("fountain:show:id:") ? "fountain:show:id:" : value.startsWith("fountain:") ? "fountain:" : undefined;
  if (!knownPrefix) return undefined;
  const separator = value.indexOf(":", knownPrefix.length);
  if (separator < 0) return undefined;
  const feedGuid = value.slice(knownPrefix.length, separator);
  let episodeGuid: string;
  try {
    episodeGuid = decodeURIComponent(value.slice(separator + 1));
  } catch {
    return undefined;
  }
  if (!feedGuid || feedGuid.length > 512 || !episodeGuid || episodeGuid.length > 512) return undefined;
  const rawShowId = `${knownPrefix}${feedGuid}`;
  return { feedGuid, expectedId: `fountain-rss:${rawShowId}:${encodeURIComponent(episodeGuid)}` };
}

function parsePodcastIndexFallback(id: string): { episodeId?: number; feedUrl?: string; publishedAt?: number; title?: string } | undefined {
  const episodeMatch = /^podcast-index:episode:id:(\d{1,12})$/.exec(id);
  if (episodeMatch) return { episodeId: Number(episodeMatch[1]) };
  const value = id.slice("podcast-index:".length);
  const prefixMatch = /^(https:\/\/[^:]+(?::\d+)?\/.*):(\d{1,12}):(.*)$/s.exec(value);
  if (!prefixMatch) return undefined;
  const feedUrl = sanitizeUrl(prefixMatch[1]);
  const publishedAt = Number(prefixMatch[2]);
  const title = prefixMatch[3];
  if (!feedUrl || !Number.isFinite(publishedAt) || !title) return undefined;
  return { feedUrl, publishedAt, title };
}

function sourceLabel(track: Track): string {
  if (track.source === "wavlake") return "Wavlake";
  if (track.source === "librivox") return "LibriVox";
  if (track.source === "gutenberg") return "Project Gutenberg Open Audiobook Collection";
  if (track.source === "tunestr") return "TuneStr";
  if (track.source === "fountain") return "Fountain";
  if (track.source === "podcast-index") return "Podcast Index";
  if (track.source === "radio-browser") return "Live radio";
  if (track.kind === "podcast") return "Nostr podcast";
  if (track.kind === "audiobook") return "Audiobook";
  return "Nostr music";
}

function sourceHref(track: Track, bookId?: string): string | undefined {
  if (track.event) {
    try {
      const identifier = track.event.tags.find(([name]) => name === "d")?.[1];
      const encoded = track.event.kind >= 30000 && track.event.kind < 40000 && identifier
        ? nip19.naddrEncode({ identifier, pubkey: track.event.pubkey, kind: track.event.kind })
        : nip19.neventEncode({ id: track.event.id, author: track.event.pubkey, kind: track.event.kind });
      return `https://njump.me/${encoded}`;
    } catch {
      return undefined;
    }
  }
  const wavlake = wavlakeTrackUrl(track.id);
  if (wavlake) return wavlake;
  const fountain = fountainTrackUrl(track.id);
  if (fountain) return fountain;
  if (bookId) return `https://archive.org/details/${encodeURIComponent(bookId)}`;
  return undefined;
}

export default function AudioDetailPage() {
  const [searchParams] = useSearchParams();
  const compressedFallback = useMemo(() => decodeAudioDetailFallback(searchParams.get("fallback")), [searchParams]);
  const rawId = searchParams.get("track") ?? compressedFallback?.id ?? "";
  const trackId = decodeAudioId(rawId)?.trim() ?? "";
  const sharedTrack = useMemo<Track | undefined>(() => {
    if (compressedFallback?.id === trackId) return compressedFallback;
    if (!trackId) return undefined;
    const urlParam = searchParams.get("url");
    if (urlParam === null) return undefined;
    const url = sanitizeUrl(urlParam);
    const title = searchParams.get("title")?.trim();
    const kind = searchParams.get("kind");
    if (!url || url.length > 2048 || !title || title.length > 500 || !["music", "podcast", "audiobook"].includes(kind ?? "")) return undefined;
    const durationValue = Number(searchParams.get("duration"));
    const duration = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : undefined;
    const sourceValue = searchParams.get("source");
    const source = sourceValue === "radio-browser" && /^radio-browser:[\da-f-]{36}$/i.test(trackId)
      ? "radio-browser"
      : ["wavlake", "librivox", "gutenberg", "tunestr", "fountain", "podcast-index"].includes(sourceValue ?? "") ? sourceValue as Track["source"] : undefined;
    const rawEventKind = searchParams.get("eventKind");
    const eventKindValue = rawEventKind ? Number(rawEventKind) : NaN;
    const eventKind = Number.isInteger(eventKindValue) && [1, 54, 1063, 1053, 31337, 36787, 32123, 30440, 30311].includes(eventKindValue) ? eventKindValue : undefined;
    const createdAtValue = Number(searchParams.get("createdAt"));
    return {
      id: trackId,
      source,
      eventKind,
      artistId: searchParams.get("artistId")?.slice(0, 100) || undefined,
      artistPubkey: /^[0-9a-f]{64}$/i.test(searchParams.get("artistPubkey") ?? "") ? searchParams.get("artistPubkey")!.toLowerCase() : undefined,
      showId: searchParams.get("showId")?.slice(0, 256) || undefined,
      url,
      fallbackUrls: sanitizeAudioFallbacks(searchParams.getAll("audioFallback"), url),
      title,
      artist: searchParams.get("artist")?.slice(0, 300) || undefined,
      album: searchParams.get("album")?.slice(0, 300) || undefined,
      image: sanitizeUrl(searchParams.get("image")),
      duration,
      kind: kind as Track["kind"],
      pubkey: /^[0-9a-f]{64}$/i.test(searchParams.get("pubkey") ?? "") ? searchParams.get("pubkey")!.toLowerCase() : "",
      topics: (searchParams.get("topics") ?? "").slice(0, 700).split(",").filter(topic => /^[a-z0-9_-]{1,50}$/i.test(topic)).slice(0, 12),
      createdAt: Number.isFinite(createdAtValue) && createdAtValue > 0 ? createdAtValue : 0,
    } satisfies Track;
  }, [trackId, searchParams]);
  const nostrLookupId = useMemo(() => resolveTuneStrId(trackId), [trackId]);
  const fallbackEventKind = sharedTrack?.eventKind ?? (trackId.startsWith("tunestr:n94:") ? 1053 : undefined);
  const librivoxChapter = useMemo(() => parseAudiobookChapter(trackId, "librivox"), [trackId]);
  const gutenbergChapter = useMemo(() => parseAudiobookChapter(trackId, "gutenberg"), [trackId]);
  const fountainRss = useMemo(() => parseFountainRssId(trackId), [trackId]);
  const podcastIndexFallback = useMemo(() => parsePodcastIndexFallback(trackId), [trackId]);
  const unsupportedExternalId = !sharedTrack && ((trackId.startsWith("podcast-index:") && !podcastIndexFallback) || (trackId.startsWith("fountain-rss:") && !fountainRss) || (trackId.startsWith("gutenberg:") && !gutenbergChapter) || (trackId.startsWith("librivox:") && !librivoxChapter) || (trackId.startsWith("tunestr:") && !isTuneStrReference(trackId)));
  const directLookup = useTracksByIds(
    trackId && !sharedTrack && !librivoxChapter && !gutenbergChapter && !fountainRss && !podcastIndexFallback && !unsupportedExternalId ? [nostrLookupId] : undefined,
    true,
    [DROPS_MUSIC_RELAY],
  );
  const librivoxBook = useLibriVoxBook(librivoxChapter?.catalogId);
  const gutenbergBook = useGutenbergAudiobook(gutenbergChapter?.catalogId);
  const fountainShow = useFountainShow(fountainRss?.feedGuid);
  const fountainEpisodes = useFountainRssEpisodes(fountainShow.data);
  const podcastIndexShow = usePodcastIndexFeed(podcastIndexFallback?.episodeId ? undefined : podcastIndexFallback?.feedUrl);
  const podcastIndexEpisodes = usePodcastIndexEpisodes(
    undefined,
    podcastIndexFallback?.episodeId ? undefined : podcastIndexFallback?.feedUrl,
    podcastIndexFallback?.title,
    !!podcastIndexFallback?.feedUrl && !podcastIndexFallback.episodeId,
  );
  const podcastIndexEpisode = useQuery({
    queryKey: ["podcast-index", "episode-detail", podcastIndexFallback?.episodeId ?? 0],
    enabled: !!podcastIndexFallback?.episodeId,
    queryFn: ({ signal }) => fetchPodcastIndexEpisodes(podcastIndexFallback?.episodeId ?? 0, signal),
  });
  const player = usePlayer();

  const wavlakeTrackId = !sharedTrack ? /^wavlake:([0-9a-f-]{36})$/i.exec(trackId)?.[1] : undefined;
  const wavlakeDetailQuery = useQuery({
    queryKey: ["wavlake", "track-detail", wavlakeTrackId ?? ""],
    enabled: !!wavlakeTrackId && !sharedTrack,
    queryFn: ({ signal }) => fetchWavlakeTrack(wavlakeTrackId!, signal),
    staleTime: 5 * 60 * 1000,
  });
  const book = librivoxChapter ? librivoxBook.data : gutenbergChapter ? gutenbergBook.data : undefined;
  const chapter = librivoxChapter?.fileName || gutenbergChapter?.fileName ? book?.chapters.find(item => item.id === trackId) : undefined;
  const bookTrack: Track | undefined = book && (librivoxChapter?.isBookLink || gutenbergChapter?.isBookLink) && book.chapters[0] ? {
    ...book.chapters[0],
    id: trackId,
    title: book.title,
    artist: book.author,
    album: book.title,
    duration: book.duration,
  } : undefined;
  const fallbackEpisode = fountainRss
    ? fountainEpisodes.data?.find(item => item.id === fountainRss.expectedId)
    : podcastIndexFallback?.episodeId
      ? podcastIndexEpisode.data ?? undefined
      : podcastIndexFallback?.title && podcastIndexFallback.publishedAt !== undefined
        ? podcastIndexEpisodes.data?.find(item => item.title === podcastIndexFallback.title && Math.abs(item.createdAt - (podcastIndexFallback.publishedAt ?? 0)) <= 2) ?? podcastIndexEpisode.data ?? undefined
        : undefined;
  const podcastShowId = podcastIndexFallback?.episodeId ? podcastIndexEpisode.data?.showId : undefined;
  const nostrTrack = directLookup.data?.tracks.find(item => item.id.toLowerCase() === nostrLookupId.toLowerCase()) ?? directLookup.data?.tracks[0];
  const resolvedTrack = chapter ?? bookTrack ?? (!librivoxChapter && !gutenbergChapter && !fountainRss && !podcastIndexFallback && !sharedTrack && !unsupportedExternalId ? nostrTrack : undefined) ?? fallbackEpisode ?? sharedTrack;
  const tuneStrEventKind = resolvedTrack?.event?.kind ?? (trackId.startsWith("tunestr:n94:") ? 1053 : undefined);
  const trackWithFallbackPublisher = resolvedTrack;
  const fallbackArtistPubkey = searchParams.get("artistPubkey");
  const trackWithFallbackArtist = trackWithFallbackPublisher && fallbackArtistPubkey && !trackWithFallbackPublisher.artistPubkey && /^[0-9a-f]{64}$/i.test(fallbackArtistPubkey) ? { ...trackWithFallbackPublisher, artistPubkey: fallbackArtistPubkey.toLowerCase() } : trackWithFallbackPublisher;
  const trackWithPodcastShowBase = trackWithFallbackArtist && trackWithFallbackArtist.kind === "podcast" && !trackWithFallbackArtist.showId && podcastShowId ? { ...trackWithFallbackArtist, showId: podcastShowId } : trackWithFallbackArtist;
  const trackWithPodcastShow = trackWithPodcastShowBase && (tuneStrEventKind ?? fallbackEventKind) && !trackWithPodcastShowBase.eventKind ? { ...trackWithPodcastShowBase, eventKind: tuneStrEventKind ?? fallbackEventKind } : trackWithPodcastShowBase;
  const detailLoadError = (!!librivoxChapter && !librivoxBook.data && librivoxBook.isError) || (!!gutenbergChapter && !gutenbergBook.data && gutenbergBook.isError) ||
    (!!fountainRss && (fountainShow.isError || fountainEpisodes.isError) && !fallbackEpisode) ||
    (!!podcastIndexFallback && (podcastIndexFallback.episodeId ? podcastIndexEpisode.isError : podcastIndexEpisodes.isError) && !fallbackEpisode) ||
    (!!wavlakeTrackId && wavlakeDetailQuery.isError && !trackWithPodcastShow) ||
    (!sharedTrack && !unsupportedExternalId && !librivoxChapter && !gutenbergChapter && !fountainRss && !podcastIndexFallback && directLookup.isError);
  const isLoading = trackId.length > 0 && !sharedTrack && !unsupportedExternalId && !trackWithPodcastShow && (
    (!!librivoxChapter && !librivoxBook.data && librivoxBook.isLoading) || (!!gutenbergChapter && !gutenbergBook.data && gutenbergBook.isLoading) ||
    (!!fountainRss && !fallbackEpisode && (fountainShow.isLoading || fountainEpisodes.isLoading)) ||
    (!!podcastIndexFallback && !fallbackEpisode && (podcastIndexFallback.episodeId ? podcastIndexEpisode.isLoading : podcastIndexEpisodes.isLoading)) ||
    (!!wavlakeTrackId && !trackWithPodcastShow && wavlakeDetailQuery.isLoading) ||
    (!librivoxChapter && !gutenbergChapter && !fountainRss && !podcastIndexFallback && directLookup.isLoading)
  );

  useSeoMeta({ title: trackWithPodcastShow ? `${trackWithPodcastShow.title} — Ostrify` : "Audio — Ostrify" });

  if (!trackId) return <div className="p-6"><h1 className="text-2xl font-bold">Audio item not found</h1><p className="mt-2 text-muted-foreground">This link is missing its track identifier.</p></div>;

  if (isLoading) return <div className="space-y-5 p-4 sm:p-6"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>;
  if (!trackWithPodcastShow) return <div className="space-y-3 p-6"><h1 className="text-2xl font-bold">{detailLoadError ? "Couldn’t load this audio" : "Audio item unavailable"}</h1><p className="max-w-xl text-sm text-muted-foreground">{detailLoadError ? "The source may be temporarily unavailable. Try again, or open the item from its original list." : <>This item is no longer available from the selected relays or catalog. It may have been removed, or your current sources may not include it. <strong className="font-semibold text-foreground">The relay hosting the track may not have responded. Refresh the page and try again.</strong></>}</p>{unsupportedExternalId && <p className="text-sm text-muted-foreground">This external podcast link doesn’t contain a supported episode identifier.</p>}{detailLoadError && <Button variant="outline" onClick={() => { void directLookup.refetch(); void librivoxBook.refetch(); void gutenbergBook.refetch(); void fountainShow.refetch(); void fountainEpisodes.refetch(); void podcastIndexShow.refetch(); void podcastIndexEpisodes.refetch(); void podcastIndexEpisode.refetch(); }}>Try again</Button>}<Link to="/music" className="text-sm font-semibold text-primary underline">Explore music</Link></div>;

  const track = trackWithPodcastShow?.id === trackId && trackWithPodcastShow.url
    ? trackWithPodcastShow
    : wavlakeDetailQuery.data ?? trackWithPodcastShow;
  const isCurrent = player.current?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;
  const source = sourceLabel(track);
  const externalSource = sourceHref(track, book?.catalogId);
  const bookLink = librivoxChapter?.isBookLink || gutenbergChapter?.isBookLink;
  const fountainGuid = track.kind === "podcast" ? fountainShowGuid(track.showId) : undefined;
  const podcastIndexShowId = track.kind === "podcast" && track.showId && /^podcast-index:\d{1,12}$/.test(track.showId) ? track.showId : undefined;
  const shareTrack: Track = { ...track, eventKind: track.event?.kind ?? track.eventKind ?? tuneStrEventKind };
  const artist: ReactNode = fountainGuid
    ? <Link to={`/podcasts/fountain/${encodeURIComponent(fountainGuid)}`} className="hover:underline">{track.artist || "Podcast show"}</Link>
    : podcastIndexShowId
      ? <Link to={`/podcasts?source=directory&show=${encodeURIComponent(podcastIndexShowId)}`} className="hover:underline">{track.artist || "Podcast show"}</Link>
      : <ArtistLink pubkey={track.pubkey} artistId={track.artistId} artistPubkey={track.artistPubkey} fallbackName={track.artist} isUnverifiedArtist={!!track.event && !!track.artist} />;
  const sourceIcon = track.source === "radio-browser" || track.kind === "podcast" ? Radio : track.kind === "audiobook" ? BookOpen : Music2;
  const SourceIcon = sourceIcon;
  const trackArtwork = <TrackArtwork track={track} className="aspect-square w-full max-w-48 shadow-lg sm:max-w-56" rounded="rounded-xl" priority />;
  const hasBookDetail = !!(librivoxChapter?.fileName || gutenbergChapter?.fileName);
  const pageDescription = track.source === "radio-browser"
    ? "A live radio station available in Ostrify."
    : track.kind === "audiobook"
    ? track.album ? `From ${track.album}.` : "An audiobook recording in your Ostrify library."
    : track.kind === "podcast"
      ? track.album ? `Part of ${track.album}.` : "A podcast episode available in Ostrify."
      : track.album ? `From the album ${track.album}.` : "A music track available in Ostrify.";
  const releaseLabel = track.kind === "audiobook" ? "Audiobook" : track.kind === "podcast" ? "Podcast" : track.album ? "Album" : undefined;

  return <main className="space-y-6 p-4 sm:p-6">
    <header className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border/60 bg-gradient-to-br from-slate-900 via-emerald-950/70 to-card p-5 sm:flex-row sm:items-end sm:p-8">
      {trackArtwork}
      <div className="min-w-0 flex-1 text-white">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-200"><SourceIcon className="size-4" aria-hidden="true" />{source}</p>
        <h1 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-5xl">{track.title}</h1>
        <p className="mt-3 text-lg text-white/80">{artist || "Unknown artist"}</p>
        <p className="mt-3 text-sm text-white/65">{pageDescription}</p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/65">
          {releaseLabel && <span>{releaseLabel}{track.album ? ` · ${track.album}` : ""}</span>}
          {track.duration && <span>{formatDuration(track.duration)}</span>}
          {track.createdAt > 0 && <time dateTime={new Date(track.createdAt * 1000).toISOString()}>{new Date(track.createdAt * 1000).toLocaleDateString()}</time>}
        </div>
      </div>
    </header>

    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" className="rounded-full" onClick={() => isCurrent ? player.togglePlay() : track.source === 'radio-browser' ? player.playStation(track) : player.playTrack(track)}><span className="mr-2">{isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}</span>{isPlaying ? "Pause" : "Play"}</Button>
      {track.kind === "music" && track.source !== "tunestr" && track.source !== "radio-browser" && <LikeButton trackId={track.id} />}
      <ShareTrackButton track={shareTrack} />
      {track.kind !== "audiobook" && track.source !== "tunestr" && track.source !== "radio-browser" && <QueueActionsMenu track={track} />}
      {track.source !== "librivox" && track.source !== "gutenberg" && track.source !== "tunestr" && track.source !== "radio-browser" && <AddToPlaylistMenu trackId={track.id} />}
      {externalSource && <a href={externalSource} target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-accent">View original source</a>}
    </div>

    {track.topics.length > 0 && <section aria-label="Audio tags" className="flex flex-wrap gap-2">{track.topics.slice(0, 12).map(topic => <span key={topic} className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{topic.startsWith("#") ? topic : `#${topic}`}</span>)}</section>}
    {track.kind === "podcast" && <section className="rounded-xl border border-border/60 p-4"><h2 className="font-semibold">Podcast episode</h2><p className="mt-1 text-sm text-muted-foreground">Explore the show for more episodes.</p>{fountainGuid && <Link to={`/podcasts/fountain/${encodeURIComponent(fountainGuid)}`} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">View podcast show</Link>}{podcastIndexShowId && <Link to={`/podcasts?source=directory&show=${encodeURIComponent(podcastIndexShowId)}`} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">View podcast show</Link>}{!fountainGuid && !podcastIndexShowId && <Link to="/podcasts" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">Browse podcasts</Link>}</section>}
    {hasBookDetail && book && <section className="space-y-3"><div><h2 className="text-2xl font-bold">{book.title}</h2><p className="text-sm text-muted-foreground">{book.chapters.length} recordings · {book.author}</p></div><div className="rounded-xl border border-border/60">{book.chapters.map((item, index) => <TrackRow key={item.id} track={item} index={index} />)}</div></section>}
    {track.kind === "audiobook" && !hasBookDetail && <section className="flex min-w-0 items-center gap-4 rounded-xl border border-border/60 p-4"><TrackArtwork track={track} className="size-16" /><div className="min-w-0"><h2 className="font-semibold">{bookLink ? "Audiobook" : "Audiobook recording"}</h2><p className="mt-1 text-sm text-muted-foreground">{track.album || (bookLink ? "Audiobook from your library." : "This chapter is available from your audiobook library.")}</p></div></section>}
    {track.event && <p className="text-xs text-muted-foreground">Published as a public Nostr event. Visibility controls in Ostrify do not make relay copies private.</p>}
  </main>;
}
