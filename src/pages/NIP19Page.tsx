import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import { ArtistPage } from './ArtistPage';
import NotFound from './NotFound';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

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
      return <ArtistPage pubkey={decoded.data} />;

    case 'nprofile':
      return <ArtistPage pubkey={decoded.data.pubkey} />;

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
