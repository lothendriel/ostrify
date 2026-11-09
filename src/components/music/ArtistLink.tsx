import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { cn } from "@/lib/utils";
import { useAuthor } from "@/hooks/useAuthor";
import { genUserName } from "@/lib/sanitize";

interface ArtistLinkProps {
  pubkey: string;
  artistId?: string;
  artistPubkey?: string;
  /** A name in event metadata can describe someone other than the publisher. */
  isUnverifiedArtist?: boolean;
  /** Preferred display name (e.g. the track's `artist` tag). */
  fallbackName?: string;
  className?: string;
  /** Stop click from bubbling to a parent row/card handler. */
  stopPropagation?: boolean;
}

/** A clickable artist name that navigates to the artist's page. */
export function ArtistLink({ pubkey, artistId, artistPubkey, fallbackName, isUnverifiedArtist, className, stopPropagation = true }: ArtistLinkProps) {
  const artistAuthor = useAuthor(artistPubkey);
  const author = useAuthor(fallbackName || artistId ? undefined : pubkey || undefined);
  const name =
    artistAuthor.data?.metadata?.display_name ||
    artistAuthor.data?.metadata?.name ||
    fallbackName ||
    author.data?.metadata?.name ||
    author.data?.metadata?.display_name ||
    genUserName(pubkey);

  if (artistId) {
    return <Link to={`/wavlake/artist/${artistId}`} onClick={(e) => { if (stopPropagation) e.stopPropagation(); }} className={cn("hover:underline hover:text-foreground focus-visible:underline", className)}>{name}</Link>;
  }
  if (artistPubkey) {
    try {
      const artist = nip19.npubEncode(artistPubkey);
      const publisher = pubkey && pubkey !== artistPubkey && isUnverifiedArtist ? nip19.npubEncode(pubkey) : undefined;
      return <span className={className}><Link to={`/artist/${artist}`} onClick={(e) => { if (stopPropagation) e.stopPropagation(); }} className="hover:underline hover:text-foreground focus-visible:underline" title="Open the identified artist’s page">{name}</Link>{publisher && <> <Link to={`/artist/${publisher}`} onClick={(e) => { if (stopPropagation) e.stopPropagation(); }} className="text-xs hover:underline" title="View tracks published by this account">· Publisher</Link></>}</span>;
    } catch {
      return <span className={className}>{name}</span>;
    }
  }
  if (!pubkey) return <span className={className}>{fallbackName || 'Unknown artist'}</span>;
  if (isUnverifiedArtist) {
    try {
      const publisher = nip19.npubEncode(pubkey);
      return <span className={className}>{name} <Link to={`/artist/${publisher}`} onClick={(e) => { if (stopPropagation) e.stopPropagation(); }} className="text-xs hover:underline" title="View tracks published by this account">· Publisher</Link></span>;
    } catch {
      return <span className={className}>{name}</span>;
    }
  }

  let npub: string;
  try {
    npub = nip19.npubEncode(pubkey);
  } catch {
    return <span className={className}>{name}</span>;
  }

  return (
    <Link
      to={`/artist/${npub}`}
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
