/**
 * Online multiplayer core (factory-owned — don't edit; owner, 2026-10-27). Firebase Realtime Database + anonymous
 * sign-in, platform-agnostic so the factory can test it headlessly; src/modules/multiplayer.ts wires it for the app.
 *
 * Players interact through GAMEPLAY and a FIXED set of emotes only — no free text, no chat (Google Play needs no
 * moderation for this). Names are generated, never typed. Quick matches fall back to an AI opponent (match.bot) after
 * a few seconds, so nobody ever waits on an empty queue: the GAME plays the bot with its own AI.
 *
 * Data layout under g/<package>/ (enforced by the factory's security rules):
 *   players/<uid> {name, avatar, at}       queue/<mode> {uid, room, at}      codes/<CODE> "<roomId>"
 *   rooms/<id> {mode, host, status, createdAt, players/<uid> {name, avatar, seat, online}, state, moves/*, emotes/*}
 *   lb/<board>/<uid> {name, avatar, score, at}
 */
import { type FirebaseApp } from "firebase/app";
import { type Auth, signInAnonymously } from "firebase/auth";
import {
  type Database,
  type DatabaseReference,
  type DataSnapshot,
  get,
  getDatabase,
  limitToLast,
  onChildAdded,
  onDisconnect,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from "firebase/database";

export const EMOTES = ["gg", "nice", "wow", "oops", "thanks", "glhf", "wp", "again"] as const;
export type Emote = (typeof EMOTES)[number];

const ADJ = ["Swift", "Brave", "Lucky", "Clever", "Mighty", "Happy", "Sunny", "Quick", "Bold", "Calm", "Royal", "Witty", "Jolly", "Nimble", "Daring", "Golden"];
const NOUN = ["Tiger", "Falcon", "Panda", "Otter", "Comet", "Lotus", "Rocket", "Mango", "Cobra", "Eagle", "Koala", "Bison", "Raven", "Lynx", "Shark", "Wolf"];
export const AVATARS = 24;

export interface Profile { uid: string; name: string; avatar: number }
export interface Seat { uid: string; name: string; avatar: number; seat: number; online?: boolean }
type Move = { uid: string; m: string; at: number };

export interface Match {
  id: string;
  /** No human opponent arrived in time: the game plays an AI opponent locally (nothing goes online). */
  bot: boolean;
  /** Friend-room code (rooms created with createRoom), shareable. */
  code?: string;
  seat: number;
  isHost: boolean;
  players(): Seat[];
  /** A move from another player (JSON-parsed). Own moves are not echoed. */
  onMove(cb: (move: unknown, from: Seat) => void): void;
  onEmote(cb: (emote: Emote, from: Seat) => void): void;
  /** Host-authoritative shared state (whatever the game stores). */
  onState(cb: (state: unknown) => void): void;
  onPlayers(cb: (players: Seat[]) => void): void;
  /** Another player left / disconnected. */
  onLeave(cb: (who: Seat) => void): void;
  sendMove(move: unknown): Promise<void>;
  setState(state: unknown): Promise<void>;
  emote(e: Emote): Promise<void>;
  leave(): Promise<void>;
}

const randomName = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}${Math.floor(Math.random() * 100)}`;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export function createMultiplayer(app: FirebaseApp, auth: Auth, ns: string, saved?: { name?: string; avatar?: number }) {
  const db: Database = getDatabase(app);
  const base = `g/${ns.replace(/[.#$[\]]/g, "_")}`;
  let me: Profile | null = null;

  async function init(): Promise<Profile> {
    if (me) return me;
    const cred = auth.currentUser ?? (await signInAnonymously(auth)).user;
    me = { uid: cred.uid, name: saved?.name || randomName(), avatar: saved?.avatar ?? Math.floor(Math.random() * AVATARS) };
    await set(ref(db, `${base}/players/${me.uid}`), { name: me.name, avatar: me.avatar, at: serverTimestamp() });
    return me;
  }

  function botMatch(p: Profile): Match {
    const noop = () => {};
    return {
      id: `bot-${Date.now()}`, bot: true, seat: 0, isHost: true,
      players: () => [{ uid: p.uid, name: p.name, avatar: p.avatar, seat: 0 }, { uid: "bot", name: randomName(), avatar: Math.floor(Math.random() * AVATARS), seat: 1 }],
      onMove: noop, onEmote: noop, onState: noop, onPlayers: noop, onLeave: noop,
      sendMove: async () => {}, setState: async () => {}, emote: async () => {}, leave: async () => {},
    };
  }

  function wire(roomId: string, p: Profile, seat: number, isHost: boolean, code?: string): Match {
    const room = ref(db, `${base}/rooms/${roomId}`);
    const subs: (() => void)[] = [];
    let seats: Seat[] = [];
    const playersCbs: ((s: Seat[]) => void)[] = [];
    const leaveCbs: ((s: Seat) => void)[] = [];
    subs.push(
      onValue(ref(db, `${base}/rooms/${roomId}/players`), (snap: DataSnapshot) => {
        const v = (snap.val() ?? {}) as Record<string, Omit<Seat, "uid">>;
        const next = Object.entries(v).map(([uid, s]) => ({ uid, ...s })).sort((a, b) => a.seat - b.seat);
        for (const old of seats) {
          const now = next.find((s) => s.uid === old.uid);
          if (old.uid !== p.uid && old.online !== false && (!now || now.online === false)) leaveCbs.forEach((cb) => cb(old));
        }
        seats = next;
        playersCbs.forEach((cb) => cb(seats));
      }),
    );
    const mine = ref(db, `${base}/rooms/${roomId}/players/${p.uid}/online`);
    void onDisconnect(mine).set(false);
    const from = (uid: string) => seats.find((s) => s.uid === uid) ?? { uid, name: "Player", avatar: 0, seat: -1 };
    return {
      id: roomId, bot: false, code, seat, isHost,
      players: () => seats,
      onMove: (cb) => subs.push(onChildAdded(ref(db, `${base}/rooms/${roomId}/moves`), (s) => {
        const mv = s.val() as Move;
        if (mv && mv.uid !== p.uid) cb(JSON.parse(mv.m), from(mv.uid));
      })),
      onEmote: (cb) => subs.push(onChildAdded(ref(db, `${base}/rooms/${roomId}/emotes`), (s) => {
        const e = s.val() as { uid: string; e: Emote };
        if (e && e.uid !== p.uid && (EMOTES as readonly string[]).includes(e.e)) cb(e.e, from(e.uid));
      })),
      onState: (cb) => subs.push(onValue(ref(db, `${base}/rooms/${roomId}/state`), (s) => cb(s.exists() ? JSON.parse(String(s.val())) : null))),
      onPlayers: (cb) => { playersCbs.push(cb); cb(seats); },
      onLeave: (cb) => { leaveCbs.push(cb); },
      sendMove: async (m) => { await push(ref(db, `${base}/rooms/${roomId}/moves`), { uid: p.uid, m: JSON.stringify(m), at: serverTimestamp() }); },
      setState: async (st) => { if (isHost) await set(ref(db, `${base}/rooms/${roomId}/state`), JSON.stringify(st)); },
      emote: async (e) => { if ((EMOTES as readonly string[]).includes(e)) await push(ref(db, `${base}/rooms/${roomId}/emotes`), { uid: p.uid, e, at: serverTimestamp() }); },
      leave: async () => {
        subs.forEach((u) => u());
        await set(mine, false).catch(() => {});
        if (isHost) await update(room, { status: "done" }).catch(() => {});
      },
    };
  }

  async function newRoom(p: Profile, mode: string, status: "open" | "waiting"): Promise<DatabaseReference> {
    const r = push(ref(db, `${base}/rooms`));
    await set(r, { mode, host: p.uid, status, createdAt: serverTimestamp(), players: { [p.uid]: { name: p.name, avatar: p.avatar, seat: 0, online: true } } });
    return r;
  }

  async function join(roomId: string, p: Profile, seat: number) {
    await set(ref(db, `${base}/rooms/${roomId}/players/${p.uid}`), { name: p.name, avatar: p.avatar, seat, online: true });
  }

  /**
   * Quick match for 2 players: pair with whoever is waiting in `mode`, else wait up to `timeoutMs` for someone, else
   * resolve a BOT match (match.bot) — the game then plays its own AI. Never rejects for "no players".
   */
  async function findMatch(mode: string, opts: { timeoutMs?: number } = {}): Promise<Match> {
    const p = await init();
    const q = ref(db, `${base}/queue/${mode}`);
    // Our room exists BEFORE we can be claimed (a joiner must never write into a room that isn't there yet).
    const myRoom = await newRoom(p, mode, "waiting");
    await get(q); // warm the cache: a transaction's first pass sees the cached value, and null must mean "empty"
    let taken: string | null = null;
    await runTransaction(q, (cur: { uid: string; room: string; at: number } | null) => {
      taken = null;
      if (cur && cur.uid !== p.uid && Date.now() - (cur.at ?? 0) < 60_000) {
        taken = cur.room;
        return null; // claim the waiting player: clear the slot
      }
      return { uid: p.uid, room: myRoom.key, at: Date.now() }; // queue ourselves (replaces a stale entry)
    }, { applyLocally: false });
    if (taken) {
      await set(myRoom, null).catch(() => {});
      await join(taken, p, 1);
      await update(ref(db, `${base}/rooms/${taken}`), { status: "playing" });
      return wire(taken, p, 1, false);
    }
    return waitForOpponent(myRoom, q, p, opts.timeoutMs ?? 8000);
  }

  function waitForOpponent(room: DatabaseReference, q: DatabaseReference, p: Profile, timeoutMs: number): Promise<Match> {
    const players = ref(db, `${base}/rooms/${room.key}/players`);
    return new Promise((resolve) => {
      let done = false;
      let unsub: () => void = () => {};
      const finish = (m: Match) => { if (!done) { done = true; unsub(); resolve(m); } };
      unsub = onValue(players, (snap) => {
        if (Object.keys(snap.val() ?? {}).length >= 2) finish(wire(room.key!, p, 0, true));
      });
      setTimeout(async () => {
        if (done) return;
        // Leave the queue (no-op if someone already claimed us), then decide by who is in the room.
        await runTransaction(q, (cur: { uid: string } | null) => (cur && cur.uid === p.uid ? null : cur), { applyLocally: false }).catch(() => {});
        const joined = Object.keys((await get(players)).val() ?? {}).length >= 2;
        if (joined) return finish(wire(room.key!, p, 0, true)); // claimed at the last moment
        await update(room, { status: "done" }).catch(() => {});
        finish(botMatch(p));
      }, timeoutMs);
    });
  }

  /** A friend room: share match.code; others join with joinRoom(code). Up to `maxPlayers`. */
  async function createRoom(mode: string): Promise<Match> {
    const p = await init();
    const room = await newRoom(p, mode, "open");
    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      const r = await runTransaction(ref(db, `${base}/codes/${code}`), (cur: string | null) => (cur ? undefined : room.key), { applyLocally: false });
      if (r.committed) return wire(room.key!, p, 0, true, code);
    }
    throw new Error("could not allocate a room code");
  }

  async function joinRoom(code: string, maxPlayers = 8): Promise<Match | null> {
    const p = await init();
    const roomId = (await get(ref(db, `${base}/codes/${code.trim().toUpperCase()}`))).val() as string | null;
    if (!roomId) return null;
    const players = Object.keys(((await get(ref(db, `${base}/rooms/${roomId}/players`))).val() ?? {}));
    if (!players.includes(p.uid) && players.length >= maxPlayers) return null;
    await join(roomId, p, players.includes(p.uid) ? players.indexOf(p.uid) : players.length);
    return wire(roomId, p, players.length, false, code.trim().toUpperCase());
  }

  /** Leaderboards: a player's best score per board; top(n) for display. */
  async function submitScore(board: string, score: number): Promise<void> {
    const p = await init();
    await runTransaction(ref(db, `${base}/lb/${board}/${p.uid}`), (cur: { score: number } | null) =>
      cur && cur.score >= score ? undefined : { name: p.name, avatar: p.avatar, score, at: Date.now() }, { applyLocally: false });
  }

  async function topScores(board: string, n = 50): Promise<{ uid: string; name: string; avatar: number; score: number }[]> {
    const snap = await get(query(ref(db, `${base}/lb/${board}`), orderByChild("score"), limitToLast(n)));
    const out: { uid: string; name: string; avatar: number; score: number }[] = [];
    snap.forEach((c) => { out.push({ uid: c.key!, ...(c.val() as { name: string; avatar: number; score: number }) }); });
    return out.reverse();
  }

  return { init, profile: () => me, findMatch, createRoom, joinRoom, submitScore, topScores, EMOTES };
}

export type Multiplayer = ReturnType<typeof createMultiplayer>;
