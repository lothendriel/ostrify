import { useSeoMeta } from "@unhead/react";
import { Heart } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePlaylist } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { LIKED_SONGS_ID } from "@/hooks/usePlaylists";
import { CollectionHeader } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { LoginArea } from "@/components/auth/LoginArea";

const LikedSongs = () => {
  useSeoMeta({ title: "Liked Songs — Ostrify" });
  const { user } = useCurrentUser();
  const { data: playlist } = usePlaylist(LIKED_SONGS_ID);
  const { data, isLoading, isFetching, refetch } = useTracksByIds(playlist?.trackIds);
  const tracks = data?.tracks ?? [];

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 py-24 px-6">
        <Heart className="size-12 text-primary" />
        <h1 className="text-2xl font-bold">Your Liked Songs live here</h1>
        <p className="text-muted-foreground max-w-sm">
          Log in with Nostr to save tracks to your public library across devices.
        </p>
        <LoginArea className="max-w-60" />
      </div>
    );
  }

  return (
    <div>
      <CollectionHeader
        subtitle="Playlist"
        title="Liked Songs"
        description="Your favorite tracks on Nostr"
        gradient="linear-gradient(to bottom, hsl(262 60% 35%), transparent)"
        icon={<Heart className="size-16 text-white fill-white" />}
        tracks={tracks}
      />
      <div className="px-3 sm:px-6">
        {!!data?.unavailable && <p role="status" className="mb-4 text-sm text-muted-foreground">{data.unavailable} saved track(s) could not be loaded right now. They remain in your library. <button type="button" className="text-primary underline disabled:opacity-50" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Retrying…' : 'Try again'}</button></p>}
        <TrackList
          tracks={tracks}
          isLoading={isLoading}
          emptyMessage={data?.unavailable ? "Your saved songs couldn't be loaded. Try again in a moment." : "Songs you like will show up here. Tap the heart on any track."}
        />
      </div>
    </div>
  );
};

export default LikedSongs;
