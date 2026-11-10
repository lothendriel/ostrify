import { nip19 } from 'nostr-tools';
import { usePublicMusicPlaylists } from '@/hooks/usePublicMusicPlaylists';

export function usePublicMusicPlaylist(identifier: string | undefined, id: string | undefined) {
  const discovery = usePublicMusicPlaylists(!!identifier && !!id);
  let pubkey: string | undefined;
  try {
    if (identifier) {
      const decoded = nip19.decode(identifier);
      if (decoded.type === 'npub') pubkey = decoded.data;
      else if (decoded.type === 'nprofile') pubkey = decoded.data.pubkey;
    }
  } catch {
    pubkey = undefined;
  }

  return {
    ...discovery,
    data: pubkey && id
      ? discovery.data?.playlists.find(playlist => playlist.pubkey === pubkey && playlist.id === id)
      : undefined,
  };
}
