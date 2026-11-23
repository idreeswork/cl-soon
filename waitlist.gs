const SHEET_NAME = "Waitlist";
const RATE_LIMIT_PER_MINUTE = 30; // circuit-breaker only; real traffic never gets near this

function doPost(e) {
  try {
    if (isRateLimited_()) {
      return jsonResponse_({ ok: false, error: "rate_limited" });
    }

    const params = (e && e.parameter) || {};
    const name = sanitize_(params.name);
    const email = sanitize_(params.email).toLowerCase();
    const source = sanitize_(params.source) || "direct";
    const country = sanitize_(params.country);
    const ip = sanitize_(params.ip);

    if (!name) {
      return jsonResponse_({ ok: false, error: "missing_name" });
    }
    if (!isValidEmail_(email)) {
      return jsonResponse_({ ok: false, error: "invalid_email" });
    }
    if (isDisposableOrDummy_(email)) {
      return jsonResponse_({ ok: false, error: "disposable_email" });
    }

    const sheet = getOrCreateSheet_();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (emailExists_(sheet, email)) {
        return jsonResponse_({ ok: true, duplicate: true });
      }
      sheet.appendRow([new Date(), name, email, source, country, ip]);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_({ ok: true });
  } catch (err) {
    Logger.log("doPost error: " + err);
    return jsonResponse_({ ok: false, error: "server_error" });
  }
}

function doGet(e) {
  return ContentService.createTextOutput("CourseLegend signup endpoint is live.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// Google intentionally doesn't expose a caller's IP to Apps Script, so
// this can't be a per-visitor limit — it's a blunt, global circuit
// breaker against a flood of scripted requests, not a spam filter (the
// email checks below handle content quality). One counter bucket per
// minute, self-expiring.
function isRateLimited_() {
  const cache = CacheService.getScriptCache();
  const bucket = "rl_" + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(bucket) || 0) + 1;
  cache.put(bucket, String(count), 90);
  return count > RATE_LIMIT_PER_MINUTE;
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const expectedHeaders = ["Received At", "Name", "Email", "Source", "Country", "IP"];
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(expectedHeaders);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Self-heals an older header row (this replaces a previous version that
  // had a separate "Client Timestamp" column) without touching any data
  // rows. Only row 1 is ever rewritten here. Rows written before this
  // update keep whatever value used to live in that column — now sitting
  // under the "Country" header — which is harmless, just cosmetic.
  const headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
  const currentHeaders = headerRange.getValues()[0];
  const matches = expectedHeaders.every(function(h, i) { return currentHeaders[i] === h; });
  if (!matches) {
    headerRange.setValues([expectedHeaders]);
  }
  return sheet;
}

function sanitize_(value) {
  if (!value) return "";
  return String(value).trim().slice(0, 200);
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const DISPOSABLE_DOMAINS_ = [
  "mailinator.com","mailinator.net","mailinator2.com",
  "guerrillamail.com","guerrillamail.biz","guerrillamail.de","guerrillamail.info","guerrillamail.net","guerrillamail.org","guerrillamailblock.com",
  "10minutemail.com","10minutemail.net",
  "temp-mail.org","tempmail.com","etempmail.com","tempr.email",
  "yopmail.com","yopmail.fr","yopmail.net",
  "throwawaymail.com","sharklasers.com","getnada.com","dispostable.com",
  "trashmail.com","trashmail.me","fakeinbox.com","mailnesia.com","mintemail.com",
  "emailondeck.com","mohmal.com","maildrop.cc","discard.email","discardmail.com",
  "spamgourmet.com","mailcatch.com","mailsac.com","moakt.com","burnermail.io",
  "inboxkitten.com","fakemailgenerator.com"
];
const DUMMY_LOCAL_PARTS_ = ["test","testing","asdf","asdfasdf","qwerty","example","fake","dummy","notreal","nobody","noreply","no-reply","none","na","xxx","abc","abcd","user","email","admin","sample","foo","bar"];
const DUMMY_DOMAINS_ = ["example.com","example.org","example.net","test.com","test.org","domain.com","email.com","yourdomain.com","mydomain.com","company.com","site.com"];

function isDisposableOrDummy_(email) {
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const local = parts[0];
  const domain = parts[1];
  if (DISPOSABLE_DOMAINS_.indexOf(domain) !== -1) return true;
  if (DUMMY_DOMAINS_.indexOf(domain) !== -1) return true;
  if (DUMMY_LOCAL_PARTS_.indexOf(local) !== -1) return true;
  const domainRoot = domain.split(".")[0];
  if (local === domainRoot) return true;
  if (/^(.)\1+$/.test(local)) return true;
  return false;
}

function emailExists_(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) return true;
  }
  return false;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
