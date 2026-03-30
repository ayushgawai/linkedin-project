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
