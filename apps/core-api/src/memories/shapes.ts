// 038. What no memory may hold, checked in code whoever wrote it.
//
// The prompt says the same, and saying it twice is the point: a prompt is a
// request and this is the enforcement. Lossy in the safe direction: a refused
// memory costs one sentence, a kept card number is the harm.

import type { MemoryClass } from "../schema.js";

/** Nine or more digits in a run, a space, dash, dot or slash inside it
 *  ignored: an ID, an account or a card number. A date is eight, so a
 *  birthday with its year is never refused for its digits. */
const LONG_NUMBER = /\d(?:[\s./-]?\d){8,}/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /\+?\d[\d\s().-]{7,}\d/;
/** 040. The rest of the never list, which the turn's prompt held alone until
 *  the tab gave the person a write path with no model in it: a password with
 *  its value, and immigration status. */
const PASSWORD = /\b(?:password|passcode|passphrase|pin(?:\s+code)?)\b\s*(?:is|:|=)\s*\S+/i;
const IMMIGRATION = /\bimmigration status\b|\bundocumented\b|\b(?:asylum|refugee)\s+(?:status|claim|seeker)\b|\bwork permit\b|\bgreen card\b|\bvisa status\b/i;
const STREET = /\b\d+[a-z]?\s+(?:[A-Z][\w'-]*\s+){1,3}(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|court|ct|crescent|cres|way|place|pl)\b\.?/i;

/** True when the sentence holds something no memory may: a number that is an
 *  ID or an account, and on a person, how to reach them or where they live. */
export function neverHolds(raw: string, kind: MemoryClass): boolean {
  // Full-width and other compatibility digits read as the digits they are.
  const text = raw.normalize("NFKC");
  if (LONG_NUMBER.test(text) || SSN.test(text) || IBAN.test(text)) return true;
  if (PASSWORD.test(text) || IMMIGRATION.test(text)) return true;
  if (kind === "people" && (EMAIL.test(text) || PHONE.test(text) || STREET.test(text))) return true;
  return false;
}
