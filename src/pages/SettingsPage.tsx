import { useSeoMeta } from "@unhead/react";
import { Radio, Sun, Moon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RelayListManager } from "@/components/RelayListManager";
import { useTheme } from "@/hooks/useTheme";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useListeningSharing } from "@/hooks/useListeningSharing";
import { Switch } from "@/components/ui/switch";
import { useDirectoryEnrollment } from "@/hooks/useOstrifyDirectory";
import { useToast } from "@/hooks/useToast";

const SettingsPage = () => {
  useSeoMeta({ title: "Settings — Ostrify" });
  const { theme, setTheme } = useTheme();
  const { user } = useCurrentUser();
  const sharing = useListeningSharing();
  const directory = useDirectoryEnrollment();
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
            Ostrify loads all music and podcasts from these relays. Add more sources to
            discover more audio, and toggle read (fetch music) or write (publish your likes
            &amp; playlists) for each. When you're logged in, your list syncs across every
            Nostr client via NIP-65.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RelayListManager />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ostrify directory</CardTitle>
          <CardDescription>Opt in to a public Nostr listing so people can find your name and profile picture in Ostrify. This does not make anyone your friend or share your listening activity. Turning it off publishes a withdrawal; relays or clients may retain older copies.</CardDescription>
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
        <CardHeader><CardTitle>Listening activity</CardTitle><CardDescription>When enabled, your current track is published publicly on Nostr—not just to friends. Relays may retain or copy it. Off by default; this preference is saved on this device. Pausing or turning it off sends a clearing status.</CardDescription></CardHeader>
        <CardContent className="flex items-center gap-3"><Switch id="listening-sharing" checked={sharing.enabled} disabled={!user} onCheckedChange={sharing.setEnabled} /><label htmlFor="listening-sharing" className="text-sm font-medium">Share what I’m listening to</label>{!user && <span className="text-sm text-muted-foreground">Log in to enable</span>}</CardContent>
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
