const express = require('express');
const { getStudentActivity, getStudentQuizHistory } = require('../utils/studentActivity');

const router = express.Router();

router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const activity = await getStudentActivity(req.query, limit);
    return res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Get student activity error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/quiz-history', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const history = await getStudentQuizHistory(req.query, limit);
    return res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get student quiz history error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
