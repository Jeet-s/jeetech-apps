import { useState } from "react";
import { View } from "react-native";
import { Card, HeroCard, ListItem, Screen, SectionHeader, gradient, palette, space, type, ProgressRing } from "../ui";
import { Text } from "react-native";
import { useSugar } from "../core/data";
import { useSettings } from "../modules/store";
import { activeProfile, liveReadings } from "../core/model";
import { loggingStreak, timeInRange } from "../core/insights";
import { nowTs } from "./shared";
import { ReportsScreen } from "./ReportsScreen";
import { RemindersScreen } from "./RemindersScreen";
import { MedicationsScreen } from "./MedicationsScreen";
import { BackupScreen } from "./BackupScreen";
import { ProfilesScreen } from "./ProfilesScreen";
import { SettingsScreen } from "./SettingsScreen";
import { SupportScreen } from "./SupportScreen";
import { DevicesScreen } from "./DevicesScreen";

type Route = "reports" | "reminders" | "medications" | "backup" | "profiles" | "devices" | "settings" | "support";

/** The More tab: a menu that routes to each secondary screen. */
export function MoreScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const data = useSugar();
  const settings = useSettings();
  const [route, setRoute] = useState<Route | null>(null);
  const back = () => setRoute(null);

  if (route === "reports") return <ReportsScreen bottomInset={bottomInset} onBack={back} />;
  if (route === "reminders") return <RemindersScreen bottomInset={bottomInset} onBack={back} />;
  if (route === "medications") return <MedicationsScreen bottomInset={bottomInset} onBack={back} />;
  if (route === "backup") return <BackupScreen bottomInset={bottomInset} onBack={back} />;
  if (route === "devices") return <DevicesScreen bottomInset={bottomInset} onBack={back} onPro={onPro} />;
  if (route === "profiles") return <ProfilesScreen bottomInset={bottomInset} onBack={back} />;
  if (route === "settings") return <SettingsScreen bottomInset={bottomInset} onPro={onPro} />;
  if (route === "support") return <SupportScreen bottomInset={bottomInset} onBack={back} />;

  const profile = activeProfile(data);
  const streak = loggingStreak(data, nowTs());
  const tir = timeInRange(data, nowTs(), 7);
  const total = liveReadings(data).length;

  return (
    <Screen title="More" subtitle={profile.name} bottomInset={bottomInset}>
      <HeroCard
        overline="This week"
        value={tir.total ? `${tir.pctInRange}% in range` : `${total} readings`}
        caption={data.streakEnabled && streak > 0 ? `${streak}-day logging streak · keep it gentle` : "Everything below is free — Pro only adds cloud & AI."}
        right={
          <ProgressRing
            value={tir.total ? tir.pctInRange / 100 : 0}
            size={84}
            stroke={9}
            color={gradient.onHero}
            track={gradient.pill}
            labelColor={gradient.onHero}
            label={tir.total ? `${tir.pctInRange}%` : "—"}
            sublabel="7-day"
          />
        }
      />

      <SectionHeader title="Tools" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem icon="doc" title="Doctor report" subtitle="PDF & CSV export, any date range" onPress={() => setRoute("reports")} />
        <ListItem icon="bell" title="Reminders" subtitle="Fasting, meals, medication, weekly" onPress={() => setRoute("reminders")} />
        <ListItem icon="pill" title="Medication" subtitle="Log doses & insulin" onPress={() => setRoute("medications")} />
        <ListItem icon="cloud" title="Backup & restore" subtitle="Snapshots, file export, phone change" onPress={() => setRoute("backup")} />
        <ListItem icon="link" title="Devices & meters" subtitle="Bluetooth sync, scan or CSV import" onPress={() => setRoute("devices")} />
        <ListItem icon="person" title="Profiles" subtitle="Track for yourself and family" onPress={() => setRoute("profiles")} />
      </Card>

      <SectionHeader title="App" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {!settings.pro ? (
          <ListItem icon="star" iconTint={palette.accent} title="Upgrade to Pro" subtitle="Cloud backup, AI coaching, clinician reports" onPress={() => onPro("more")} />
        ) : (
          <ListItem icon="star" iconTint={palette.accent} title="Pro unlocked" subtitle="Thanks for your support" />
        )}
        <ListItem icon="settings" title="Settings" subtitle="Units, target ranges, privacy, data" onPress={() => setRoute("settings")} />
        <ListItem icon="info" title="Support & changelog" subtitle="Reach a human in under 24h" onPress={() => setRoute("support")} />
      </Card>

      <Text style={[type.caption, { textAlign: "center" }]}>No account needed · Wellness information only</Text>
    </Screen>
  );
}
