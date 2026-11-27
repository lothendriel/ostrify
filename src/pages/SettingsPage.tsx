import { useSeoMeta } from "@unhead/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useNostr } from "@nostrify/react";
import { Radio, Sun, Moon, UserRound, Heart, Music2, Library, Users, Mic, HardDriveUpload, Disc3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, RotateCcw } from "lucide-react";
import { getUserRelayUrls, normalizeRelayAddress } from "@/lib/appRelays";
import { RelayListManager } from "@/components/RelayListManager";
import { useTheme } from "@/hooks/useTheme";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { LISTENING_STATUS_CLEAR_RESULT_EVENT, useListeningSharing, type ListeningStatusClearResult } from "@/hooks/useListeningSharing";
import { Switch } from "@/components/ui/switch";
import { useDirectoryEnrollment } from "@/hooks/useOstrifyDirectory";
import { useToast } from "@/hooks/useToast";
import { useProfilePrivacy } from "@/hooks/useProfilePrivacy";
import { BlossomServerManager } from "@/components/BlossomServerManager";
import type { NPool } from "@nostrify/nostrify";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UserRelayStatusListProps {
  relays: { url: string; read: boolean; write: boolean }[];
  excludedRelayUrls: string[];
  nostr: NPool;
  onRemove: (url: string) => void;
  onRestore: (url: string) => void;
}

type RelayHealth = 'checking' | 'reachable' | 'unreachable';

