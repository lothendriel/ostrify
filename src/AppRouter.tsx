import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { NavigationHistoryProvider } from "./components/NavigationHistory";
import { PlayerProvider } from "./components/PlayerProvider";
import { RadioProvider } from "./components/RadioProvider";
import { AppLayout } from "./components/music/AppLayout";
import { ListeningStatusSync } from "./components/music/ListeningStatusSync";

import Index from "./pages/Index";
import MusicNewsPage from "./pages/MusicNewsPage";
import SearchPage from "./pages/SearchPage";
import CategoryPage from "./pages/CategoryPage";
import PlaylistPage from "./pages/PlaylistPage";
import PublicMusicPlaylistPage from "./pages/PublicMusicPlaylistPage";
import LikedSongs from "./pages/LikedSongs";
import SettingsPage from "./pages/SettingsPage";
import PodcastsPage, { FountainBrowsePage, PodcastBrowsePage } from "./pages/PodcastsPage";
import FountainShowPage from "./pages/FountainShowPage";
import SavedPodcastsPage from "./pages/SavedPodcastsPage";
import WavlakePage, { RankedReleasesPage } from "./pages/WavlakePage";
import MusicDiscovery from "./pages/MusicDiscovery";
import { NostrCollectionsPage } from "./components/music/NostrCollections";
import { PublicMusicPlaylists } from "./components/music/PublicMusicPlaylists";
import FollowedArtists from "./pages/FollowedArtists";
import FriendsPage from "./pages/FriendsPage";
import MyProfile from "./pages/MyProfile";
import AudiobooksPage from "./pages/AudiobooksPage";
import AudiobookLibraryPage from "./pages/AudiobookLibraryPage";
import { NIP19Page } from "./pages/NIP19Page";
import { ArtistPage } from "./pages/ArtistPage";
import NotFound from "./pages/NotFound";
import ListenPage from "./pages/ListenPage";
import AnalyticsPage from "./pages/AnalyticsPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <PlayerProvider>
        <RadioProvider>
          <ListeningStatusSync />
          <NavigationHistoryProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/listen" element={<ListenPage />} />
                <Route path="/music-news" element={<MusicNewsPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/category/:id" element={<CategoryPage />} />
                <Route path="/playlist/:id" element={<PlaylistPage />} />
                <Route path="/ostrify-playlist/:pubkey" element={<PublicMusicPlaylistPage />} />
                <Route path="/liked" element={<LikedSongs />} />
                <Route path="/podcasts" element={<PodcastsPage />} />
                <Route path="/podcasts/fountain/shows" element={<FountainBrowsePage type="shows" />} />
                <Route path="/podcasts/fountain/episodes" element={<FountainBrowsePage type="episodes" />} />
                <Route path="/podcasts/nostr/shows" element={<PodcastBrowsePage type="shows" />} />
                <Route path="/podcasts/nostr/episodes" element={<PodcastBrowsePage type="episodes" />} />
                <Route path="/podcasts/fountain/:feedGuid" element={<FountainShowPage />} />
                <Route path="/podcast-library" element={<SavedPodcastsPage />} />
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
                <Route path="/artist/:nip19" element={<ArtistPage />} />
                <Route path="/friends/:nip19" element={<FriendsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
                <Route path="/:nip19" element={<NIP19Page />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          </NavigationHistoryProvider>
        </RadioProvider>
      </PlayerProvider>
    </BrowserRouter>
  );
}
export default AppRouter;
