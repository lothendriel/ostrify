import { useEffect, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { Globe2, Plus, RotateCcw, Server, X } from 'lucide-react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { APP_BLOSSOM_SERVERS, parseBlossomServerList } from '@/lib/appBlossom';
import { newestEventForCoordinate } from '@/lib/libraryQuery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

function normalizeServerUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function formatServerUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return value;
  }
}

export function BlossomServerManager() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const activePubkey = useRef(user?.pubkey);
  useEffect(() => { activePubkey.current = user?.pubkey; }, [user?.pubkey]);
  const { toast } = useToast();
  const publish = useNostrPublish();
  const [servers, setServers] = useState(config.blossomServerMetadata.servers);
  const [newServerUrl, setNewServerUrl] = useState('');
  const [loadingPublished, setLoadingPublished] = useState(false);
  const isLocalList = config.blossomServerMetadata.isLocal === true || (config.blossomServerMetadata.isLocal === undefined && config.blossomServerMetadata.updatedAt > 0 && !config.blossomServerMetadata.eventId);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServers(config.blossomServerMetadata.servers);
  }, [config.blossomServerMetadata.servers]);

  const saveServers = (nextServers: string[]) => {
    setServers(nextServers);
    // eslint-disable-next-line react-hooks/purity
    const now = Math.floor(Date.now() / 1000);
    updateConfig(current => ({
      ...current,
      blossomServerMetadata: { servers: nextServers, updatedAt: now, isLocal: true },
    }));
  };

  const addServer = () => {
    const normalized = normalizeServerUrl(newServerUrl);
    if (!normalized) {
      toast({
        title: 'Invalid Blossom server URL',
        description: 'Enter a secure HTTPS address, such as https://blossom.example.com.',
        variant: 'destructive',
      });
      return;
    }
    const alreadyAdded = servers.some(server => normalizeUrl(server) === normalizeUrl(normalized));
    const isAppDefault = APP_BLOSSOM_SERVERS.servers.some(server => normalizeUrl(server) === normalizeUrl(normalized));
    if (alreadyAdded || isAppDefault) {
      toast({ title: 'Server already included', description: 'This server is already in your list or Ostrify’s defaults.' });
      return;
    }
    saveServers([...servers, normalized]);
    setNewServerUrl('');
  };

  const removeServer = (url: string) => saveServers(servers.filter(server => server !== url));

  const toggleAppServers = (enabled: boolean) => {
    updateConfig(current => ({ ...current, useAppBlossomServers: enabled }));
  };

  const publishServerList = async () => {
    try {
      const event = await publish.mutateAsync({
        kind: 10063,
        content: '',
        tags: servers.map(server => ['server', server]),
      });
      if (!user || event.pubkey !== user.pubkey || event.kind !== 10063) throw new Error('The signer returned a different account or event. Check your signer and retry.');
      updateConfig(current => {
        // Do not discard changes made while the signer or relay was responding.
        if (current.userRelayPubkey !== event.pubkey || JSON.stringify(current.blossomServerMetadata?.servers ?? []) !== JSON.stringify(servers)) return current;
        return { ...current, blossomServerMetadata: { servers, updatedAt: event.created_at, eventId: event.id, pubkey: event.pubkey, isLocal: false } };
      });
      toast({
        title: 'Blossom server list published',
        description: 'Your personal server list was published to your configured Nostr relays.',
      });
    } catch (error) {
      toast({
        title: 'Could not publish server list',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const loadPublishedList = async () => {
    if (!user) return;
    const pubkey = user.pubkey;
    const before = JSON.stringify(config.blossomServerMetadata);
    setLoadingPublished(true);
    try {
      const events = await nostr.query([{ kinds: [10063], authors: [pubkey], limit: 20 }], { signal: AbortSignal.timeout(8000) });
      const event = newestEventForCoordinate(events, pubkey, 10063);
      if (!event) throw new Error('No published server list was found on the responding relays. Your local list was kept.');
      if (activePubkey.current !== pubkey) throw new Error('Your account changed. Your local list was kept.');
      let applied = false;
      updateConfig(current => {
        if (current.userRelayPubkey !== pubkey || JSON.stringify(current.blossomServerMetadata ?? config.blossomServerMetadata) !== before) return current;
        applied = true;
        return { ...current, blossomServerMetadata: { servers: parseBlossomServerList(event), updatedAt: event.created_at, eventId: event.id, pubkey, isLocal: false } };
      });
      if (!applied) throw new Error('Your settings changed while loading. Your local list was kept; try again.');
      toast({ title: 'Published server list loaded', description: 'Your local list was replaced with the newest revision returned by the relays.' });
    } catch (error) {
      toast({ title: 'Could not load published list', description: error instanceof Error ? error.message : 'Your local list was kept.', variant: 'destructive' });
    } finally {
      setLoadingPublished(false);
    }
  };

  const resetDefaults = () => {
    updateConfig(current => ({ ...current, useAppBlossomServers: true }));
    saveServers([]);
    toast({ title: 'Ostrify defaults restored', description: 'Public community Blossom servers are enabled.' });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3">
        <div className="flex gap-3">
          <Globe2 className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium">Use Ostrify’s public servers</p>
            <p className="text-sm text-muted-foreground">Include these community servers for uploads. They are provided for public use; availability and policies are managed by their operators.</p>
          </div>
        </div>
        <Switch
          aria-label="Use Ostrify's public Blossom servers"
          checked={config.useAppBlossomServers}
          onCheckedChange={toggleAppServers}
        />
      </div>

      {config.useAppBlossomServers && (
        <div className="space-y-2" aria-label="Ostrify public Blossom servers">
          {APP_BLOSSOM_SERVERS.servers.map(url => (
            <div key={url} className="flex items-center gap-3 rounded-md border bg-muted/20 p-3">
              <Server className="size-4 shrink-0 text-muted-foreground" />
              <a className="min-w-0 flex-1 truncate font-mono text-sm underline-offset-4 hover:underline" href={url} target="_blank" rel="noreferrer" title={url}>
                {formatServerUrl(url)}
              </a>
              <Badge variant="secondary" className="shrink-0">Ostrify default</Badge>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Your servers</h3>
        {servers.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No personal servers added. You can use Ostrify’s defaults above or add your own.</p>
        ) : servers.map(url => (
          <div key={url} className="flex items-center gap-3 rounded-md border bg-muted/20 p-3">
            <Server className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-sm" title={url}>{formatServerUrl(url)}</span>
            <Badge variant="outline" className="shrink-0">Personal</Badge>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${url}`} onClick={() => removeServer(url)} className="size-8 shrink-0 text-muted-foreground hover:text-destructive">
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-blossom-server" className="sr-only">Blossom server URL</Label>
        <div className="flex gap-2">
          <Input
            id="new-blossom-server"
            type="url"
            inputMode="url"
            placeholder="https://blossom.example.com"
            value={newServerUrl}
            onChange={event => setNewServerUrl(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') addServer(); }}
          />
          <Button type="button" variant="outline" onClick={addServer} disabled={!newServerUrl.trim()} className="shrink-0">
            <Plus className="mr-2 size-4" /> Add server
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Only HTTPS server URLs are accepted. Your personal server list is stored on this device until you publish it to Nostr.</p>
        {isLocalList && <p role="status" className="text-xs text-muted-foreground">Your local list is protected from background updates. Publish it, or replace it with your published list below.</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">Uploads try the enabled servers in order.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={resetDefaults}>
            <RotateCcw className="mr-2 size-4" /> Reset defaults
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={!user || loadingPublished || publish.isPending}>
                {loadingPublished ? 'Loading…' : 'Replace with published list'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace your local server list?</AlertDialogTitle>
                <AlertDialogDescription>Ostrify will replace this device’s personal server list with the latest published list returned by your relays. Unpublished local changes will be lost. If no list can be found, your local list will be kept.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep local list</AlertDialogCancel>
                <AlertDialogAction onClick={() => void loadPublishedList()}>Replace list</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button type="button" size="sm" onClick={() => void publishServerList()} disabled={!user || publish.isPending || loadingPublished}>
            {publish.isPending ? 'Publishing…' : 'Publish list to Nostr'}
          </Button>
        </div>
      </div>
      {!user && <p className="text-sm text-muted-foreground">Log in with a signer to publish your personal server list as a Nostr kind 10063 event.</p>}
    </div>
  );
}
