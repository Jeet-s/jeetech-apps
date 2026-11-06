import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button, Card, EmptyState, Icon, TextField, gradient, palette, radius, shadow, space, toast, type } from "../ui";
import { RouteScreen } from "../components";
import { appStore, useApp } from "../core/data";
import { getCourse } from "../core/catalog";
import { courseProgress } from "../core/courses";
import { setName } from "../core/state";
import { share } from "../modules/share";
import { useNav } from "../nav";

/** Completion certificate — name (entered locally) + date on a warm, framed card, stored on device. */
export function CertificateScreen({ courseId }: { courseId: string }) {
  const nav = useNav();
  const s = useApp();
  const course = getCourse(courseId);
  const cert = s.certificates.find((c) => c.courseId === courseId);
  const cp = courseProgress(s.progress, courseId);
  const [editing, setEditing] = useState(false);
  const [name, setNameInput] = useState(s.profile.name);

  if (!course || !cert) {
    return (
      <RouteScreen title="সার্টিফিকেট" onClose={() => nav.back()}>
        <EmptyState
          icon="award"
          title="কোর্স এখনো শেষ হয়নি"
          body={`সব ${cp.total} দিন সম্পূর্ণ করলে এখানে আপনার সার্টিফিকেট তৈরি হবে।`}
          action={<Button label="কোর্স ম্যাপ দেখুন" onPress={() => { nav.back(); nav.go({ name: "courseMap", courseId }); }} />}
        />
      </RouteScreen>
    );
  }

  const displayName = s.profile.name || cert.name || "Learner";
  const save = () => {
    appStore.set((st) => setName(st, name));
    setEditing(false);
    toast("নাম সংরক্ষিত হয়েছে");
  };

  return (
    <RouteScreen title="সার্টিফিকেট" subtitle={course.title_bn} onClose={() => nav.back()}>
      <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cert, gradient.border ? { borderWidth: 1, borderColor: gradient.border } : null]}>
        <View style={[styles.seal, { backgroundColor: gradient.pill }]}>
          <Icon name="award" size={30} color={gradient.onHero} />
        </View>
        <Text style={[type.overline, { color: gradient.onHeroSoft, textAlign: "center" }]}>Certificate of Completion</Text>
        <Text style={[type.caption, { color: gradient.onHeroSoft, textAlign: "center" }]}>এই সার্টিফিকেট দেওয়া হলো</Text>
        <Text style={[type.display, { color: gradient.onHero, textAlign: "center", fontSize: 28 }]} numberOfLines={2} adjustsFontSizeToFit>
          {displayName}
        </Text>
        <View style={[styles.rule, { backgroundColor: gradient.onHeroSoft }]} />
        <Text style={[type.body, { color: gradient.onHero, textAlign: "center" }]}>{course.title_en}</Text>
        <Text style={[type.caption, { color: gradient.onHeroSoft, textAlign: "center" }]}>Fluent Friend · {cert.date}</Text>
      </LinearGradient>

      {editing ? (
        <Card style={{ gap: space.md }}>
          <TextField label="সার্টিফিকেটের নাম" placeholder="আপনার নাম" value={name} onChangeText={setNameInput} maxLength={40} returnKeyType="done" onSubmitEditing={save} />
          <Button label="সংরক্ষণ করুন" icon="check" disabled={!name.trim()} onPress={save} />
        </Card>
      ) : (
        <Button label="নাম পরিবর্তন করুন" variant="secondary" icon="edit" onPress={() => { setNameInput(s.profile.name); setEditing(true); }} />
      )}
      <Button label="বন্ধুদের জানান" variant="ghost" icon="share" onPress={() => void share.app("certificate")} />
    </RouteScreen>
  );
}

const styles = StyleSheet.create({
  cert: { borderRadius: radius.xl, padding: space.xl, gap: space.sm, alignItems: "center", ...shadow },
  seal: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  rule: { width: 120, height: 2, marginVertical: space.xs },
});
