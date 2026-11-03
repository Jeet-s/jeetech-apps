import { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { palette, radius, shadowStrong, space, springs, type, isDark } from "./theme";
import { play } from "../audio/sfx";

/** Bottom sheet over a dimmed backdrop — for add/edit forms, pickers and the Pro offer.
 *  By default the body scrolls (capped to 90% of the screen, flexShrink) with keyboardShouldPersistTaps="handled",
 *  so a form's buttons are ALWAYS reachable with the keyboard up and a tap on a chip/button lands on the first try
 *  instead of just dismissing the keyboard (QA: tournament "can't select a 2nd team / reach Create" was taps being
 *  swallowed + the Create button sitting behind the keyboard). Sheets that host their OWN inner ScrollView pass
 *  `scroll={false}` to avoid nesting two vertical scrollers. */
export function Sheet({ visible, title, onClose, children, scroll = true }: { visible: boolean; title?: string; onClose: () => void; children: React.ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const y = useSharedValue(1);
  useEffect(() => {
    if (visible) play("whoosh", 0.4);
    y.value = visible ? withSpring(0, springs.gentle) : withTiming(1, { duration: 180 });
  }, [visible, y]);
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 600 }] }));
  const dim = useAnimatedStyle(() => ({ opacity: withTiming(visible ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) }) }));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      {/* "padding" on Android too: a Modal doesn't resize with the keyboard, so without it the keyboard covered the
          sheet's fields and buttons (Band Up's sign-in "Send code", 2026-10-25). */}
      <KeyboardAvoidingView behavior="padding" style={styles.bottom} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { maxHeight: height * 0.9, paddingBottom: scroll ? 0 : insets.bottom + space.lg }, sheet]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.titleRow}>
              <Text style={[type.title, { flex: 1 }]} accessibilityRole="header">{title}</Text>
              <IconButton icon="close" label="Close" size={40} onPress={onClose} />
            </View>
          ) : null}
          {scroll ? (
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={[styles.sheetScroll, { paddingBottom: insets.bottom + space.lg }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Friendly empty state: illustration/icon, one line of why, one clear action. */
export function EmptyState({
  icon = "plus",
  art,
  title,
  body,
  action,
}: {
  icon?: IconName;
  /** An illustration from src/art (preferred over the icon on first-run screens). */
  art?: ImageSourcePropType;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {art ? (
        <Image source={art} style={styles.emptyArt} resizeMode="contain" fadeDuration={0} accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.emptyIcon}>
          <Icon name={icon} size={30} color={palette.primary} />
        </View>
      )}
      <Text style={[type.heading, { textAlign: "center" }]}>{title}</Text>
      {body ? <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>{body}</Text> : null}
      {action}
    </View>
  );
}

type ToastMsg = { id: number; text: string; action?: { label: string; onPress: () => void }; top?: boolean };
let push: ((m: Omit<ToastMsg, "id">) => void) | null = null;

/**
 * Show a short confirmation ("Saved", "Deleted · Undo"). Mount <ToastHost/> once in App.
 * `opts.top` pins it just below the status bar instead of the bottom — use it on screens where a
 * bottom toast would cover controls (the scoring keypad's Undo/Edit sit at the very bottom).
 */
export function toast(text: string, action?: ToastMsg["action"], opts?: { top?: boolean }): void {
  push?.({ text, action, top: opts?.top });
}

export function ToastHost({ bottom = 96 }: { bottom?: number }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  // Keep the last message mounted while it fades out, so the exit animation plays before it disappears.
  const shown = useRef<ToastMsg | null>(null);
  if (msg) shown.current = msg;
  // 0 = hidden, 1 = shown. Driven imperatively on a STABLE Animated.View (no keyed `entering=`, which can stick blank
  // on Android — the keyed-entering pitfall): a new message animates in, a cleared message animates out.
  const p = useSharedValue(0);
  useEffect(() => {
    let n = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    push = (m) => {
      if (timer) clearTimeout(timer);
      setMsg({ ...m, id: ++n });
      // Keep plain top toasts brief (~1.5s) so a scoring confirmation flashes and gets out of the way.
      timer = setTimeout(() => setMsg(null), m.action ? 5000 : m.top ? 1500 : 2200);
    };
    return () => {
      push = null;
      if (timer) clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    p.value = withTiming(msg ? 1 : 0, { duration: msg ? 200 : 160 });
  }, [msg, p]);
  const display = msg ?? shown.current;
  const fromTop = !!display?.top;
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * (fromTop ? -10 : 10) }],
  }));
  if (!display) return null;
  // Top toasts sit clear of the scoring top bar (back / scorecard / options row) over the score header.
  const pos = fromTop ? { top: insets.top + 56 } : { bottom };
  return (
    <Animated.View
      style={[styles.toast, pos, style]}
      pointerEvents={msg ? "auto" : "none"}
      accessibilityLiveRegion="polite"
    >
      <Text style={[type.bodyStrong, { color: isDark ? palette.bg : "#fff", flex: 1 }]} numberOfLines={2}>{display.text}</Text>
      {display.action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={display.action.label}
          hitSlop={10}
          onPress={() => {
            display.action?.onPress();
            setMsg(null);
          }}
        >
          <Text style={[type.button, { color: isDark ? palette.primaryDark : palette.primarySoft }]}>{display.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: palette.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, gap: space.lg, ...shadowStrong },
  sheetScroll: { gap: space.lg },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: palette.border, marginTop: space.sm },
  titleRow: { flexDirection: "row", alignItems: "center" },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyArt: { width: 180, height: 140 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: space.lg, right: space.lg, backgroundColor: palette.ink, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, ...shadowStrong },
});
