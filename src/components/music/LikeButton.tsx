import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsLiked, usePlaylistActions } from "@/hooks/usePlaylists";
import { useToast } from "@/hooks/useToast";

interface LikeButtonProps {
  trackId: string;
  className?: string;
  size?: number;
}

export function LikeButton({ trackId, className, size = 18 }: LikeButtonProps) {
  const { user } = useCurrentUser();
  const liked = useIsLiked(trackId);
  const { toggleLike } = usePlaylistActions();
  const { toast } = useToast();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast({ title: "Log in to like tracks", variant: "destructive" });
      return;
    }
    toggleLike.mutate({ trackId, liked: !liked });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={toggleLike.isPending}
      aria-label={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
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
