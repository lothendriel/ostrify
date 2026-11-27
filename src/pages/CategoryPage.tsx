import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { useCategoryTracks } from "@/hooks/useCategoryTracks";
import { useWavlakeGenreCatalog, type WavlakeRelease } from "@/hooks/useWavlake";
import { CATEGORIES, SUBGENRES, categoryColor, trackMatchesSubgenre, tracksInCategory } from "@/lib/categories";
import type { Track } from "@/lib/music";
import { CollectionHeader } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { NostrCollections } from "@/components/music/NostrCollections";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const subgenres = SUBGENRES[id ?? ''] ?? [];
  const selectedSubgenre = subgenres.find(subgenre => subgenre.id === searchParams.get('subgenre'));
  const [collectionShuffle, setCollectionShuffle] = useState<{ categoryId: string; key: number } | null>(null);
  const category = CATEGORIES.find((c) => c.id === id);
  const { data: nostrTracks = [], isLoading, isError, refetch } = useCategoryTracks(id);
  const wavlakeQueries = useWavlakeGenreCatalog(category?.wavlakeGenres ?? []);
  const wavlakeTracks = wavlakeQueries.flatMap((query) => query.data ?? []);
  const isWavlakeLoading = wavlakeQueries.some((query) => query.isLoading);
  const isWavlakeError = wavlakeQueries.some((query) => query.isError);
  const refetchWavlake = () => Promise.all(wavlakeQueries.map((query) => query.refetch()));
  const tracks = useMemo(() => {
    const categoryNostrTracks = tracksInCategory(nostrTracks, category?.id ?? '');
    const seenIds = new Set(categoryNostrTracks.map((track) => track.id));
    const seenUrls = new Set(categoryNostrTracks.map((track) => track.url));
    const combined = [...categoryNostrTracks];
    for (const track of wavlakeTracks) {
      if (seenIds.has(track.id) || seenUrls.has(track.url)) continue;
      seenIds.add(track.id);
      seenUrls.add(track.url);
      combined.push(track);
    }
    // A Wavlake genre query establishes category membership even when its response
    // does not include genre metadata. Do not invent a subgenre for those tracks.
    return combined.sort((left, right) => right.createdAt - left.createdAt);
  }, [category?.id, nostrTracks, wavlakeTracks]);
  // The main view includes all tracks, including tracks with no recognized subgenre.
  const visibleTracks = selectedSubgenre ? tracks.filter(track => trackMatchesSubgenre(track, selectedSubgenre)) : tracks;
  const categoryNostrTracks = useMemo(() => tracksInCategory(nostrTracks, category?.id ?? ''), [category?.id, nostrTracks]);
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
        tracks={visibleTracks}
      />
      <div className="px-3 sm:px-6 space-y-8">
        {isError && !nostrTracks.length && <p role="alert" className="text-sm text-muted-foreground">Could not load this category from your relays. <button type="button" onClick={() => void refetch()} className="text-primary underline">Try again</button></p>}
        {isWavlakeError && <p role="status" className="text-sm text-muted-foreground">Some Wavlake catalog results are unavailable right now. <button type="button" onClick={() => void refetchWavlake()} className="text-primary underline">Try again</button></p>}
        <section className="space-y-4" aria-labelledby="category-tracks-heading">
          <div>
            <h2 id="category-tracks-heading" className="text-2xl font-bold">Explore tracks</h2>
            {subgenres.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Browse all {category.label} tracks or choose a sub-genre. Matches depend on the tags publishers provide.</p>}
          </div>
          {subgenres.length > 0 && <div className="flex flex-wrap gap-2" role="group" aria-label={`${category.label} genre filters`}>
            <Button type="button" size="sm" variant={!selectedSubgenre ? 'default' : 'outline'} style={!selectedSubgenre ? { backgroundColor: '#007d38', color: '#fff' } : undefined} aria-pressed={!selectedSubgenre} onClick={() => { const next = new URLSearchParams(searchParams); next.delete('subgenre'); setSearchParams(next); }}>All {category.label}</Button>
            {subgenres.map(subgenre => <Button key={subgenre.id} type="button" size="sm" variant={selectedSubgenre?.id === subgenre.id ? 'default' : 'outline'} style={selectedSubgenre?.id === subgenre.id ? { backgroundColor: '#007d38', color: '#fff' } : undefined} aria-pressed={selectedSubgenre?.id === subgenre.id} onClick={() => { const next = new URLSearchParams(searchParams); next.set('subgenre', subgenre.id); setSearchParams(next); }}>{subgenre.label}</Button>)}
          </div>}
          <h3 className="text-lg font-semibold">{selectedSubgenre?.label ?? `${category.label} tracks`}</h3>
          <TrackList
            key={`${category.id}:${selectedSubgenre?.id ?? 'all'}`}
            tracks={visibleTracks}
            isLoading={(isLoading || isWavlakeLoading) && tracks.length === 0}
            alwaysShowPagination
            emptyMessage={selectedSubgenre ? `No ${selectedSubgenre.label} tracks found in the available results. Try another sub-genre or browse all ${category.label}.` : `No ${category.label} tracks found right now. Results depend on available sources and publisher tags.`}
          />
        </section>
        {(isLoading || isWavlakeLoading) && tracks.length === 0 ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Loading artists and albums">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div> : <NostrCollections tracks={categoryNostrTracks} categoryId={category.id} wavlakeArtists={wavlakeArtists} wavlakeAlbums={wavlakeAlbums} shuffleSeed={collectionShuffleKey ?? 0} />}
      </div>
    </div>
  );
};

export default CategoryPage;
