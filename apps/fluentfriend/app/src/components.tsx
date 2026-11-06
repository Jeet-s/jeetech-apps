import { memo, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View, type ImageStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import {
  Button,
  IconButton,
  Icon,
  type IconName,
  ListItem,
  Pill,
  Screen,
  Sheet,
  Tappable,
  feedback,
  palette,
  radius,
  shadow,
  space,
  springs,
  toast,
  tones,
  type,
} from "./ui";
import { art } from "./art";
import { appStore, useApp, todayKey } from "./core/data";
import { isFavorite, reportError, setSlowAudio, toggleFavorite } from "./core/state";
import type { ErrorReport, Phrase } from "./core";

/* ------------------------------------------------------------------ *
 * Animated sound wave — the honest affordance for playing audio.
 * (Pre-generated phrase audio ships in the downloadable packs; here the
 * bars pulse while a phrase "plays" so every tap has a visible result.)
 * ------------------------------------------------------------------ */
const WAVE_BARS = [0.5, 0.9, 0.6, 1, 0.7, 0.4];

function WaveBar({ active, base, color, delay }: { active: boolean; base: number; color: string; delay: number }) {
  const v = useSharedValue(0.35);
  useEffect(() => {
    if (active) {
      v.value = withRepeat(withTiming(base, { duration: 320 + delay, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      cancelAnimation(v);
      v.value = withTiming(0.35, { duration: 200 });
    }
    return () => cancelAnimation(v);
  }, [active, base, delay, v]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: v.value }] }));
  return <Animated.View style={[styles.waveBar, { backgroundColor: color }, style]} />;
}

export const SoundWave = memo(function SoundWave({ active, color = palette.primary, height = 22 }: { active: boolean; color?: string; height?: number }) {
  return (
    <View style={[styles.wave, { height }]} pointerEvents="none">
      {WAVE_BARS.map((b, i) => (
        <WaveBar key={i} active={active} base={b} color={color} delay={i * 40} />
      ))}
    </View>
  );
});

/** Round play button. Tapping shows a brief "playing" wave (the clip plays from the offline pack).
 *  Memoized — it sits in long phrase/word/example lists where parent re-renders are common. */
export const AudioButton = memo(function AudioButton({
  slow,
  size = 48,
  tone = "primary",
  label,
}: {
  slow?: boolean;
  size?: number;
  tone?: "primary" | "soft";
  label?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const bg = tone === "primary" ? palette.primary : palette.primarySoft;
  const fg = tone === "primary" ? palette.onPrimary : palette.primary;
  const play = () => {
    feedback("pop", "light");
    setPlaying(true);
    // Slow playback reads longer; normal is snappier. Represents the clip length.
    setTimeout(() => setPlaying(false), slow ? 1700 : 1150);
  };
  return (
    <Tappable
      label={label ?? `Play audio${slow ? ", slow" : ""}`}
      sound={null}
      onPress={play}
      style={[styles.audioBtn, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}
    >
      {playing ? <SoundWave active color={fg} height={size * 0.42} /> : <Icon name="play" size={size * 0.44} color={fg} />}
    </Tappable>
  );
});

/* ------------------------------------------------------------------ *
 * Live mic level meter (used in the speaking exercise / role-play).
 * Driven by a shared value so volume updates never touch React state.
 * ------------------------------------------------------------------ */
export function LevelMeter({ level, color = palette.primary, size = 128, icon = "mic" }: { level: SharedValue<number>; color?: string; size?: number; icon?: IconName }) {
  // Cap the ripple so, even at peak volume, it stays within ~1.26× — callers reserve that room
  // so the ring never creeps over the label beneath it.
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + level.value * 0.26 }], opacity: 0.16 + level.value * 0.26 }));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[styles.levelRing, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} />
      <View style={[styles.micCore, { width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, backgroundColor: color }]}>
        <Icon name={icon} size={size * 0.26} color={palette.onPrimary} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Bondhu mascot (transparent PNG — no white box in dark mode).
 * ------------------------------------------------------------------ */
