import { View, StyleSheet } from "react-native";
import { palette } from "./ui";
import type { Route } from "./nav";
import { LessonScreen } from "./screens/LessonScreen";
import { CourseMapScreen } from "./screens/CourseMapScreen";
import { ConversationScreen } from "./screens/ConversationScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { PlacementScreen } from "./screens/PlacementScreen";
import { CertificateScreen } from "./screens/CertificateScreen";
import { DownloadsScreen } from "./screens/DownloadsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { BackupScreen } from "./screens/BackupScreen";
import { PhrasebookScreen, DictionaryScreen, GrammarScreen, FavoritesScreen, DrillsScreen } from "./screens/LearnRoutes";

/** Renders the top full-screen route pushed over the tabs. */
export function RouteHost({ route, onPro }: { route: Route; onPro: (from: string) => void }) {
  return <View style={styles.root}>{render(route, onPro)}</View>;
}

function render(route: Route, onPro: (from: string) => void) {
  switch (route.name) {
    case "lesson":
      return <LessonScreen lessonId={route.lessonId} />;
    case "courseMap":
      return <CourseMapScreen />;
    case "conversation":
      return <ConversationScreen scenarioId={route.scenarioId} onPro={onPro} />;
    case "review":
      return <ReviewScreen />;
    case "placement":
      return <PlacementScreen />;
    case "certificate":
      return <CertificateScreen courseId={route.courseId} />;
    case "downloads":
      return <DownloadsScreen />;
    case "settings":
      return <SettingsScreen onPro={onPro} />;
    case "backup":
      return <BackupScreen />;
    case "phrasebook":
      return <PhrasebookScreen topic={route.topic} />;
    case "dictionary":
      return <DictionaryScreen />;
    case "grammar":
      return <GrammarScreen />;
    case "favorites":
      return <FavoritesScreen />;
    case "drills":
      return <DrillsScreen />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
});
