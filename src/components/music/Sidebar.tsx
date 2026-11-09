import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Home, Search, Library, Plus, Heart, Music, Mic, Users, BookOpen } from "lucide-react";
import { useAudiobookLibrary } from "@/hooks/useAudiobookLibrary";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePlaylists } from "@/hooks/usePlaylists";
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";
import { usePodcastFavorites } from "@/hooks/usePodcasts";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/music", label: "Music", icon: Music },
  { to: "/podcasts", label: "Podcasts", icon: Mic },
  { to: "/audiobooks", label: "Audiobooks", icon: BookOpen },
  { to: "/friends", label: "Friends", icon: Users },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useCurrentUser();
  const { data: playlists, isLoading } = usePlaylists();
  const audiobookLibrary = useAudiobookLibrary();
  const podcastFavorites = usePodcastFavorites();
  const [createOpen, setCreateOpen] = useState(false);

  const liked = playlists?.find((p) => p.isLiked);
  const regular = (playlists ?? []).filter((p) => !p.isLiked);

  return (
    <nav className="flex flex-col h-full min-h-0 gap-2 w-64 overflow-hidden" aria-label="Primary">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-2">
        <div className="size-8 rounded-md bg-primary flex items-center justify-center">
          <Music className="size-5 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg tracking-tight">Ostrify</span>
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
              <NavLink
                to="/liked"
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 p-2 rounded-md hover:bg-accent/10 transition-colors",
                    isActive && "bg-accent/10",
                  )
                }
              >
                <div className="size-11 rounded-md bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shrink-0">
                  <Heart className="size-5 text-white fill-white" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">Liked Songs</div>
                  <div className="text-xs text-muted-foreground">
                    {liked ? `${liked.trackIds.length} songs` : "Playlist"}
                  </div>
                </div>
              </NavLink>

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
