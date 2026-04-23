import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../util/validator.js';
import { ok } from '../util/envelope.js';
import { ingestEnvelope } from '../kafka/consumer.js';

const EntitySchema = z.object({
  entity_type: z.enum(['job', 'application', 'thread', 'connection', 'ai_task', 'member']),
  entity_id: z.string().min(1),
});

// Kafka envelope shape — matches Part 4 of the master doc exactly.
const EnvelopeSchema = z.object({
  event_type: z.string().min(1),
  trace_id: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
  actor_id: z.string().min(1),
  entity: EntitySchema.optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  payload: z.record(z.any()).default({}),
  idempotency_key: z.string().min(1).optional(),
});

export const eventsRouter = Router();

eventsRouter.post('/events/ingest', async (req, res, next) => {
  try {
    const body = validate(EnvelopeSchema, req.body);

    // Normalise: the API doc accepts either {entity:{entity_type,entity_id}} (envelope form)
    // or flat {entity_type, entity_id} (simpler form used by frontend). Unify to the nested form.
    const entity =
      body.entity ||
      (body.entity_type && body.entity_id
        ? { entity_type: body.entity_type, entity_id: body.entity_id }
        : undefined);

    const envelope = {
      event_type: body.event_type,
      trace_id: body.trace_id || req.traceId || uuidv4(),
      timestamp: body.timestamp || new Date().toISOString(),
      actor_id: body.actor_id,
      entity,
      payload: body.payload,
      idempotency_key: body.idempotency_key || `${body.event_type}:${uuidv4()}`,
    };

    const result = await ingestEnvelope(envelope, { source: 'http' });

    return res.status(202).json(
      ok(
        {
          accepted: true,
          duplicate: result.duplicate,
          idempotency_key: envelope.idempotency_key,
        },
        envelope.trace_id,
      ),
    );
  } catch (err) {
    next(err);
  }
});
