import { useSeoMeta } from "@unhead/react";
import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthor } from "@/hooks/useAuthor";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { useWavlakeRelease } from "@/hooks/useWavlake";
import { genUserName, sanitizeUrl } from "@/lib/sanitize";
import { LoginArea } from "@/components/auth/LoginArea";
import { LibrarySyncStatus } from "@/components/music/CollectionHeader";

function ArtistTile({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const picture = sanitizeUrl(metadata?.picture);

  let npub = pubkey;
  try {
    npub = nip19.npubEncode(pubkey);
  } catch {
    // keep hex fallback
  }

  return (
    <Link
      to={`/artist/${npub}`}
      className="ostrify-audio-card group relative flex min-w-0 flex-col items-center rounded-xl p-4 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="ostrify-card-label">Artist</span>
      <Avatar className="size-28 max-w-full mb-3 shadow-lg">
        <AvatarImage src={picture} alt={name} className="object-cover" />
        <AvatarFallback className="text-2xl">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="font-semibold truncate w-full">{name}</div>
      <div className="text-xs text-muted-foreground mt-0.5">Artist</div>
    </Link>
  );
}

function WavlakeArtistTile({ artistId }: { artistId: string }) {
  const { data, isLoading, isError } = useWavlakeRelease('artist', artistId);
  const name = data?.title ?? (isLoading ? 'Loading artist…' : 'Wavlake artist unavailable');
  return <Link to={`/wavlake/artist/${artistId}`} className="ostrify-audio-card group relative flex min-w-0 flex-col items-center rounded-xl p-4 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <span className="ostrify-card-label">Artist</span><Avatar className="size-28 max-w-full mb-3 shadow-lg"><AvatarImage src={sanitizeUrl(data?.image)} alt="" /><AvatarFallback className="text-2xl">{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
    <div className="font-semibold truncate w-full">{name}</div><div className="text-xs text-muted-foreground mt-0.5">{isError ? 'Unavailable · Wavlake' : 'Wavlake artist'}</div>
  </Link>;
}

const FollowedArtists = () => {
  useSeoMeta({ title: "Followed Artists — Ostrify" });
  const { user } = useCurrentUser();
  const { data: artists = [], isLoading, isFetching, isError, isPartial, hasReadRelays, refetch } = useFollowedArtists();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 py-24 px-6">
        <Users className="size-12 text-primary" />
        <h1 className="text-2xl font-bold">Follow your favorite artists</h1>
        <p className="text-muted-foreground max-w-sm">
          Log in with Nostr, then tap Follow on any artist to save them in your public Ostrify library.
        </p>
        <LoginArea className="max-w-60" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Followed Artists</h1>
      <LibrarySyncStatus name="Your followed artists" hasReadRelays={hasReadRelays} isFetching={isFetching} isError={isError} isPartial={isPartial} onRetry={() => void refetch()} />

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center p-4 gap-3">
              <Skeleton className="size-28 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : artists.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-16 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto">
            {isPartial ? 'No followed artists were found in the responses received so far.' : "You're not following any artists yet. Open an artist's page and tap Follow."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {artists.map((ref) => ref.startsWith('wavlake:') ? (
            <WavlakeArtistTile key={ref} artistId={ref.slice(8)} />
          ) : (
            <ArtistTile key={ref} pubkey={ref} />
          ))}
        </div>
      )}
    </div>
  );
};

export default FollowedArtists;
