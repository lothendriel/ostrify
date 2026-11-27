import { ReactNode, useEffect } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata, type BlossomServerMetadata } from '@/contexts/AppContext';
import { APP_RELAYS, isRequiredAppRelay } from '@/lib/appRelays';
import { useOctober } from '@/hooks/useDecember';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

// Zod schema for RelayMetadata validation
const RelayMetadataSchema = z.object({
  relays: z.array(z.object({
    url: z.url(),
    read: z.boolean(),
    write: z.boolean(),
  })),
  updatedAt: z.number(),
  eventId: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}) satisfies z.ZodType<RelayMetadata>;

// Zod schema for BlossomServerMetadata validation
const BlossomServerMetadataSchema = z.object({
  servers: z.array(z.url()),
  updatedAt: z.number(),
  eventId: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  pubkey: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  isLocal: z.boolean().optional(),
}) satisfies z.ZodType<BlossomServerMetadata>;

// Zod schema for AppConfig validation
const AppConfigSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']),
  relayMetadata: RelayMetadataSchema,
  appRelayMetadata: RelayMetadataSchema,
  userRelayMetadata: RelayMetadataSchema,
  userRelayPubkey: z.string(),
  includeUserRelays: z.boolean(),
  excludedUserRelayUrls: z.array(z.url()),
  excludedUserRelayPubkey: z.string(),
  blossomServerMetadata: BlossomServerMetadataSchema,
  useAppBlossomServers: z.boolean(),
}) satisfies z.ZodType<AppConfig>;

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed: unknown = JSON.parse(value);
        return AppConfigSchema.partial().parse(parsed);
      }
    }
  );

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
    setConfig(updater);
  };

  // Migrate old app-only relay settings: preserve the user's read/write choices
  // for defaults that remain, add the newly recommended defaults, drop relays
  // that were removed from the recommended set, and retain explicitly custom relays.
  const legacyRelayMetadata = rawConfig.relayMetadata;
  const normalizeRelayUrl = (url: string): string => url.trim().replace(/\/+$/, '').toLowerCase();
  const legacyRecommendedRelayUrls = new Set([
    'wss://relay.studio314.us/nostrrelay/ostrify',
    'wss://drops.basspistol.org',
    'wss://relay.lightning.fm',
    'wss://relay.wavlake.com',
    'wss://relay.fountain.fm',
    'wss://lightningrelay.com',
    'wss://nostr.land',
    'wss://relay.nostr.band',
    'wss://purplepag.es',
    'wss://nos.lol',
    'wss://relay.nostr.net',
    'wss://relay.noswhere.com',
    'wss://relay.primal.net',
    'wss://relay.damus.io',
    'wss://nostr.wine',
    'wss://relay.snort.social',
    'wss://relay.ditto.pub',
    'wss://relay.dreamith.to',
  ]);
  const migratedLegacyRelays = legacyRelayMetadata
    ? legacyRelayMetadata.updatedAt === 0
      ? defaultConfig.appRelayMetadata.relays
      : [
          ...defaultConfig.appRelayMetadata.relays.map(relay => {
            const previous = legacyRelayMetadata.relays.find(saved => normalizeRelayUrl(saved.url) === normalizeRelayUrl(relay.url));
            return previous
              ? { ...relay, read: previous.read, write: previous.write }
              : legacyRelayMetadata.relays.some(saved => legacyRecommendedRelayUrls.has(normalizeRelayUrl(saved.url)))
                ? relay
                : { ...relay, read: false, write: false };
          }),
          ...legacyRelayMetadata.relays
            .filter(relay => !legacyRecommendedRelayUrls.has(normalizeRelayUrl(relay.url)))
            .map(relay => ({ ...relay })),
        ]
    : defaultConfig.appRelayMetadata.relays;
  const appRelayMetadata = rawConfig.appRelayMetadata ?? {
    relays: migratedLegacyRelays,
    updatedAt: legacyRelayMetadata?.updatedAt ?? 0,
  };
  const userRelayMetadata = rawConfig.userRelayMetadata ?? defaultConfig.userRelayMetadata;
  const userRelayPubkey = rawConfig.userRelayPubkey ?? defaultConfig.userRelayPubkey;
  const includeUserRelays = rawConfig.includeUserRelays ?? defaultConfig.includeUserRelays;
  const excludedUserRelayPubkey = rawConfig.excludedUserRelayPubkey ?? defaultConfig.excludedUserRelayPubkey;
  const excludedUserRelayUrls = excludedUserRelayPubkey === userRelayPubkey && userRelayPubkey
    ? rawConfig.excludedUserRelayUrls ?? defaultConfig.excludedUserRelayUrls
    : defaultConfig.excludedUserRelayUrls;
  const effectiveIncludeUserRelays = includeUserRelays && !!userRelayPubkey && userRelayPubkey === excludedUserRelayPubkey;
  const requiredRelay = APP_RELAYS.relays.find(relay => isRequiredAppRelay(relay.url));
  const appRelays = appRelayMetadata.relays;
  const normalizedAppRelays = [
    ...(requiredRelay && !appRelays.some(relay => isRequiredAppRelay(relay.url)) ? [requiredRelay] : []),
    ...appRelays.map(relay => isRequiredAppRelay(relay.url) && requiredRelay ? { ...relay, url: requiredRelay.url, read: true, write: true } : relay),
  ];
  const excludedForUser = excludedUserRelayPubkey === userRelayPubkey && userRelayPubkey
    ? new Set(excludedUserRelayUrls.map(normalizeRelayUrl))
    : new Set<string>();
  const appRelayMap = new Map(normalizedAppRelays.map(relay => [normalizeRelayUrl(relay.url), { ...relay }]));
  for (const relay of userRelayMetadata.relays) {
    if (!userRelayPubkey || excludedForUser.has(normalizeRelayUrl(relay.url))) continue;
    if (!relay.write && !(effectiveIncludeUserRelays && relay.read)) continue;
    const key = normalizeRelayUrl(relay.url);
    const existing = appRelayMap.get(key);
    appRelayMap.set(key, {
      url: existing?.url ?? relay.url,
      read: (existing?.read ?? false) || (effectiveIncludeUserRelays && relay.read),
      write: (existing?.write ?? false) || relay.write,
    });
  }
  const relays = [...appRelayMap.values()];
  const config: AppConfig = {
    ...defaultConfig,
    ...rawConfig,
    appRelayMetadata: { ...appRelayMetadata, relays: normalizedAppRelays },
    userRelayMetadata,
    userRelayPubkey,
    includeUserRelays,
    excludedUserRelayUrls,
    excludedUserRelayPubkey,
    relayMetadata: {
      ...defaultConfig.relayMetadata,
      updatedAt: Math.max(appRelayMetadata.updatedAt, effectiveIncludeUserRelays ? userRelayMetadata.updatedAt : 0),
      relays,
    },
  };

  const appContextValue: AppContextType = {
    config,
    updateConfig,
  };

  // The seasonal palette is temporary and never modifies the saved preference.
  const isOctober = useOctober();
  useApplyTheme(config.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('october', isOctober);
    if (isOctober) root.style.setProperty('--october-art', 'url("/images/october-night.webp")');
    else root.style.removeProperty('--october-art');
    return () => {
      root.classList.remove('october');
      root.style.removeProperty('--october-art');
    };
  }, [isOctober]);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to apply theme changes to the document root
 */
function useApplyTheme(theme: Theme) {
  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  // Handle system theme changes when theme is set to "system"
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');

      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);
}