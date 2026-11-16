import type { Track } from "@/lib/music";

/** Hidden means excluded from Ostrify discovery, not private on Nostr or the media host. */
export function isTrackVisibleInOstrify(track: Track, viewerPubkey?: string, profilePubkey?: string): boolean {
  return track.visibility !== "hidden" || (!!viewerPubkey && track.pubkey === viewerPubkey && (!profilePubkey || viewerPubkey === profilePubkey));
}

export function withMusicVisibility(tags: string[][], visibility: "public" | "hidden"): string[][] {
  const preserved = tags.filter(([name]) => name !== "ostrify_visibility").map(tag => [...tag]);
  preserved.push(["ostrify_visibility", visibility]);
  return preserved;
}
