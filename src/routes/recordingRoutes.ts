import { Router } from 'express';
import { generateRecordingTwiml, handleRecordingStatus } from '../controllers/recordingController';

const router = Router();

router.post('/record', generateRecordingTwiml);
router.post('/recording-status', handleRecordingStatus);

export default router;