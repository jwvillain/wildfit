// ───────────────────────────────────────────────────────────────────────────
// firebase.js — Cloud sync + data protection for WildFit
//
// What this gives you:
//   • Data lives in Google Firestore (cloud) — survives clearing your browser,
//     switching devices, reinstalling, etc.
//   • Both phones using the SAME household code see the SAME data (sync).
//   • A localStorage mirror keeps the app fast and fully usable OFFLINE; writes
//     sync up to the cloud automatically when you're back online.
//
// It exposes the exact same async get/set/delete/list API the app already uses,
// so App.jsx doesn't need to change how it stores anything.
// ───────────────────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, deleteField, collection, getDocs,
} from "firebase/firestore";

// 1) ── Your Firebase project config ──────────────────────────────────────────
//    Replace this whole object with the config from your Firebase console.
//    (Project settings → Your apps → SDK setup and configuration → Config)
//    These values are NOT secret — they're safe to commit. Security comes from
//    the Firestore rules + the household code, not from hiding these.
const firebaseConfig = {
  apiKey: "AIzaSyB8TraDIXA8Lsj7NtBZ0AnF-kZokv--G_g",
  authDomain: "wildfit-24682.firebaseapp.com",
  projectId: "wildfit-24682",
  storageBucket: "wildfit-24682.firebasestorage.app",
  messagingSenderId: "424727952203",
  appId: "1:424727952203:web:abdf1e04cd7f3a924186ce",
};

// 2) ── The household code ─────────────────────────────────────────────────────
//    Both you and your partner enter the same code in the app (Settings → Sync).
//    All data is stored under households/<code>. Treat it like a shared password:
//    anyone who knows it can read/write your data, so make it long & non-obvious.
function getHousehold() {
  try { return localStorage.getItem("wf:household") || null; } catch { return null; }
}
export function setHousehold(code) {
  try { localStorage.setItem("wf:household", code.trim()); } catch {}
}
export function clearHousehold() {
  try { localStorage.removeItem("wf:household"); } catch {}
}

// 3) ── Init ──────────────────────────────────────────────────────────────────
const CONFIGURED = !Object.values(firebaseConfig).some((v) => String(v).includes("REPLACE_ME"));

let auth = null, db = null;
let authReady = false;
let authResolve;
const authPromise = new Promise((r) => { authResolve = r; });

if (CONFIGURED) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, (user) => {
    if (user && !authReady) { authReady = true; authResolve(true); }
  });
  // Anonymous sign-in: no email/password, but enough to satisfy security rules.
  signInAnonymously(auth).catch((e) => console.warn("Anon auth failed:", e));
} else {
  // Not configured yet → app runs in local-only mode (no cloud, no crash).
  authResolve(false);
  if (typeof console !== "undefined") console.info("WildFit: Firebase not configured — running in local-only mode.");
}

// Firestore stores one document per household. Each key (e.g. "wf:p:<id>:sessions")
// becomes a field on that document. We mirror everything to localStorage so the
// app is instant and works offline; the cloud is the durable backup + sync source.
function householdRef() {
  const h = getHousehold();
  return (CONFIGURED && db && h) ? doc(db, "households", h) : null;
}

// localStorage mirror (also the fallback when no household code is set yet)
const local = {
  get: (k) => { try { const v = localStorage.getItem(k); return v !== null ? { key: k, value: v } : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
  list: (p) => { try { return Object.keys(localStorage).filter((k) => !p || k.startsWith(p)); } catch { return []; } },
};

// Pull the entire household doc into the local mirror. Call this on startup /
// after entering a code so a fresh device hydrates from the cloud.
export async function pullFromCloud() {
  const ref = householdRef();
  if (!ref) return false;
  try {
    await authPromise;
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() || {};
      for (const [k, v] of Object.entries(data)) {
        // Firestore can't have "/" or "." in field names, so we encoded them.
        local.set(decodeKey(k), typeof v === "string" ? v : JSON.stringify(v));
      }
    }
    return true;
  } catch (e) { console.warn("pullFromCloud failed:", e); return false; }
}

// Firestore field names can't contain "/", "~", "*", "[", "]" or start with "__".
// Our keys use ":" which is fine, but we encode defensively.
const encodeKey = (k) => k.replace(/\./g, "~d~").replace(/\//g, "~s~");
const decodeKey = (k) => k.replace(/~d~/g, ".").replace(/~s~/g, "/");

async function pushField(key, value) {
  const ref = householdRef();
  if (!ref) return; // no household yet → local-only
  try {
    await authPromise;
    await setDoc(ref, { [encodeKey(key)]: value }, { merge: true });
  } catch (e) { console.warn("cloud write failed (kept locally):", e); }
}

// 4) ── The window.storage-compatible API ─────────────────────────────────────
//    Reads come from the fast local mirror; writes go to local immediately AND
//    fire-and-forget up to the cloud.
export const cloudStorage = {
  get: async (key) => local.get(key),
  set: async (key, value) => {
    const v = typeof value === "string" ? value : JSON.stringify(value);
    local.set(key, v);
    pushField(key, v); // async, non-blocking
    return { key, value: v };
  },
  delete: async (key) => {
    local.del(key);
    const ref = householdRef();
    if (ref) { try { await authPromise; await setDoc(ref, { [encodeKey(key)]: deleteField() }, { merge: true }); } catch {} }
    return { key, deleted: true };
  },
  list: async (prefix) => ({ keys: local.list(prefix) }),
};

export function hasHousehold() { return CONFIGURED && !!getHousehold(); }
export function isConfigured() { return CONFIGURED; }
export { getHousehold };
