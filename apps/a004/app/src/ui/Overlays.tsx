import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from "react-native";
import Animated, { Easing, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { palette, radius, shadowStrong, space, springs, type, isDark } from "./theme";
import { play } from "../audio/sfx";

/** Bottom sheet over a dimmed backdrop — for add/edit forms, pickers and the Pro offer. */
export function Sheet({ visible, title, onClose, headerAction, children }: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  /** An action pinned in the fixed header (e.g. Save) so it stays above the keyboard on tall forms. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const y = useSharedValue(1);
  useEffect(() => {
    if (visible) play("whoosh", 0.4);
    y.value = visible ? withSpring(0, springs.gentle) : withTiming(1, { duration: 180 });
  }, [visible, y]);
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 600 }] }));
  const dim = useAnimatedStyle(() => ({ opacity: withTiming(visible ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) }) }));
  // Cap the sheet so a tall form (edit meal, Pro offer) never overflows the top
  // of the screen with its action button or controls out of reach — the body
  // scrolls inside the sheet instead, with the title and grabber fixed above it.
  const maxH = height * 0.9;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.bottom} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { maxHeight: maxH, paddingBottom: insets.bottom + space.lg }, sheet]}>
          <View style={styles.grabber} />
          {title || headerAction ? (
            <View style={styles.titleRow}>
              <Text style={[type.title, { flex: 1 }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
              {headerAction}
              <IconButton icon="close" label="Close" size={40} onPress={onClose} />
            </View>
          ) : null}
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
      {/* A host INSIDE the modal so a toast fired from the sheet (e.g. "Restored",
          "Reading linked") is visible above it, not hidden behind the scrim. */}
      <ToastHost bottom={insets.bottom + space.xxl} />
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
type Pusher = (m: Omit<ToastMsg, "id">) => void;
// A SET of subscribers (not one) so a ToastHost rendered INSIDE an open Sheet (a
// Modal) can show the confirmation on top of the modal, while the app-level host
// stays mounted for the rest of the UI. A toast(...) reaches every live host; the
// one that is actually on screen (the sheet's, when a sheet is open) is the one
// the user sees — fixing "Restore/Link gave no feedback" (toast hidden behind the modal).
const pushers = new Set<Pusher>();

/** Show a short confirmation ("Saved", "Deleted · Undo"). Mount <ToastHost/> once in App; Sheets mount their own. */
export function toast(text: string, action?: ToastMsg["action"]): void {
  pushers.forEach((p) => p({ text, action }));
}

export function ToastHost({ bottom = 96 }: { bottom?: number }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let n = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pusher: Pusher = (m) => {
      if (timer) clearTimeout(timer);
      setMsg({ ...m, id: ++n });
      timer = setTimeout(() => setMsg(null), m.action ? 5000 : 2200);
    };
    pushers.add(pusher);
    return () => {
      pushers.delete(pusher);
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  // The host renders null between toasts, so the Animated.View genuinely mounts fresh for each
  // message — `entering` fires every time WITHOUT a keyed remount (a keyed remount of a view that
  // stays in the tree is what can stick blank on Android; a real mount from null is safe).
  return (
    <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} style={[styles.toast, { bottom }]} accessibilityLiveRegion="polite">
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: palette.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, gap: space.md, ...shadowStrong },
  sheetScroll: { flexShrink: 1 },
  sheetContent: { gap: space.lg, paddingTop: space.xs, paddingBottom: space.xs },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: palette.border, marginTop: space.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyArt: { width: 180, height: 140 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: space.lg, right: space.lg, backgroundColor: palette.ink, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, ...shadowStrong },
});
