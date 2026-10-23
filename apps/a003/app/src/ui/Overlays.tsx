import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import Animated, { Easing, FadeInDown, FadeInUp, FadeOutDown, FadeOutUp, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { MAX_CONTENT, isDark, palette, radius, shadowStrong, space, springs, type } from "./theme";
import { play } from "../audio/sfx";

/** The toast is a high-contrast snackbar: a dark slab in light mode, a raised
 * light-on-dark slab in dark mode — so its text always reads against it. */
const TOAST_FG = isDark ? palette.ink : "#FFFFFF";

/**
 * Bottom sheet over a dimmed backdrop — for add/edit forms, pickers and the Pro
 * offer. `headerAction` places a control in the title row (above the keyboard),
 * so a sheet's primary confirm is always reachable even when the keyboard is up.
 * A toast host is mounted inside the sheet's own window so confirmations ("Saved",
 * "Duplicated") appear ABOVE the sheet — a toast fired from the main window would
 * be hidden behind this Modal on Android.
 */
export function Sheet({
  visible,
  title,
  headerAction,
  onClose,
  children,
}: {
  visible: boolean;
  title?: string;
  headerAction?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.bottom} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, sheet]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.titleRow}>
              <Text style={[type.title, { flex: 1 }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
              {headerAction}
              <IconButton icon="close" label="Close" size={40} onPress={onClose} />
            </View>
          ) : null}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
      {/* In-sheet toasts float at the top of the sheet's own window, above the keyboard. */}
      <ToastHost anchor="top" />
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

/**
 * Every mounted ToastHost subscribes. A message is delivered to all of them so
 * that, when a Sheet (its own native Modal window) is open, the host inside the
 * sheet shows the toast on top — while the root host behind the sheet shows the
 * same message once the sheet closes. The topmost window always wins visually.
 */
const subscribers = new Set<(m: ToastMsg) => void>();
let seq = 0;

/** Show a short confirmation ("Saved", "Deleted · Undo"). Mount <ToastHost/> in App. */
export function toast(text: string, action?: ToastMsg["action"]): void {
  const m: ToastMsg = { id: ++seq, text, action };
  subscribers.forEach((fn) => fn(m));
}

export function ToastHost({ bottom = 96, anchor = "bottom" }: { bottom?: number; anchor?: "top" | "bottom" }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fn = (m: ToastMsg) => {
      if (timer) clearTimeout(timer);
      setMsg(m);
      timer = setTimeout(() => setMsg(null), m.action ? 5000 : 2200);
    };
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  const pos = anchor === "top" ? { top: insets.top + space.sm } : { bottom };
  return (
    <Animated.View
      key={msg.id}
      entering={(anchor === "top" ? FadeInUp : FadeInDown).duration(200)}
      exiting={(anchor === "top" ? FadeOutUp : FadeOutDown).duration(160)}
      style={[styles.toast, pos]}
      accessibilityLiveRegion="polite"
      pointerEvents="box-none"
    >
      <Text style={[type.bodyStrong, { color: TOAST_FG, flex: 1 }]}>{msg.text}</Text>
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
          <Text style={[type.button, { color: "#A5B4FC" }]}>{msg.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  sheet: { width: "100%", maxWidth: MAX_CONTENT, backgroundColor: palette.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, gap: space.lg, ...shadowStrong },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: palette.border, marginTop: space.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyArt: { width: 180, height: 140 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: space.lg, right: space.lg, backgroundColor: isDark ? palette.surfaceAlt : palette.ink, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, ...shadowStrong },
});
