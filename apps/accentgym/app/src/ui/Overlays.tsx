import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { palette, radius, shadowStrong, space, springs, type, isDark } from "./theme";
import { play } from "../audio/sfx";

/** Bottom sheet over a dimmed backdrop — for add/edit forms, pickers and the Pro offer. */
export function Sheet({ visible, title, onClose, children, footer, fullHeight = false, fillContent = false, resetScrollKey }: { fullHeight?: boolean; fillContent?: boolean; visible: boolean; title?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; resetScrollKey?: string | number }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [visible, resetScrollKey]);
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
      <KeyboardAvoidingView behavior="padding" style={[styles.bottom, fullHeight && { paddingTop: insets.top + space.sm, backgroundColor: palette.surface }]} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, fullHeight && { flex: 1, maxHeight: "100%" }, { paddingBottom: insets.bottom + space.lg }, sheet]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.titleRow}>
              <Text style={[type.title, { flex: 1 }]} accessibilityRole="header">{title}</Text>
              <IconButton icon="close" label="Close" size={40} onPress={onClose} />
            </View>
          ) : null}
          <ScrollView ref={scrollRef} style={{ flexShrink: 1, flexGrow: fullHeight ? 1 : 0 }} contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm, flexGrow: fillContent ? 1 : 0 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer}
        </Animated.View>
      </KeyboardAvoidingView>
      {visible ? <ToastHost bottom={insets.bottom + 24} /> : null}
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
        <Image source={art} style={styles.emptyArt} resizeMode="contain" accessibilityIgnoresInvertColors />
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

type ToastMsg = { id: number; text: string; action?: { label: string; onPress: () => void } };
// Every mounted ToastHost shows the toast: App's host AND the one inside an open Sheet (a Modal covers App's host, so
// confirmations from sheet actions were invisible — "taps had no visible effect" in QA).
const hosts = new Set<(m: Omit<ToastMsg, "id">) => void>();

/** Show a short confirmation ("Saved", "Deleted · Undo"). App mounts <ToastHost/>; every Sheet has its own. */
export function toast(text: string, action?: ToastMsg["action"]): void {
  for (const h of hosts) h({ text, action });
}

export function ToastHost({ bottom = 96 }: { bottom?: number }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let n = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const host = (m: Omit<ToastMsg, "id">) => {
      if (timer) clearTimeout(timer);
      setMsg({ ...m, id: ++n });
      timer = setTimeout(() => setMsg(null), m.action ? 5000 : 2200);
    };
    hosts.add(host);
    return () => {
      hosts.delete(host);
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <View style={[styles.toast, { bottom }]} accessibilityLiveRegion="polite">
      <Text style={[type.bodyStrong, { color: isDark ? palette.bg : "#fff", flex: 1 }]}>{msg.text}</Text>
      {msg.action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={msg.action.label}
          hitSlop={10}
          onPress={() => {
            msg.action?.onPress();
            setMsg(null);
          }}
        >
          <Text style={[type.button, { color: isDark ? palette.primaryDark : palette.primarySoft }]}>{msg.action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", backgroundColor: palette.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, gap: space.lg, ...shadowStrong },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: palette.border, marginTop: space.sm },
  titleRow: { flexDirection: "row", alignItems: "center" },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyArt: { width: 180, height: 140 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: space.lg, right: space.lg, backgroundColor: palette.ink, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, ...shadowStrong },
});
