import express from 'express';
import { CLS } from '../data.js';
import { myClasses } from '../API/auth.js';

const router = express.Router();

// GET /api/classes-list
router.get('/', (req, res) => res.json(myClasses(req.user) || CLS));

export default router;
