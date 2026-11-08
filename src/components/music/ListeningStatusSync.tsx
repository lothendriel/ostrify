import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePlayer } from '@/hooks/usePlayer';
import { useListeningSharing } from '@/hooks/useListeningSharing';

/** Publish explicitly enabled public NIP-38 music statuses, clearing on pause/disable. */
export function ListeningStatusSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { current, isPlaying, duration } = usePlayer();
  const { enabled } = useListeningSharing();
  const last = useRef('');
  const sequence = useRef(0);

  useEffect(() => {
    const clearStatus = async () => {
      if (!user) return;
      const sequenceAtStart = ++sequence.current;
      try {
        const event = await user.signer.signEvent({ kind: 30315, content: '', tags: [['d', 'music']], created_at: Math.floor(Date.now() / 1000) });
        if (sequenceAtStart !== sequence.current) return;
        await nostr.event(event, { signal: AbortSignal.timeout(5000) });
      } catch (error) { console.warn('Could not clear listening status after privacy change', error); }
    };
    window.addEventListener('ostrify:clear-listening-status', clearStatus);
    return () => window.removeEventListener('ostrify:clear-listening-status', clearStatus);
  }, [user, nostr]);

  useEffect(() => {
    if (!user) { last.current = ''; return; }
    const playing = !!enabled && !!current && isPlaying;
    const state = playing ? `${user.pubkey}:${current.id}` : `${user.pubkey}:off`;
    if (!playing && !last.current) return;
    if (last.current === state) return;
    last.current = state;
    const seq = ++sequence.current;
    const track = current;
    const publish = async () => {
      try {
        const content = playing && track ? [track.artist, track.title].filter(Boolean).join(' — ') : '';
        const tags: string[][] = [['d', 'music']];
        if (playing && track) {
          const seconds = Math.min(14400, Math.max(60, Number.isFinite(duration) && duration > 0 ? duration : track.duration || 3600));
          tags.push(['expiration', String(Math.floor(Date.now() / 1000 + seconds))]);
          if (track.event?.id) tags.push(['e', track.event.id]);
          else if (track.source === 'wavlake' && track.id.startsWith('wavlake:')) tags.push(['r', `https://wavlake.com/track/${track.id.slice(8)}`]);
        }
        const signed = await user.signer.signEvent({ kind: 30315, content, tags, created_at: Math.floor(Date.now() / 1000) });
        if (seq !== sequence.current) return;
        if (playing && !enabled) return;
        await nostr.event(signed, { signal: AbortSignal.timeout(5000) });
      } catch (error) { console.warn('Could not update listening status', error); }
    };
    void publish();
  }, [current, isPlaying, duration, enabled, user, nostr]);
  return null;
}
