import { useState, useEffect } from 'react';
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
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { APP_RELAYS } from '@/lib/appRelays';

interface Relay {
  url: string;
  read: boolean;
  write: boolean;
}

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
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const [relays, setRelays] = useState<Relay[]>(config.relayMetadata.relays);
  const [newRelayUrl, setNewRelayUrl] = useState('');

  // Sync local state with config when it changes (e.g., from NostrProvider sync).
  // This is a legitimate "mirror external source of truth" pattern: the local
  // `relays` state is what the UI edits optimistically, and we need to reset
  // it when the authoritative config changes from outside.
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

    // Update local config
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: newRelays,
        updatedAt: now,
      },
    }));

    // Publish to Nostr if user is logged in
    if (user) {
      publishNIP65RelayList(newRelays);
    }
  };

  const publishNIP65RelayList = (relayList: Relay[]) => {
    const tags = relayList.map(relay => {
      if (relay.read && relay.write) {
        return ['r', relay.url];
      } else if (relay.read) {
        return ['r', relay.url, 'read'];
      } else if (relay.write) {
        return ['r', relay.url, 'write'];
      }
      // If neither read nor write, don't include (shouldn't happen)
      return null;
    }).filter((tag): tag is string[] => tag !== null);

    publishEvent(
      {
        kind: 10002,
        content: '',
        tags,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Relay list published',
            description: 'Your relay list has been published to Nostr.',
          });
        },
        onError: (error) => {
          console.error('Failed to publish relay list:', error);
          toast({
            title: 'Failed to publish relay list',
            description: 'There was an error publishing your relay list to Nostr.',
            variant: 'destructive',
          });
        },
      }
    );
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
      <div className="space-y-2">
        {relays.map((relay) => (
          <div
            key={relay.url}
            className="flex items-center gap-3 p-3 rounded-md border bg-muted/20"
          >
            <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-mono text-sm truncate min-w-0" title={relay.url}>
              {renderRelayUrl(relay.url)}
            </span>
            {DEFAULT_RELAY_URLS.has(normalizeForCompare(relay.url)) ? (
              <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                Default
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-muted-foreground">
                Custom
              </Badge>
            )}
            <span className="flex-1" />

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
        ))}
      </div>

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
          {user
            ? 'Changes sync to your Nostr relay list (NIP-65).'
            : 'Log in to sync your relay list with Nostr.'}
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
                you added yourself will be removed.
                {user && ' Your updated list will be published to Nostr.'}
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