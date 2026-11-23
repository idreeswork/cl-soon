(function(){
var CONFIG = window.CL_CONFIG || {};
var SCRIPT_URL = CONFIG.SCRIPT_URL;
var REDIRECT_URL = CONFIG.REDIRECT_URL || "";
var REDIRECT_DELAY_SECONDS = CONFIG.REDIRECT_DELAY_SECONDS || 5;
var SHOW_FLOATING_CTA = !!CONFIG.SHOW_FLOATING_CTA;
var FLOATING_CTA_URL = CONFIG.FLOATING_CTA_URL || "#";
var FLOATING_CTA_LABEL = CONFIG.FLOATING_CTA_LABEL || "Your promo here";
var GEO_LOOKUP_URL = CONFIG.GEO_LOOKUP_URL || "https://ipapi.co/json/";

var form = document.getElementById('waitlist-form');
var nameInput = document.getElementById('wl-name');
var emailInput = document.getElementById('wl-email');
var honeypot = form.querySelector('.hp');
var note = document.getElementById('form-note');
var button = form.querySelector('.submit');
var defaultNote = note.textContent;
var successPanel = document.getElementById('success-panel');
var successSub = document.getElementById('success-sub');

// --- Geo lookup (best-effort, never blocks or fails the signup) -----------
// Kicked off immediately on load so it's normally already resolved by the
// time someone finishes typing. Bounded by its own timeout so a slow or
// unreachable third party can never hang the form.
function fetchGeo(){
  if(!('fetch' in window)) return Promise.resolve({ country:'', ip:'' });
  var controller = ('AbortController' in window) ? new AbortController() : null;
  var timer = controller && setTimeout(function(){ controller.abort(); }, 4000);
  return fetch(GEO_LOOKUP_URL, controller ? { signal: controller.signal } : {})
    .then(function(res){ return res.ok ? res.json() : null; })
    .then(function(data){
      return { country: (data && data.country_name) || '', ip: (data && data.ip) || '' };
    })
    .catch(function(){ return { country:'', ip:'' }; })
    .finally(function(){ if(timer) clearTimeout(timer); });
}
var geoPromise = fetchGeo();

// --- Source attribution -----------------------------------------------
// Only one page exists today, so a hardcoded "landing_page" told nobody
// anything. This pulls a real channel instead: ?utm_source, else the
// referring site, else "direct".
function detectSource(){
  var utm = new URLSearchParams(window.location.search).get('utm_source');
  if(utm) return utm.slice(0, 100);
  if(document.referrer){
    try {
      var refHost = new URL(document.referrer).hostname.replace(/^www\./, '');
      if(refHost && refHost !== window.location.hostname) return refHost;
    } catch(err){ /* malformed referrer, ignore */ }
  }
  return 'direct';
}

function setFieldInvalid(field, invalid){
  field.closest('.field').classList.toggle('field--invalid', invalid);
  field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
}

function setState(state, message){
  note.classList.remove('is-error');
  if(state === 'loading'){
    button.classList.add('is-loading');
    button.disabled = true;
    nameInput.disabled = true;
    emailInput.disabled = true;
  } else {
    button.classList.remove('is-loading');
    button.disabled = false;
    nameInput.disabled = false;
    emailInput.disabled = false;
    if(state === 'error'){ note.classList.add('is-error'); }
  }
  note.textContent = message || defaultNote;
}

function showSuccess(){
  button.classList.remove('is-loading');
  form.classList.add('is-leaving');
  note.classList.add('is-leaving');
  setTimeout(function(){
    form.hidden = true;
    note.hidden = true;
    successPanel.hidden = false;
    successPanel.classList.add('is-visible');
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ successPanel.classList.add('is-shown'); });
    });
  }, 220);
  if(REDIRECT_URL){
    var secondsLeft = REDIRECT_DELAY_SECONDS;
    (function tick(){
      successSub.textContent = "Taking you there in " + secondsLeft + "s\u2026";
      if(secondsLeft <= 0){ window.location.href = REDIRECT_URL; return; }
      secondsLeft -= 1;
      setTimeout(tick, 1000);
    })();
  }
}

