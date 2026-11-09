import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { finalizeEvent, generateSecretKey, getEventHash, nip19, nip44, verifyEvent } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

const APP_TAG = 'ostrify-friends-v1';
const HEX = /^[0-9a-f]{64}$/;
type Action = 'request' | 'accept' | 'decline' | 'remove';
interface Message { id: string; from: string; to: string; token: string; action: Action; created_at: number }
interface Rumor { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string }

async function inboxRelays(nostr: ReturnType<typeof useNostr>['nostr'], pubkey: string, signal: AbortSignal): Promise<string[]> {
  const events = await nostr.query([{ kinds: [10050], authors: [pubkey], limit: 10 }], { signal });
  const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
  return [...new Set((newest?.tags ?? []).filter(([name]) => name === 'relay').map(([, url]) => {
    try { const parsed = new URL(url); return parsed.protocol === 'wss:' && !parsed.username && !parsed.password ? parsed.href : ''; } catch { return ''; }
  }).filter(Boolean))].slice(0, 5);
}

function randomTime() { return Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800); }

/** Standard NIP-17 kind-14 message with private protocol tags inside the encrypted rumor. */
async function wrapMessage(user: NonNullable<ReturnType<typeof useCurrentUser>['user']>, rumor: Rumor, recipient: string): Promise<NostrEvent> {
  if (!user.signer.nip44) throw new Error('Your signer must support NIP-44 private messages.');
  const content = await user.signer.nip44.encrypt(recipient, JSON.stringify(rumor));
  const seal = await user.signer.signEvent({ kind: 13, content, created_at: randomTime(), tags: [] });
  const key = generateSecretKey();
  const ciphertext = nip44.v2.encrypt(JSON.stringify(seal), nip44.v2.utils.getConversationKey(key, recipient));
  return finalizeEvent({ kind: 1059, created_at: randomTime(), tags: [['p', recipient]], content: ciphertext }, key);
}

async function unwrapMessage(user: NonNullable<ReturnType<typeof useCurrentUser>['user']>, wrap: NostrEvent): Promise<Message | null> {
  if (!user.signer.nip44 || wrap.kind !== 1059 || !verifyEvent(wrap) || !wrap.tags.some(([n, v]) => n === 'p' && v === user.pubkey)) return null;
  try {
    const seal = JSON.parse(await user.signer.nip44.decrypt(wrap.pubkey, wrap.content)) as NostrEvent;
    if (seal.kind !== 13 || !Array.isArray(seal.tags) || seal.tags.length !== 0 || !verifyEvent(seal)) return null;
    const rumor = JSON.parse(await user.signer.nip44.decrypt(seal.pubkey, seal.content)) as Rumor;
    if (rumor.kind !== 14 || rumor.pubkey !== seal.pubkey || !Array.isArray(rumor.tags) || getEventHash(rumor) !== rumor.id) return null;
    const recipients = rumor.tags.filter(([n]) => n === 'p').map(([, p]) => p);
    const tag = rumor.tags.find(([n]) => n === APP_TAG);
    const action = tag?.[1]; const token = tag?.[2];
    if (recipients.length !== 1 || !HEX.test(recipients[0]) || !HEX.test(rumor.pubkey) || !token || !/^[0-9a-f]{32}$/.test(token) || !action || !['request', 'accept', 'decline', 'remove'].includes(action)) return null;
    if (rumor.pubkey !== user.pubkey && recipients[0] !== user.pubkey) return null;
    return { id: rumor.id, from: rumor.pubkey, to: recipients[0], token, action: action as Action, created_at: rumor.created_at };
  } catch { return null; }
}

function derive(messages: Message[], me: string) {
  const byId = new Map(messages.map(m => [m.id, m]));
  const sorted = [...byId.values()].sort((a, b) => a.created_at - b.created_at || (a.action === 'request' ? -1 : b.action === 'request' ? 1 : a.id.localeCompare(b.id)));
  const requests = new Map<string, Message>();
  const accepted = new Map<string, { pubkey: string; at: number }>();
  const incoming: Message[] = [];
  const outgoing: Message[] = [];
  for (const message of sorted) {
    if (message.action === 'request') requests.set(message.token, message);
    else if (message.action === 'accept') {
      const request = requests.get(message.token);
      if (request && request.from === message.to && request.to === message.from) {
        const peer = message.from === me ? message.to : message.from;
        accepted.set(peer, { pubkey: peer, at: message.created_at });
      }
    } else if (message.action === 'remove') {
      const peer = message.from === me ? message.to : message.from;
      accepted.delete(peer);
    }
  }
  for (const request of requests.values()) {
    if (request.to !== me) continue;
    const resolved = sorted.some(m => m.token === request.token && m.from === me && m.to === request.from && ['accept', 'decline'].includes(m.action));
    if (!resolved && !accepted.has(request.from)) incoming.push(request);
  }
  for (const request of requests.values()) {
    if (request.from !== me) continue;
    const resolved = sorted.some(m => m.token === request.token && m.from === request.to && m.to === me && ['accept', 'decline'].includes(m.action));
    const removed = sorted.some(m => m.action === 'remove' && ((m.from === me && m.to === request.to) || (m.to === me && m.from === request.to)) && m.created_at >= request.created_at);
    if (!resolved && !removed && !accepted.has(request.to)) outgoing.push(request);
  }
  return { friends: [...accepted.values()], incoming: incoming.reverse(), outgoing: outgoing.reverse() };
}

