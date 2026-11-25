import {clean, countryName, jsonResponse, sendToAppsScript, sourceFromRequest} from "./_shared.js";

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return jsonResponse({ok:false,error:"method_not_allowed"}, 405);
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch (error) {
    return jsonResponse({ok:false,error:"invalid_request"}, 400);
  }

  if (clean(payload.company, 200)) {
    return jsonResponse({ok:true,result:"success"});
  }

  const name = clean(payload.name, 100);
  const email = clean(payload.email, 254).toLowerCase();

  if (!name) return jsonResponse({ok:false,error:"missing_name"}, 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ok:false,error:"invalid_email"}, 422);
  }

  try {
    const result = await sendToAppsScript({
      action:"courselegend_signup_v1",
      name:name,
      email:email,
      source:sourceFromRequest(context.request, clean(payload.source, 200)),
      country:countryName(context.request),
      ip:context.request.headers.get("cf-connecting-ip") || ""
    });
    return jsonResponse({ok:true,result:"success",duplicate:!!result.duplicate});
  } catch (error) {
    const code = error.message || "webhook_failed";
    const status = code === "rate_limited" ? 429 : code === "disposable_email" ? 422 : 502;
    return jsonResponse({ok:false,error:code}, status);
  }
}
