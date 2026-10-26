// Cookie consent and Google Analytics 4, loaded only when site.json has ga4Id (see build.py) and
// the page runs on the real domain (data-hosts), so local previews and github.io never send visits. Basic consent mode: gtag.js is not fetched at all
// until the visitor accepts, so nothing goes to Google before that. Ads stay denied: SmartPeak
// runs no ads. The choice lives in localStorage (not a cookie) and is asked again after 6 months.
(() => {
  const script = document.currentScript;
  const id = script && script.dataset.ga;
  const hosts = ((script && script.dataset.hosts) || "").split(",").filter(Boolean);
  if (!id || !hosts.includes(location.hostname)) return;

  const KEY = "sp-cookiekeuze";
  const VERSION = 1;
  const MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;
  const COOKIE_DAYS = 395; // _ga lifetime about 13 months instead of Google's 2 years

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });

  const readChoice = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!saved || saved.v !== VERSION || !["ja", "nee"].includes(saved.keuze)) return null;
      if (Date.now() - saved.t > MAX_AGE_MS) return null;
      return saved.keuze;
    } catch {
      return null;
    }
  };
  const saveChoice = (keuze) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: VERSION, keuze, t: Date.now() }));
    } catch {
      // Private mode or blocked storage: the choice holds for this page only and is asked again.
    }
  };

  let loaded = false;
  const startAnalytics = () => {
    window[`ga-disable-${id}`] = false;
    gtag("consent", "update", { analytics_storage: "granted" });
    if (loaded) return;
    loaded = true;
    gtag("js", new Date());
    gtag("config", id, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: COOKIE_DAYS * 24 * 60 * 60,
    });
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(tag);
  };

  const removeAnalyticsCookies = () => {
    const host = location.hostname;
    const domains = ["", host, `.${host}`, `.${host.replace(/^www\./, "")}`];
    document.cookie.split(";").map((c) => c.split("=")[0].trim())
      .filter((name) => name === "_ga" || name.startsWith("_ga_"))
      .forEach((name) => domains.forEach((domain) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ""}`;
      }));
  };
  const stopAnalytics = () => {
    gtag("consent", "update", { analytics_storage: "denied" });
    // gtag.js may already be loaded on this page: also stop it sending cookieless pings.
    window[`ga-disable-${id}`] = true;
    removeAnalyticsCookies();
  };

  const track = (name, params) => {
    if (loaded && readChoice() === "ja") gtag("event", name, params || {});
  };

  let banner = null;
  const closeBanner = () => {
    if (!banner) return;
    const hadFocus = banner.contains(document.activeElement);
    banner.remove();
    banner = null;
    document.body.classList.remove("has-cookie-banner");
    if (hadFocus) {
      const main = document.getElementById("inhoud");
      if (main) {
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.focus({ preventScroll: true });
      }
    }
  };
  const choose = (keuze) => {
    saveChoice(keuze);
    if (keuze === "ja") startAnalytics();
    else stopAnalytics();
    closeBanner();
  };

  const openBanner = (moveFocus) => {
    if (banner) return;
    const policy = script.dataset.policy || "/cookies/";
    banner = document.createElement("section");
    banner.className = "cookie-banner";
    banner.setAttribute("aria-labelledby", "cookie-banner-titel");
    banner.innerHTML =
      '<div class="cookie-banner-inner">' +
      '<p class="cookie-banner-title" id="cookie-banner-titel">Mogen we meten hoe de site gebruikt wordt?</p>' +
      "<p>Met Google Analytics zien we welke pagina's en menu's bezoekers bekijken. Dat plaatst cookies, en enkel als jij dat goed vindt. " +
      `Je kan je keuze altijd wijzigen onderaan elke pagina. <a href="${policy}">Meer over cookies</a></p>` +
      '<div class="cookie-banner-actions">' +
      '<button type="button" class="cookie-button" data-keuze="nee">Weigeren</button>' +
      '<button type="button" class="cookie-button" data-keuze="ja">Aanvaarden</button>' +
      "</div></div>";
    banner.addEventListener("click", (event) => {
      const button = event.target.closest("[data-keuze]");
      if (button) choose(button.dataset.keuze);
    });
    const skip = document.querySelector(".skip-link");
    if (skip) skip.after(banner);
    else document.body.prepend(banner);
    document.body.classList.add("has-cookie-banner");
    if (moveFocus) banner.querySelector("button").focus();
  };

  const init = () => {
    const keuze = readChoice();
    if (keuze === "ja") startAnalytics();
    else if (keuze === null) openBanner(false);

    document.querySelectorAll("[data-cookie-settings]").forEach((button) => {
      button.hidden = false;
      button.addEventListener("click", () => openBanner(true));
    });

    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="tel:"], a[href^="mailto:"]');
      if (!link) return;
      const area = link.closest("header, footer, main");
      track(link.protocol === "tel:" ? "telefoon_klik" : "mail_klik", {
        link_location: link.classList.contains("call-fab") ? "belknop" : area ? area.tagName.toLowerCase() : "andere",
      });
    });
    document.addEventListener("sp:lead", (event) => {
      track("generate_lead", { lead_source: (event.detail && event.detail.bron) || "onbekend" });
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
