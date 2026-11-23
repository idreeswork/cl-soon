const WAITLIST_SHEET = "Waitlist";
const VISITOR_SHEET = "Website Tracker";
const SIGNUP_RATE_LIMIT = 30;

function doPost(e) {
  const params = (e && e.parameter) || {};
  const action = sanitize_(params.action, 20);

  if (action === "visit") return recordVisit_(params);
  if (isRateLimited_()) return jsonResponse_({ok:false,error:"rate_limited"});

  const name = sanitize_(params.name, 100);
  const email = sanitize_(params.email, 254).toLowerCase();
  const source = sanitize_(params.source, 200) || "direct";
  const country = sanitize_(params.country, 100);
  const ip = sanitize_(params.ip, 64);
  const company = sanitize_(params.company, 200);

  if (company) return jsonResponse_({ok:true});
  if (!name) return jsonResponse_({ok:false,error:"missing_name"});
  if (!isValidEmail_(email)) return jsonResponse_({ok:false,error:"invalid_email"});
  if (isDisposableOrDummy_(email)) return jsonResponse_({ok:false,error:"disposable_email"});

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_(WAITLIST_SHEET, ["Received At","Name","Email","Source","Country","IP"]);
    if (emailExists_(sheet, email)) return jsonResponse_({ok:true,duplicate:true});
    appendRecord_(sheet, {
      "Received At": new Date(),
      "Name": name,
      "Email": email,
      "Source": source,
      "Country": country,
      "IP": ip
    });
  } finally {
    lock.releaseLock();
  }

  return jsonResponse_({ok:true});
}

function doGet() {
  return ContentService.createTextOutput("Course Legend endpoint is live.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function recordVisit_(params) {
  const source = sanitize_(params.source, 200) || "direct";
  const country = sanitize_(params.country, 100);
  const ip = sanitize_(params.ip, 64);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_(VISITOR_SHEET, ["Received At","Country","Source","IP"]);
    appendRecord_(sheet, {
      "Received At": new Date(),
      "Country": country,
      "Source": source,
      "IP": ip
    });
  } finally {
    lock.releaseLock();
  }
  return jsonResponse_({ok:true});
}

function getOrCreateSheet_(name, requiredHeaders) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0 || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function(value){ return String(value || "").trim(); });

  if (currentHeaders.every(function(value){ return !value; })) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  } else {
    const updatedHeaders = currentHeaders.slice();
    requiredHeaders.forEach(function(header){
      if (updatedHeaders.indexOf(header) === -1) updatedHeaders.push(header);
    });
    if (updatedHeaders.length > currentHeaders.length) {
      sheet.getRange(1, 1, 1, updatedHeaders.length).setValues([updatedHeaders]);
    }
  }

  if (sheet.getFrozenRows() === 0) sheet.setFrozenRows(1);
  return sheet;
}

function appendRecord_(sheet, record) {
  const columnCount = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, columnCount).getValues()[0]
    .map(function(value){ return String(value || "").trim(); });
  const row = new Array(columnCount).fill("");
  Object.keys(record).forEach(function(key){
    const index = headers.indexOf(key);
    if (index !== -1) {
      row[index] = record[key] instanceof Date ? record[key] : safeCell_(record[key]);
    }
  });
  sheet.appendRow(row);
}

function safeCell_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function sanitize_(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength || 200);
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
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(value){ return String(value || "").trim(); });
  const emailColumn = headers.indexOf("Email") + 1;
  const lastRow = sheet.getLastRow();
  if (!emailColumn || lastRow < 2) return false;
  const values = sheet.getRange(2, emailColumn, lastRow - 1, 1).getValues();
  return values.some(function(row){
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
