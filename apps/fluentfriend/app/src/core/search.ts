/**
 * Offline phrasebook + dictionary search — pure, synchronous, fast. Matches on
 * English and Bangla (and romanized), ranks exact/prefix above substring so the
 * most relevant hit is first. Built to return in well under 200ms over the
 * bundled lists.
 */
import { DICTIONARY, PHRASES } from "./catalog";
import type { DictionaryWord, Phrase, Topic } from "./types";

const norm = (s: string) => s.toLowerCase().trim();

function rank(hay: string, q: string): number {
  const h = norm(hay);
  if (!q) return 0;
  if (h === q) return 3;
  if (h.startsWith(q)) return 2;
  if (h.includes(q)) return 1;
  return 0;
}

export function searchPhrases(query: string, topic?: Topic): Phrase[] {
  const q = norm(query);
  const pool = topic ? PHRASES.filter((p) => p.topic === topic) : PHRASES;
  if (!q) return pool;
  return pool
    .map((p) => ({ p, r: Math.max(rank(p.en, q), rank(p.bn, q), rank(p.romanBn, q)) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r)
    .map((x) => x.p);
}

export function searchDictionary(query: string): DictionaryWord[] {
  const q = norm(query);
  if (!q) return DICTIONARY;
  return DICTIONARY.map((w) => ({ w, r: Math.max(rank(w.en, q), rank(w.bn, q), rank(w.romanBn, q)) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r)
    .map((x) => x.w);
}
