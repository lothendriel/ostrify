import { useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { useCategoryTracks } from "@/hooks/useCategoryTracks";
import { CATEGORIES, categoryColor } from "@/lib/categories";
import { CollectionHeader } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { Music } from "lucide-react";

const CategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const category = CATEGORIES.find((c) => c.id === id);
  const { data: tracks = [], isLoading } = useCategoryTracks(id);

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
      <div className="px-3 sm:px-6">
        <TrackList
          tracks={tracks}
          isLoading={isLoading}
          emptyMessage={`No ${category.label} tracks found right now. We look for the genre in each track's tags, title, and description — check back as more music is published to Nostr.`}
        />
      </div>
    </div>
  );
};

export default CategoryPage;
