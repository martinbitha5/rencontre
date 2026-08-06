import { Platform } from 'react-native';

// Cache local clé-valeur (SQLite) pour afficher immédiatement les données
// déjà connues (conversations, messages, activité, portefeuille) sans
// attendre la base distante. Pattern : lire le cache -> afficher -> requête
// réseau -> rafraîchir l'écran et le cache.
//
// Sur le web (preview), expo-sqlite n'est pas disponible : repli mémoire.

type SQLiteDb = {
  runAsync: (sql: string, ...params: unknown[]) => Promise<unknown>;
  getFirstAsync: <T>(sql: string, ...params: unknown[]) => Promise<T | null>;
};

let dbPromise: Promise<SQLiteDb | null> | null = null;
const memory = new Map<string, string>();

function openDb(): Promise<SQLiteDb | null> {
  if (Platform.OS === 'web') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const SQLite = await import('expo-sqlite');
        const db = (await SQLite.openDatabaseAsync('dowe-cache.db')) as unknown as SQLiteDb;
        await db.runAsync(
          'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)',
        );
        return db;
      } catch {
        // SQLite indisponible : le cache devient simplement inactif.
        return null;
      }
    })();
  }
  return dbPromise;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const raw = db
      ? (await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key))
          ?.value ?? null
      : memory.get(key) ?? null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    const db = await openDb();
    if (db) {
      await db.runAsync(
        'INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)',
        key,
        raw,
        Date.now(),
      );
    } else {
      memory.set(key, raw);
    }
  } catch {
    // le cache est un confort, jamais une source d'erreur
  }
}

// À la déconnexion : ne pas laisser les données d'un compte au suivant.
export async function cacheClear(): Promise<void> {
  try {
    memory.clear();
    const db = await openDb();
    if (db) await db.runAsync('DELETE FROM kv');
  } catch {
    // idem
  }
}
