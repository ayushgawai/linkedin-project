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
  const events = db.collection('events');
  await events.createIndex({ idempotency_key: 1 }, { unique: true });
  await events.createIndex({ event_type: 1, timestamp: -1 });
  await events.createIndex({ 'entity.entity_id': 1, event_type: 1, timestamp: -1 });
  await events.createIndex({ actor_id: 1, timestamp: -1 });

  const profileViews = db.collection('profile_views');
  await profileViews.createIndex({ member_id: 1, viewed_at: -1 });

  const cacheMetrics = db.collection('cache_metrics');
  await cacheMetrics.createIndex({ at: -1 });
  await cacheMetrics.createIndex({ operation: 1, at: -1 });
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
