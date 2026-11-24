const SPREADSHEET_ID = "1vrlypbUKG9h7yzGldN5cpJ79zPChwOz_nxJ4pekJPGA";
const WAITLIST_SHEET = "Waitlist";
const SIGNUP_RATE_LIMIT = 30;

function authorizeSpreadsheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_();
  Logger.log("Connected: " + spreadsheet.getName());
  Logger.log("Worksheet: " + sheet.getName());
}

function doPost(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = sanitize_(params.action, 20);

    if (action === "visit") {
      recordVisit_(params);
      return jsonResponse_({ok:true});
    }

    if (isRateLimited_()) {
      return jsonResponse_({ok:false,error:"rate_limited"});
    }

    const company = sanitize_(params.company, 200);
    if (company) return jsonResponse_({ok:true});

    const name = sanitize_(params.name, 100);
    const email = sanitize_(params.email, 254).toLowerCase();
    const source = sanitize_(params.source, 200) || "direct";
    const country = sanitize_(params.country, 100);
    const ip = sanitize_(params.ip, 64);

    if (!name) return jsonResponse_({ok:false,error:"missing_name"});
    if (!isValidEmail_(email)) return jsonResponse_({ok:false,error:"invalid_email"});
    if (isDisposableOrDummy_(email)) return jsonResponse_({ok:false,error:"disposable_email"});

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getOrCreateSheet_();
      if (emailExists_(sheet, email)) {
        return jsonResponse_({ok:true,duplicate:true});
      }
      sheet.appendRow([
        new Date(),
        safeCell_(name),
        safeCell_(email),
        safeCell_(source),
        safeCell_(country),
        safeCell_(ip)
      ]);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_({ok:true});
  } catch (error) {
    Logger.log(String(error));
    return jsonResponse_({ok:false,error:"sheet_write_failed"});
  }
}

function doGet(e) {
  const health = e && e.parameter && e.parameter.health === "1";
  if (!health) {
    return ContentService.createTextOutput("Course Legend endpoint is live.")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateSheet_();
    return jsonResponse_({
      ok:true,
      spreadsheet:spreadsheet.getName(),
      sheet:sheet.getName(),
      headers:sheet.getRange(1, 1, 1, 6).getValues()[0]
    });
  } catch (error) {
    Logger.log(String(error));
    return jsonResponse_({ok:false,error:"sheet_access_failed"});
  }
}

function recordVisit_(params) {
  const source = sanitize_(params.source, 200) || "direct";
  const country = sanitize_(params.country, 100);
  const ip = sanitize_(params.ip, 64);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_();
    sheet.appendRow([
      new Date(),
      "",
      "",
      safeCell_(source),
      safeCell_(country),
      safeCell_(ip)
    ]);
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(WAITLIST_SHEET);
  const headers = ["Received At","Name","Email","Source","Country","IP"];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(WAITLIST_SHEET);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  const missing = headers.some(function(header, index) {
    return String(current[index] || "").trim() !== header;
  });

  if (missing && sheet.getLastRow() === 1 && current.every(function(value) { return !value; })) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  if (sheet.getFrozenRows() === 0) sheet.setFrozenRows(1);
  return sheet;
}

function sanitize_(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength || 200);
}

function safeCell_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isRateLimited_() {
  const cache = CacheService.getScriptCache();
  const key = "signup_" + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 90);
  return count > SIGNUP_RATE_LIMIT;
}

function emailExists_(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  return values.some(function(row) {
    return String(row[0] || "").trim().toLowerCase() === email;
  });
}

const DISPOSABLE_DOMAINS_ = [
  "mailinator.com","mailinator.net","mailinator2.com",
  "guerrillamail.com","guerrillamail.biz","guerrillamail.de","guerrillamail.info","guerrillamail.net","guerrillamail.org","guerrillamailblock.com",
  "10minutemail.com","10minutemail.net","temp-mail.org","tempmail.com","etempmail.com","tempr.email",
  "yopmail.com","yopmail.fr","yopmail.net","sharklasers.com","getnada.com","dispostable.com",
  "trashmail.com","trashmail.me","fakeinbox.com","mailnesia.com","mintemail.com","emailondeck.com",
  "mohmal.com","maildrop.cc","discard.email","discardmail.com","spamgourmet.com","mailcatch.com",
  "mailsac.com","moakt.com","burnermail.io","inboxkitten.com","fakemailgenerator.com"
];

const DUMMY_LOCAL_PARTS_ = [
  "test","testing","asdf","asdfasdf","qwerty","example","fake","dummy","notreal","nobody",
  "noreply","no-reply","none","na","xxx","abc","abcd","user","email","admin","sample","foo","bar"
];

const DUMMY_DOMAINS_ = [
  "example.com","example.org","example.net","test.com","test.org","domain.com","email.com",
  "yourdomain.com","mydomain.com","company.com","site.com"
];

function isDisposableOrDummy_(email) {
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const local = parts[0];
  const domain = parts[1];
  if (DISPOSABLE_DOMAINS_.indexOf(domain) !== -1) return true;
  if (DUMMY_DOMAINS_.indexOf(domain) !== -1) return true;
  if (DUMMY_LOCAL_PARTS_.indexOf(local) !== -1) return true;
  if (local === domain.split(".")[0]) return true;
  if (/^(.)\1+$/.test(local)) return true;
  return false;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
