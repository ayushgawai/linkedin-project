use('linkedinclone');

db.createCollection('events', { capped: false });
db.events.createIndex({ event_type: 1, timestamp: -1 });
db.events.createIndex({ actor_id: 1, timestamp: -1 });
db.events.createIndex({ 'entity.entity_id': 1 });
db.events.createIndex({ idempotency_key: 1 }, { unique: true });

db.createCollection('ai_traces');
db.ai_traces.createIndex({ task_id: 1 }, { unique: true });
db.ai_traces.createIndex({ trace_id: 1 });
db.ai_traces.createIndex({ status: 1, created_at: -1 });

db.createCollection('resumes');
db.resumes.createIndex({ member_id: 1 });

db.createCollection('profile_views');
db.profile_views.createIndex({ member_id: 1, viewed_at: -1 });

// Connections graph in MongoDB (prof requirement: MySQL + MongoDB for connections).
// This collection stores the graph edges and invitation status.
db.createCollection('connections');
db.connections.createIndex({ user_a: 1, user_b: 1 }, { unique: true });
db.connections.createIndex({ status: 1, updated_at: -1 });
db.connections.createIndex({ requested_by: 1, updated_at: -1 });

// Seed a small, deterministic demo graph so fresh clones have real connections data.
// Matches the demo member IDs used in backend_demo_seed.sql.
const now = new Date();
db.connections.updateOne(
  { user_a: '22222222-2222-2222-2222-222222222222', user_b: '66666666-6666-6666-6666-666666666666' },
  { $set: { user_a: '22222222-2222-2222-2222-222222222222', user_b: '66666666-6666-6666-6666-666666666666', status: 'accepted', requested_by: '22222222-2222-2222-2222-222222222222', created_at: now, updated_at: now } },
  { upsert: true },
);
db.connections.updateOne(
  { user_a: '22222222-2222-2222-2222-222222222222', user_b: '77777777-7777-7777-7777-777777777777' },
  { $set: { user_a: '22222222-2222-2222-2222-222222222222', user_b: '77777777-7777-7777-7777-777777777777', status: 'pending', requested_by: '77777777-7777-7777-7777-777777777777', created_at: now, updated_at: now } },
  { upsert: true },
);
