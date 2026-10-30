import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, Icon, IconButton, Sheet, Tappable, TextField, feedback, palette, space, toast, type } from "../ui";
import { useSugar, sugarStore } from "../core/data";
import { addProfile, switchProfile, renameProfile, deleteProfile, type ProfileError } from "../core/profiles";
import { CUISINES, CUISINE_LABEL, type Cuisine, type Profile } from "../core/model";
import { analytics } from "../modules/analytics";
import { SubScreen, nowTs } from "./shared";

const ERR: Record<ProfileError, string> = { empty_name: "Enter a name.", duplicate: "You already have a profile with this name.", last_profile: "You need at least one profile." };

export function ProfilesScreen({ bottomInset, onBack }: { bottomInset: number; onBack: () => void }) {
  const data = useSugar();
  const [sheet, setSheet] = useState<null | { mode: "add" } | { mode: "edit"; profile: Profile }>(null);

  const pick = (p: Profile) => {
    if (p.id === data.activeProfileId) return;
    sugarStore.set(switchProfile(data, p.id));
    feedback("success", "success");
    toast(`Switched to ${p.name}`);
  };

  const remove = (p: Profile) =>
    Alert.alert("Delete profile?", `This deletes "${p.name}" and all of its readings, meals and medication. It can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const res = deleteProfile(data, p.id);
          if (res.error) { feedback("error", "error"); toast(ERR[res.error]); return; }
          sugarStore.set(res.state);
          feedback("pop", "warning");
          toast("Profile deleted");
        },
      },
    ]);

  return (
    <>
      <SubScreen
        title="Profiles"
        subtitle="Track for yourself and family"
        onBack={onBack}
        bottomInset={bottomInset}
        right={<IconButton icon="plus" label="Add profile" tone="primary" onPress={() => setSheet({ mode: "add" })} />}
      >
        <View style={{ gap: space.sm }}>
          {data.profiles.map((p) => {
            const active = p.id === data.activeProfileId;
            return (
              <Card key={p.id} padded={false} style={styles.row} accent={active ? palette.primary : undefined}>
                <Tappable label={`${p.name}${active ? ", active" : ""}. Tap to switch`} onPress={() => pick(p)} style={styles.rowMain}>
                  <View style={[styles.avatar, active && { backgroundColor: palette.primary }]}>
                    <Icon name="person" size={18} color={active ? palette.onPrimary : palette.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong}>{p.name}</Text>
                    <Text style={type.caption}>{CUISINE_LABEL[p.cuisine]} · {p.unit === "mmol" ? "mmol/L" : "mg/dL"}{active ? " · active" : ""}</Text>
                  </View>
                  {active ? <Icon name="check" size={20} color={palette.primary} /> : null}
                </Tappable>
                <IconButton icon="edit" label={`Edit ${p.name}`} size={38} onPress={() => setSheet({ mode: "edit", profile: p })} style={{ marginRight: space.sm }} />
              </Card>
            );
          })}
        </View>

        <Text style={[type.caption, { textAlign: "center", marginTop: space.sm }]}>
          Each profile keeps its own readings, meals and medication on this device. To share a summary with a clinician, open Doctor report for a PDF or CSV.
        </Text>
      </SubScreen>

      {sheet ? (
        <ProfileSheet
          mode={sheet.mode}
          profile={sheet.mode === "edit" ? sheet.profile : undefined}
          onClose={() => setSheet(null)}
          onDelete={sheet.mode === "edit" && data.profiles.length > 1 ? () => { remove(sheet.profile); setSheet(null); } : undefined}
        />
      ) : null}
    </>
  );
}

function ProfileSheet({ mode, profile, onClose, onDelete }: { mode: "add" | "edit"; profile?: Profile; onClose: () => void; onDelete?: () => void }) {
  const data = useSugar();
  const [name, setName] = useState(profile?.name ?? "");
  const [cuisine, setCuisine] = useState<Cuisine>(profile?.cuisine ?? "india");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (mode === "edit" && profile) {
      const res = renameProfile(data, profile.id, name);
      if (res.error) { feedback("error", "error"); return setError(ERR[res.error]); }
      sugarStore.set(res.state);
    } else {
      const res = addProfile(data, { name, cuisine }, nowTs());
      if (res.error) { feedback("error", "error"); return setError(ERR[res.error]); }
      sugarStore.set(res.state);
      analytics.track("core_action", { feature: "profile_added" });
    }
    feedback("success", "success");
    toast(mode === "edit" ? "Profile updated" : `Added ${name.trim()}`);
    onClose();
  };

  return (
    <Sheet visible title={mode === "edit" ? "Edit profile" : "New profile"} onClose={onClose}>
      <TextField label="Name" placeholder="e.g. Mum, Dad, Me" value={name} onChangeText={(t) => { setName(t); setError(null); }} error={error} maxLength={40} autoFocus />
      {mode === "add" ? (
        <>
          <Text style={type.label}>CUISINE</Text>
          <View style={styles.chips}>
            {CUISINES.map((c) => <Chip key={c} label={CUISINE_LABEL[c]} selected={cuisine === c} onPress={() => setCuisine(c)} />)}
          </View>
        </>
      ) : null}
      <Button label={mode === "edit" ? "Save" : "Add profile"} size="lg" icon="check" onPress={save} />
      {onDelete ? <Button label="Delete profile" variant="danger" icon="trash" onPress={onDelete} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, minHeight: 64 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
