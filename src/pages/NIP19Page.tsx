import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import { ArtistPage } from './ArtistPage';
import FriendsPage from './FriendsPage';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import NotFound from './NotFound';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();
  const { user } = useCurrentUser();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  switch (decoded.type) {
    case 'npub':
      return user?.pubkey === decoded.data ? <ArtistPage pubkey={decoded.data} /> : <FriendsPage profilePubkey={decoded.data} />;

    case 'nprofile':
      return user?.pubkey === decoded.data.pubkey ? <ArtistPage pubkey={decoded.data.pubkey} /> : <FriendsPage profilePubkey={decoded.data.pubkey} />;

    case 'note':
      // Could resolve a single track in the future.
      return <div>Note placeholder</div>;

    case 'nevent':
      return <div>Event placeholder</div>;

    case 'naddr':
      return <div>Addressable event placeholder</div>;

    default:
      return <NotFound />;
  }
}
