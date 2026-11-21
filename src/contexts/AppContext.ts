import { createContext } from "react";

export type Theme = "dark" | "light" | "system";

export interface RelayMetadata {
  /** List of relays with read/write permissions */
  relays: { url: string; read: boolean; write: boolean }[];
  /** Unix timestamp of when the relay list was last updated */
  updatedAt: number;
}

/** Blossom server list metadata (BUD-03 / kind 10063), mirroring RelayMetadata for parity. */
export interface BlossomServerMetadata {
  /** Ordered list of Blossom server URLs (most trusted/reliable first per BUD-03). */
  servers: string[];
  /** Unix timestamp of when the server list was last updated (from kind 10063 created_at). */
  updatedAt: number;
}

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** Effective relay set used by Ostrify's relay pool and features. */
  relayMetadata: RelayMetadata;
  /** Relay choices managed in Ostrify settings, stored locally and never synced to NIP-65. */
  appRelayMetadata: RelayMetadata;
  /** User's NIP-65 relay list, cached locally after being fetched from Nostr. */
  userRelayMetadata: RelayMetadata;
  /** Public key owning the cached user relay list. */
  userRelayPubkey: string;
  /** Whether to include the user's NIP-65 relays in Ostrify's effective relay set. */
  includeUserRelays: boolean;
  /** User's kind 10063 Blossom server list. */
  blossomServerMetadata: BlossomServerMetadata;
  /**
   * When true, the app's default Blossom servers are merged with the user's
   * servers (app servers first, deduped). When false, only the user's servers
   * are used.
   */
  useAppBlossomServers: boolean;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
