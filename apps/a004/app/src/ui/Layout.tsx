import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBannerHeight } from "../modules/layout";
import { palette, radius, shadow, space, type } from "./theme";

/** Content never stretches wider than this — centred with margins on tablets/landscape. */
const MAX_CONTENT = 640;

/**
 * Screen scaffold: safe areas, the large title header, scrolling content and
 * bottom padding that clears the tab bar + banner. Every screen starts here.
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  bottomInset = 0,
  contentStyle,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  /** Extra space the screen must leave at the bottom (e.g. the tab bar height). */
  bottomInset?: number;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const header = title ? (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={[type.label, styles.subtitle]}>{subtitle}</Text> : null}
        <Text style={type.display} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
      </View>
      {right}
    </View>
  ) : null;
  const pad = { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + bottomInset + banner + space.xl };
  const body = (
    <View style={[styles.content, !scroll && { flex: 1 }, contentStyle]}>
      {header}
      {children}
    </View>
  );
  return (
    <View style={styles.root}>
      {scroll ? (
        <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={[pad, { flex: 1 }]}>{body}</View>
      )}
      {/* Opaque strip behind the (translucent) status bar: scrolled content must never sit under the clock/icons. */}
      <View pointerEvents="none" style={[styles.statusBar, { height: insets.top }]} />
    </View>
  );
}

/**
 * Scrolling body between a FIXED top (progress dots, step header) and a FIXED
 * bottom action bar (Continue / Save) — onboarding steps, editors, long forms.
 * Use this instead of hand-rolling ScrollView + footer: on a 720x1280 phone the
 * body scrolls, and soft fades at the scroll edges show that content continues,
 * so nothing ever looks covered by the header or the button bar.
 */
export function FooterScreen({
  top,
  footer,
  children,
  contentStyle,
}: {
  top?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const [edge, setEdge] = useState({ above: false, below: false });
  const [box, setBox] = useState(0);
  // Whether the content fits inside the viewport. When it does, we vertically CENTRE it (calm, framed
  // look). When it DOESN'T, we must top-align it: `justifyContent: "center"` on a ScrollView content
  // container silently clips content taller than the viewport at BOTH edges and makes the top
  // unreachable (you can't scroll above offset 0) — which is exactly how a tall onboarding step had
  // its hero illustration sliced off the top and its helper text buried under the footer with no way
  // to scroll to either. Top-aligning restores a normal, fully-scrollable column.
  const [fits, setFits] = useState(true);
  const m = useRef({ y: 0, content: 0, box: 0 });
  const refresh = () => {
    const above = m.current.y > 2;
    const below = m.current.y + m.current.box < m.current.content - 2;
    if (above !== edge.above || below !== edge.below) setEdge({ above, below });
    const f = m.current.box === 0 || m.current.content <= m.current.box + 1;
    setFits((v) => (v === f ? v : f));
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    m.current.y = e.nativeEvent.contentOffset.y;
    refresh();
  };
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      {top ? <View style={styles.fixedTop}><View style={styles.capped}>{top}</View></View> : null}
      <View style={{ flex: 1 }} onLayout={(e) => { const h = e.nativeEvent.layout.height; m.current.box = h; setBox(h); refresh(); }}>
        <ScrollView
          contentContainerStyle={[styles.footerBody, { minHeight: box }, !fits && styles.footerBodyTop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={edge.below || edge.above}
          scrollEventThrottle={32}
          onScroll={onScroll}
          onContentSizeChange={(_, h) => {
            m.current.content = h;
            refresh();
          }}
        >
          <View style={[styles.footerInner, contentStyle]}>{children}</View>
        </ScrollView>
        {edge.above ? <LinearGradient pointerEvents="none" colors={[palette.bg, `${palette.bg}00`]} style={[styles.fade, { top: 0 }]} /> : null}
        {edge.below ? <LinearGradient pointerEvents="none" colors={[`${palette.bg}00`, palette.bg]} style={[styles.fade, { bottom: 0 }]} /> : null}
      </View>
      <View style={[styles.footerBar, { paddingBottom: insets.bottom + space.lg }]}><View style={styles.capped}>{footer}</View></View>
    </View>
  );
}

/**
 * White rounded surface for grouped content. `accent` adds a tinted left edge
 * (a category's colour) — cards in a list read as distinct items, not one flat sheet.
 */
export function Card({ children, style, padded = true, accent }: { children: React.ReactNode; style?: ViewStyle; padded?: boolean; accent?: string }) {
  return (
    <View style={[styles.card, padded && { padding: space.lg }, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null, style]}>{children}</View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.label, { textTransform: "uppercase", letterSpacing: 0.6 }]}>{title}</Text>
      {action}
    </View>
  );
}

/** Big number + label, for stats rows. */
export function Stat({ value, label, tone = palette.ink }: { value: string; label: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.number, { color: tone }]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  statusBar: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: palette.bg, zIndex: 10 },
  content: { width: "100%", maxWidth: MAX_CONTENT, alignSelf: "center", paddingHorizontal: space.lg, gap: space.lg },
  header: { flexDirection: "row", alignItems: "flex-end", gap: space.md, marginBottom: space.xs },
  subtitle: { marginBottom: 2 },
  fixedTop: { paddingHorizontal: space.lg, paddingBottom: space.sm, backgroundColor: palette.bg, zIndex: 1 },
  footerBody: { paddingVertical: space.md, justifyContent: "center" },
  // Applied only when content overflows the viewport: top-align so the whole column scrolls and the
  // top edge is reachable (centring would clip the top unreachably — see the note in FooterScreen).
  footerBodyTop: { justifyContent: "flex-start" },
  footerInner: { width: "100%", maxWidth: MAX_CONTENT, alignSelf: "center", paddingHorizontal: space.lg, gap: space.lg },
  capped: { width: "100%", maxWidth: MAX_CONTENT, alignSelf: "center", gap: space.sm },
  fade: { position: "absolute", left: 0, right: 0, height: 28 },
  footerBar: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: palette.bg },
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, ...shadow },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm },
});