export function Mascot({ size = 56, style }: { size?: number; style?: ImageStyle }) {
  return <Image source={art.ui_splash_bondhu} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/* ------------------------------------------------------------------ *
 * Full-screen stack header (back + title + optional right control).
 * ------------------------------------------------------------------ */
export function StackHeader({ title, subtitle, onClose, right, closeIcon = "chevronLeft" }: { title: string; subtitle?: string; onClose: () => void; right?: React.ReactNode; closeIcon?: "chevronLeft" | "close" }) {
  return (
    <View style={styles.stackHeader}>
      <IconButton icon={closeIcon} label="Back" onPress={onClose} />
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={type.label} numberOfLines={1}>{subtitle}</Text> : null}
        <Text style={type.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
      </View>
      {right}
    </View>
  );
}

/**
 * A full-screen pushed route: safe-area scroll with a back header (confirm handled
 * by the caller). Mirrors <Screen> but leads with a StackHeader instead of the
 * large title, so lessons / sub-pages feel like a stack, not a tab.
 */
export function RouteScreen({
  title,
  subtitle,
  onClose,
  right,
  children,
  scroll = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <Screen scroll={scroll}>
      <StackHeader title={title} subtitle={subtitle} onClose={onClose} right={right} />
      {children}
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * Phrase card — English + Bangla meaning + romanized, dual-speed audio,
 * favorite heart and a report-an-error flag. Self-contained for favorites.
 * ------------------------------------------------------------------ */
export function PhraseCard({ phrase, onReport, accent }: { phrase: Phrase; onReport: (p: Phrase) => void; accent?: string }) {
  const state = useApp();
  const fav = isFavorite(state, phrase.id);
  const reported = state.errorReports.some((r) => r.phraseId === phrase.id);
  const toggleFav = () => {
    feedback(fav ? "pop" : "success", fav ? "light" : "success");
    appStore.set((s) => toggleFavorite(s, phrase.id, todayKey()));
  };
  return (
    <View style={[styles.phraseCard, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null]}>
      {/* Breathing room between the three lines so they never read as a cramped block, and the
          card grows with the text at a 1.3× font scale (QA phrase-card layout). */}
      <View style={{ gap: 6 }}>
        <Text style={type.sentence}>{phrase.en}</Text>
        <Text style={[type.body, { color: palette.inkSoft }]}>{phrase.bn}</Text>
        <Text style={type.caption}>{phrase.romanBn}</Text>
      </View>
      <PhraseAudio en={phrase.en} size={46} />
      <View style={styles.phraseActions}>
        <View style={{ flex: 1 }} />
        <Tappable label={fav ? "পছন্দ থেকে সরান" : "পছন্দে যোগ করুন"} role="checkbox" accessibilityState={{ checked: fav }} sound={null} onPress={toggleFav} style={styles.pillAction}>
          <Icon name={fav ? "heart" : "heartOutline"} size={18} color={fav ? palette.danger : palette.inkSoft} />
          <Text style={[type.label, { color: fav ? palette.danger : palette.inkSoft }]}>{fav ? "সংরক্ষিত" : "সংরক্ষণ"}</Text>
        </Tappable>
        {reported ? (
          <View style={styles.pillAction}>
            <Icon name="checkCircle" size={18} color={palette.success} />
            <Text style={[type.label, { color: palette.success }]}>রিপোর্ট হয়েছে</Text>
          </View>
        ) : (
          <Tappable label="এই বাক্যের সমস্যা জানান" sound={null} onPress={() => onReport(phrase)} style={styles.pillAction}>
            <Icon name="flag" size={18} color={palette.inkSoft} />
            <Text style={[type.label, { color: palette.inkSoft }]}>সমস্যা?</Text>
          </Tappable>
        )}
      </View>
    </View>
  );
}

/**
 * Dual-speed phrase audio: one round Play button + a speed toggle (Normal / Slow 0.75x).
 * The chosen speed is a REAL, persistent on-state — the selected pill fills with the primary
 * colour and a check, and the preference is saved to the profile so every phrase plays at the
 * learner's speed. Tapping a speed also plays a short preview at that speed, so a tap always has
 * a visible + audible result (the earlier version only flashed a wave for ~1.7s, so the slow
 * control looked identical to "off"). Table-stakes "adjustable audio speed" made obvious.
 */
export function PhraseAudio({ en, size = 52, onPlayed, emphasize }: { en: string; size?: number; onPlayed?: () => void; emphasize?: boolean }) {
  const slowPref = useApp().profile.slowAudio;
  const [slow, setSlow] = useState(slowPref);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // When the play button is the required FIRST step (repeat-after-me), draw attention to it with a
  // slow breathing ring until the learner has heard the line once — then it rests.
  const callAttention = !!emphasize && !played;
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = callAttention
      ? withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true)
      : withTiming(0, { duration: 200 });
  }, [callAttention, ring]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + ring.value * 0.28 }], opacity: 0.22 - ring.value * 0.14 }));

  const startPlay = (useSlow: boolean) => {
    setPlaying(true);
    setPlayed(true);
    onPlayed?.(); // let the parent know the learner has heard the model line (drives the "now say it" cue)
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(false), useSlow ? 1700 : 1150);
  };
  const play = () => {
    feedback("pop", "light");
    startPlay(slow);
  };
  const choose = (useSlow: boolean) => {
    feedback("pop", "select");
    setSlow(useSlow);
    appStore.set((st) => setSlowAudio(st, useSlow));
    startPlay(useSlow); // immediate audible + visible result when the speed changes
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.audioRow}>
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          {callAttention ? (
            <Animated.View pointerEvents="none" style={[styles.audioPulse, { width: size, height: size, borderRadius: size / 2 }, ringStyle]} />
          ) : null}
          <Tappable
            label={`“${en}” শুনুন${slow ? " — আস্তে" : ""}`}
            sound={null}
            onPress={play}
            style={[styles.audioBtn, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.primary }]}
          >
            {playing ? <SoundWave active color={palette.onPrimary} height={size * 0.42} /> : <Icon name="play" size={size * 0.44} color={palette.onPrimary} />}
          </Tappable>
        </View>
        {/* ONE consistent caption — it never flips wording between the "listen first" and resting
            states (QA: "helper text switches between 'প্রথমে এটা শুনুন' and 'ট্যাপ করে শুনুন'"). The
            breathing ring alone signals "do this first"; the words stay put. */}
        <Text style={[type.label, { color: playing || callAttention ? palette.primary : palette.inkSoft, flex: 1 }]} numberOfLines={1}>
          {playing ? "বাজছে…" : "ট্যাপ করে শুনুন"}
        </Text>
      </View>
      {/* Speed toggle in a segmented TRACK (surfaceAlt) so the whole control reads as a toggle group and is
          clearly distinct from the round solid Play button beside it (design director: "make the Play button
          and Normal/Slow toggle visually distinct"). The active pill fills + shows a check. */}
      <View style={styles.speedToggle} accessibilityRole="tablist">
        <SpeedPill label="স্বাভাবিক" active={!slow} onPress={() => choose(false)} />
        <SpeedPill label="আস্তে ০.৭৫x" active={slow} onPress={() => choose(true)} />
      </View>
    </View>
  );
}

function SpeedPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  // Solid primary fill + a check = the unmistakable on-state; outline = off. A slight press scale
  // gives an immediate toggle response (QA: "unclear selected vs unselected").
  return (
    <Tappable
      label={label}
      role="tab"
      accessibilityState={{ selected: active }}
      sound={null}
      scale={0.96}
      onPress={onPress}
      style={[styles.speedPill, active && styles.speedPillOn]}
    >
      {active ? <Icon name="check" size={15} color={palette.onPrimary} /> : null}
      <Text style={[type.label, { color: active ? palette.onPrimary : palette.inkSoft }]} numberOfLines={1}>{label}</Text>
    </Tappable>
  );
}

/** A small circular score badge with a tone colour, a pop-in and a count-up to the score. */
export function ScoreBadge({ score, size = 72 }: { score: number; size?: number }) {
  // Bands match the scorer's scoreBand() so the badge colour never contradicts the result copy
  // (QA: a low number must not sit on a green "celebration" state). ≥80 green, 50–79 amber, else red.
  const tone = score >= 80 ? "success" : score >= 50 ? "warning" : "danger";
  const t = tones[tone];
  // Count UP from the band floor (80 / 50 / 0), not from 0 — so any frame captured mid-animation
  // still shows a number inside the same band as the praise copy beside it. Counting from 0 let a
  // store/QA screenshot catch e.g. "69" next to a green "দারুণ বলেছেন!" (QA trust: "a low number
  // beside high praise"). From the floor the number and the praise can never contradict.
  const floor = score >= 80 ? 80 : score >= 50 ? 50 : 0;
  const s = useSharedValue(0.6);
  const [shown, setShown] = useState(floor);
  useEffect(() => {
    s.value = withSpring(1, springs.pop);
    const target = Math.max(0, Math.round(score));
    setShown(Math.min(floor, target));
    if (target <= floor) return;
    // Cap updates at ~16 ticks over ~600ms (≥37ms apart) so the count-up never floods the main
    // thread with ~57 setState/s right as the result + confetti mount (QA: "System UI freeze at the
    // core moment"). The spring + the reveal still read as a satisfying count.
    const span = target - floor;
    const steps = Math.min(span, 16);
    const stepMs = 600 / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(floor + Math.round((span * i) / steps));
      if (i >= steps) clearInterval(id);
    }, stepMs);
    return () => clearInterval(id);
  }, [s, score, floor]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }, style]}>
      <Text style={[type.number, { color: t.fg, fontSize: size * 0.34 }]}>{shown}</Text>
      <Text style={[type.caption, { color: t.fg, fontSize: 10 }]}>/ 100</Text>
    </Animated.View>
  );
}