function UserRelayStatusList({ relays, excludedRelayUrls, nostr, onRemove, onRestore }: UserRelayStatusListProps) {
  const excluded = new Set(excludedRelayUrls.map(normalizeRelayAddress));
  const [health, setHealth] = useState<Record<string, RelayHealth>>({});
  const relayKey = relays.map(relay => relay.url).join('|');

  useEffect(() => {
    let active = true;
    const urls = relayKey ? relayKey.split('|') : [];
    setHealth(current => Object.fromEntries(urls.map(url => [url, current[url] ?? 'checking'])));

    const check = async (url: string) => {
      try {
        let receivedEose = false;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 7000);
        try {
          for await (const message of nostr.relay(url).req([{ kinds: [0], limit: 1 }], { signal: controller.signal })) {
            if (message[0] === 'EOSE') {
              receivedEose = true;
              break;
            }
          }
        } finally {
          window.clearTimeout(timeout);
        }
        if (active) setHealth(current => ({ ...current, [url]: receivedEose ? 'reachable' : 'unreachable' }));
      } catch {
        if (active) setHealth(current => ({ ...current, [url]: 'unreachable' }));
      }
    };

    for (const url of urls) void check(url);
    const interval = window.setInterval(() => { for (const url of urls) void check(url); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [nostr, relayKey]);

  if (relays.length === 0) {
    return <p className="pt-2 text-xs text-muted-foreground">All NIP-65 relays are currently removed from Ostrify. Their published NIP-65 list is unchanged.</p>;
  }

  return (
    <>
      <ul aria-label="Your NIP-65 read and write relays" className="space-y-2 pt-2">
      {relays.map(relay => {
        const status = health[relay.url] ?? 'checking';
        const isExcluded = excluded.has(normalizeRelayAddress(relay.url));
        const label = status === 'reachable' ? 'Read connection reachable' : status === 'unreachable' ? 'Read connection unavailable' : 'Checking read connection';
        return (
          <li key={relay.url} className="flex min-w-0 items-center gap-3 rounded-md border bg-muted/20 px-3 py-2">
            <span role="status" aria-label={`${relay.url}: ${label}`} title={`${label}; publishing is not tested`} className="inline-flex size-3 shrink-0 items-center justify-center rounded-full">
              <span className={`size-2.5 rounded-full shadow-[0_0_8px_currentColor] ${status === 'reachable' ? 'bg-emerald-500 text-emerald-500' : status === 'unreachable' ? 'bg-red-500 text-red-500' : 'animate-pulse bg-amber-400 text-amber-400'}`} />
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={relay.url}>{relay.url}</span>
            <span className="flex shrink-0 gap-2 text-[11px] text-muted-foreground">
              {relay.read && <span>{isExcluded ? 'Read off' : 'Read'}</span>}
              {relay.write && <span>{isExcluded ? 'Write off' : 'Write'}</span>}
            </span>
            <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-primary" onClick={() => isExcluded ? onRestore(relay.url) : onRemove(relay.url)} aria-label={isExcluded ? `Restore ${relay.url} in Ostrify` : `Remove ${relay.url} from Ostrify`} title={isExcluded ? 'Restore in Ostrify' : 'Remove from Ostrify only'}>
              {isExcluded ? <RotateCcw className="size-4" /> : <X className="size-4" />}
            </Button>
          </li>
        );
      })}
      </ul>
      <p className="text-xs text-muted-foreground">Remove only disables a relay in Ostrify. It does not alter your published NIP-65 relay list. Restore brings it back for Ostrify.</p>
    </>
  );
}

const SettingsPage = () => {
  useSeoMeta({ title: "Settings — Ostrify" });
  const [searchParams] = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config, updateConfig } = useAppContext();
  const sharing = useListeningSharing();
  const [clearResult, setClearResult] = useState<ListeningStatusClearResult | null>(null);
  const directory = useDirectoryEnrollment();
  const privacy = useProfilePrivacy();
  const { toast } = useToast();

  useEffect(() => {
    const handleClearResult = (event: Event) => {
      const result = (event as CustomEvent<ListeningStatusClearResult>).detail;
      setClearResult(result);
      if (result.state === 'failed') {
        toast({ title: 'Status clearing update failed', description: 'Sharing is off in Ostrify, but an earlier public status may remain visible until it expires.', variant: 'destructive' });
      }
    };
    window.addEventListener(LISTENING_STATUS_CLEAR_RESULT_EVENT, handleClearResult);
    return () => window.removeEventListener(LISTENING_STATUS_CLEAR_RESULT_EVENT, handleClearResult);
  }, [toast]);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <Tabs defaultValue={searchParams.get('tab') === 'relays' ? 'relays' : 'privacy'} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="relays">Relays</TabsTrigger>
        </TabsList>
        <TabsContent value="relays" className="mt-0 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="size-5 text-primary" />
            Relays
          </CardTitle>
          <CardDescription>
            Ostrify uses these recommended music, podcast, and community relays for discovery and app data. You can add or remove app relays and toggle read or write access. Your NIP-65 relays are separate and can optionally be included below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RelayListManager />
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-start gap-3">
              <Switch
                id="include-user-relays"
                checked={config.includeUserRelays}
                disabled={!user || config.userRelayPubkey !== user.pubkey || getUserRelayUrls(config.userRelayMetadata, config.userRelayPubkey, user.pubkey, 'read', config.excludedUserRelayUrls, config.excludedUserRelayPubkey).length === 0}
                onCheckedChange={(enabled) => updateConfig(current => ({ ...current, includeUserRelays: enabled }))}
              />
              <div className="space-y-1">
                <label htmlFor="include-user-relays" className="text-sm font-medium">Also use my NIP-65 read relays for broader discovery</label>
                <p className="text-xs text-muted-foreground">
                  Ostrify uses your NIP-65 write relays to publish and retrieve your own settings, libraries, and music. Enabling this adds your read relays to broader discovery. Relays are independently operated: publishing sends event data to those operators, and public events remain public. Removing a relay here only stops Ostrify from using it; your published NIP-65 list is unchanged. These are NIP-65 read/write relays, not your NIP-17 private-message inbox. Blossom servers are separate and host media uploads.
                </p>
              </div>
            </div>
            {!user && <p className="text-xs text-muted-foreground">Log in to use your NIP-65 relays.</p>}
            {user && config.userRelayPubkey !== user.pubkey && <p role="status" className="text-xs text-muted-foreground">Loading your NIP-65 relay list…</p>}
            {user && config.userRelayPubkey === user.pubkey && !config.userRelayMetadata.relays.some(relay => relay.read || relay.write) && <p className="text-xs text-muted-foreground">No NIP-65 relay list was found for this account. Your Blossom server list is managed separately below.</p>}
            {user && config.userRelayPubkey === user.pubkey && config.userRelayMetadata.relays.length > 0 && (
              <UserRelayStatusList
                relays={config.userRelayMetadata.relays}
                excludedRelayUrls={config.excludedUserRelayPubkey === user.pubkey ? config.excludedUserRelayUrls : []}
                nostr={nostr}
                onRemove={(url) => updateConfig(current => ({
                  ...current,
                  excludedUserRelayPubkey: user.pubkey,
                  excludedUserRelayUrls: [...new Set([
                    ...(current.excludedUserRelayPubkey === user.pubkey ? current.excludedUserRelayUrls ?? [] : []),
                    url,
                  ])],
                }))}
                onRestore={(url) => updateConfig(current => ({
                  ...current,
                  excludedUserRelayPubkey: user.pubkey,
                  excludedUserRelayUrls: (current.excludedUserRelayPubkey === user.pubkey ? current.excludedUserRelayUrls ?? [] : []).filter(excluded => normalizeRelayAddress(excluded) !== normalizeRelayAddress(url)),
                }))}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDriveUpload className="size-5 text-primary" />
            Blossom servers
          </CardTitle>
          <CardDescription>
            Choose public servers for uploading profile images and other media, or add your own. Ostrify’s defaults are free to use, but operated by independent services and may have their own limits or terms. Your server choices are separate from your Nostr relay list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BlossomServerManager />
        </CardContent>
      </Card>

        </TabsContent>
        <TabsContent value="privacy" className="mt-0 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ostrify directory</CardTitle>
          <CardDescription>Opt in to a public Nostr listing so people can find your name and profile picture in Ostrify. This does not share your listening activity. Turning it off publishes a withdrawal; relays or clients may retain older copies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3"><Switch id="directory-visibility" checked={directory.enabled} disabled={!user || !directory.hasReadRelays || directory.isLoading || directory.isError || directory.update.isPending} onCheckedChange={(active) => directory.update.mutate(active, { onSuccess: () => toast({ title: active ? 'Directory listing published' : 'Directory listing withdrawn', description: active ? 'Your profile is publicly discoverable on relays that received the listing.' : 'Your withdrawal was published. Other relays may retain older copies.' }), onError: (error) => toast({ title: 'Could not update directory visibility', description: error.message, variant: 'destructive' }) })} /><label htmlFor="directory-visibility" className="text-sm font-medium">Make my Ostrify profile discoverable</label></div>
          {!user && <p className="text-sm text-muted-foreground">Log in to manage your listing.</p>}
          {user && !directory.hasReadRelays && <p className="text-sm text-muted-foreground">Enable a read relay to check your listing.</p>}
          {user && directory.hasReadRelays && directory.isLoading && <p className="text-sm text-muted-foreground">Checking your listing…</p>}
          {directory.isError && <p role="alert" className="text-sm text-destructive">Could not check your current listing. <button type="button" className="underline" onClick={() => void directory.refetch()}>Try again</button></p>}
          {directory.update.isPending && <p className="text-sm text-muted-foreground">Publishing…</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserRound className="size-5 text-primary" /> Profile privacy</CardTitle>
          <CardDescription>Choose which sections are visible on your public Ostrify profile. These privacy preferences are published in your Ostrify Nostr follow set. This only controls how Ostrify displays the sections; data and older copies may remain available on relays or to other clients.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {privacy.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading privacy preferences…</p>}
          {!privacy.isLoading && privacy.hasReadRelays === false && user && <p className="text-sm text-muted-foreground">Enable a read relay to load profile privacy settings.</p>}
          {privacy.isError && <p role="alert" className="text-sm text-destructive">Could not load Ostrify privacy preferences. Retry before changing visibility.</p>}
          {user && privacy.isPartial && !privacy.isLoading && <p role="status" className="text-sm text-muted-foreground">Some relays did not finish. Your profile settings may be incomplete or out of date. Retry or review your read relays in the Relays tab. <button type="button" className="underline" onClick={() => void privacy.refetch()}>Try again</button></p>}
          {([
            ['liked', 'Liked songs', Heart],
            ['artists', 'Followed artists', Music2],
            ['people', 'Friends on Ostrify', Users],
            ['playlists', 'Playlists', Library],
            ['podcasts', 'Saved podcasts', Mic],
            ['albums', 'Saved albums', Disc3],
          ] as const).map(([section, label, Icon]) => <div key={section} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-3"><Icon className="size-5 text-muted-foreground" /><div><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{privacy.privacyUnknown ? 'Visibility could not be confirmed' : privacy.isHidden(section) ? 'Private on your profile' : 'Visible on your profile'}</p></div></div>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Private</span><Switch aria-label={`Show ${label} on profile`} checked={!privacy.isHidden(section)} disabled={!user || privacy.isSaving || privacy.isLoading || privacy.isError || privacy.privacyUnknown || !privacy.hasReadRelays} onCheckedChange={visible => privacy.setVisibility.mutate({ section, visible }, { onSuccess: () => toast({ title: `${label} ${visible ? 'shown on' : 'hidden from'} your profile` }), onError: error => toast({ title: 'Could not update profile privacy', description: error.message, variant: 'destructive' }) })} /><span className="text-xs text-muted-foreground">Public</span></div>
          </div>)}
          {!user && <p className="text-sm text-muted-foreground">Log in to manage profile privacy.</p>}
          {user && !privacy.hasReadRelays && <p className="text-sm text-muted-foreground">Enable a read relay to check your saved preferences and publish changes.</p>}
          {privacy.saveError && <p role="alert" className="text-sm text-destructive">{privacy.saveError.message}</p>}
          {privacy.isSaving && <p role="status" className="text-sm text-muted-foreground">Publishing visibility to Nostr…</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listening activity</CardTitle>
          <CardDescription id="listening-sharing-description">When sharing is on, Ostrify publishes your current track or video as a public Nostr status that other people can see. For embedded videos, Ostrify reports that the video is open because it cannot reliably detect playback or pauses. When off, Ostrify stops publishing new statuses and attempts to publish a clearing update. This preference is saved on this device; a failed update can leave an earlier status visible until it expires, and relays or other clients may retain older copies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Switch
              id="listening-sharing"
              aria-describedby="listening-sharing-description"
              checked={sharing.enabled}
              disabled={!user}
              className={sharing.enabled ? 'data-[state=checked]:bg-emerald-600' : 'data-[state=unchecked]:bg-destructive'}
              onCheckedChange={value => { try { setClearResult(null); sharing.setEnabled(value); toast({ title: value ? 'Listening activity sharing enabled' : 'Sharing is off in Ostrify', description: value ? 'Your current track or video may be published publicly.' : 'Ostrify is attempting to publish a clearing update; this does not confirm that relays removed an earlier status.' }); } catch (error) { toast({ title: 'Could not update listening privacy', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); } }}
            />
            <label htmlFor="listening-sharing" className={`text-sm font-semibold ${sharing.enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
              {sharing.enabled ? 'Public — share my current track or video' : 'Sharing off in Ostrify — do not publish new statuses'}
            </label>
          </div>
          {!sharing.enabled && clearResult?.state === 'pending' && <p role="status" className="text-sm text-muted-foreground">Sharing is off in Ostrify. Publishing a clearing update…</p>}
          {!sharing.enabled && clearResult?.state === 'published' && <p role="status" className="text-sm text-muted-foreground">A clearing update was accepted by the configured relay publisher. Other relays or clients may still retain older copies.</p>}
          {!sharing.enabled && clearResult?.state === 'failed' && <p role="alert" className="text-sm text-destructive">Sharing is off in Ostrify, but the clearing update failed. An earlier status may remain visible until it expires. {clearResult.message}</p>}
          {!user && <p className="text-sm text-muted-foreground">Log in to change this setting.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how Ostrify looks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              onClick={() => setTheme("dark")}
              className="gap-2"
            >
              <Moon className="size-4" /> Dark
            </Button>
            <Button
              variant={theme === "light" ? "default" : "outline"}
              onClick={() => setTheme("light")}
              className="gap-2"
            >
              <Sun className="size-4" /> Light
            </Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
