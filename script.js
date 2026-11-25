(function(){
var form = document.getElementById("waitlist-form");
if (!form) return;

var nameInput = document.getElementById("wl-name");
var emailInput = document.getElementById("wl-email");
var honeypot = form.querySelector(".hp");
var note = document.getElementById("form-note");
var button = form.querySelector(".submit");
var defaultNote = note.textContent;
var successPanel = document.getElementById("success-panel");
var successSub = document.getElementById("success-sub");

function sendVisit(){
  if (window.location.hostname !== "courselegend.com" &&
      window.location.hostname !== "www.courselegend.com") return;
  fetch("/api/visit", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({source:detectSource()}),
    keepalive:true
  }).catch(function(){});
}
sendVisit();

function detectSource(){
  var params = new URLSearchParams(window.location.search);
  var utm = params.get("utm_source");
  if (utm) return utm.trim().slice(0, 120);
  if (document.referrer) {
    try {
      var referrer = new URL(document.referrer);
      if (referrer.hostname && referrer.hostname !== window.location.hostname) {
        return referrer.hostname.replace(/^www\./, "").slice(0, 200);
      }
    } catch (error) {}
  }
  return "direct";
}

function setFieldInvalid(field, invalid){
  field.closest(".field").classList.toggle("field--invalid", invalid);
  field.setAttribute("aria-invalid", invalid ? "true" : "false");
}

function setState(state, message){
  note.classList.remove("is-error");
  var loading = state === "loading";
  button.classList.toggle("is-loading", loading);
  button.disabled = loading;
  nameInput.disabled = loading;
  emailInput.disabled = loading;
  if (state === "error") note.classList.add("is-error");
  note.textContent = message || defaultNote;
}

function showSuccess(){
  button.classList.remove("is-loading");
  button.disabled = true;
  form.classList.add("is-leaving");
  note.classList.add("is-leaving");
  setTimeout(function(){
    form.hidden = true;
    note.hidden = true;
    successPanel.hidden = false;
    successPanel.classList.add("is-visible");
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        successPanel.classList.add("is-shown");
      });
    });
  }, 220);
}

function messageForError(code){
  if (code === "disposable_email") return "Use an email address you actually check.";
  if (code === "rate_limited") return "Too many attempts. Please try again shortly.";
  if (code === "invalid_email") return "Enter a valid email address.";
  if (code === "missing_name") return "Enter your name to continue.";
  if (code === "webhook_timeout" || code === "apps_script_unavailable") return "The request took too long. Please try again.";
  if (code === "network_error" || code === "apps_script_not_json") return "We couldn't reach the server. Check your connection and try again.";
  return "We couldn't save your details right now. Please try again in a few minutes.";
}

form.addEventListener("submit", function(event){
  event.preventDefault();
  if (honeypot && honeypot.value) return;

  var name = nameInput.value.trim();
  var email = emailInput.value.trim();
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  setFieldInvalid(nameInput, false);
  setFieldInvalid(emailInput, false);

  if (!name) {
    setState("error", "Enter your name to continue.");
    setFieldInvalid(nameInput, true);
    nameInput.focus();
    return;
  }

  if (!emailPattern.test(email)) {
    setState("error", "Enter a valid email address.");
    setFieldInvalid(emailInput, true);
    emailInput.focus();
    return;
  }

  setState("loading", "Submitting…");

  var controller = "AbortController" in window ? new AbortController() : null;
  var timeout = controller ? setTimeout(function(){ controller.abort(); }, 20000) : null;

  fetch("/api/waitlist", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      name: name,
      email: email,
      source: detectSource(),
      company: honeypot ? honeypot.value : ""
    }),
    signal: controller ? controller.signal : undefined
  })
    .then(function(response){
      return response.json().catch(function(){
        throw new Error("apps_script_not_json");
      }).then(function(data){
        if (!response.ok || !data.ok) {
          var error = new Error(data.error || "request_failed");
          error.code = data.error || "request_failed";
          throw error;
        }
        return data;
      });
    })
    .then(function(data){
      if (successSub) {
        successSub.textContent = data.duplicate
          ? "You’re already on the list. We’ll email you when Course Legend is ready."
          : "We’ll email you when Course Legend is ready.";
      }
      showSuccess();
    })
    .catch(function(error){
      var code = error.code || error.message;
      if (error.name === "AbortError") code = "apps_script_unavailable";
      else if (error.name === "TypeError") code = "network_error";
      setState("error", messageForError(code));
    })
    .finally(function(){
      if (timeout) clearTimeout(timeout);
    });
});

nameInput.addEventListener("input", function(){
  setFieldInvalid(nameInput, false);
});
emailInput.addEventListener("input", function(){
  setFieldInvalid(emailInput, false);
});

if ("IntersectionObserver" in window) {
  var items = document.querySelectorAll(".reveal");
  var delays = [0,60,120,180,240,300];
  items.forEach(function(item, index){
    item.style.animationDelay = (delays[index] || 300) + "ms";
  });
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    });
  }, {threshold:0.1});
  items.forEach(function(item){
    observer.observe(item);
  });
} else {
  document.querySelectorAll(".reveal").forEach(function(item){
    item.classList.add("is-in");
  });
}
})();
