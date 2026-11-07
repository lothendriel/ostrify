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
  const { data: tracks = [], isLoading } = useTracksByIds(playlist?.trackIds);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 py-24 px-6">
        <Heart className="size-12 text-primary" />
        <h1 className="text-2xl font-bold">Your Liked Songs live here</h1>
        <p className="text-muted-foreground max-w-sm">
          Log in with Nostr to like tracks and have them follow you across every client.
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
        <TrackList
          tracks={tracks}
          isLoading={isLoading}
          emptyMessage="Songs you like will show up here. Tap the heart on any track."
        />
      </div>
    </div>
  );
};

export default LikedSongs;
