import { useState, useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { Plus, X, Wifi, Settings, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { APP_RELAYS } from '@/lib/appRelays';
import { AudioCatalogCapturePanel } from '@/components/AudioCatalogCapturePanel';

interface Relay {
  url: string;
  read: boolean;
  write: boolean;
}

type RelayHealth = 'checking' | 'reachable' | 'unreachable';

/** Normalize a relay URL for set membership comparison (ignore trailing slash). */
function normalizeForCompare(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

/** The set of Ostrify's recommended default relay URLs, normalized. */
const DEFAULT_RELAY_URLS = new Set(
  APP_RELAYS.relays.map((r) => normalizeForCompare(r.url)),
);

export function RelayListManager() {
  const { config, updateConfig } = useAppContext();
  const { nostr } = useNostr();
  const { toast } = useToast();

  const [relays, setRelays] = useState<Relay[]>(config.relayMetadata.relays);
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [health, setHealth] = useState<Record<string, RelayHealth>>({});

  // Probe each enabled relay with a small REQ. A successful EOSE means the
  // WebSocket connected and accepted a Nostr subscription; errors/timeouts are offline.
  useEffect(() => {
    let active = true;
    const checkRelays = async () => {
      const urls = relays.map(relay => relay.url);
      setHealth(current => Object.fromEntries(urls.map(url => [url, current[url] ?? 'checking'])));
      await Promise.all(relays.map(async relay => {
        try {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 7000);
          try {
            let receivedEose = false;
            for await (const message of nostr.relay(relay.url).req([{ kinds: [0], limit: 1 }], { signal: controller.signal })) {
              if (message[0] === 'EOSE') {
                receivedEose = true;
                break;
              }
            }
            if (active) setHealth(current => ({ ...current, [relay.url]: receivedEose ? 'reachable' : 'unreachable' }));
          } finally {
            window.clearTimeout(timeout);
          }
        } catch {
          if (active) setHealth(current => ({ ...current, [relay.url]: 'unreachable' }));
        }
      }));
    };

    void checkRelays();
    const interval = window.setInterval(() => { void checkRelays(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [nostr, relays]);

  // Sync the editable relay list with its persisted app-specific configuration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRelays(config.relayMetadata.relays);
  }, [config.relayMetadata.relays]);

  const normalizeRelayUrl = (url: string): string => {
    url = url.trim();
    try {
      return new URL(url).toString();
    } catch {
      try {
        return new URL(`wss://${url}`).toString();
      } catch {
        return url;
      }
    }
  };

  const isValidRelayUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;

    const normalized = normalizeRelayUrl(trimmed);
    try {
      new URL(normalized);
      return true;
    } catch {
      return false;
    }
  };

  const handleAddRelay = () => {
    if (!isValidRelayUrl(newRelayUrl)) {
      toast({
        title: 'Invalid relay URL',
        description: 'Please enter a valid relay URL (e.g., wss://relay.example.com)',
        variant: 'destructive',
      });
      return;
    }

    const normalized = normalizeRelayUrl(newRelayUrl);

    if (relays.some(r => r.url === normalized)) {
      toast({
        title: 'Relay already exists',
        description: 'This relay is already in your list.',
        variant: 'destructive',
      });
      return;
    }

    const newRelays = [...relays, { url: normalized, read: true, write: true }];
    setRelays(newRelays);
    setNewRelayUrl('');

    saveRelays(newRelays);
  };

  const handleRemoveRelay = (url: string) => {
    const newRelays = relays.filter(r => r.url !== url);
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const handleToggleRead = (url: string) => {
    const newRelays = relays.map(r =>
      r.url === url ? { ...r, read: !r.read } : r
    );
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const handleToggleWrite = (url: string) => {
    const newRelays = relays.map(r =>
      r.url === url ? { ...r, write: !r.write } : r
    );
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const handleResetDefaults = () => {
    const defaults = APP_RELAYS.relays.map((r) => ({ ...r }));
    setRelays(defaults);
    saveRelays(defaults);
    toast({
      title: 'Relays reset',
      description: "Restored Ostrify's recommended default relays.",
    });
  };

  const saveRelays = (newRelays: Relay[]) => {
    // Only called from event handlers, not during render, so Date.now() is safe.
    // eslint-disable-next-line react-hooks/purity
    const now = Math.floor(Date.now() / 1000);

    // Persist relay choices only in Ostrify's local app configuration.
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: newRelays,
        updatedAt: now,
      },
    }));
  };

  const renderRelayUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'wss:') {
        if (parsed.pathname === '/') {
          return parsed.host;
        } else {
          return parsed.host + parsed.pathname;
        }
      } else {
        return parsed.href;
      }
    } catch {
      return url;
    }
  }

  return (
    <div className="space-y-4">
      {/* Relay List */}
      <div className="grid grid-cols-2 gap-2">
        {relays.map((relay) => (
          <div
            key={relay.url}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 rounded-md border bg-muted/20 p-2 sm:p-3"
          >
            <Wifi className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-mono text-xs sm:text-sm" title={relay.url}>
              {renderRelayUrl(relay.url)}
            </span>
            <span
              role="status"
              aria-label={`${renderRelayUrl(relay.url)} read connection ${health[relay.url] ?? 'checking'}`}
              title={`Read connection ${health[relay.url] ?? 'checking'} — write availability is not tested`}
              className="inline-flex size-3 shrink-0 items-center justify-center rounded-full"
            >
              <span className={`size-2.5 rounded-full shadow-[0_0_8px_currentColor] ${
                health[relay.url] === 'reachable'
                  ? 'bg-emerald-500 text-emerald-500'
                  : health[relay.url] === 'unreachable'
                    ? 'bg-red-500 text-red-500'
                    : 'animate-pulse bg-amber-400 text-amber-400'
              }`} />
            </span>
            {DEFAULT_RELAY_URLS.has(normalizeForCompare(relay.url)) ? (
              <Badge variant="secondary" className="col-start-2 w-fit shrink-0 px-1.5 py-0 text-[10px]">
                Default
              </Badge>
            ) : (
              <Badge variant="outline" className="col-start-2 w-fit shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
                Custom
              </Badge>
            )}
            <div className="col-start-3 row-start-2 flex items-center justify-end gap-1">
              {/* Settings Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="end">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`read-${relay.url}`} className="text-sm cursor-pointer">
                        Read
                      </Label>
                      <Switch
                        id={`read-${relay.url}`}
                        checked={relay.read}
                        onCheckedChange={() => handleToggleRead(relay.url)}
                        className="data-[state=checked]:bg-green-500 scale-75"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`write-${relay.url}`} className="text-sm cursor-pointer">
                        Write
                      </Label>
                      <Switch
                        id={`write-${relay.url}`}
                        checked={relay.write}
                        onCheckedChange={() => handleToggleWrite(relay.url)}
                        className="data-[state=checked]:bg-blue-500 scale-75"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Remove Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveRelay(relay.url)}
                className="size-5 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
                disabled={relays.length <= 1}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-emerald-600 dark:text-emerald-400">Green</span> means the relay answered a read check;{' '}
        <span className="font-medium text-red-600 dark:text-red-400">red</span> means it did not respond. Amber means checking. This does not test publishing.
      </p>
      <AudioCatalogCapturePanel />

      {/* Add Relay Form */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="new-relay-url" className="sr-only">
            Relay URL
          </Label>
          <Input
            id="new-relay-url"
            placeholder="Enter relay URL (e.g., wss://relay.example.com)"
            value={newRelayUrl}
            onChange={(e) => setNewRelayUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddRelay();
              }
            }}
          />
        </div>
        <Button
          onClick={handleAddRelay}
          disabled={!newRelayUrl.trim()}
          variant="outline"
          size="sm"
          className="h-10 shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Relay
        </Button>
      </div>

      {/* Reset to defaults */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-xs text-muted-foreground">
          These relay choices are saved in Ostrify only and won’t change your NIP-65 relay list.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to defaults
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset to Ostrify defaults?</AlertDialogTitle>
              <AlertDialogDescription>
                This replaces your current relay list with Ostrify's recommended set,
                including the music-focused relays (Wavlake, Fountain, and more). Any relays
                you added yourself will be removed. This affects Ostrify only; your NIP-65 relay
                list on Nostr won’t be changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetDefaults}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}