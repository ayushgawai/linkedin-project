import { MongoClient } from 'mongodb';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

let client = null;
let db = null;

export async function connectMongo() {
  if (db) return db;
  client = new MongoClient(config.MONGO_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  db = client.db(config.MONGO_DB);
  logger.info({ uri: config.MONGO_URI, db: config.MONGO_DB }, 'mongo connected');
  await ensureIndexes(db);
  return db;
}

async function ensureIndexes(db) {
  const createIndexSafely = async (collection, spec, options = {}) => {
    try {
      await collection.createIndex(spec, options);
    } catch (err) {
      const message = String(err?.message || '');
      const ignorable =
        message.includes('Index already exists with a different name') ||
        message.includes('IndexKeySpecsConflict') ||
        message.includes('IndexOptionsConflict');
      if (!ignorable) throw err;
      logger.info({ collection: collection.collectionName, spec, options, err: message }, 'mongo index already satisfied');
    }
  };

  const events = db.collection('events');
  await createIndexSafely(events, { idempotency_key: 1 }, { unique: true });
  await createIndexSafely(events, { event_type: 1, timestamp: -1 });
  await createIndexSafely(events, { 'entity.entity_id': 1, event_type: 1, timestamp: -1 });
  await createIndexSafely(events, { actor_id: 1, timestamp: -1 });

  const profileViews = db.collection('profile_views');
  await createIndexSafely(profileViews, { member_id: 1, viewed_at: -1 });

  const cacheMetrics = db.collection('cache_metrics');
  await createIndexSafely(cacheMetrics, { at: -1 });
  await createIndexSafely(cacheMetrics, { operation: 1, at: -1 });
}

export function getDb() {
  if (!db) throw new Error('mongo not connected — call connectMongo() first');
  return db;
}

export async function pingMongo() {
  try {
    if (!db) return false;
    await db.command({ ping: 1 });
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'mongo ping failed');
    return false;
  }
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
