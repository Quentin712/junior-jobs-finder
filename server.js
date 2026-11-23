require('dotenv').config();
const express = require('express');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;
const SERVER_NAME = process.env.SERVER_NAME || 'local';
const HOST = '127.0.0.1';

const COUNTRIES = ['gb', 'us', 'ca', 'de', 'fr'];
const LEVELS = ['internship', 'graduate', 'junior', 'entry level'];
const SENIOR_WORDS = /\b(senior|sr|lead|principal|manager|director|head of)\b/i;
const CACHE_MINUTES = 10;
const cache = new Map();

if (!APP_ID || !APP_KEY) {
  console.error('Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in .env');
  process.exit(1);
}

app.use((req, res, next) => {
  res.setHeader('X-App-Server', SERVER_NAME);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
  );
  next();
});
app.use(express.static('public'));

/*
Takes one raw job from Adzuna and keeps only the parts our page needs.
*/
function cleanJob(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company ? job.company.display_name : 'Unknown company',
    location: job.location ? job.location.display_name : 'Unknown location',
    salaryMin: job.salary_min || null,
    salaryMax: job.salary_max || null,
    contractTime: job.contract_time || null,
    posted: job.created,
    link: job.redirect_url
  };
}

/*
Checks what the visitor typed. Gives back an error message,
or null if everything looks fine.
*/
function checkInput(country, level, keyword, page) {
  if (!COUNTRIES.includes(country)) return 'Country not supported.';
  if (!LEVELS.includes(level)) return 'Level not supported.';
  if (keyword.length > 50) return 'Keyword is too long (50 characters max).';
  if (!/^[\w\s+#.-]*$/.test(keyword)) return 'Keyword has characters we do not allow.';
  if (!Number.isInteger(page) || page < 1 || page > 5) return 'Page must be from 1 to 5.';
  return null;
}

app.get('/api/jobs', async (req, res) => {
  const country = (req.query.country || 'gb').toLowerCase();
  const level = (req.query.level || 'internship').toLowerCase();
  const keyword = (req.query.keyword || '').trim();
  const page = parseInt(req.query.page || '1', 10);

  const problem = checkInput(country, level, keyword, page);
  if (problem) return res.status(400).json({ error: problem });

  const cacheKey = [country, level, keyword, page].join('|');
  const saved = cache.get(cacheKey);
  if (saved && saved.expires > Date.now()) {
    return res.json({ ...saved.data, cached: true });
  }

  const params = new URLSearchParams({
    app_id: APP_ID,
    app_key: APP_KEY,
    what: `${keyword} ${level}`.trim(),
    results_per_page: '20',
    sort_by: 'date'
  });
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`;

  try {
    const reply = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (reply.status === 401 || reply.status === 403) {
      return res.status(502).json({ error: 'The job service rejected our API key.' });
    }
    if (reply.status === 429) {
      return res.status(503).json({ error: 'Too many requests to the job service. Try again later.' });
    }
    if (!reply.ok) {
      return res.status(502).json({ error: 'The job service returned an error.' });
    }
    const body = await reply.json();
    if (!Array.isArray(body.results)) {
      return res.status(502).json({ error: 'The job service sent an unexpected reply.' });
    }
    const jobs = body.results.map(cleanJob).filter(job => !SENIOR_WORDS.test(job.title));
    const data = { count: body.count, jobs: jobs, cached: false };
    cache.set(cacheKey, { data, expires: Date.now() + CACHE_MINUTES * 60 * 1000 });
    res.json(data);
  } catch (err) {
    res.status(504).json({ error: 'Could not get data from the job service. Check your connection and try again.' });
  }
});

app.listen(PORT, (err) => {
  if (err) {
    console.error('Could not start the server:', err.message);
    process.exit(1);
  }
  console.log(`Server "${SERVER_NAME}" running on port ${PORT}`);
});
