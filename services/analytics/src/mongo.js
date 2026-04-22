import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../..', '.env') });

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/linkedinclone';

const client = new MongoClient(uri, {
  connectTimeoutMS: 5000,
  serverSelectionTimeoutMS: 5000,
});

let connected = false;

export async function connectMongo() {
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    connected = true;
    console.log('MongoDB connected');
  } catch (e) {
    console.error('MongoDB connect failed:', e.message);
    connected = false;
  }
}

export function isMongoConnected() { return connected; }

export function getDb() { return client.db(); }

export async function pingMongo() {
  try {
    await client.db().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
