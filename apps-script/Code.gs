const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
const SHEET_NAMES = {
  senior: 'Senior Library',
  junior: 'Junior Library'
};
const FAILED_SHEET_NAMES = {
  senior: 'Failed Submissions - Senior',
  junior: 'Failed Submissions - Junior'
};
const SPREADSHEET_NAME = 'Library Book Scanner';

function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SPREADSHEET_ID');
  let ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ssId = null; }
  }
  if (!ssId) {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  return ss;
}

function getSheet(ss, library) {
  const sheetName = SHEET_NAMES[library] || SHEET_NAMES.senior;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && defaultSheet.getLastRow() === 0) ss.deleteSheet(defaultSheet);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Sl.No.', 'Accession No.', 'Title of the Book', 'Sub Title',
      'Author', 'Editor', 'Compiler', 'Illustrator', 'Publisher',
      'Edition', 'Volume No.', 'Series', 'Place', 'Price', 'Year',
      'Pages', 'Size', 'Source', 'ISBN No.', 'Lost cost', 'Damage Quantity'
    ]);
    sheet.getRange(1, 1, 1, 21).setBackground('#FFFF00');
  }
  return sheet;
}

function getFailedSheet(ss, library) {
  const sheetName = FAILED_SHEET_NAMES[library] || FAILED_SHEET_NAMES.senior;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['Timestamp', 'Accession No.', 'Error', 'Action']);
    sheet.getRange(1, 1, 1, 4).setBackground('#FFE0E0');
  }
  return sheet;
}

function lookupOpenLibrary(isbn) {
  try {
    const res = UrlFetchApp.fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      { muteHttpExceptions: true }
    );
    const json = JSON.parse(res.getContentText());
    const data = json[`ISBN:${isbn}`];
    if (!data) return {};

    // Extract year from publish_date which can be "2005", "January 2005", etc.
    const yearMatch = (data.publish_date || '').match(/\d{4}/);

    return {
      title:      data.title                     || null,
      subtitle:   data.subtitle                  || null,
      author:     data.authors?.[0]?.name        || null,
      publisher:  data.publishers?.[0]?.name     || null,
      place:      data.publish_places?.[0]?.name || null,
      year:       yearMatch ? yearMatch[0]        : null,
      pages:      data.number_of_pages           || null,
      edition:    data.edition_name              || null,
      series:     data.series?.[0]?.name         || null,
    };
  } catch (_) {
    return {};
  }
}

function mergeOpenLibrary(book, olData) {
  // Only fill fields that Gemini left null — never override what it found
  for (const key of Object.keys(olData)) {
    if ((book[key] === null || book[key] === undefined) && olData[key]) {
      book[key] = olData[key];
    }
  }
  return book;
}

function callGemini(parts) {
  const gRes = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } }
      }),
      muteHttpExceptions: true
    }
  );
  const gJson = JSON.parse(gRes.getContentText());
  if (!gJson.candidates || !gJson.candidates[0]) {
    throw new Error('Gemini error: ' + JSON.stringify(gJson));
  }
  return JSON.parse(gJson.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim());
}

function callGeminiWithRetry(parts, maxRetries) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) Utilities.sleep(3000 * attempt); // 3s, 6s backoff
    try {
      return callGemini(parts);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function doPost(e) {
  const ss = getSpreadsheet();
  let accessionNo = '?';
  let library = 'senior';
  try {
    const data = JSON.parse(e.postData.contents);
    const { images, accessionNo: acc } = data;
    library = (data.library === 'junior') ? 'junior' : 'senior';
    accessionNo = acc;

    const parts = images.map(img => ({
      inlineData: { mimeType: 'image/jpeg', data: img }
    }));
    parts.push({ text: `You are a library cataloguing assistant.
You have been given photos of a book (front cover, back cover, and ISBN/barcode close-up).

STEP 1 — READ THE IMAGES CAREFULLY:
Scan every part of every image for text. Specifically look for:
- Front cover: title, subtitle, author, editor ("Edited by"), compiler ("Compiled by"), illustrator, series name, volume number, edition
- Back cover: price (near barcode, e.g. "Rs. 250" or "₹250"), publisher, ISBN, series info, description
- Spine: series name, volume, publisher
- ISBN image: extract the full ISBN number from the barcode digits or printed text
- Any small print anywhere: edition details, publication place, year

STEP 2 — USE YOUR KNOWLEDGE:
If you recognise the book from its title/author/publisher, use your training knowledge to fill fields not visible in the images (year, place, pages, edition, series, etc.).

Return raw JSON only, no markdown. Use null only if truly unknown:
{
  "title": "full title",
  "subtitle": "subtitle or null",
  "author": "primary author full name or null",
  "editor": "editor full name (look for 'Edited by' on cover) or null",
  "compiler": "compiler full name (look for 'Compiled by') or null",
  "illustrator": "illustrator full name or null",
  "publisher": "publisher name",
  "edition": "e.g. 1st Edition, 2nd Edition or null",
  "volume": "volume number or null",
  "series": "series name or null",
  "place": "city of publication or null",
  "year": "publication year as 4-digit string or null",
  "pages": number of pages as integer or null,
  "size": "book dimensions e.g. 24cm or null",
  "source": "country of origin or null",
  "isbn": "ISBN digits only no hyphens or null",
  "price": "price as printed on book e.g. Rs. 250 or null"
}` });

    let book = callGeminiWithRetry(parts, 2);

    // Free Open Library lookup — fills any fields Gemini left null
    if (book.isbn) {
      const olData = lookupOpenLibrary(book.isbn);
      book = mergeOpenLibrary(book, olData);
    }

    const sheet = getSheet(ss, library);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.appendRow([
        sheet.getLastRow(), accessionNo,
        book.title       ?? null,
        book.subtitle    ?? null,
        book.author      ?? null,
        book.editor      ?? null,
        book.compiler    ?? null,
        book.illustrator ?? null,
        book.publisher   ?? null,
        book.edition     ?? null,
        book.volume      ?? null,
        book.series      ?? null,
        book.place       ?? null,
        book.price       ?? null,
        book.year        ?? null,
        book.pages       ?? null,
        book.size        ?? null,
        book.source      ?? null,
        book.isbn        ?? null, 0, 0
      ]);
    } finally {
      lock.releaseLock();
    }

    return respond({ success: true, title: book.title ?? accessionNo });
  } catch (err) {
    // All retries exhausted — log to Failed Submissions sheet
    try {
      const failedSheet = getFailedSheet(ss, library);
      failedSheet.appendRow([
        new Date().toLocaleString(),
        accessionNo,
        err.message,
        'Re-scan required'
      ]);
    } catch (_) {}
    return respond({ success: false, error: err.message });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
