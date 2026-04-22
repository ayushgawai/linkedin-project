import { getDb } from './mongo.js';
import { successResponse, errorResponse } from '../../shared/response.js';

function err(res, status, code, message, details = {}) {
  return res.status(status).json(errorResponse(code, message, details));
}
function ok(res, data, status = 200) {
  return res.status(status).json(successResponse(data));
}

export async function ingestEvent(req, res) {
  const b = req.body || {};
  const required = ['event_type', 'actor_id', 'entity_type', 'entity_id'];
  const missing = required.filter((f) => !b[f]);
  if (missing.length) {
    return err(res, 400, 'VALIDATION_ERROR', 'Missing required fields', { fields: missing });
  }

  const doc = {
    event_type: b.event_type,
    trace_id: b.trace_id || null,
    timestamp: new Date(),
    actor_id: b.actor_id,
    entity: {
      entity_type: b.entity_type,
      entity_id: b.entity_id,
    },
    payload: b.payload || {},
    idempotency_key: b.idempotency_key || null,
  };

  const db = getDb();
  if (doc.idempotency_key) {
    const existing = await db.collection('events').findOne({ idempotency_key: doc.idempotency_key });
    if (existing) return ok(res, { accepted: true, deduplicated: true }, 202);
  }

  await db.collection('events').insertOne(doc);
  return ok(res, { accepted: true }, 202);
}

export async function topJobs(req, res) {
  const b = req.body || {};
  const metric = b.metric || 'applications';
  const windowDays = Math.max(1, parseInt(String(b.window_days), 10) || 30);
  const limit = Math.min(100, Math.max(1, parseInt(String(b.limit), 10) || 10));

  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const eventType = metric === 'views' ? 'job.viewed' : 'application.submitted';

  const db = getDb();
  const pipeline = [
    { $match: { event_type: eventType, timestamp: { $gte: since } } },
    { $group: { _id: '$entity.entity_id', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { _id: 0, job_id: '$_id', count: 1 } },
  ];

  const jobs = await db.collection('events').aggregate(pipeline).toArray();
  return ok(res, { jobs, metric, window_days: windowDays });
}

export async function funnel(req, res) {
  const b = req.body || {};
  if (!b.job_id) return err(res, 400, 'VALIDATION_ERROR', 'job_id is required');

  const windowDays = Math.max(1, parseInt(String(b.window_days), 10) || 30);
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const db = getDb();
  const events = db.collection('events');
  const jobId = String(b.job_id).trim();

  const [viewCount, submitCount] = await Promise.all([
    events.countDocuments({ event_type: 'job.viewed', 'entity.entity_id': jobId, timestamp: { $gte: since } }),
    events.countDocuments({ event_type: 'application.submitted', 'payload.job_id': jobId, timestamp: { $gte: since } }),
  ]);

  const applyRate = viewCount > 0 ? (submitCount / viewCount * 100).toFixed(1) : '0.0';

  return ok(res, {
    view: viewCount,
    submit: submitCount,
    rates: { apply_rate: `${applyRate}%` },
    window_days: windowDays,
  });
}

export async function geo(req, res) {
  const b = req.body || {};
  if (!b.job_id) return err(res, 400, 'VALIDATION_ERROR', 'job_id is required');

  const windowDays = Math.max(1, parseInt(String(b.window_days), 10) || 30);
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const db = getDb();
  const jobId = String(b.job_id).trim();

  const pipeline = [
    { $match: { event_type: 'job.viewed', 'entity.entity_id': jobId, timestamp: { $gte: since }, 'payload.location': { $exists: true } } },
    { $group: { _id: '$payload.location', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 50 },
    { $project: { _id: 0, city: '$_id', count: 1 } },
  ];

  const cities = await db.collection('events').aggregate(pipeline).toArray();
  return ok(res, { cities, window_days: windowDays });
}

export async function memberDashboard(req, res) {
  const b = req.body || {};
  if (!b.member_id) return err(res, 400, 'VALIDATION_ERROR', 'member_id is required');

  const windowDays = Math.max(1, parseInt(String(b.window_days), 10) || 30);
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const db = getDb();
  const memberId = String(b.member_id).trim();

  const [profileViews, appsByStatus] = await Promise.all([
    db.collection('profile_views').countDocuments({ member_id: memberId, viewed_at: { $gte: since } }),
    db.collection('events').aggregate([
      { $match: { event_type: 'application.status.updated', 'payload.member_id': memberId, timestamp: { $gte: since } } },
      { $group: { _id: '$payload.new_status', count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const statusBreakdown = {};
  for (const row of appsByStatus) {
    statusBreakdown[row._id] = row.count;
  }

  return ok(res, {
    profile_views: profileViews,
    application_status_breakdown: statusBreakdown,
    window_days: windowDays,
  });
}