var DISPOSABLE_DOMAINS = [
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
var DUMMY_LOCAL_PARTS = ["test","testing","asdf","asdfasdf","qwerty","example","fake","dummy","notreal","nobody","noreply","no-reply","none","na","xxx","abc","abcd","user","email","admin","sample","foo","bar"];
var DUMMY_DOMAINS = ["example.com","example.org","example.net","test.com","test.org","domain.com","email.com","yourdomain.com","mydomain.com","company.com","site.com"];

function emailLooksFake(value){
  var parts = value.toLowerCase().split('@');
  if(parts.length !== 2) return false;
  var local = parts[0];
  var domain = parts[1];
  if(DISPOSABLE_DOMAINS.indexOf(domain) !== -1) return true;
  if(DUMMY_DOMAINS.indexOf(domain) !== -1) return true;
  if(DUMMY_LOCAL_PARTS.indexOf(local) !== -1) return true;
  var domainRoot = domain.split('.')[0];
  if(local === domainRoot) return true;
  if(/^(.)\1+$/.test(local)) return true;
  return false;
}

form.addEventListener('submit', function(e){
  e.preventDefault();
  if(honeypot.value){ return; }

  var name = nameInput.value.trim();
  var email = emailInput.value.trim();
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  setFieldInvalid(nameInput, false);
  setFieldInvalid(emailInput, false);

  if(!name){
    setState('error','Enter your name to continue.');
    setFieldInvalid(nameInput, true);
    nameInput.focus();
    return;
  }
  if(!emailPattern.test(email)){
    setState('error','Enter a valid email to continue.');
    setFieldInvalid(emailInput, true);
    emailInput.focus();
    return;
  }
  if(emailLooksFake(email)){
    setState('error','That looks like a placeholder or disposable address. Use one you actually check.');
    setFieldInvalid(emailInput, true);
    emailInput.focus();
    return;
  }

  setState('loading','Submitting\u2026');

  geoPromise.then(function(geo){
    var payload = new URLSearchParams();
    payload.append('name', name);
    payload.append('email', email);
    payload.append('source', detectSource());
    payload.append('country', geo.country);
    payload.append('ip', geo.ip);

    var controller = ('AbortController' in window) ? new AbortController() : null;
    var timeoutId = controller && setTimeout(function(){ controller.abort(); }, 12000);

    return fetch(SCRIPT_URL, {
      method:'POST',
      mode:'no-cors',
      body: payload,
      signal: controller ? controller.signal : undefined
    }).finally(function(){ if(timeoutId) clearTimeout(timeoutId); });
  })
    .then(function(){
      showSuccess();
    })
    .catch(function(){
      setState('error','Something went wrong. Please try again.');
    });
});

nameInput.addEventListener('input', function(){ setFieldInvalid(nameInput, false); });
emailInput.addEventListener('input', function(){ setFieldInvalid(emailInput, false); });

var floatingCta = document.getElementById('floating-cta');
if(SHOW_FLOATING_CTA && floatingCta){
  var ctaLink = floatingCta.querySelector('.floating-cta__link');
  ctaLink.href = FLOATING_CTA_URL;
  ctaLink.querySelector('span').textContent = FLOATING_CTA_LABEL;
  floatingCta.hidden = false;
  var ctaShown = false;
  var revealCta = function(){
    if(ctaShown) return;
    ctaShown = true;
    floatingCta.classList.add('is-visible');
  };
  setTimeout(revealCta, 5000);
  window.addEventListener('scroll', revealCta, { once:true, passive:true });
  floatingCta.querySelector('.floating-cta__close').addEventListener('click', function(){
    floatingCta.classList.remove('is-visible');
    setTimeout(function(){ floatingCta.hidden = true; }, 320);
  });
}

if('IntersectionObserver' in window){
  var items = document.querySelectorAll('.reveal');
  var delays = [0,60,120,180,240,300];
  items.forEach(function(el,i){
    el.style.animationDelay = (delays[i] || 300) + 'ms';
  });
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  items.forEach(function(el){ io.observe(el); });
} else {
  document.querySelectorAll('.reveal').forEach(function(el){ el.classList.add('is-in'); });
}
})();