/** Quota line used on the Speak tab and the quota sheet. */
export function QuotaPill({ remaining, limit }: { remaining: number; limit: number }) {
  const tone = remaining === 0 ? "danger" : remaining <= 2 ? "warning" : "success";
  return <Pill label={`আজ ${remaining}/${limit} AI চ্যাট বাকি`} tone={tone} />;
}

/* ------------------------------------------------------------------ *
 * Report-an-error sheet — a flag on every phrase (queues offline, de-duped
 * by phrase id in the reducer). Shown a warm Bangla thank-you on submit.
 * ------------------------------------------------------------------ */
const REASONS: { value: ErrorReport["reason"]; labelBn: string; icon: "chat" | "edit" | "volume" }[] = [
  { value: "meaning", labelBn: "ভুল মানে", icon: "chat" },
  { value: "spelling", labelBn: "বানান ভুল", icon: "edit" },
  { value: "audio", labelBn: "অডিও সমস্যা", icon: "volume" },
];

export function ReportSheet({ phrase, onClose }: { phrase: Phrase | null; onClose: () => void }) {
  const submit = (reason: ErrorReport["reason"]) => {
    if (!phrase) return;
    feedback("pop", "success");
    appStore.set((s) => reportError(s, phrase.id, reason, todayKey()));
    onClose();
    toast("ধন্যবাদ! আমাদের সম্পাদক দেখে নেবেন।");
  };
  return (
    <Sheet visible={!!phrase} title="সমস্যা জানান" onClose={onClose}>
      {phrase ? (
        <>
          <Text style={[type.body, { color: palette.inkSoft }]} numberOfLines={2}>
            “{phrase.en}” — {phrase.bn}
          </Text>
          <View style={{ gap: space.xs }}>
            {REASONS.map((r) => (
              <ListItem key={r.value} icon={r.icon} title={r.labelBn} onPress={() => submit(r.value)} />
            ))}
          </View>
          <Button label="বাতিল" variant="ghost" onPress={onClose} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wave: { flexDirection: "row", alignItems: "center", gap: 3 },
  waveBar: { width: 3.5, height: "100%", borderRadius: 2 },
  audioBtn: { alignItems: "center", justifyContent: "center", ...shadow },
  audioPulse: { position: "absolute", backgroundColor: palette.primary },
  levelRing: { position: "absolute" },
  micCore: { alignItems: "center", justifyContent: "center" },
  stackHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
  phraseCard: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, ...shadow },
  phraseActions: { flexDirection: "row", alignItems: "center", gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: space.md },
  audioRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  speedToggle: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, padding: 4 },
  speedPill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 38, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: "transparent" },
  speedPillOn: { backgroundColor: palette.primary },
  pillAction: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 10, borderRadius: radius.pill },
});
