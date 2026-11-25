const REPORT_FORM_SHEET_TAB_ = "Course Reports";
const REPORT_FORM_HEADERS_ = ["Timestamp","Course","URL","Issue","IP","Status"];
const REPORT_FORM_DEFAULT_STATUS_ = "New";

function handleReportFormPost_(e) {
  try {
    if (!e || !e.parameter) {
      return reportFormJsonOut_({status:"error",message:"No POST data. Run via HTTP only."});
    }

    const params = e.parameter;
    if (!params.course || !params.url || !params.issue) {
      return reportFormJsonOut_({status:"error",message:"Missing required fields."});
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = reportFormGetOrCreateSheet_();
      reportFormAppend_(sheet, params);
    } finally {
      lock.releaseLock();
    }

    return reportFormJsonOut_({status:"ok"});
  } catch (error) {
    Logger.log("Course report error: " + error.message);
    return reportFormJsonOut_({status:"error",message:"Internal error."});
  }
}

function handleReportFormGet_(e) {
  return reportFormJsonOut_({status:"ok",service:"CL Course Report v2"});
}

function reportFormGetOrCreateSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(REPORT_FORM_SHEET_TAB_);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(REPORT_FORM_SHEET_TAB_);
    reportFormWriteHeaders_(sheet);
  } else if (sheet.getLastRow() === 0) {
    reportFormWriteHeaders_(sheet);
  }

  return sheet;
}

function reportFormWriteHeaders_(sheet) {
  const range = sheet.getRange(1, 1, 1, REPORT_FORM_HEADERS_.length);
  range.setValues([REPORT_FORM_HEADERS_])
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 280);
  sheet.setColumnWidth(4, 360);
  sheet.setColumnWidth(5, 160);
  sheet.setColumnWidth(6, 80);
}

function reportFormAppend_(sheet, params) {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm:ss"
  );

  const row = [
    timestamp,
    params.course || "",
    params.url || "",
    params.issue || "",
    params.ip || "",
    REPORT_FORM_DEFAULT_STATUS_
  ];

  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.insertRowAfter(lastRow);
  sheet.getRange(lastRow + 1, 1, 1, row.length)
    .setValues([row])
    .setHorizontalAlignment("left");
}

function reportFormJsonOut_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
