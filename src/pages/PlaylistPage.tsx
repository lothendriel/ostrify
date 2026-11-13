import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { ArrowDownAZ, Music, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { usePlaylist, usePlaylistActions, rememberPlaylistDeletion, type Playlist } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useToast } from "@/hooks/useToast";
import { CollectionHeader } from "@/components/music/CollectionHeader";
import { TrackList } from "@/components/music/TrackList";
import { CreatePlaylistDialog } from "@/components/music/CreatePlaylistDialog";
import { useNavigate } from "react-router-dom";
import type { Track } from "@/lib/music";

type PlaylistSort = "original" | "title" | "artist";

const PlaylistPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: playlist, isLoading: playlistLoading } = usePlaylist(id);
  const { data, isLoading, isFetching, refetch } = useTracksByIds(playlist?.trackIds);
  const tracks = data?.tracks ?? [];
  const { removeFromPlaylist, reorderPlaylist } = usePlaylistActions();
  const { mutate: publish } = useNostrPublish();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sort, setSort] = useState<PlaylistSort>("original");
  const [filter, setFilter] = useState("");
  const sortedTracks = useMemo(() => {
    if (sort === "original") return tracks;
    return [...tracks].sort((left, right) => {
      const primary = sort === "title"
        ? left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true })
        : (left.artist ?? "").localeCompare(right.artist ?? "", undefined, { sensitivity: "base", numeric: true });
      return primary || left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true });
    });
  }, [sort, tracks]);
  const visibleTracks = useMemo(() => {
    const normalizedFilter = filter.trim().toLocaleLowerCase();
    if (!normalizedFilter) return sortedTracks;
    return sortedTracks.filter(track => `${track.title} ${track.artist ?? ""}`.toLocaleLowerCase().includes(normalizedFilter));
  }, [filter, sortedTracks]);

  useSeoMeta({ title: `${playlist?.title ?? "Playlist"} — Ostrify` });

  const handleRemove = (track: Track) => {
    if (!playlist) return;
    removeFromPlaylist.mutate(
      { playlistId: playlist.id, trackId: track.id },
      { onSuccess: () => toast({ title: "Removed from playlist" }) },
    );
  };

  const handleReorder = (orderedTracks: Track[]) => {
    if (!playlist || reorderPlaylist.isPending) return;
    const resolvedIds = new Set(tracks.map(track => track.id));
    const orderedResolvedIds = orderedTracks.map(track => track.id);
    const nextTrackIds: string[] = [];
    let resolvedIndex = 0;
    for (const id of playlist.trackIds) {
      if (resolvedIds.has(id)) {
        const nextId = orderedResolvedIds[resolvedIndex];
        if (nextId) nextTrackIds.push(nextId);
        resolvedIndex += 1;
      } else {
        nextTrackIds.push(id);
      }
    }
    if (nextTrackIds.length !== playlist.trackIds.length || nextTrackIds.every((id, index) => id === playlist.trackIds[index])) return;
    reorderPlaylist.mutate({ playlistId: playlist.id, trackIds: nextTrackIds }, {
      onSuccess: () => toast({ title: "Playlist order saved" }),
      onError: () => toast({ title: "Could not reorder playlist", description: "Check your relay connection and try again.", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!playlist) return;
    // NIP-09 deletion request for the NIP-51 bookmark set.
    publish(
      {
        kind: 5,
        content: "Deleted playlist",
        tags: [
          ["a", `30003:${playlist.event.pubkey}:${playlist.id}`],
          ["e", playlist.event.id],
        ],
      },
      {
        onSuccess: deletion => {
          rememberPlaylistDeletion(playlist.event.pubkey, playlist.id, deletion.created_at);
          void queryClient.setQueriesData<Playlist[]>(
            { queryKey: ["playlists"] },
            current => current?.filter(item => item.id !== playlist.id),
          );
          void queryClient.invalidateQueries({ queryKey: ["ostrify-public-playlists"] });
          void queryClient.invalidateQueries({ queryKey: ["playlists"] });
          toast({ title: "Playlist deleted" });
          navigate("/");
        },
        onError: () => toast({ title: "Playlist deletion failed", description: "The playlist is still in your library. Please try again.", variant: "destructive" }),
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
        tracks={sortedTracks}
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
        {tracks.length > 1 && <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={filter} onChange={event => setFilter(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setFilter(""); }} placeholder="Filter by title or artist" aria-label="Filter playlist tracks by title or artist" maxLength={120} className="h-9 pl-9 pr-9" />
              {filter && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-7 -translate-y-1/2" onClick={() => setFilter("")} aria-label="Clear playlist track filter"><X className="size-4" /></Button>}
            </div>
            <ArrowDownAZ className="size-4 text-muted-foreground" aria-hidden="true" />
            <Label htmlFor="playlist-sort" className="text-xs text-muted-foreground">Sort by</Label>
            <Select value={sort} onValueChange={value => setSort(value as PlaylistSort)}>
              <SelectTrigger id="playlist-sort" className="h-8 w-40" aria-label="Sort playlist tracks">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original order</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="artist">Artist</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(filter.trim() || sort !== "original") && <p className="text-xs text-muted-foreground">View only · saved playlist order is unchanged.</p>}
          {sort === "original" && !filter.trim() && playlist && !playlist.isLiked && <p className="text-xs text-muted-foreground">Drag rows or use the up/down controls to save a new playlist order.</p>}
        </div>}
        {!!data?.unavailable && <p role="status" className="mb-4 text-sm text-muted-foreground">{data.unavailable} saved track(s) could not be loaded right now. They remain in your playlist. <button type="button" className="text-primary underline disabled:opacity-50" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Retrying…' : 'Try again'}</button></p>}
        {filter.trim() && visibleTracks.length === 0 && !isLoading
          ? <div className="rounded-lg border border-dashed px-6 py-10 text-center">
              <p className="text-muted-foreground">No tracks match “{filter.trim()}”.</p>
              <Button type="button" variant="link" onClick={() => setFilter("")}>Clear filter</Button>
            </div>
          : <TrackList
              tracks={visibleTracks}
              isLoading={isLoading}
              onRemove={handleRemove}
              onReorder={sort === "original" && !filter.trim() && playlist && !playlist.isLiked ? handleReorder : undefined}
              emptyMessage={data?.unavailable ? "Your saved songs couldn't be loaded. Try again in a moment." : "This playlist is empty. Add songs from anywhere using the + menu."}
            />}
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
              Ostrify and from clients that honor deletions.
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
