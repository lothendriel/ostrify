import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { PlayerProvider } from "./components/PlayerProvider";
import { AppLayout } from "./components/music/AppLayout";
import { ListeningStatusSync } from "./components/music/ListeningStatusSync";

import Index from "./pages/Index";
import SearchPage from "./pages/SearchPage";
import CategoryPage from "./pages/CategoryPage";
import PlaylistPage from "./pages/PlaylistPage";
import LikedSongs from "./pages/LikedSongs";
import SettingsPage from "./pages/SettingsPage";
import PodcastsPage from "./pages/PodcastsPage";
import WavlakePage from "./pages/WavlakePage";
import MusicDiscovery from "./pages/MusicDiscovery";
import FollowedArtists from "./pages/FollowedArtists";
import FriendsPage from "./pages/FriendsPage";
import MyProfile from "./pages/MyProfile";
import AudiobooksPage from "./pages/AudiobooksPage";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <PlayerProvider>
        <ListeningStatusSync />
        <AppLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/category/:id" element={<CategoryPage />} />
            <Route path="/playlist/:id" element={<PlaylistPage />} />
            <Route path="/liked" element={<LikedSongs />} />
            <Route path="/podcasts" element={<PodcastsPage />} />
            <Route path="/audiobooks" element={<AudiobooksPage />} />
            <Route path="/audiobooks/:id" element={<AudiobooksPage />} />
            <Route path="/music" element={<MusicDiscovery />} />
            <Route path="/wavlake" element={<WavlakePage />} />
            <Route path="/wavlake/:type/:id" element={<WavlakePage />} />
            <Route path="/artists" element={<FollowedArtists />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/my-profile" element={<MyProfile />} />
            <Route path="/friends/:nip19" element={<FriendsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
            <Route path="/:nip19" element={<NIP19Page />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </PlayerProvider>
    </BrowserRouter>
  );
}
export default AppRouter;
