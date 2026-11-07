import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { useTracks } from "@/hooks/useTracks";
import { CATEGORIES, categoryColor, tracksInCategory } from "@/lib/categories";
import { CollectionHeader } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { Music } from "lucide-react";

const CategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const category = CATEGORIES.find((c) => c.id === id);
  const { data: allTracks = [], isLoading } = useTracks({ limit: 200 });

  useSeoMeta({ title: `${category?.label ?? "Category"} — Ostrify` });

  const tracks = useMemo(
    () => (id ? tracksInCategory(allTracks, id) : []),
    [allTracks, id],
  );

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
      <div className="px-3 sm:px-6">
        <TrackList
          tracks={tracks}
          isLoading={isLoading}
          emptyMessage={`No ${category.label} tracks found right now. Artists tag their music with #${category.id} to appear here.`}
        />
      </div>
    </div>
  );
};

export default CategoryPage;
