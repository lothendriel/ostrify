import { useCallback, useEffect, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePlayer } from '@/hooks/usePlayer';
import { useTunestrPlayer } from '@/components/music/TunestrPlayer';
import { classifyStreamPlayback } from '@/lib/sanitize';
import { CLEAR_LISTENING_STATUS_EVENT, LISTENING_STATUS_CLEAR_RESULT_EVENT, useListeningSharing, type ListeningStatusClearResult } from '@/hooks/useListeningSharing';

/** Publish public NIP-38 music statuses when sharing is enabled, clearing on pause/disable. */
export function ListeningStatusSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { current, isPlaying, duration, videoActive } = usePlayer();
  const { stream, playback } = useTunestrPlayer();
  const { enabled } = useListeningSharing();
  const sharingEnabledRef = useRef(enabled);
  sharingEnabledRef.current = enabled;
  const last = useRef('');
  const sequence = useRef(0);
  const lastPublishedAt = useRef(0);
  const publishStatus = useCallback(async (content: string, tags: string[][], expectedSequence: number) => {
    if (!user) return false;
    const wait = Math.max(0, (lastPublishedAt.current + 1) * 1000 - Date.now());
    if (wait) await new Promise<void>(resolve => window.setTimeout(resolve, wait));
    if (expectedSequence !== sequence.current || (content && !sharingEnabledRef.current)) return false;
    const createdAt = Math.floor(Date.now() / 1000);
    const signed = await user.signer.signEvent({ kind: 30315, content, tags, created_at: createdAt });
    if (expectedSequence !== sequence.current || (content && !sharingEnabledRef.current)) return false;
    lastPublishedAt.current = createdAt;
    await nostr.event(signed, { signal: AbortSignal.timeout(5000) });
    return true;
  }, [user, nostr]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!enabled || !user) return;
    const timer = window.setInterval(() => setRefresh(value => value + 1), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [enabled, user]);

  useEffect(() => {
    const clearStatus = async () => {
      const publishResult = (result: ListeningStatusClearResult) => window.dispatchEvent(new CustomEvent(LISTENING_STATUS_CLEAR_RESULT_EVENT, { detail: result }));
      if (user) last.current = `${user.pubkey}:off`;
      if (!user) {
        publishResult({ state: 'failed', message: 'Log in with the same account to publish a status-clearing update.' });
        return;
      }
      const sequenceAtStart = ++sequence.current;
      try {
        const published = await publishStatus('', [['d', 'music']], sequenceAtStart);
        publishResult({ state: published ? 'published' : 'superseded' });
      } catch (error) {
        console.warn('Could not clear listening status after privacy change', error);
        if (sequenceAtStart !== sequence.current) {
          publishResult({ state: 'superseded' });
          return;
        }
        publishResult({ state: 'failed', message: error instanceof Error ? error.message : 'The clearing update could not be published.' });
      }
    };
    window.addEventListener(CLEAR_LISTENING_STATUS_EVENT, clearStatus);
    return () => window.removeEventListener(CLEAR_LISTENING_STATUS_EVENT, clearStatus);
  }, [user, publishStatus]);

  useEffect(() => {
    if (!user) { last.current = ''; return; }
    const embed = stream && (stream.format === 'odysee' || stream.format !== 'n94' && classifyStreamPlayback(stream.url).type === 'embed');
    const videoStatus = enabled && stream && (embed || playback === 'playing') ? stream : null;
    const track = enabled && !videoActive && !stream && current && isPlaying ? current : null;
    const active = !!videoStatus || !!track;
    const state = videoStatus ? `${user.pubkey}:video:${videoStatus.id}:${refresh}` : track ? `${user.pubkey}:audio:${track.id}` : `${user.pubkey}:off`;
    if (!active && !last.current) return;
    if (last.current === state) return;
    last.current = state;
    const seq = ++sequence.current;
    const publish = async () => {
      try {
        const tags: string[][] = [['d', 'music']];
        let content = '';
        if (videoStatus) {
          if (videoStatus.format === 'odysee') {
            content = `Odysee video open — ${videoStatus.creator} — ${videoStatus.title}`;
            tags.push(['r', `https://odysee.com/${encodeURIComponent(videoStatus.name)}:${videoStatus.claimId}`]);
          } else {
            content = `${embed ? 'TuneStr video open' : 'TuneStr'} — ${videoStatus.title}`;
            if (videoStatus.event?.id) tags.push(['e', videoStatus.event.id]);
          }
          // Refresh while open, so live sessions do not leave permanent stale statuses.
          tags.push(['expiration', String(Math.floor(Date.now() / 1000) + 10 * 60)]);
        } else if (track) {
          content = [track.artist, track.title].filter(Boolean).join(' — ');
          const seconds = Math.min(14400, Math.max(60, Number.isFinite(duration) && duration > 0 ? duration : track.duration || 3600));
          tags.push(['expiration', String(Math.floor(Date.now() / 1000 + seconds))]);
          if (track.event?.id) tags.push(['e', track.event.id]);
          else if (track.source === 'wavlake' && track.id.startsWith('wavlake:')) tags.push(['r', `https://wavlake.com/track/${track.id.slice(8)}`]);
        }
        await publishStatus(content, tags, seq);
      } catch (error) { console.warn('Could not update listening status', error); }
    };
    void publish();
  }, [current, isPlaying, duration, videoActive, stream, playback, refresh, enabled, user, publishStatus]);
  return null;
}
