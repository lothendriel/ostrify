import { useMemo } from "react";
import { usePodcastEpisodes } from "@/hooks/usePodcasts";
import { Shelf } from "@/components/music/Shelf";

function PodcastContent({ enabled, sessionScope }: { enabled: boolean; sessionScope?: string }) {
  const podcasts = usePodcastEpisodes(40, 10, enabled, sessionScope);
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    return (podcasts.data ?? []).filter(track => {
      if (seen.has(track.url)) return false;
      seen.add(track.url);
      return true;
    }).slice(0, 10);
  }, [podcasts.data]);
  return <Shelf title="Podcasts" subtitle="Episodes from Nostr and Fountain.fm" tracks={tracks} isLoading={podcasts.isLoading && tracks.length === 0} dense seeAllHref="/podcasts/episodes" />;
}

export function HomePodcastsSection({ enabled, sessionScope }: { enabled: boolean; sessionScope?: string }) {
  return <PodcastContent enabled={enabled} sessionScope={sessionScope} />;
}
