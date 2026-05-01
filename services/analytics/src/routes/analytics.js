import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../util/validator.js';
import { getDb } from '../db/mongo.js';
import { getPool } from '../db/mysql.js';
import { config } from '../config.js';
import { getOrSet, keys } from '../../../shared/cache.js';

export const analyticsRouter = Router();
const OTHER_TECHNIQUES_ANALYTICS_TTL_SEC = 30;

async function getAnalyticsResult(cacheKey, loader) {
  if (!config.OTHER_TECHNIQUES_ENABLED) {
    return loader();
  }
  return getOrSet(cacheKey, OTHER_TECHNIQUES_ANALYTICS_TTL_SEC, loader);
}

// ---------------------------------------------------------------------------
// GET /analytics/events
// Recent ingested events (frontend AnalyticsEvent[] contract).
// ---------------------------------------------------------------------------
analyticsRouter.get('/analytics/events', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const page_size = Math.min(200, Math.max(1, Number.parseInt(String(req.query.page_size ?? '50'), 10) || 50));
    const event_type = typeof req.query.event_type === 'string' && req.query.event_type.trim()
      ? req.query.event_type.trim()
      : null;
    const skip = (page - 1) * page_size;

    const match = event_type ? { event_type } : {};
    const rows = await getDb().collection('events')
      .find(match)
      .sort({ timestamp: -1, _received_at: -1 })
      .skip(skip)
      .limit(page_size)
      .toArray();

    // Frontend expects AnalyticsEvent[] directly (not envelope).
    const events = rows.map((r) => ({
      event_id: String(r._id),
      member_id: r.actor_id ?? null,
      event_type: r.event_type || '',
      event_source: r._source || 'unknown',
      entity_id: r.entity?.entity_id ?? r.entity_id ?? null,
      metadata: r.payload && typeof r.payload === 'object' ? r.payload : {},
      occurred_at: r.timestamp || (r._received_at instanceof Date ? r._received_at.toISOString() : new Date().toISOString()),
    }));

    return res.json(events);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /analytics/jobs/top
// Top (or bottom) N jobs by applications | views | saves within window_days.
// ---------------------------------------------------------------------------

const TopJobsSchema = z.object({
  // Frontend sends "window", docs also allow window_days.
  window: z.enum(['7d', '14d', '30d', '90d']).optional(),
  metric: z.enum(['applications', 'views', 'saves']).default('applications'),
  window_days: z.number().int().positive().max(365).default(30),
  limit: z.number().int().positive().max(100).default(10),
  sort: z.enum(['desc', 'asc']).default('desc'),
});

const METRIC_TO_EVENT = {
  applications: 'application.submitted',
  views: 'job.viewed',
  saves: 'job.saved',
};

analyticsRouter.post('/analytics/jobs/top', async (req, res, next) => {
  try {
    const parsed = validate(TopJobsSchema, req.body);
    const window_days = resolveWindowDays(parsed);
    const metric = parsed.metric;
    const limit = parsed.limit;
    const sort = parsed.sort;
    const cacheKey = keys.analyticsTopJobs(metric, window_days, limit, sort);

    const data = await getAnalyticsResult(cacheKey, async () => {
      const eventType = METRIC_TO_EVENT[metric];
      const since = new Date(Date.now() - window_days * 86_400_000);

      const agg = await getDb().collection('events').aggregate([
        {
          $match: {
            event_type: eventType,
            'entity.entity_type': 'job',
            timestamp: { $gte: since.toISOString() },
          },
        },
        { $group: { _id: '$entity.entity_id', count: { $sum: 1 } } },
        { $sort: { count: sort === 'desc' ? -1 : 1 } },
        { $limit: limit },
      ]).toArray();

      const jobIds = agg.map((r) => r._id).filter(Boolean);
      let titleMap = new Map();
      if (jobIds.length) {
        const placeholders = jobIds.map(() => '?').join(',');
        const [rows] = await getPool().query(
          `SELECT j.job_id, j.title, r.company_name
             FROM jobs j
             LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id
            WHERE j.job_id IN (${placeholders})`,
          jobIds,
        );
        titleMap = new Map(rows.map((r) => [r.job_id, { title: r.title, company: r.company_name }]));
      }

      const jobs = agg.map((r) => ({
        job_id: r._id,
        title: titleMap.get(r._id)?.title || null,
        company: titleMap.get(r._id)?.company || null,
        count: r.count,
      }));

      // Frontend recruiter dashboard expects this richer shape.
      const top_jobs_by_applications = jobs.map((j) => ({
        name: j.title || j.job_id,
        value: Number(j.count) || 0,
      }));
      const clicks_per_job = jobs.slice(0, 8).map((j) => ({
        name: j.title || j.job_id,
        value: Number(j.count) || 0,
      }));

      const savedByDay = await getDb().collection('events').aggregate([
        {
          $match: {
            event_type: 'job.saved',
            timestamp: { $gte: since.toISOString() },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$timestamp' } } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray();
      const saved_jobs_trend = savedByDay.map((r) => ({ date: `${r._id}T00:00:00.000Z`, value: Number(r.count) || 0 }));

      const [[kpiRow]] = await getPool().query(
        `SELECT
            COUNT(CASE WHEN status='open' THEN 1 END) AS active_jobs,
            COALESCE(SUM(applicants_count), 0) AS total_applicants
           FROM jobs`,
      );

      const kpis = {
        active_jobs: Number(kpiRow?.active_jobs || 0),
        total_applicants: Number(kpiRow?.total_applicants || 0),
        avg_time_to_review_days: 0,
        pending_messages: 0,
      };

      return {
        // New recruiter dashboard contract fields:
        kpis,
        top_jobs_by_applications,
        clicks_per_job,
        saved_jobs_trend,
        // Keep old fields for backwards compatibility:
        metric,
        window_days,
        jobs,
      };
    });

    return res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /analytics/jobs/saved-per-day
// Saved-jobs time series over the requested window.
// ---------------------------------------------------------------------------

const SavedPerDaySchema = z.object({
  window_days: z.number().int().positive().max(365).default(30),
});

analyticsRouter.post('/analytics/jobs/saved-per-day', async (req, res, next) => {
  try {
    const { window_days } = validate(SavedPerDaySchema, req.body);
    const since = new Date(Date.now() - window_days * 86_400_000);

    const rows = await getDb().collection('events').aggregate([
      {
        $match: {
          event_type: 'job.saved',
          timestamp: { $gte: since.toISOString() },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $toDate: '$timestamp' },
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    return res.json({
      trend: rows.map((r) => ({
        date: r._id,
        count: Number(r.count) || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /analytics/funnel
// For one job: view → save → apply_start → submit (+ stage conversion rates).
// ---------------------------------------------------------------------------

const FunnelSchema = z.object({
  // Frontend currently calls this without job_id.
  job_id: z.string().min(1).optional(),
  recruiter_id: z.string().min(1).optional(),
  window: z.enum(['7d', '14d', '30d', '90d']).optional(),
  window_days: z.number().int().positive().max(365).optional(),
});

analyticsRouter.post('/analytics/funnel', async (req, res, next) => {
  try {
    const parsed = validate(FunnelSchema, req.body);
    const window_days = resolveWindowDays(parsed);
    const cacheKey = keys.analyticsFunnel(parsed.job_id || 'all', window_days);

    const data = await getAnalyticsResult(cacheKey, async () => {
      const since = new Date(Date.now() - window_days * 86_400_000);
      const match = {
        'entity.entity_type': 'job',
        event_type: { $in: ['job.viewed', 'job.saved', 'apply_start', 'application.submitted'] },
        timestamp: { $gte: since.toISOString() },
      };
      if (parsed.job_id) {
        match['entity.entity_id'] = parsed.job_id;
      } else if (parsed.recruiter_id) {
        const [jobRows] = await getPool().query(
          'SELECT job_id FROM jobs WHERE recruiter_id = :recruiter_id',
          { recruiter_id: parsed.recruiter_id },
        );
        const ids = jobRows.map((r) => r.job_id);
        if (ids.length === 0) {
          return {
            job_id: null,
            window_days,
            view: 0,
            save: 0,
            apply_start: 0,
            submit: 0,
            rates: { view_to_save: 0, save_to_apply_start: 0, apply_start_to_submit: 0, view_to_submit: 0 },
            low_performing_jobs: [],
          };
        }
        match['entity.entity_id'] = { $in: ids };
      }

      const rows = await getDb().collection('events').aggregate([
        { $match: match },
        { $group: { _id: '$event_type', count: { $sum: 1 } } },
      ]).toArray();

      const counts = Object.fromEntries(rows.map((r) => [r._id, r.count]));
      const view = counts['job.viewed'] || 0;
      const save = counts['job.saved'] || 0;
      const apply_start = counts['apply_start'] || 0;
      const submit = counts['application.submitted'] || 0;

      const safeRate = (num, den) => (den > 0 ? Number((num / den).toFixed(4)) : 0);
      const rates = {
        view_to_save: safeRate(save, view),
        save_to_apply_start: safeRate(apply_start, save),
        apply_start_to_submit: safeRate(submit, apply_start),
        view_to_submit: safeRate(submit, view),
      };

      // Frontend recruiter dashboard expects low_performing_jobs from this endpoint.
      const lowAgg = await getDb().collection('events').aggregate([
        {
          $match: {
            event_type: 'application.submitted',
            'entity.entity_type': 'job',
            ...(parsed.job_id ? { 'entity.entity_id': parsed.job_id } : {}),
            timestamp: { $gte: since.toISOString() },
          },
        },
        { $group: { _id: '$entity.entity_id', count: { $sum: 1 } } },
        { $sort: { count: 1 } },
        { $limit: 5 },
      ]).toArray();
      const lowIds = lowAgg.map((r) => r._id).filter(Boolean);
      let lowTitleMap = new Map();
      if (lowIds.length) {
        const placeholders = lowIds.map(() => '?').join(',');
        const [rowsTitle] = await getPool().query(
          `SELECT job_id, title FROM jobs WHERE job_id IN (${placeholders})`,
          lowIds,
        );
        lowTitleMap = new Map(rowsTitle.map((r) => [r.job_id, r.title]));
      }
      const low_performing_jobs = lowAgg.map((r) => ({
        name: lowTitleMap.get(r._id) || r._id,
        value: Number(r.count) || 0,
      }));

      return {
        // Frontend-recruiter field:
        low_performing_jobs,
        // Backwards-compatible funnel shape:
        job_id: parsed.job_id || null,
        window_days,
        view,
        save,
        apply_start,
        submit,
        rates,
      };
    });

    return res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /analytics/geo
// City/state distribution of application.submitted events for a job.
// ---------------------------------------------------------------------------

const GeoSchema = z.object({
  // Frontend currently calls this without job_id.
  job_id: z.string().min(1).optional(),
  recruiter_id: z.string().min(1).optional(),
  window: z.enum(['7d', '14d', '30d', '90d']).optional(),
  window_days: z.number().int().positive().max(365).optional(),
  limit: z.number().int().positive().max(100).default(20),
});

analyticsRouter.post('/analytics/geo', async (req, res, next) => {
  try {
    const parsed = validate(GeoSchema, req.body);
    const window_days = resolveWindowDays(parsed);
    const limit = parsed.limit;
    const cacheKey = keys.analyticsGeo(parsed.job_id || 'all', window_days, limit);

    const data = await getAnalyticsResult(cacheKey, async () => {
      const since = new Date(Date.now() - window_days * 86_400_000);
      const match = {
        event_type: 'application.submitted',
        'entity.entity_type': 'job',
        timestamp: { $gte: since.toISOString() },
      };
      if (parsed.job_id) {
        match['entity.entity_id'] = parsed.job_id;
      } else if (parsed.recruiter_id) {
        const [jobRows] = await getPool().query(
          'SELECT job_id FROM jobs WHERE recruiter_id = :recruiter_id',
          { recruiter_id: parsed.recruiter_id },
        );
        const ids = jobRows.map((r) => r.job_id);
        if (ids.length === 0) {
          return { job_id: null, window_days, cities: [], city_applications: [] };
        }
        match['entity.entity_id'] = { $in: ids };
      }

      const cities = await getDb().collection('events').aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              city: { $ifNull: ['$payload.member_city', '$payload.city'] },
              state: { $ifNull: ['$payload.member_state', '$payload.state'] },
            },
            count: { $sum: 1 },
          },
        },
        { $match: { '_id.city': { $ne: null } } },
        { $sort: { count: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            city: '$_id.city',
            state: '$_id.state',
            count: 1,
          },
        },
      ]).toArray();

      return {
        // Frontend recruiter field:
        city_applications: cities.map((c) => ({ city: c.city, value: Number(c.count) || 0 })),
        // Backwards-compatible shape:
        job_id: parsed.job_id || null,
        window_days,
        cities,
      };
    });

    return res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /analytics/member/dashboard
// Per-member: profile views line chart + application status breakdown donut.
// ---------------------------------------------------------------------------

const MemberDashboardSchema = z.object({
  member_id: z.string().min(1),
  // Frontend sends "window" ("7d" | "14d" | "30d" | "90d"), professor doc uses window_days.
  window: z.enum(['7d', '14d', '30d', '90d']).optional(),
  window_days: z.number().int().positive().max(365).optional(),
});

function resolveWindowDays(body) {
  if (typeof body.window_days === 'number' && Number.isFinite(body.window_days)) return body.window_days;
  if (body.window === '7d') return 7;
  if (body.window === '14d') return 14;
  if (body.window === '90d') return 90;
  return 30;
}

analyticsRouter.post('/analytics/member/dashboard', async (req, res, next) => {
  try {
    const parsed = validate(MemberDashboardSchema, req.body);
    const member_id = parsed.member_id;
    const window_days = resolveWindowDays(parsed);
    const cacheKey = keys.analyticsMemberDashboard(member_id, window_days);

    const data = await getOrSet(cacheKey, config.ANALYTICS_CACHE_TTL_SEC, async () => {
      const since = new Date(Date.now() - window_days * 86_400_000);

      const viewsAgg = await getDb().collection('profile_views').aggregate([
        { $match: { member_id, viewed_at: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$viewed_at' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]).toArray();

      const topViewersAgg = await getDb().collection('profile_views').aggregate([
        { $match: { member_id, viewed_at: { $gte: since } } },
        { $group: { _id: '$viewer_id', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]).toArray();
      const topViewerIds = topViewersAgg.map((r) => r._id).filter(Boolean);
      let top_viewers = [];
      if (topViewerIds.length) {
        const placeholders = topViewerIds.map(() => '?').join(',');
        const [rows] = await getPool().query(
          `SELECT member_id, first_name, last_name, headline
             FROM members
            WHERE member_id IN (${placeholders})`,
          topViewerIds,
        );
        const map = new Map(rows.map((r) => [
          r.member_id,
          { member_id: r.member_id, full_name: `${r.first_name} ${r.last_name}`.trim(), headline: r.headline || '' },
        ]));
        top_viewers = topViewerIds.map((id) => map.get(id)).filter(Boolean);
      }

      const [statusRows] = await getPool().query(
        `SELECT status, COUNT(*) AS count
           FROM applications
          WHERE member_id = :member_id
          GROUP BY status`,
        { member_id },
      );
      const application_status_breakdown = Object.fromEntries(
        statusRows.map((r) => [r.status, Number(r.count)]),
      );

      const status = {
        submitted: application_status_breakdown.submitted || 0,
        reviewing: application_status_breakdown.reviewing || 0,
        interview: application_status_breakdown.interview || 0,
        offer: application_status_breakdown.offer || 0,
        rejected: application_status_breakdown.rejected || 0,
      };
      const profileViewsValue = viewsAgg.reduce((sum, p) => sum + (Number(p.count) || 0), 0);

      // Frontend contract expects a richer dashboard shape; fields we don't track yet are zeros/empties.
      return {
        member_id,
        window_days,
        profile_views_per_day: viewsAgg.map((p) => ({ date: `${p.date}T00:00:00.000Z`, value: Number(p.count) || 0 })),
        post_impressions_per_day: [],
        search_appearances_per_week: [],
        applications_status_breakdown: status,
        engagement_breakdown: { reactions: 0, comments: 0, reposts: 0, shares: 0 },
        top_skills_searched: [],
        top_viewers,
        kpis: {
          profile_views: { value: profileViewsValue, change_pct: 0 },
          post_impressions: { value: 0, change_pct: 0 },
          search_appearances: { value: 0, change_pct: 0 },
          application_response_rate: { value: 0, change_pct: 0 },
        },
      };
    });

    return res.json(data);
  } catch (err) {
    next(err);
  }
});
