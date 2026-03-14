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
    Logger.log('Created new spreadsheet: ' + ss.getUrl());
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Remove default Sheet1 if empty
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
    const { isbn, accessionNo, price } = data;

    // Open Library → all metadata
    const olRes  = UrlFetchApp.fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
    );
    const olJson = JSON.parse(olRes.getContentText());
    const book   = olJson[`ISBN:${isbn}`] ?? {};

    const sheet = getSheet();

    sheet.appendRow([
      sheet.getLastRow(), accessionNo,
      book.title                     ?? null,
      book.subtitle                  ?? null,
      book.authors?.[0]?.name        ?? null,
      book.by_statement              ?? null,
      null,
      book.contributions?.[0]        ?? null,
      book.publishers?.[0]?.name     ?? null,
      book.edition_name              ?? null,
      book.volumes                   ?? null,
      book.series?.[0]?.name         ?? null,
      book.publish_places?.[0]?.name ?? null,
      price,
      book.publish_date              ?? null,
      book.number_of_pages           ?? null,
      null, null, isbn, 0, 0
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
