import { useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { useCategoryTracks } from "@/hooks/useCategoryTracks";
import { CATEGORIES, categoryColor } from "@/lib/categories";
import { CollectionHeader } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { NostrCollections } from "@/components/music/NostrCollections";
import { Skeleton } from "@/components/ui/skeleton";
import { Music } from "lucide-react";

const CategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const category = CATEGORIES.find((c) => c.id === id);
  const { data: tracks = [], isLoading, isError, refetch } = useCategoryTracks(id);

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
        {isLoading ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Loading artists and albums">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div> : <NostrCollections tracks={tracks} />}
        <section className="space-y-3"><h2 className="text-2xl font-bold">Tracks</h2>
        <TrackList
          tracks={tracks}
          isLoading={isLoading}
          emptyMessage={`No ${category.label} tracks found right now. We look for the genre in each track's tags, title, and description — check back as more music is published to Nostr.`}
        />
        </section>
      </div>
    </div>
  );
};

export default CategoryPage;
