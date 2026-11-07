import { Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsFollowingArtist, useFollowArtistActions } from "@/hooks/useFollowedArtists";
import { useToast } from "@/hooks/useToast";

export function FollowButton({ pubkey, className }: { pubkey: string; className?: string }) {
  const { user } = useCurrentUser();
  const following = useIsFollowingArtist(pubkey);
  const { toggleFollow } = useFollowArtistActions();
  const { toast } = useToast();

  const handleClick = () => {
    if (!user) {
      toast({ title: "Log in to follow artists", variant: "destructive" });
      return;
    }
    toggleFollow.mutate(
      { pubkey, follow: !following },
      {
        onSuccess: () => toast({ title: following ? "Unfollowed" : "Following artist" }),
        onError: () => toast({ title: 'Could not update followed artists', description: 'Check your relay connections and try again.', variant: 'destructive' }),
      },
    );
  };

  return (
    <Button
      type="button"
      variant={following ? "secondary" : "outline"}
      onClick={handleClick}
      disabled={toggleFollow.isPending}
      aria-pressed={following}
      className={cn("rounded-full gap-2", className)}
    >
      {following ? (
        <>
          <Check className="size-4" /> Following
        </>
      ) : (
        <>
          <UserPlus className="size-4" /> Follow
        </>
      )}
    </Button>
  );
}
