import {checkAppsScript, jsonResponse} from "./_shared.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return jsonResponse({ok:false,error:"method_not_allowed"}, 405);
  }
  try {
    return jsonResponse(await checkAppsScript());
  } catch (error) {
    return jsonResponse({ok:false,error:error.message || "webhook_failed"}, 502);
  }
}
