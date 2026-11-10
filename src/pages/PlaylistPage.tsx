import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { Music, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePlaylist, usePlaylistActions, LIKED_SONGS_ID } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useToast } from "@/hooks/useToast";
import { CollectionHeader } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { CreatePlaylistDialog } from "@/components/music/CreatePlaylistDialog";
import { useNavigate } from "react-router-dom";
import type { Track } from "@/lib/music";

const PlaylistPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: playlist, isLoading: playlistLoading } = usePlaylist(id);
  const { data, isLoading, isFetching, refetch } = useTracksByIds(playlist?.trackIds);
  const tracks = data?.tracks ?? [];
  const { removeFromPlaylist } = usePlaylistActions();
  const { mutate: publish } = useNostrPublish();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useSeoMeta({ title: `${playlist?.title ?? "Playlist"} — Ostrify` });

  const handleRemove = (track: Track) => {
    if (!playlist) return;
    removeFromPlaylist.mutate(
      { playlistId: playlist.id, trackId: track.id },
      { onSuccess: () => toast({ title: "Removed from playlist" }) },
    );
  };

  const handleDelete = () => {
    if (!playlist) return;
    // NIP-09 deletion request for the personal bookmark set and public playlist counterpart.
    publish(
      {
        kind: 5,
        content: "Deleted playlist",
        tags: [
          ["a", `30003:${playlist.event.pubkey}:${playlist.id}`],
          ["e", playlist.event.id],
          ...(playlist.id !== LIKED_SONGS_ID ? [["a", `34139:${playlist.event.pubkey}:${playlist.id}`], ["d", playlist.id]] : []),
        ],
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ["public-music-playlists"] });
          void queryClient.invalidateQueries({ queryKey: ["playlists"] });
          toast({ title: "Playlist deleted" });
          navigate("/");
        },
      },
    );
  };

  if (!playlistLoading && !playlist) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground">Playlist not found.</p>
      </div>
    );
  }

  return (
    <div>
      <CollectionHeader
        subtitle="Playlist"
        title={playlist?.title ?? "Playlist"}
        description={playlist?.description}
        image={playlist?.image}
        icon={<Music className="size-16 text-white/70" />}
        gradient="linear-gradient(to bottom, hsl(141 40% 28%), transparent)"
        tracks={tracks}
        actions={
          playlist && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setEditOpen(true)}
                aria-label="Edit playlist"
              >
                <Pencil className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete playlist"
              >
                <Trash2 className="size-5" />
              </Button>
            </>
          )
        }
      />
      <div className="px-3 sm:px-6">
        {!!data?.unavailable && <p role="status" className="mb-4 text-sm text-muted-foreground">{data.unavailable} saved track(s) could not be loaded right now. They remain in your playlist. <button type="button" className="text-primary underline disabled:opacity-50" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Retrying…' : 'Try again'}</button></p>}
        <TrackList
          tracks={tracks}
          isLoading={isLoading}
          onRemove={handleRemove}
          emptyMessage={data?.unavailable ? "Your saved songs couldn't be loaded. Try again in a moment." : "This playlist is empty. Add songs from anywhere using the + menu."}
        />
      </div>

      {playlist && (
        <CreatePlaylistDialog open={editOpen} onOpenChange={setEditOpen} editing={playlist} />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a deletion request to the network. The playlist will be removed from
              clients that honor deletions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PlaylistPage;
