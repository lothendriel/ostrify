import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { cn } from "@/lib/utils";
import { useAuthor } from "@/hooks/useAuthor";
import { genUserName } from "@/lib/sanitize";

interface ArtistLinkProps {
  pubkey: string;
  artistId?: string;
  /** Preferred display name (e.g. the track's `artist` tag). */
  fallbackName?: string;
  className?: string;
  /** Stop click from bubbling to a parent row/card handler. */
  stopPropagation?: boolean;
}

/** A clickable artist name that navigates to the artist's page. */
export function ArtistLink({ pubkey, artistId, fallbackName, className, stopPropagation = true }: ArtistLinkProps) {
  const author = useAuthor(pubkey || undefined);
  const name =
    fallbackName ||
    author.data?.metadata?.name ||
    author.data?.metadata?.display_name ||
    genUserName(pubkey);

  if (artistId) {
    return <Link to={`/wavlake/artist/${artistId}`} onClick={(e) => { if (stopPropagation) e.stopPropagation(); }} className={cn("hover:underline hover:text-foreground focus-visible:underline", className)}>{name}</Link>;
  }
  if (!pubkey) return <span className={className}>{fallbackName || 'Unknown artist'}</span>;

  let npub: string;
  try {
    npub = nip19.npubEncode(pubkey);
  } catch {
    return <span className={className}>{name}</span>;
  }

  return (
    <Link
      to={`/${npub}`}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
      }}
      className={cn("hover:underline hover:text-foreground focus-visible:underline outline-none", className)}
      title={name}
    >
      {name}
    </Link>
  );
}
