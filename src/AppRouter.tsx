import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { NavigationHistoryProvider } from "./components/NavigationHistory";
import { PlayerProvider } from "./components/PlayerProvider";
import { RadioProvider } from "./components/RadioProvider";
import { AppLayout } from "./components/music/AppLayout";
import { ListeningStatusSync } from "./components/music/ListeningStatusSync";
import { TunestrPlayerProvider } from "./components/music/TunestrPlayer";

const Index = lazy(() => import("./pages/Index"));
const MusicNewsPage = lazy(() => import("./pages/MusicNewsPage"));
const LocalRadioPage = lazy(() => import("./pages/LocalRadioPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const PlaylistPage = lazy(() => import("./pages/PlaylistPage"));
const PublicMusicPlaylistPage = lazy(() => import("./pages/PublicMusicPlaylistPage"));
const LikedSongs = lazy(() => import("./pages/LikedSongs"));
const TunestrLibraryPage = lazy(() => import("./pages/TunestrLibraryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const PodcastsPage = lazy(() => import("./pages/PodcastsPage"));
const CombinedPodcastEpisodesPage = lazy(() => import("./pages/PodcastsPage").then(module => ({ default: module.CombinedPodcastEpisodesPage })));
const FountainBrowsePage = lazy(() => import("./pages/PodcastsPage").then(module => ({ default: module.FountainBrowsePage })));
const PodcastBrowsePage = lazy(() => import("./pages/PodcastsPage").then(module => ({ default: module.PodcastBrowsePage })));
const FountainShowPage = lazy(() => import("./pages/FountainShowPage"));
const SavedPodcastsPage = lazy(() => import("./pages/SavedPodcastsPage"));
const SavedAlbumsPage = lazy(() => import("./pages/SavedAlbumsPage"));
const WavlakePage = lazy(() => import("./pages/WavlakePage"));
const RankedReleasesPage = lazy(() => import("./pages/WavlakePage").then(module => ({ default: module.RankedReleasesPage })));
const MusicDiscovery = lazy(() => import("./pages/MusicDiscovery"));
const NostrCollectionsPage = lazy(() => import("./components/music/NostrCollections").then(module => ({ default: module.NostrCollectionsPage })));
const CategoryCollectionsPage = lazy(() => import("./components/music/NostrCollections").then(module => ({ default: module.CategoryCollectionsPage })));
const PublicMusicPlaylists = lazy(() => import("./components/music/PublicMusicPlaylists").then(module => ({ default: module.PublicMusicPlaylists })));
const FollowedArtists = lazy(() => import("./pages/FollowedArtists"));
const FriendsPage = lazy(() => import("./pages/FriendsPage"));
const MyProfile = lazy(() => import("./pages/MyProfile"));
const MyUploadsManager = lazy(() => import("./components/music/MyUploadsManager").then(module => ({ default: module.MyUploadsManager })));
const AudiobooksPage = lazy(() => import("./pages/AudiobooksPage"));
const AudiobookLibraryPage = lazy(() => import("./pages/AudiobookLibraryPage"));
const NIP19Page = lazy(() => import("./pages/NIP19Page").then(module => ({ default: module.NIP19Page })));
const ArtistPage = lazy(() => import("./pages/ArtistPage").then(module => ({ default: module.ArtistPage })));
const ArtistAlbumPage = lazy(() => import("./pages/ArtistAlbumPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ListenPage = lazy(() => import("./pages/ListenPage"));
const AudioDetailPage = lazy(() => import("./pages/AudioDetailPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <PlayerProvider>
        <RadioProvider>
          <TunestrPlayerProvider>
            <ListeningStatusSync />
            <NavigationHistoryProvider>
              <AppLayout>
                <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground">Loading page…</div>}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/audio" element={<AudioDetailPage />} />
                    <Route path="/listen" element={<ListenPage />} />
                    <Route path="/music-news" element={<MusicNewsPage />} />
                    <Route path="/radio" element={<LocalRadioPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/category/:id" element={<CategoryPage />} />
                    <Route path="/category/:id/publishers" element={<CategoryCollectionsPage type="publishers" />} />
                    <Route path="/category/:id/albums" element={<CategoryCollectionsPage type="albums" />} />
                    <Route path="/playlist/:id" element={<PlaylistPage />} />
                    <Route path="/ostrify-playlist/:pubkey" element={<PublicMusicPlaylistPage />} />
                    <Route path="/liked" element={<LikedSongs />} />
                    <Route path="/tunestr-library" element={<TunestrLibraryPage />} />
                    <Route path="/podcasts" element={<PodcastsPage />} />
                    <Route path="/podcasts/episodes" element={<CombinedPodcastEpisodesPage />} />
                    <Route path="/podcasts/fountain/shows" element={<FountainBrowsePage type="shows" />} />
                    <Route path="/podcasts/fountain/episodes" element={<FountainBrowsePage type="episodes" />} />
                    <Route path="/podcasts/nostr/shows" element={<PodcastBrowsePage type="shows" />} />
                    <Route path="/podcasts/nostr/episodes" element={<PodcastBrowsePage type="episodes" />} />
                    <Route path="/podcasts/fountain/:feedGuid" element={<FountainShowPage />} />
                    <Route path="/podcast-library" element={<SavedPodcastsPage />} />
                    <Route path="/saved-albums" element={<SavedAlbumsPage />} />
                    <Route path="/audiobook-library" element={<AudiobookLibraryPage />} />
                    <Route path="/audiobook-library/:id" element={<AudiobookLibraryPage />} />
                    <Route path="/audiobooks" element={<AudiobooksPage />} />
                    <Route path="/audiobooks/gutenberg/:id" element={<AudiobooksPage />} />
                    <Route path="/audiobooks/:id" element={<AudiobooksPage />} />
                    <Route path="/music" element={<MusicDiscovery />} />
                    <Route path="/music/publishers" element={<NostrCollectionsPage type="publishers" />} />
                    <Route path="/music/albums" element={<NostrCollectionsPage type="albums" />} />
                    <Route path="/music/playlists" element={<PublicMusicPlaylists paginatedPage />} />
                    <Route path="/wavlake" element={<MusicDiscovery />} />
                    <Route path="/wavlake/top-artists" element={<RankedReleasesPage type="artist" />} />
                    <Route path="/wavlake/top-albums" element={<RankedReleasesPage type="album" />} />
                    <Route path="/wavlake/:type/:id" element={<WavlakePage />} />
                    <Route path="/artists" element={<FollowedArtists />} />
                    <Route path="/friends" element={<FriendsPage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/my-profile" element={<MyProfile />} />
                    <Route path="/my-uploads" element={<MyUploadsManager />} />
                    <Route path="/artist/:nip19/album" element={<ArtistAlbumPage />} />
                    <Route path="/artist/:nip19" element={<ArtistPage />} />
                    <Route path="/friends/:nip19" element={<FriendsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
                    <Route path="/:nip19" element={<NIP19Page />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </AppLayout>
            </NavigationHistoryProvider>
          </TunestrPlayerProvider>
        </RadioProvider>
      </PlayerProvider>
    </BrowserRouter>
  );
}
export default AppRouter;
