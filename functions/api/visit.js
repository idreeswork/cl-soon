import {countryName, jsonResponse, sendToAppsScript, sourceFromRequest} from "./_shared.js";

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return jsonResponse({ok:false,error:"method_not_allowed"}, 405);
  }

  try {
    const payload = await context.request.json().catch(function(){ return {}; });
    const result = await sendToAppsScript({
      action:"courselegend_visit_v1",
      source:sourceFromRequest(context.request, String(payload.source || "")),
      country:countryName(context.request),
      ip:context.request.headers.get("cf-connecting-ip") || ""
    });
    return jsonResponse({ok:true,result:"success"});
  } catch (error) {
    return jsonResponse({ok:false,error:error.message || "webhook_failed"}, 502);
  }
}
