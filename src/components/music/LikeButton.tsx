import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { LIKED_SONGS_ID, useIsLiked, usePlaylistActions } from "@/hooks/usePlaylists";
import { TUNESTR_FAVORITES_IDENTIFIER } from "@/lib/musicPlaylists";
import { useToast } from "@/hooks/useToast";

interface LikeButtonProps {
  trackId: string;
  className?: string;
  size?: number;
  collection?: 'songs' | 'tunestr';
}

export function LikeButton({ trackId, className, size = 18, collection }: LikeButtonProps) {
  const { user } = useCurrentUser();
  const playlistId = collection === 'tunestr' || trackId.startsWith('30311:') ? TUNESTR_FAVORITES_IDENTIFIER : LIKED_SONGS_ID;
  const collectionTitle = playlistId === TUNESTR_FAVORITES_IDENTIFIER ? 'TuneStr Recordings' : 'Liked Songs';
  const liked = useIsLiked(trackId, playlistId);
  const { toggleLike } = usePlaylistActions();
  const { toast } = useToast();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast({ title: "Log in to like tracks", variant: "destructive" });
      return;
    }
    toggleLike.mutate({ trackId, liked: !liked, playlistId, title: collectionTitle }, { onSuccess: () => toast({ title: liked ? `Removed from ${collectionTitle}` : `Added to ${collectionTitle}` }), onError: error => toast({ title: 'Could not save your like', description: error.message, variant: 'destructive' }) });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={toggleLike.isPending}
      aria-label={liked ? `Remove from ${collectionTitle}` : `Add to ${collectionTitle}`}
      aria-pressed={liked}
      className={cn(
        "rounded-full hover:scale-110 transition-transform",
        liked ? "text-primary" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Heart style={{ width: size, height: size }} className={cn(liked && "fill-current")} />
    </Button>
  );
}
