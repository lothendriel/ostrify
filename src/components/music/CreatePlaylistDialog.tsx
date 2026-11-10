import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { usePlaylistActions, type Playlist } from "@/hooks/usePlaylists";
import { useToast } from "@/hooks/useToast";

interface CreatePlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, edit this playlist instead of creating a new one. */
  editing?: Playlist;
}

export function CreatePlaylistDialog({ open, onOpenChange, editing }: CreatePlaylistDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const { createPlaylist, updatePlaylist } = usePlaylistActions();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setDescription(editing?.description ?? "");
      setImage(editing?.image ?? "");
    }
  }, [open, editing]);

  const isEditing = !!editing;
  const pending = createPlaylist.isPending || updatePlaylist.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (isEditing) {
      updatePlaylist.mutate(
        { id: editing.id, title: title.trim(), description: description.trim() || undefined, image: image.trim() || undefined },
        {
          onSuccess: () => {
            toast({ title: "Playlist updated" });
            onOpenChange(false);
          },
        },
      );
    } else {
      createPlaylist.mutate(
        { title: title.trim(), description: description.trim() || undefined, image: image.trim() || undefined },
        {
          onSuccess: (id) => {
            toast({ title: "Playlist created" });
            onOpenChange(false);
            navigate(`/playlist/${id}`);
          },
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit playlist" : "Create playlist"}</DialogTitle>
          <DialogDescription>
            Regular playlists are public on Nostr and appear in Public playlists on Nostr. Ostrify keeps the kind 30003 library copy and publishes a matching kind 34139 music playlist. Liked Songs stay a library-only list.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pl-title">Name</Label>
            <Input
              id="pl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Awesome Mix"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pl-desc">Description</Label>
            <Textarea
              id="pl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pl-image">Cover image URL</Label>
            <Input
              id="pl-image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://..."
              type="url"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? "Saving…" : isEditing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
