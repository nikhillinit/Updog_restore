import express from 'express';
import { createServer } from 'http';

// Assuming your package.json is in the root
import { version } from '../../package.json';

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

/**
 * Health check endpoint to verify the service is running.
 */
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: version,
  });
});

// Add other routes here as the project grows...

const server = createServer(app);

server.listen(port, () => {
  console.log(`🚀 API Server listening on http://localhost:${port}`);
});
