import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Sheet, toast } from "./Overlays";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Tappable } from "./Pressable";
import { palette, radius, space, type } from "./theme";
import { ai } from "../modules/ai";

const REASONS = [
  { id: "offensive", label: "Offensive or inappropriate" },
  { id: "harmful", label: "Harmful or unsafe advice" },
  { id: "inaccurate", label: "Wrong or misleading" },
  { id: "other", label: "Something else" },
] as const;

/**
 * "Report this AI response" — required by Google Play under every AI-generated response (AI-generated content
 * policy). Place it directly below each AI result: <AiReport feature="meal_photo" />.
 */
export function AiReport({ feature }: { feature: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: "flex-start", marginTop: space.xs }}>
      <Tappable onPress={() => setOpen(true)} label="Report this AI response" style={styles.flagBtn}>
        <Icon name="flag" size={13} color={palette.inkMuted} />
        <Text style={[type.label, { color: palette.inkMuted }]}>Report</Text>
      </Tappable>
      <Sheet visible={open} title="Report this AI response" onClose={() => setOpen(false)}>
        <Text style={[type.body, { color: palette.inkSoft, marginBottom: space.md }]}>
          AI can make mistakes. Tell us what was wrong — it helps us make it safer.
        </Text>
        {REASONS.map((r) => (
          <Button
            key={r.id}
            label={r.label}
            variant="secondary"
            style={{ marginBottom: space.sm }}
            onPress={() => {
              ai.reportAiOutput(feature, r.id);
              setOpen(false);
              toast("Thanks — reported to the developer.");
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  // A subtle, consistent icon button (not a low-contrast underlined link).
  flagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
  },
});
