import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { useCategoryTracks } from "@/hooks/useCategoryTracks";
import { useWavlakeGenreCatalog, type WavlakeRelease } from "@/hooks/useWavlake";
import { CATEGORIES, categoryColor } from "@/lib/categories";
import type { Track } from "@/lib/music";
import { CollectionHeader } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { NostrCollections } from "@/components/music/NostrCollections";
import { Skeleton } from "@/components/ui/skeleton";
import { Music } from "lucide-react";

function wavlakeReleases(tracks: Track[], type: 'artist' | 'album'): WavlakeRelease[] {
  const releases = new Map<string, WavlakeRelease>();
  for (const track of tracks) {
    const id = type === 'artist' ? track.artistId : track.albumId;
    const title = type === 'artist' ? track.artist : track.album;
    if (!id || !title?.trim() || releases.has(id)) continue;
    releases.set(id, {
      id,
      type,
      title: title.trim(),
      artist: type === 'album' ? track.artist : undefined,
      image: type === 'artist' ? track.artistImage : track.image,
    });
  }
  return [...releases.values()];
}

const CategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const [collectionShuffle, setCollectionShuffle] = useState<{ categoryId: string; key: number } | null>(null);
  const category = CATEGORIES.find((c) => c.id === id);
  const { data: nostrTracks = [], isLoading, isError, refetch } = useCategoryTracks(id);
  const wavlakeQueries = useWavlakeGenreCatalog(category?.wavlakeGenres ?? []);
  const wavlakeTracks = wavlakeQueries.flatMap((query) => query.data ?? []);
  const isWavlakeLoading = wavlakeQueries.some((query) => query.isLoading);
  const isWavlakeError = wavlakeQueries.some((query) => query.isError);
  const refetchWavlake = () => Promise.all(wavlakeQueries.map((query) => query.refetch()));
  const tracks = useMemo(() => {
    const seenIds = new Set(nostrTracks.map((track) => track.id));
    const seenUrls = new Set(nostrTracks.map((track) => track.url));
    const combined = [...nostrTracks];
    for (const track of wavlakeTracks) {
      if (seenIds.has(track.id) || seenUrls.has(track.url)) continue;
      seenIds.add(track.id);
      seenUrls.add(track.url);
      combined.push(track);
    }
    return combined.sort((left, right) => right.createdAt - left.createdAt);
  }, [nostrTracks, wavlakeTracks]);
  const wavlakeArtists = useMemo(() => wavlakeReleases(wavlakeTracks, 'artist'), [wavlakeTracks]);
  const wavlakeAlbums = useMemo(() => wavlakeReleases(wavlakeTracks, 'album'), [wavlakeTracks]);
  const collectionShuffleKey = collectionShuffle && collectionShuffle.categoryId === id ? collectionShuffle.key : undefined;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCollectionShuffle({ categoryId: id ?? '', key: Math.floor(Math.random() * 2 ** 32) });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [id]);

  useSeoMeta({ title: `${category?.label ?? "Category"} — Ostrify` });

  if (!category) {
    return (
      <div className="py-24 text-center text-muted-foreground">Category not found.</div>
    );
  }

  return (
    <div>
      <CollectionHeader
        subtitle="Genre"
        title={category.label}
        gradient={categoryColor(category.id)}
        icon={<Music className="size-16 text-white/80" />}
        tracks={tracks}
      />
      <div className="px-3 sm:px-6 space-y-8">
        {isError && <p role="alert" className="text-sm text-muted-foreground">Could not load this category from your relays. <button type="button" onClick={() => void refetch()} className="text-primary underline">Try again</button></p>}
        {(isLoading || isWavlakeLoading) ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Loading artists and albums">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div> : <NostrCollections tracks={nostrTracks} wavlakeArtists={wavlakeArtists} wavlakeAlbums={wavlakeAlbums} shuffleSeed={collectionShuffleKey ?? 0} />}
        {isWavlakeError && <p role="status" className="text-sm text-muted-foreground">Some Wavlake catalog results are unavailable right now. <button type="button" onClick={() => void refetchWavlake()} className="text-primary underline">Try again</button></p>}
        <section className="space-y-3"><h2 className="text-2xl font-bold">Tracks</h2>
        <TrackList
          tracks={tracks}
          isLoading={isLoading || isWavlakeLoading}
          playTrackOnSelect
          emptyMessage={`No ${category.label} tracks found right now. We look for the genre in Nostr tags and catalog track metadata — check back later or browse another genre.`}
        />
        </section>
      </div>
    </div>
  );
};

export default CategoryPage;
