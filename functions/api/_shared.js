export const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqixrjoIW24Z2DB9BFqq-osXhZqDNlt-EccJPUv-dS3evxKAfX85p0oYYj5fBAXZ4kRg/exec";

export function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status:status || 200,
    headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
}

export function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export function countryName(request) {
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

export function sourceFromRequest(request, fallback) {
  const referrer = request.headers.get("referer");
  const currentUrl = new URL(request.url);
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

async function interpretAppsScriptResponse(response) {
  const text = await response.text().catch(function() {
    throw new Error("webhook_unreachable");
  });
  let data;
  try {
    data = JSON.parse(text.trim());
  } catch (error) {
    if (/accounts\\?authuser|sign in|google drive|unable to open the file/i.test(text)) {
      throw new Error("webhook_access_denied");
    }
    throw new Error("webhook_invalid_response");
  }

  if (!data || data.service !== "courselegend-waitlist") {
    throw new Error("webhook_handler_mismatch");
  }
  const accepted = data.ok === true && data.result === "success";
  if (!response.ok || !accepted) {
    throw new Error(data.error || "webhook_failed");
  }
  return data;
}

async function callAppsScript(url, init) {
  let response;
  try {
    response = await fetch(url, Object.assign({redirect:"follow", signal:AbortSignal.timeout(15000)}, init));
  } catch (error) {
    throw new Error(error && error.name === "TimeoutError" ? "webhook_timeout" : "webhook_unreachable");
  }
  return interpretAppsScriptResponse(response);
}

export function sendToAppsScript(values) {
  const body = new URLSearchParams();
  Object.keys(values).forEach(function(key) {
    body.set(key, String(values[key] == null ? "" : values[key]));
  });
  return callAppsScript(GOOGLE_APPS_SCRIPT_URL, {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
    body:body.toString()
  });
}

export function checkAppsScript() {
  const url = new URL(GOOGLE_APPS_SCRIPT_URL);
  url.searchParams.set("health", "1");
  return callAppsScript(url.toString(), {method:"GET"});
}
