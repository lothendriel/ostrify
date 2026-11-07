import { useMemo } from "react";
import { useSeoMeta } from "@unhead/react";
import { Play, Pause, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthor } from "@/hooks/useAuthor";
import { usePlayer } from "@/hooks/usePlayer";
import { useArtistTracks, groupIntoAlbums } from "@/hooks/useArtistTracks";
import { genUserName, sanitizeUrl } from "@/lib/sanitize";
import { TrackCard } from "@/components/music/TrackCard";
import { TrackList } from "@/components/music/TrackList";
import { FollowButton } from "@/components/music/FollowButton";

export function ArtistPage({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const { data: tracks = [], isLoading } = useArtistTracks(pubkey);
  const player = usePlayer();

  const metadata = author.data?.metadata;
  const name = metadata?.name || metadata?.display_name || genUserName(pubkey);
  const banner = sanitizeUrl(metadata?.banner);
  const picture = sanitizeUrl(metadata?.picture);
  const verified = !!metadata?.nip05;

  useSeoMeta({ title: `${name} — Ostrify` });

  const { albums, singles } = useMemo(() => groupIntoAlbums(tracks), [tracks]);

  const isThisPlaying =
    player.isPlaying && tracks.some((t) => t.id === player.current?.id);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    if (tracks.some((t) => t.id === player.current?.id)) {
      player.togglePlay();
    } else {
      player.playQueue(tracks, 0);
    }
  };

  return (
    <div>
      {/* Hero header */}
      <div className="relative isolate">
        {banner && (
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <img src={banner} alt="" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-transparent" />
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 p-6 pt-12 sm:pt-20">
          <Avatar className="size-32 sm:size-40 shadow-2xl ring-4 ring-background/20">
            <AvatarImage src={picture} alt={name} className="object-cover" />
            <AvatarFallback className="text-4xl">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="text-center sm:text-left min-w-0">
            <div className="flex items-center gap-1.5 justify-center sm:justify-start text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {verified && <BadgeCheck className="size-4 text-primary" />}
              Artist
            </div>
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight break-words my-2">
              {name}
            </h1>
            {metadata?.about && (
              <p className="text-muted-foreground line-clamp-2 max-w-xl">{metadata.about}</p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              {isLoading ? "Loading…" : `${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </div>

      {/* Play all */}
      <div className="flex items-center gap-4 px-6 py-4">
        <Button
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
          size="icon"
          className={cn(
            "size-14 rounded-full bg-primary text-primary-foreground shadow-xl",
            "hover:scale-105 transition-transform disabled:opacity-40",
          )}
          aria-label={isThisPlaying ? "Pause" : "Play all"}
        >
          {isThisPlaying ? (
            <Pause className="size-7 fill-current" />
          ) : (
            <Play className="size-7 fill-current ml-0.5" />
          )}
        </Button>
        <FollowButton pubkey={pubkey} />
      </div>

      <div className="px-3 sm:px-6 space-y-8 pb-4">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 space-y-3">
                <Skeleton className="w-full aspect-square rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-16 px-8 text-center">
            <p className="text-muted-foreground max-w-sm mx-auto">
              No music found for this artist yet. They may publish from relays Ostrify isn't
              reading from — try adding more relays in Settings.
            </p>
          </div>
        ) : (
          <>
            {/* Albums */}
            {albums.map((album) => (
              <section key={album.title} className="space-y-3">
                <h2 className="text-2xl font-bold tracking-tight">{album.title}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {album.tracks.map((track) => (
                    <TrackCard key={track.id} track={track} queue={album.tracks} />
                  ))}
                </div>
              </section>
            ))}

            {/* Singles / loose tracks */}
            {singles.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-2xl font-bold tracking-tight">
                  {albums.length > 0 ? "Songs" : "All tracks"}
                </h2>
                <TrackList tracks={singles} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
