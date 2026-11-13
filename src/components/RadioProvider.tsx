import { useCallback, useMemo } from "react";
import { RadioContext } from "@/contexts/RadioContext";
import { usePlayer } from "@/hooks/usePlayer";
import { useTracks } from "@/hooks/useTracks";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { useToast } from "@/hooks/useToast";
import { buildRadioStation } from "@/lib/radio";
import type { Track } from "@/lib/music";

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const player = usePlayer();
  const { toast } = useToast();
  const nostrTracks = useTracks({ limit: 150, enabled: false });
  const wavlake = useWavlakeCatalog(undefined, false);
  const startRadio = useCallback(async (seed: Track, relatedTracks: Track[], artistKeys: string[] = []) => {
    toast({ title: "Building your radio", description: "Finding related music from Nostr and Wavlake…" });
    const [nostrResult, wavlakeResult] = await Promise.allSettled([
      nostrTracks.refetch({ throwOnError: true }),
      wavlake.refetch({ throwOnError: true }),
    ]);
    const fetchedCandidates = [
      ...(nostrResult.status === "fulfilled" ? nostrResult.value.data ?? [] : []),
      ...(wavlakeResult.status === "fulfilled" ? wavlakeResult.value.data?.pages.flatMap(page => page.tracks) ?? [] : []),
      ...player.history.filter(track => track.kind === "music"),
    ];
    const station = buildRadioStation({ seed, candidates: fetchedCandidates, relatedTracks, artistKeys });
    player.playQueue(station, 0);
    if (nostrResult.status === "rejected" && wavlakeResult.status === "rejected") {
      toast({ title: "Radio started with this track only", description: "Track recommendations could not be loaded. Check your connection and try again." });
    } else {
      toast({ title: "Radio started", description: `${station.length} tracks · replaces your current queue` });
    }
  }, [nostrTracks.refetch, wavlake.refetch, player.history, player.playQueue, toast]);

  const startTrackRadio = useCallback((seed: Track) => {
    void startRadio(seed, []);
  }, [startRadio]);

  const startArtistRadio = useCallback((artistKey: string, artistTracks: Track[]) => {
    const tracks = artistTracks.filter(track => track.kind === "music");
    const seed = tracks[0];
    if (seed) void startRadio(seed, tracks, [artistKey]);
  }, [startRadio]);

  const value = useMemo(() => ({ startTrackRadio, startArtistRadio }), [startTrackRadio, startArtistRadio]);
  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}
