const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
const SHEET_NAME = 'Library Book details';
const SPREADSHEET_NAME = 'Library Book Scanner';

function getSheet() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SPREADSHEET_ID');

  let ss;
  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (e) {
      ssId = null;
    }
  }

  if (!ssId) {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
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

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { images, accessionNo } = data;

    // Build parts: one entry per image + the prompt text
    const parts = images.map(img => ({
      inlineData: { mimeType: 'image/jpeg', data: img }
    }));
    parts.push({ text: `You are a library cataloguing assistant. Look at these book cover images and identify the book.
Then use BOTH what you can see in the images AND your training knowledge about this book to fill in as many fields as possible.
Do not limit yourself to only what is visible — if you recognise the book, use your knowledge to fill edition, pages, place, series, etc.
Return raw JSON only, no markdown. Use null only if you truly don't know the value:
{
  "title": "full title of the book",
  "subtitle": "subtitle or null",
  "author": "primary author full name",
  "editor": "editor name or null",
  "compiler": "compiler name or null",
  "illustrator": "illustrator name or null",
  "publisher": "publisher name",
  "edition": "edition e.g. 1st Edition or null",
  "volume": "volume number or null",
  "series": "series name or null",
  "place": "city of publication or null",
  "year": "publication year as string",
  "pages": "number of pages as integer or null",
  "size": "book dimensions e.g. 24cm or null",
  "source": "original country or source of publication or null",
  "isbn": "ISBN digits only no hyphens or null",
  "price": "price with currency symbol as printed on book or null"
}` });

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
    const gText = gJson.candidates[0].content.parts[0].text;
    const book = JSON.parse(gText.replace(/```json|```/g, '').trim());

    const sheet = getSheet();
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

    return respond({ success: true, title: book.title ?? isbn });
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
