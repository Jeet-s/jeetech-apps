import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import config from "../../multiplayer.json";
import { createMultiplayer, EMOTES, type Emote, type Match, type Multiplayer } from "./multiplayer-core";

/**
 * Online multiplayer for this app (factory-owned — don't edit). The factory writes multiplayer.json (the studio's
 * Firebase project + this game's namespace) when the design has online play; empty config = offline only (enabled()
 * is false and every match is a bot match, so the game still works).
 * Rules (owner, 2026-10-27): gameplay + the fixed EMOTES only — no free text, no chat; generated names; quick matches
 * fall back to an AI opponent (match.bot) after a few seconds.
 *   await multiplayer.findMatch("duel")      → Match (match.bot = play your AI)
 *   await multiplayer.createRoom("duel")     → Match with .code to share;  multiplayer.joinRoom(code)
 *   multiplayer.submitScore("weekly", score); multiplayer.topScores("weekly")
 */
type Cfg = { apiKey?: string; appId?: string; projectId?: string; databaseURL?: string; authDomain?: string; ns?: string };
const cfg = config as Cfg;
const KEY = "mp_profile_v1";

let mp: Multiplayer | null = null;
async function core(): Promise<Multiplayer | null> {
  if (mp) return mp;
  if (!cfg.apiKey || !cfg.databaseURL || !cfg.ns) return null;
  const app = getApps()[0] ?? initializeApp({ apiKey: cfg.apiKey, appId: cfg.appId, projectId: cfg.projectId, databaseURL: cfg.databaseURL, authDomain: cfg.authDomain });
  // getReactNativePersistence exists only in firebase/auth's React Native build (what Metro bundles), not in the
  // default type definitions tsc reads — look it up at runtime so a player's anonymous id survives restarts.
  const rnPersistence = (FirebaseAuth as unknown as { getReactNativePersistence?: (s: typeof AsyncStorage) => FirebaseAuth.Persistence }).getReactNativePersistence;
  let auth: FirebaseAuth.Auth;
  try {
    auth = rnPersistence ? FirebaseAuth.initializeAuth(app, { persistence: rnPersistence(AsyncStorage) }) : FirebaseAuth.getAuth(app);
  } catch {
    auth = FirebaseAuth.getAuth(app); // already initialised (fast refresh)
  }
  const saved = JSON.parse((await AsyncStorage.getItem(KEY).catch(() => null)) ?? "{}") as { name?: string; avatar?: number };
  mp = createMultiplayer(app, auth, cfg.ns, saved);
  return mp;
}

const offlineBot = async (): Promise<Match> => {
  const noop = () => {};
  return {
    id: `bot-${Date.now()}`, bot: true, seat: 0, isHost: true,
    players: () => [{ uid: "me", name: "You", avatar: 0, seat: 0 }, { uid: "bot", name: "Rival", avatar: 1, seat: 1 }],
    onMove: noop, onEmote: noop, onState: noop, onPlayers: noop, onLeave: noop,
    sendMove: async () => {}, setState: async () => {}, emote: async () => {}, leave: async () => {},
  };
};

export const multiplayer = {
  enabled: () => !!(cfg.apiKey && cfg.databaseURL && cfg.ns),
  EMOTES,
  async profile() {
    const m = await core();
    if (!m) return null;
    const p = await m.init();
    await AsyncStorage.setItem(KEY, JSON.stringify({ name: p.name, avatar: p.avatar })).catch(() => {});
    return p;
  },
  async findMatch(mode: string, opts?: { timeoutMs?: number }): Promise<Match> {
    const m = await core().catch(() => null);
    if (!m) return offlineBot();
    await this.profile().catch(() => null);
    return m.findMatch(mode, opts).catch(() => offlineBot()); // offline / network error → play the AI
  },
  async createRoom(mode: string): Promise<Match | null> {
    const m = await core().catch(() => null);
    return m ? m.createRoom(mode).catch(() => null) : null;
  },
  async joinRoom(code: string, maxPlayers?: number): Promise<Match | null> {
    const m = await core().catch(() => null);
    return m ? m.joinRoom(code, maxPlayers).catch(() => null) : null;
  },
  async submitScore(board: string, score: number) {
    const m = await core().catch(() => null);
    if (m) await m.submitScore(board, score).catch(() => {});
  },
  async topScores(board: string, n?: number) {
    const m = await core().catch(() => null);
    return m ? m.topScores(board, n).catch(() => []) : [];
  },
};
export type { Emote, Match };
