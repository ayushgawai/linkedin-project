import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'application', db: 'disconnected', kafka: 'disconnected' });
});

app.use((_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'application service route not implemented yet',
      details: {}
    },
    trace_id: 'pending'
  });
});

const port = Number(process.env.PORT || 8003);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'application', port, status: 'started' }));
});
