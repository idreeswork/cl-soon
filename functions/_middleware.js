const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqixrjoIW24Z2DB9BFqq-osXhZqDNlt-EccJPUv-dS3evxKAfX85p0oYYj5fBAXZ4kRg/exec";

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status:status || 200,
    headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
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

function validateWebhookUrl() {
  const url = new URL(GOOGLE_APPS_SCRIPT_URL);
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname)) {
    throw new Error("invalid_webhook_url");
  }
  return url.toString();
}

async function postToAppsScript(values) {
  const url = validateWebhookUrl();
  const body = new URLSearchParams();
  Object.keys(values).forEach(function(key) {
    body.set(key, String(values[key] == null ? "" : values[key]));
  });

  const response = await fetch(url, {
    method:"POST",
    redirect:"follow",
    headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
    body:body.toString()
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (/accounts\?authuser|sign in|google drive|unable to open the file/i.test(text)) {
      throw new Error("webhook_access_denied");
    }
    throw new Error("webhook_invalid_response");
  }

  const accepted = data.ok === true || data.result === "success";
  if (!response.ok || !accepted) {
    const code = data.error || "webhook_failed";
    if (code === "sheet_write_failed" || code === "sheet_access_failed") {
      throw new Error("sheet_access_failed");
    }
    throw new Error(code);
  }
  return {ok:true,duplicate:!!data.duplicate};
}

async function submitWaitlist(request, env) {
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

  const values = {
    name:name,
    email:email,
    source:sourceFromRequest(request, clean(payload.source, 200)),
    country:countryName(request),
    ip:request.headers.get("cf-connecting-ip") || ""
  };

  try {
    const result = await postToAppsScript(values);
    return jsonResponse(result);
  } catch (error) {
    const code = error.message || "webhook_failed";
    const status = code === "rate_limited" ? 429 : 502;
    return jsonResponse({ok:false,error:code}, status);
  }
}

async function health() {
  try {
    const url = validateWebhookUrl();
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(url + separator + "health=1", {redirect:"follow"});
    const text = await response.text();
    const data = JSON.parse(text);
    if (!response.ok || !(data.ok === true || data.result === "success")) {
      return jsonResponse({ok:false,error:data.error || "webhook_failed"}, 502);
    }
    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ok:false,error:error.message || "webhook_failed"}, 502);
  }
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  if (url.pathname === "/api/waitlist" && request.method === "POST") {
    return submitWaitlist(request, context.env);
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    return health();
  }

  const response = await context.next();
  const isPreview = url.hostname.endsWith(".pages.dev");
  const isProductionDomain = url.hostname === "courselegend.com" || url.hostname === "www.courselegend.com";
  const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");
  const isHomepage = url.pathname === "/" || url.pathname === "/index.html";

  if (isProductionDomain && request.method === "GET" && isHomepage && acceptsHtml) {
    const values = {
      action:"visit",
      source:sourceFromRequest(request, ""),
      country:countryName(request),
      ip:request.headers.get("cf-connecting-ip") || ""
    };
    const visit = postToAppsScript(values).catch(function(){});
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
