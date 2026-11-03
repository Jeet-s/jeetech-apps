import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBannerHeight } from "../modules/layout";
import {
  IconButton,
  Pill,
  Tappable,
  categorical,
  fonts,
  palette,
  radius,
  space,
  type,
  useCloudUser,
} from "../ui";
import { feedback } from "../audio/sfx";
import { cloud } from "../modules/cloud";
import { appStore, useApp } from "../core/data";
import type { AppState } from "../core/app";
import { nameResolver, teamResolver, type NameOf } from "../core/format";
import type { Player, Team } from "../core/types";

/** Read + write the single app store (append-only ball logs live inside). */
export { useApp, appStore };
export const commit = (fn: (s: AppState) => AppState) => appStore.set(fn);

/** Memoised name resolvers for a render. */
export function useNames(players: Player[], teams: Team[]): { playerName: NameOf; teamName: NameOf } {
  const playerName = useMemo(() => nameResolver(players), [players]);
  const teamName = useMemo(() => teamResolver(teams), [teams]);
  return { playerName, teamName };
}

/** A stable colour for a player/team chip, from its id. */
export function colorFor(id: string | null | undefined): string {
  if (!id) return palette.inkMuted;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return categorical[h % categorical.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Coloured initials avatar — no photos, no permissions. */
export function Avatar({ name, id, size = 40, color }: { name: string; id?: string; size?: number; color?: string }) {
  const c = color ?? colorFor(id ?? name);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${c}2E`, borderColor: c }]}>
      <Text style={[type.bodyStrong, { color: c, fontSize: size * 0.4 }]} numberOfLines={1}>
        {initials(name)}
      </Text>
    </View>
  );
}

/**
 * Scaffold for a pushed (stacked) screen: a back button + title header, then a
 * scrolling body with safe-area + tab-bar padding and the status-bar scrim.
 */
export function Stack({
  title,
  subtitle,
  onBack,
  right,
  children,
  bottomInset = 0,
  scroll = true,
  contentStyle,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  bottomInset?: number;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const header = (
    <View style={styles.headerRow}>
      <IconButton icon="chevronLeft" label="Back" onPress={onBack} />
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={[type.label, { marginBottom: 1 }]} numberOfLines={1}>{subtitle}</Text> : null}
        <Text style={type.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
  const pad = { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + bottomInset + banner + space.xl };
  return (
    <View style={styles.root}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, pad, contentStyle]} keyboardShouldPersistTaps="handled">
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, pad, { flex: 1 }, contentStyle]}>
          {header}
          {children}
        </View>
      )}
      <View pointerEvents="none" style={[styles.statusBar, { height: insets.top }]} />
    </View>
  );
}

/** Compact −/value/+ stepper for rules and score-only totals. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const set = (v: number) => {
    const n = Math.max(min, Math.min(max, v));
    if (n !== value) {
      feedback("pop", "select");
      onChange(n);
    }
  };
  return (
    <View style={styles.stepRow}>
      <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{label}</Text>
      <View style={styles.stepper}>
        <Tappable label={`Decrease ${label}`} sound={null} onPress={() => set(value - step)} style={styles.stepBtn} disabled={value <= min}>
          <Text style={styles.stepSign}>−</Text>
        </Tappable>
        <Text style={[type.amount, styles.stepVal]} numberOfLines={1}>{value}{suffix ?? ""}</Text>
        <Tappable label={`Increase ${label}`} sound={null} onPress={() => set(value + step)} style={styles.stepBtn} disabled={value >= max}>
          <Text style={styles.stepSign}>+</Text>
        </Tappable>
      </View>
    </View>
  );
}

/**
 * Honest backup-status chip derived from the real cloud state (QA #7 / best-in-category "sync trust"): the free
 * cloud backup is only promised when it's actually on. A local-only build says so plainly instead of implying sync;
 * a signed-in account reads "Synced"; an anonymous (not-yet-signed-in) cloud account is backing up but needs an
 * email to restore on a new phone, so it says so rather than over-claiming recoverability.
 */
export function SyncChip() {
  const user = useCloudUser();
  if (!cloud.enabled) return <Pill label="Saved on this phone" tone="neutral" />;
  if (user && !user.anonymous) return <Pill label="Backup on · Synced" tone="success" />;
  // A calm neutral nudge, not an alarming amber chip that competes with the primary CTA (QA ux_polish).
  return <Pill label="Add email to back up" tone="neutral" />;
}

/** A small label/value pill used across detail screens. */
export function KeyVal({ label, value, tone = palette.ink }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ alignItems: "center", gap: 2, flex: 1 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.number, { color: tone, fontSize: 22 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[type.caption, { textAlign: "center" }]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  statusBar: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: palette.bg, zIndex: 10 },
  content: { paddingHorizontal: space.lg, gap: space.lg, width: "100%", maxWidth: 640, alignSelf: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginLeft: -8, marginBottom: space.xs },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44 },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, padding: 3 },
  stepBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  stepSign: { fontFamily: fonts.bold, fontSize: 22, color: palette.primary, lineHeight: 26 },
  stepVal: { minWidth: 52, textAlign: "center" },
});
