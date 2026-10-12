import express from 'express';
import { CLS } from '../db/index.js';
import { myClasses } from '../API/auth.js';

const router = express.Router();

// GET /api/classes-list
router.get('/', async (req, res, next) => {
  try {
    const mine = await myClasses(req.user);
    res.json(mine || CLS);
  } catch (err) { next(err); }
});

export default router;
