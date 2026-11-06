import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, Icon, ProgressBar, Button, Tappable, feedback, palette, radius, space, type } from "../ui";
import { RouteScreen } from "../components";
import { appStore, useApp } from "../core/data";
import { finishDownload, packState, startDownload, type PackId } from "../core/state";
import { analytics } from "../modules/analytics";
import { useNav } from "../nav";
import { bn } from "../util";

const PACKS: { id: PackId; title: string; sub: string; sizeMB: number }[] = [
  { id: "c7", title: "৭ দিনের কোর্স", sub: "শুরুর পাঠ ও অডিও", sizeMB: 22 },
  { id: "c30", title: "৩০ দিনের কোর্স", sub: "পুরো পথ ও অডিও", sizeMB: 96 },
  { id: "all", title: "সব কিছু", sub: "সব পাঠ, বাক্য ও ডিকশনারি", sizeMB: 140 },
];

/** Offline packs: one-time download with a progress bar and resume. All content works in airplane mode. */
export function DownloadsScreen() {
  const nav = useNav();
  const s = useApp();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const run = (id: PackId) => {
    feedback("tap", "light");
    appStore.set((st) => startDownload(st, id));
    analytics.track("pack_download_start", { pack: id });
    setProgress((p) => ({ ...p, [id]: p[id] ?? 0 }));
    clearInterval(timers.current[id]);
    timers.current[id] = setInterval(() => {
      setProgress((p) => {
        const cur = Math.min(1, (p[id] ?? 0) + 0.08);
        if (cur >= 1) {
          clearInterval(timers.current[id]);
          appStore.set((st) => finishDownload(st, id));
          analytics.track("pack_download_done", { pack: id });
          feedback("success", "success");
        }
        return { ...p, [id]: cur };
      });
    }, 180);
  };

  // Resume any pack left mid-download (and tidy timers on unmount).
  useEffect(() => {
    const t = timers.current;
    PACKS.forEach((p) => {
      if (packState(appStore.get(), p.id) === "downloading") run(p.id);
    });
    return () => Object.values(t).forEach(clearInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RouteScreen title="অফলাইন ডাউনলোড" subtitle="নেট ছাড়াই শিখুন" onClose={() => nav.back()}>
      <Card style={styles.note}>
        <Icon name="download" size={20} color={palette.primary} />
        <Text style={[type.body, { flex: 1, color: palette.inkSoft }]}>একবার ডাউনলোড করলে প্রতিটি পাঠ, কুইজ ও অডিও এয়ারপ্লেন মোডেও চলবে।</Text>
      </Card>

      {PACKS.map((pack) => {
        const st = packState(s, pack.id);
        const downloading = st === "downloading";
        const ready = st === "ready";
        const pct = ready ? 1 : progress[pack.id] ?? 0;
        return (
          <Card key={pack.id} accent={ready ? palette.success : palette.primary} style={{ gap: space.md }}>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: ready ? palette.successSoft : palette.primarySoft }]}>
                <Icon name={ready ? "checkCircle" : "download"} size={22} color={ready ? palette.success : palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>{pack.title}</Text>
                <Text style={type.caption}>{pack.sub} · {bn(pack.sizeMB)}MB</Text>
              </View>
              {ready ? (
                <View style={styles.readyPill}>
                  <Text style={[type.label, { color: palette.success, fontSize: 12 }]}>প্রস্তুত</Text>
                </View>
              ) : null}
            </View>
            {downloading ? (
              <View style={{ gap: 6 }}>
                <ProgressBar value={pct} />
                <Text style={type.caption}>{bn(Math.round(pct * 100))}% — ডাউনলোড হচ্ছে…</Text>
              </View>
            ) : !ready ? (
              <Button label={pct > 0 ? "আবার শুরু করুন" : "ডাউনলোড করুন"} icon="download" variant="secondary" onPress={() => run(pack.id)} />
            ) : null}
          </Card>
        );
      })}

      <Tappable label="অফলাইনে পরীক্ষা" sound={null} onPress={() => nav.back()} style={{ alignItems: "center", minHeight: 44, justifyContent: "center" }}>
        <Text style={[type.caption, { textAlign: "center" }]}>ডাউনলোডের পর এয়ারপ্লেন মোডেও সব পাঠ খুলবে।</Text>
      </Tappable>
    </RouteScreen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", alignItems: "center", gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  readyPill: { backgroundColor: palette.successSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
});
