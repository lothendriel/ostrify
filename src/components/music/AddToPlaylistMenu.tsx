import { ListPlus, Plus, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePlaylists, usePlaylistActions } from "@/hooks/usePlaylists";
import { useToast } from "@/hooks/useToast";

interface AddToPlaylistMenuProps {
  trackId: string;
  trigger?: React.ReactNode;
  onCreateNew?: () => void;
}

export function AddToPlaylistMenu({ trackId, trigger, onCreateNew }: AddToPlaylistMenuProps) {
  const { user } = useCurrentUser();
  const { data: playlists } = usePlaylists();
  const { addToPlaylist } = usePlaylistActions();
  const { toast } = useToast();

  if (!user) return null;

  const regular = (playlists ?? []).filter((p) => !p.isLiked);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Add to playlist"
          >
            <ListPlus className="size-[18px]" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Add to playlist</DropdownMenuLabel>
        {onCreateNew && (
          <>
            <DropdownMenuItem onSelect={() => onCreateNew()}>
              <Plus className="size-4" /> New playlist
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {regular.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">No playlists yet</div>
        ) : (
          regular.map((p) => {
            const has = p.trackIds.includes(trackId);
            return (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => {
                  if (has) return;
                  addToPlaylist.mutate(
                    { playlistId: p.id, trackId },
                    { onSuccess: () => toast({ title: `Added to ${p.title}` }) },
                  );
                }}
              >
                <span className="truncate flex-1">{p.title}</span>
                {has && <Check className={cn("size-4 text-primary")} />}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
