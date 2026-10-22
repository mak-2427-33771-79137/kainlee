import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { REGIMENT_DEFAULT } from './util';

const g = globalThis;
g.__klSettings ||= new Map();

export async function getSetting(key) {
  if (g.__klSettings.has(key)) return g.__klSettings.get(key);
  const k = await db();
  const row = await k('settings').where({ key }).first();
  const v = row ? row.value : null;
  g.__klSettings.set(key, v);
  return v;
}

export async function setSetting(key, value) {
  const k = await db();
  await k('settings').insert({ key, value }).onConflict('key').merge();
  g.__klSettings.set(key, value);
}

export async function getSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return process.env.SESSION_SECRET;
  let s = await getSetting('session_secret');
  if (!s) {
    s = crypto.randomBytes(48).toString('base64url');
    const k = await db();
    // insert-if-absent so two simultaneous first requests agree
    await k('settings').insert({ key: 'session_secret', value: s }).onConflict('key').ignore();
    g.__klSettings.delete('session_secret');
    s = await getSetting('session_secret');
  }
  return s;
}

export async function regimentName() {
  return (await getSetting('regiment_name')) || REGIMENT_DEFAULT;
}

let defaultCrest;
function readAsset(name) {
  return fs.readFileSync(path.join(process.cwd(), 'assets', name));
}
// Logo as PNG bytes. Custom upload lives in the DB so it survives redeploys.
export async function getLogo(size = 512) {
  const key = size <= 192 ? 'logo_192' : 'logo_512';
  const b64 = await getSetting(key);
  if (b64) return Buffer.from(b64, 'base64');
  if (!defaultCrest) defaultCrest = readAsset('default-crest.png');
  return defaultCrest;
}
export async function logoVersion() {
  return (await getSetting('logo_version')) || '1';
}
export function assetBytes(name) { return readAsset(name); }
