const express = require('express');
const HTMLtoDOCX = require('@turbodocx/html-to-docx');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || ''; // optional simple auth, empty = disabled

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// --- simple optional API key check ---
app.use((req, res, next) => {
  if (!API_KEY) return next(); // auth disabled if no API_KEY set
  const key = req.header('x-api-key');
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized: invalid or missing x-api-key header' });
  next();
});

// --- resolve <style> block CSS (and default <th> bold behavior) into inline
// style="" attributes, since the docx converter only reads inline styles ---
function resolveStylesToInline(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Browsers bold <th> by default even with no CSS; the converter doesn't
  // replicate that default, so we seed it here (lowest priority).
  $('th').each((i, el) => {
    const existing = $(el).attr('style') || '';
    $(el).attr('style', `font-weight: bold; ${existing}`);
  });

  // Apply simple flat <style> block rules (tag/class selectors, comma lists).
  // Declarations are placed BEFORE each element's current style so that
  // any pre-existing inline style (higher priority) still wins on conflicts.
  $('style').each((i, styleEl) => {
    const css = $(styleEl).html() || '';
    const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
    let match;
    while ((match = ruleRegex.exec(css)) !== null) {
      const selectors = match[1].split(',').map((s) => s.trim()).filter(Boolean);
      const declarations = match[2].trim().replace(/;\s*$/, '');
      selectors.forEach((selector) => {
        try {
          $(selector).each((j, el) => {
            const existing = $(el).attr('style') || '';
            $(el).attr('style', `${declarations}; ${existing}`);
          });
        } catch (e) {
          // invalid/unsupported selector - skip it
        }
      });
    }
  });

  $('style').remove();
  return $.html();
}

// --- health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'html2docx', time: new Date().toISOString() });
});

// --- fetch a remote image and convert it to a base64 data URI ---
async function toDataUri(url) {
  try {
    const resp = await fetch(url, { timeout: 15000 });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') || 'image/png';
    const buffer = await resp.buffer();
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.error(`Failed to fetch image ${url}:`, err.message);
    return null; // leave original src if it fails
  }
}

// --- find all <img src="http..."> tags and inline them as base64 ---
async function inlineRemoteImages(html) {
  const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
  const urls = new Set();
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    urls.add(match[1]);
  }

  if (urls.size === 0) return html;

  const replacements = await Promise.all(
    [...urls].map(async (url) => {
      const dataUri = await toDataUri(url);
      return { url, dataUri };
    })
  );

  let result = html;
  for (const { url, dataUri } of replacements) {
    if (dataUri) {
      // escape special regex chars in the URL before building the replacer
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), dataUri);
    }
  }
  return result;
}

// --- main conversion endpoint ---
// POST /convert
// body: { html: "<h1>...</h1>", filename: "output.docx", options: { ... } }
// returns: binary .docx file
app.post('/convert', async (req, res) => {
  try {
    const { html, filename, options } = req.body || {};

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'Field "html" (string) is required in the JSON body' });
    }

    const htmlWithInlineStyles = resolveStylesToInline(html);
    const processedHtml = await inlineRemoteImages(htmlWithInlineStyles);

    const docxOptions = {
      footer: false,
      pageNumber: false,
      ...(options || {}),
      table: {
        row: { cantSplit: true },
        borderOptions: { stroke: 'single', size: 4, color: '000000' },
        ...(options && options.table ? options.table : {}),
      },
    };

    const fileBuffer = await HTMLtoDOCX(processedHtml, null, docxOptions);

    const outName = (filename && filename.endsWith('.docx')) ? filename : 'document.docx';

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${outName}"`,
    });
    res.send(fileBuffer);
  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ error: 'Conversion failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`html2docx service listening on port ${PORT}`);
  console.log(API_KEY ? 'API key auth: ENABLED' : 'API key auth: DISABLED (set API_KEY env var to enable)');
});