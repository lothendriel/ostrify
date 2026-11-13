import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Search, Library, Plus, Heart, Music, Mic, Users, BookOpen, BarChart3, Play, Pause } from "lucide-react";
import { useAudiobookLibrary } from "@/hooks/useAudiobookLibrary";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePlaylists } from "@/hooks/usePlaylists";
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";
import { usePodcastFavorites } from "@/hooks/usePodcasts";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { usePlayer } from "@/hooks/usePlayer";
import { useToast } from "@/hooks/useToast";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/music", label: "Music", icon: Music },
  { to: "/podcasts", label: "Podcasts", icon: Mic },
  { to: "/audiobooks", label: "Audiobooks", icon: BookOpen },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useCurrentUser();
  const { data: playlists, isLoading } = usePlaylists();
  const audiobookLibrary = useAudiobookLibrary();
  const podcastFavorites = usePodcastFavorites();
  const [createOpen, setCreateOpen] = useState(false);
  const location = useLocation();
  const player = usePlayer();
  const { toast } = useToast();

  const liked = playlists?.find((p) => p.isLiked);
  const { data: likedTracks, isLoading: likedTracksLoading } = useTracksByIds(liked?.trackIds);
  const regular = (playlists ?? []).filter((p) => !p.isLiked);
  const likedTrackList = likedTracks?.tracks ?? [];
  const isLikedSongsQueue = player.queue.length === likedTrackList.length && player.queue.every((track, index) => track.id === likedTrackList[index]?.id);
  const isLikedSongsPlaying = location.pathname === "/liked" && isLikedSongsQueue && player.isPlaying;
  const handleLikedSongsPlay = () => {
    if (isLoading || likedTracksLoading) return;
    if (!likedTrackList.length) {
      toast({ title: "No playable liked songs", description: "Like some music or check your relay connections." });
      return;
    }
    if (isLikedSongsQueue) {
      player.togglePlay();
    } else {
      player.playQueue(likedTrackList);
    }
    onNavigate?.();
  };

  return (
    <nav className="flex flex-col h-full min-h-0 gap-2 w-64 overflow-hidden" aria-label="Primary">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-2">
        <img src="/ostrify-logo.png" alt="" className="size-10 rounded-md object-contain" />
        <span className="font-bold text-xl tracking-tight">Ostrify</span>
      </div>

      {/* Main nav */}
      <div className="bg-card rounded-lg mx-2 py-2">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-4 px-5 py-2.5 font-semibold text-sm transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <Icon className="size-6" />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Library */}
      <div className="bg-card rounded-lg mx-2 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-muted-foreground font-semibold text-sm">
            <Library className="size-6" />
            Your Library
          </div>
          {user && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setCreateOpen(true)}
              aria-label="Create playlist"
            >
              <Plus className="size-5" />
            </Button>
          )}
        </div>

        <ScrollArea type="always" className="flex-1 min-h-0 px-2 pb-2">
          {!user ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Log in to create playlists and like songs.
            </p>
          ) : (
            <div className="space-y-1">
              {/* Liked songs pinned */}
              <div className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent/10">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="group size-11 shrink-0 rounded-md bg-gradient-to-br from-violet-500 to-primary text-white hover:brightness-110 hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={handleLikedSongsPlay}
                  disabled={isLoading || likedTracksLoading}
                  aria-label={isLikedSongsPlaying ? "Pause Liked Songs" : "Play Liked Songs"}
                  title={isLikedSongsPlaying ? "Pause Liked Songs" : "Play Liked Songs"}
                >
                  {isLikedSongsPlaying
                    ? <Pause className="size-5 fill-current" />
                    : <><Heart className="size-5 fill-white group-hover:hidden" /><Play className="hidden size-5 fill-current group-hover:block" /></>}
                </Button>
                <NavLink
                  to="/liked"
                  onClick={onNavigate}
                  className={({ isActive }) => cn("min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isActive && "text-primary")}
                >
                  <div className="truncate text-sm font-medium">Liked Songs</div>
                  <div className="text-xs text-muted-foreground">
                    {liked ? `${liked.trackIds.length} songs` : "Playlist"}
                  </div>
                </NavLink>
              </div>

              <NavLink
                to="/audiobook-library"
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 p-2 rounded-md hover:bg-accent/10 transition-colors",
                  isActive && "bg-accent/10",
                )}
              >
                <div className="size-11 rounded-md bg-gradient-to-br from-rose-500 to-violet-700 flex items-center justify-center shrink-0">
                  <BookOpen className="size-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">Saved Audiobooks</div>
                  <div className="text-xs text-muted-foreground">{`${audiobookLibrary.favoriteBooks.length} favorites · ${audiobookLibrary.collections.length} collections`}</div>
                </div>
              </NavLink>

              <NavLink to="/podcast-library" onClick={onNavigate} className={({ isActive }) => cn("flex items-center gap-3 p-2 rounded-md hover:bg-accent/10 transition-colors", isActive && "bg-accent/10")}>
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-600 to-purple-700"><Mic className="size-5 text-white" /></div>
                <div className="min-w-0"><div className="truncate text-sm font-medium">Saved Podcasts</div><div className="text-xs text-muted-foreground">{podcastFavorites.data.filter(item => !item.episode).length} shows · {podcastFavorites.data.filter(item => item.episode).length} episodes</div></div>
              </NavLink>

              {/* Followed Artists pinned */}
              <NavLink
                to="/artists"
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 p-2 rounded-md hover:bg-accent/10 transition-colors",
                    isActive && "bg-accent/10",
                  )
                }
              >
                <div className="size-11 rounded-md bg-gradient-to-br from-sky-500 to-primary flex items-center justify-center shrink-0">
                  <Users className="size-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">Followed Artists</div>
                  <div className="text-xs text-muted-foreground">Artists</div>
                </div>
              </NavLink>

              {isLoading && (
                <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>
              )}

              {regular.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/playlist/${p.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 p-2 rounded-md hover:bg-accent/10 transition-colors",
                      isActive && "bg-accent/10",
                    )
                  }
                >
                  <div className="size-11 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                    {p.image ? (
                      <img src={p.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Music className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{p.title}</div>
                    <div className="text-xs text-muted-foreground">{p.trackIds.length} songs</div>
                  </div>
                </NavLink>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <a
        href="https://shakespeare.diy"
        target="_blank"
        rel="noreferrer"
        className="px-5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Vibed with Shakespeare
      </a>

      <CreatePlaylistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </nav>
  );
}
