const pdfParse = require('pdf-parse/lib/pdf-parse.js');

async function extractText(file) {
  const name = file.originalname.toLowerCase();
  if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
    const data = await pdfParse(file.buffer);
    return data.text;
  }
  if (file.mimetype.startsWith('text/') || name.endsWith('.txt')) return file.buffer.toString('utf8');
  throw Object.assign(new Error('Only PDF and TXT files are supported'), { status: 400 });
}

module.exports = { extractText };
