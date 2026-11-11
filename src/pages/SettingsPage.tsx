import { useSeoMeta } from "@unhead/react";
import { Radio, Sun, Moon, UserRound, Heart, Music2, Library, Users, Mic } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RelayListManager } from "@/components/RelayListManager";
import { useTheme } from "@/hooks/useTheme";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useListeningSharing } from "@/hooks/useListeningSharing";
import { Switch } from "@/components/ui/switch";
import { useDirectoryEnrollment } from "@/hooks/useOstrifyDirectory";
import { useToast } from "@/hooks/useToast";
import { useProfilePrivacy } from "@/hooks/useProfilePrivacy";

const SettingsPage = () => {
  useSeoMeta({ title: "Settings — Ostrify" });
  const { theme, setTheme } = useTheme();
  const { user } = useCurrentUser();
  const sharing = useListeningSharing();
  const directory = useDirectoryEnrollment();
  const privacy = useProfilePrivacy();
  const { toast } = useToast();

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="size-5 text-primary" />
            Relays
          </CardTitle>
          <CardDescription>
            Ostrify loads music and podcasts from these relays. Add more sources to discover
            more audio, and toggle read (fetch music) or write (publish your likes &amp; playlists)
            for each. These choices apply only to Ostrify and never overwrite your NIP-65 relay
            list or change relay settings in other Nostr clients.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RelayListManager />
        </CardContent>
      </Card>

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
          {([
            ['liked', 'Liked songs', Heart],
            ['artists', 'Followed artists', Music2],
            ['people', 'Friends on Ostrify', Users],
            ['playlists', 'Playlists', Library],
            ['podcasts', 'Saved podcasts', Mic],
          ] as const).map(([section, label, Icon]) => <div key={section} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-3"><Icon className="size-5 text-muted-foreground" /><div><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{privacy.isHidden(section) ? 'Private on your profile' : 'Visible on your profile'}</p></div></div>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Private</span><Switch aria-label={`Show ${label} on profile`} checked={!privacy.isHidden(section)} disabled={!user || privacy.isSaving || privacy.isLoading || privacy.isError || !privacy.hasReadRelays} onCheckedChange={visible => privacy.setVisibility.mutate({ section, visible }, { onSuccess: () => toast({ title: `${label} ${visible ? 'shown on' : 'hidden from'} your profile` }), onError: error => toast({ title: 'Could not update profile privacy', description: error.message, variant: 'destructive' }) })} /><span className="text-xs text-muted-foreground">Public</span></div>
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
          <CardDescription id="listening-sharing-description">When sharing is on, Ostrify publishes the name of your current track as a public Nostr status that other people can see. When off, Ostrify stops sharing and asks relays to clear your current status. This preference is saved on this device, and relays or other clients may retain older copies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Switch
              id="listening-sharing"
              aria-describedby="listening-sharing-description"
              checked={sharing.enabled}
              disabled={!user}
              className={sharing.enabled ? 'data-[state=checked]:bg-emerald-600' : 'data-[state=unchecked]:bg-destructive'}
              onCheckedChange={value => { try { sharing.setEnabled(value); toast({ title: value ? 'Listening activity is public' : 'Listening activity is private', description: value ? 'Your current track will be shared publicly.' : 'Ostrify asks relays to clear your current status where possible.' }); } catch (error) { toast({ title: 'Could not update listening privacy', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); } }}
            />
            <label htmlFor="listening-sharing" className={`text-sm font-semibold ${sharing.enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
              {sharing.enabled ? 'Public — share my current track' : 'Private — do not share my listening activity'}
            </label>
          </div>
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
    </div>
  );
};

export default SettingsPage;
