import express from 'express';
import env from './config/env';
import recordingRoutes from './routes/recordingRoutes';
import logger from './utils/logger';

// Create Express app
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from Valerie-audio!');
});


// Register routes
app.use(recordingRoutes);

// Start server
if (require.main === module) {
  app.listen(env.port, () => {
    logger.info(`Server is running on port ${env.port}`);
    logger.info(`Recording webhook available at http://localhost:${env.port}/record`);
  });
}

export default app;