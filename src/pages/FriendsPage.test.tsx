import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { nip19 } from 'nostr-tools';
import { TestApp } from '@/test/TestApp';
import FriendsPage from './FriendsPage';

const matt = '2'.repeat(64);
const { invite } = vi.hoisted(() => ({ invite: vi.fn() }));

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: { pubkey: '1'.repeat(64) } }) }));
vi.mock('@/hooks/useFriends', () => ({
  useFriends: () => ({ data: { friends: [], incoming: [], outgoing: [] }, isLoading: false, isError: false, send: { mutate: invite, isPending: false } }),
  useNostrFollows: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useFollowedPeople', () => ({ useFollowedPeople: () => ({ hasReadRelays: true, people: [], isLoading: false, isError: false }) }));
vi.mock('@/hooks/useFriendLibrary', () => ({ useFriendStatuses: () => ({ data: [] }), useFriendLibrary: () => ({ data: { playlists: [], artists: [] }, isLoading: false, isError: false }) }));
vi.mock('@/hooks/useOstrifyDirectory', () => ({ useOstrifyDirectory: () => ({ hasReadRelays: true, data: [{ pubkey: '2'.repeat(64), name: 'Matt', picture: 'https://example.com/matt.jpg' }], isLoading: false, isError: false }) }));

describe('Ostrify people search', () => {
  beforeEach(() => { window.history.replaceState({}, '', '/friends'); invite.mockClear(); });

  it('only shows matches while searching and clears them when the input is cleared', () => {
    render(<TestApp><FriendsPage /></TestApp>);
    const search = screen.getByRole('textbox', { name: 'Search Ostrify directory by name' });
    expect(screen.queryByRole('link', { name: "View Matt's Ostrify profile" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'matt' } });
    const link = screen.getByRole('link', { name: "View Matt's Ostrify profile" });
    expect(link).toHaveAttribute('href', `/friends/${nip19.npubEncode(matt)}`);
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/matt.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Clear people search' }));
    expect(screen.queryByRole('link', { name: "View Matt's Ostrify profile" })).not.toBeInTheDocument();
    expect(search).toHaveValue('');
    expect(invite).not.toHaveBeenCalled();
  });
});
