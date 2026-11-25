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

export async function sendToAppsScript(values) {
  const body = new URLSearchParams();
  Object.keys(values).forEach(function(key) {
    body.set(key, String(values[key] == null ? "" : values[key]));
  });

  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
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
    throw new Error(data.error || "webhook_failed");
  }
  return data;
}

export async function checkAppsScript() {
  const url = new URL(GOOGLE_APPS_SCRIPT_URL);
  url.searchParams.set("health", "1");
  const response = await fetch(url.toString(), {redirect:"follow"});
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("webhook_invalid_response");
  }
  if (!response.ok || !(data.ok === true || data.result === "success")) {
    throw new Error(data.error || "webhook_failed");
  }
  return data;
}
