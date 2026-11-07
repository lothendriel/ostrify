import { useSeoMeta } from "@unhead/react";
import { Radio, Sun, Moon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RelayListManager } from "@/components/RelayListManager";
import { useTheme } from "@/hooks/useTheme";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useListeningSharing } from "@/hooks/useListeningSharing";
import { Switch } from "@/components/ui/switch";

const SettingsPage = () => {
  useSeoMeta({ title: "Settings — Ostrify" });
  const { theme, setTheme } = useTheme();
  const { user } = useCurrentUser();
  const sharing = useListeningSharing();

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
