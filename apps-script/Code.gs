const GEMINI_API_KEY = 'AIzaSyBTx-vnw7EcDu-9dwAoulFtCvflPhi0sNU';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { image, accessionNo } = data;

    // Step 1: Gemini extracts ISBN + Price from image
    const parts = [
      { inlineData: { mimeType: 'image/jpeg', data: image } },
      { text: `Look at this book image. Extract ONLY the ISBN and price.
Return raw JSON: {"isbn": "digits only no hyphens", "price": "with currency symbol or null"}
Raw JSON only. No markdown.` }
    ];

    const gRes = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ contents: [{ parts }] }),
        muteHttpExceptions: true
      }
    );
    const gText = JSON.parse(gRes.getContentText()).candidates[0].content.parts[0].text;
    const { isbn, price } = JSON.parse(gText.replace(/```json|```/g, '').trim());

    // Step 2: Open Library fetches all other metadata
    const olRes  = UrlFetchApp.fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
    );
    const olJson = JSON.parse(olRes.getContentText());
    const book   = olJson[`ISBN:${isbn}`] ?? {};

    // Step 3: Write to Sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Library Catalog');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Sl.No.', 'Accession No.', 'Title of the Book', 'Sub Title',
        'Author', 'Editor', 'Compiler', 'Illustrator', 'Publisher',
        'Edition', 'Volume No.', 'Series', 'Place', 'Price', 'Year',
        'Pages', 'Size', 'Source', 'ISBN No.', 'Lost cost', 'Damage Quantity'
      ]);
      sheet.getRange(1, 1, 1, 21).setBackground('#FFFF00');
    }

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
