function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
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
    } catch (error) {}
  }
  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);
      if (referrerUrl.hostname && referrerUrl.hostname !== currentUrl.hostname) {
        return clean(referrerUrl.hostname.replace(/^www\./, ""), 200);
      }
    } catch (error) {}
  }
  return clean(fallback, 200) || "direct";
}

async function wait(ms) {
  return new Promise(function(resolve){ setTimeout(resolve, ms); });
}

async function sendToAppsScript(url, values) {
  if (typeof url !== "string" || !url.trim()) throw new Error("missing_endpoint_setting");
  if (url.includes("/dev")) throw new Error("development_url_not_supported");
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?$/.test(url)) {
    throw new Error("invalid_apps_script_url");
  }

  const body = new URLSearchParams();
  Object.keys(values).forEach(function(key){
    body.set(key, String(values[key] == null ? "" : values[key]));
  });

  let lastError = "apps_script_unavailable";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
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
        if (response.status === 404 || response.status >= 500) {
          lastError = "apps_script_unavailable";
          if (attempt < 2) {
            await wait(1000 * (attempt + 1));
            continue;
          }
        }
        if (response.status === 401 || response.status === 403) throw new Error("apps_script_access_denied");
        throw new Error("apps_script_not_json");
      }

      if (response.ok && data.ok) return data;
      const code = data.error || "apps_script_unavailable";
      if (code === "server_error" || code === "spreadsheet_error") {
        throw new Error("spreadsheet_access_error");
      }
      throw new Error(code);
    } catch (error) {
      lastError = error.message || "apps_script_unavailable";
      if (["apps_script_access_denied","apps_script_not_json","spreadsheet_access_error","development_url_not_supported","invalid_apps_script_url","missing_endpoint_setting","disposable_email","invalid_email","missing_name","rate_limited"].includes(lastError)) {
        throw error;
      }
      if (attempt < 2) await wait(1000 * (attempt + 1));
    }
  }
  throw new Error(lastError === "invalid_apps_script_response" ? "apps_script_not_json" : "apps_script_unavailable");
}

async function submitWaitlist(request, env) {
  if (!env.GOOGLE_APPS_SCRIPT_URL) {
    return jsonResponse({ok:false,error:"missing_endpoint_setting"}, 503);
  }

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

  const ip = request.headers.get("cf-connecting-ip") || "";
  const country = countryName(request);
  const source = sourceFromRequest(request, clean(payload.source, 200));

  try {
    const result = await sendToAppsScript(env.GOOGLE_APPS_SCRIPT_URL, {
      action:"signup",
      name:name,
      email:email,
      source:source,
      country:country,
      ip:ip
    });
    return jsonResponse(result);
  } catch (error) {
    const code = error.message || "apps_script_unavailable";
    const status = code === "rate_limited" ? 429 : 502;
    return jsonResponse({ok:false,error:code}, status);
  }
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  if (url.pathname === "/api/waitlist" && request.method === "POST") {
    return submitWaitlist(request, context.env);
  }

  const response = await context.next();
  const isPreview = url.hostname.endsWith(".pages.dev");
  const isProductionDomain = url.hostname === "courselegend.com" || url.hostname === "www.courselegend.com" || url.hostname === "cl-soon.pages.dev";
  const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");
  const isHomepage = url.pathname === "/" || url.pathname === "/index.html";

  if (isProductionDomain && request.method === "GET" && isHomepage && acceptsHtml && context.env.GOOGLE_APPS_SCRIPT_URL) {
    const visit = sendToAppsScript(context.env.GOOGLE_APPS_SCRIPT_URL, {
      action:"visit",
      country:countryName(request),
      source:sourceFromRequest(request, ""),
      ip:request.headers.get("cf-connecting-ip") || ""
    }).catch(function(){});
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
