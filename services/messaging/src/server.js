import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'messaging', db: 'disconnected', kafka: 'disconnected' });
});

app.use((_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'messaging service route not implemented yet',
      details: {}
    },
    trace_id: 'pending'
  });
});

const port = Number(process.env.PORT || 8004);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'messaging', port, status: 'started' }));
});
