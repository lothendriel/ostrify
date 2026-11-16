import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Track } from "@/lib/music";
import { Button } from "@/components/ui/button";
import { usePublishMusicEvent, type MusicVisibility } from "@/hooks/usePublishMusicEvent";
import { withMusicVisibility } from "@/lib/musicVisibility";

export function TrackVisibilityManager({ tracks }: { tracks: Track[] }) {
  const publish = usePublishMusicEvent();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string>();
  const manageable = tracks.filter(track => track.event?.kind === 36787 && !!track.addressableId);
  const [showHidden, setShowHidden] = useState(false);
  const visibleTracks = manageable.filter(track => track.visibility !== "hidden");
  const hiddenTracks = manageable.filter(track => track.visibility === "hidden");
  const displayedTracks = showHidden ? manageable : visibleTracks;

  const updateVisibility = async (track: Track, visibility: MusicVisibility) => {
    if (!track.event) return;
    setMessage(undefined);
    try {
      const tags = withMusicVisibility(track.event.tags, visibility);
      const result = await publish.mutateAsync({
        kind: track.event.kind,
        content: track.event.content,
        tags,
        visibility,
        removeFromDrops: visibility === "hidden" && track.visibility !== "hidden",
      });
      setMessage(result.dropsError
        ? `“${track.title}” was updated on your write relays, but DROPS may still have an older copy: ${result.dropsError}`
        : visibility === "hidden"
          ? `“${track.title}” is hidden in Ostrify. It remains public on your configured write relays.`
          : `“${track.title}” is visible in Ostrify and shared to DROPS.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artist-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["home-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["fresh-nostr-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["category-tracks"] }),
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update Ostrify visibility.");
    }
  };

  return <section className="border-b border-white/10 bg-black/20 px-4 py-3 sm:px-6 lg:px-7" aria-label="Manage Ostrify track visibility">
    <div className="mx-auto max-w-5xl space-y-3">
      <div><h2 className="font-semibold">Manage Ostrify visibility</h2><p className="mt-1 text-xs text-muted-foreground">Hidden tracks remain public on your configured write relays and audio host. Showing a track shares its event to DROPS.</p></div>
      {hiddenTracks.length > 0 && <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)} className="accent-primary" />Include {hiddenTracks.length} tracks hidden in Ostrify</label>}
      {displayedTracks.length ? <ul className="space-y-2">{displayedTracks.map(track => <li key={track.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2"><span className="min-w-0 flex-1 truncate text-sm">{track.title}</span><span className="text-xs text-muted-foreground">{track.visibility === "hidden" ? "Hidden in Ostrify" : "Visible on Ostrify"}</span><Button type="button" size="sm" variant="outline" disabled={publish.isPending} onClick={() => void updateVisibility(track, track.visibility === "hidden" ? "public" : "hidden")}>{track.visibility === "hidden" ? "Show on Ostrify" : "Hide in Ostrify"}</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No visible tracks were found. If you hid tracks, enable the option above to manage them.</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  </section>;
}
