import { useContext, useLayoutEffect, type RefObject, type SyntheticEvent } from 'react';
import { PlayerContext } from '@/contexts/PlayerContext';

/** Share volume with Ostrify's own media elements, including their native controls. */
export function useVideoVolume(videoRef: RefObject<HTMLVideoElement | null>, sourceKey: string) {
  const player = useContext(PlayerContext);
  const volume = player?.volume ?? 1;
  const muted = player?.muted ?? false;

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.volume !== volume) video.volume = volume;
    if (video.muted !== muted) video.muted = muted;
  }, [videoRef, sourceKey, volume, muted]);

  const onVolumeChange = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (!player) return;
    const video = event.currentTarget;
    const volumeChanged = Math.abs(video.volume - player.volume) > 0.001;
    if (volumeChanged) player.setVolume(video.volume);
    // setVolume unmutes when the new level is nonzero; preserve the native mute choice.
    const mutedAfterVolumeChange = volumeChanged && video.volume > 0 ? false : player.muted;
    if (video.muted !== mutedAfterVolumeChange) player.toggleMute();
  };

  return { onVolumeChange };
}
