require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { auditRouter, optimizeRouter } = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*'
}));
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api', auditRouter);
app.use('/api', optimizeRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 SEO Audit Server running on http://localhost:${PORT}`);
});