export function useFriends() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const key = ['ostrify-friends', user?.pubkey ?? ''];
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
    refetchInterval: 30000,
    queryFn: async ({ signal }) => {
      if (!user?.signer.nip44) throw new Error('Your signer must support NIP-44 to use private invitations.');
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
      const relays = await inboxRelays(nostr, user.pubkey, timeout);
      if (!relays.length) throw new Error('Set up NIP-17 DM relays in your Nostr messaging app before using Ostrify friends.');
      const events = await nostr.group(relays).query([{ kinds: [1059], '#p': [user.pubkey], limit: 500 }], { signal: timeout });
      const cached = queryClient.getQueryData<Message[]>(['ostrify-friend-messages', user.pubkey]) ?? [];
      const seen = new Set(cached.map(message => message.id));
      const messages: Message[] = [...cached];
      // Signer requests can be interactive; do not decrypt hundreds in parallel.
      for (const event of events) {
        if (signal.aborted) break;
        const message = await unwrapMessage(user, event);
        if (message && !seen.has(message.id)) { seen.add(message.id); messages.push(message); }
      }
      queryClient.setQueryData(['ostrify-friend-messages', user.pubkey], messages);
      return derive(messages, user.pubkey);
    },
  });
  const send = useMutation({
    mutationFn: async ({ peer, action, token }: { peer: string; action: Action; token?: string }) => {
      if (!user || !user.signer.nip44) throw new Error('Log in with a signer that supports NIP-44.');
      if (!HEX.test(peer) || peer === user.pubkey) throw new Error('Enter another person’s valid Nostr public key.');
      const timeout = AbortSignal.timeout(12000);
      const [recipientRelays, ownRelays] = await Promise.all([inboxRelays(nostr, peer, timeout), inboxRelays(nostr, user.pubkey, timeout)]);
      if (!recipientRelays.length) throw new Error('This person has not published a NIP-17 DM relay list. They need to set one up before receiving an invitation.');
      if (!ownRelays.length) throw new Error('Set up your NIP-17 DM relays first so invitations and replies can be recovered.');
      const requestToken = token ?? crypto.randomUUID().replaceAll('-', '');
      if (!/^[0-9a-f]{32}$/.test(requestToken)) throw new Error('Invalid invitation.');
      const appUrl = 'https://ostrify.studio314.us';
      const profileUrl = `${appUrl}/friends/${nip19.npubEncode(user.pubkey)}?invite=1`;
      const content = action === 'request' ? `I’d like to connect with you on Ostrify! Visit my profile to review my friend request: ${profileUrl}` : action === 'accept' ? `I accepted your Ostrify friend request! Visit ${appUrl}/friends` : action === 'decline' ? 'I declined your Ostrify friend request.' : 'I removed our Ostrify friendship.';
      const unsigned = { kind: 14, pubkey: user.pubkey, created_at: Math.floor(Date.now() / 1000), content, tags: [['p', peer], [APP_TAG, action, requestToken]] };
      const rumor: Rumor = { ...unsigned, id: getEventHash(unsigned) };
      const recipientWrap = await wrapMessage(user, rumor, peer);
      const selfWrap = await wrapMessage(user, rumor, user.pubkey);
      // At least one recipient and one own inbox must acknowledge their copy.
      await Promise.any(recipientRelays.map(url => nostr.relay(url).event(recipientWrap, { signal: AbortSignal.timeout(8000) })));
      try { await Promise.any(ownRelays.map(url => nostr.relay(url).event(selfWrap, { signal: AbortSignal.timeout(8000) }))); }
      catch { throw new Error('Message sent, but your own DM relays did not save a copy. Check your DM relay settings before retrying.'); }
      const messages = queryClient.getQueryData<Message[]>(['ostrify-friend-messages', user.pubkey]) ?? [];
      queryClient.setQueryData(['ostrify-friend-messages', user.pubkey], [...messages, { id: rumor.id, from: user.pubkey, to: peer, token: requestToken, action, created_at: rumor.created_at }]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return { ...query, send };
}

export function useNostrFollows() {
  const { nostr } = useNostr(); const { user } = useCurrentUser();
  return useQuery({ queryKey: ['friend-invite-follows', user?.pubkey], enabled: !!user,
    queryFn: async ({ signal }) => {
      if (!user) return [] as string[];
      const events = await nostr.query([{ kinds: [3], authors: [user.pubkey], limit: 5 }], { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
      const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
      return [...new Set((latest?.tags ?? []).filter(([n, p]) => n === 'p' && HEX.test(p)).map(([, p]) => p))].slice(0, 200);
    },
  });
}
