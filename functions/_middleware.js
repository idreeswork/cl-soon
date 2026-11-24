const SPREADSHEET_ID = "1vrlypbUKG9h7yzGldN5cpJ79zPChwOz_nxJ4pekJPGA";
const SHEET_RANGE = "Waitlist!A:F";
const SIGNUP_RANGE = "Waitlist!C2:C";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets/";
let cachedAccessToken = "";
let cachedAccessTokenExpiry = 0;

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function privateKeyBytes(pem) {
  const normalized = String(pem || "").replace(/\\n/g, "\n");
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  if (!base64) throw new Error("missing_google_private_key");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getGoogleAccessToken(env) {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiry) return cachedAccessToken;
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error("missing_google_credentials");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const claims = base64UrlEncode(JSON.stringify({
    iss:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope:"https://www.googleapis.com/auth/spreadsheets",
    aud:TOKEN_URL,
    iat:now,
    exp:now + 3600
  }));
  const unsignedToken = header + "." + claims;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(env.GOOGLE_PRIVATE_KEY),
    {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );
  const assertion = unsignedToken + "." + base64UrlEncode(signature);
  const tokenResponse = await fetch(TOKEN_URL, {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:assertion
    }).toString()
  });
  const tokenData = await tokenResponse.json().catch(function(){ return {}; });
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error === "invalid_grant" ? "google_credentials_invalid" : "google_token_failed");
  }
  cachedAccessToken = tokenData.access_token;
  cachedAccessTokenExpiry = Date.now() + Math.max(60, Number(tokenData.expires_in || 3600) - 120) * 1000;
  return cachedAccessToken;
}

function googleErrorCode(status, data) {
  if (status === 401) return "google_credentials_invalid";
  if (status === 403) return "sheet_permission_denied";
  if (status === 404) return "spreadsheet_not_found";
  if (data && data.error && data.error.status === "INVALID_ARGUMENT") return "sheet_range_invalid";
  return "sheets_api_failed";
}

async function sheetsRequest(env, path, options) {
  const token = await getGoogleAccessToken(env);
  const response = await fetch(SHEETS_API + SPREADSHEET_ID + path, {
    method:(options && options.method) || "GET",
    headers:{
      "Authorization":"Bearer " + token,
      "Content-Type":"application/json"
    },
    body:options && options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(function(){ return {}; });
  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = "";
      cachedAccessTokenExpiry = 0;
    }
    throw new Error(googleErrorCode(response.status, data));
  }
  return data;
}

function countryName(request) {
  const code = request.cf && request.cf.country
    ? request.cf.country
    : request.headers.get("cf-ipcountry") || "";
  if (!code || code === "XX") return "";
  try {
    return new Intl.DisplayNames(["en"], {type:"region"}).of(code) || code;
  } catch (error) {
    return code;
  }
}

function sourceFromRequest(request, fallback) {
  const currentUrl = new URL(request.url);
  const referrer = request.headers.get("referer");
  const currentUtm = currentUrl.searchParams.get("utm_source");
  if (currentUtm) return clean(currentUtm, 200);
  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);
      const referrerUtm = referrerUrl.searchParams.get("utm_source");
      if (referrerUtm) return clean(referrerUtm, 200);
      if (referrerUrl.hostname && referrerUrl.hostname !== currentUrl.hostname) {
        return clean(referrerUrl.hostname.replace(/^www\./, ""), 200);
      }
    } catch (error) {}
  }
  return clean(fallback, 200) || "direct";
}

async function appendRow(env, row) {
  const path = "/values/" + encodeURIComponent(SHEET_RANGE) + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";
  return sheetsRequest(env, path, {
    method:"POST",
    body:{values:[row]}
  });
}

async function signup(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ok:false,error:"invalid_request"}, 400);
  }

  if (clean(payload.company, 200)) return jsonResponse({ok:true});

  const name = clean(payload.name, 100);
  const email = clean(payload.email, 254).toLowerCase();
  if (!name) return jsonResponse({ok:false,error:"missing_name"}, 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ok:false,error:"invalid_email"}, 422);
  }

  const source = sourceFromRequest(request, clean(payload.source, 200));
  const country = countryName(request);
  const ip = request.headers.get("cf-connecting-ip") || "";

  try {
    const existing = await sheetsRequest(env, "/values/" + encodeURIComponent(SIGNUP_RANGE), {});
    const rows = existing.values || [];
    if (rows.some(function(row){ return String(row[0] || "").trim().toLowerCase() === email; })) {
      return jsonResponse({ok:true,duplicate:true});
    }

    await appendRow(env, [new Date().toISOString(),name,email,source,country,ip]);
    return jsonResponse({ok:true});
  } catch (error) {
    return jsonResponse({ok:false,error:error.message || "sheets_api_failed"}, 502);
  }
}

async function health(env) {
  try {
    const data = await sheetsRequest(env, "/values/" + encodeURIComponent("Waitlist!A1:F1"), {});
    return jsonResponse({ok:true,sheet:"Waitlist",headers:data.values && data.values[0] ? data.values[0] : []});
  } catch (error) {
    return jsonResponse({ok:false,error:error.message || "sheets_api_failed"}, 502);
  }
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  if (url.pathname === "/api/waitlist" && request.method === "POST") {
    return signup(request, context.env);
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    return health(context.env);
  }

  const response = await context.next();
  const isPreview = url.hostname.endsWith(".pages.dev");
  const isProductionDomain = url.hostname === "courselegend.com" || url.hostname === "www.courselegend.com";
  const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");
  const isHomepage = url.pathname === "/" || url.pathname === "/index.html";

  if (isProductionDomain && request.method === "GET" && isHomepage && acceptsHtml) {
    const visit = appendRow(context.env, [
      new Date().toISOString(),
      "",
      "",
      sourceFromRequest(request, ""),
      countryName(request),
      request.headers.get("cf-connecting-ip") || ""
    ]).catch(function(){});
    context.waitUntil(visit);
  }

  if (isPreview) {
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, {
      status:response.status,
      statusText:response.statusText,
      headers:headers
    });
  }

  return response;
}
