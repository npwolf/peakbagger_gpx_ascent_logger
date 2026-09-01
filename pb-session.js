// peakbagger.com sits behind Cloudflare, which answers requests made from the
// extension's own origin (popup and service worker) with a bot challenge
// instead of the page. Only a real top-level peakbagger.com document gets
// through, so this content script is the extension's bridge to the site: it
// caches who is logged in, and runs peakbagger fetches on the site's behalf.
(() => {
  const SESSION_KEY = "pbSession";

  function findClimberId() {
    for (const link of document.querySelectorAll("a[href*=\"cid=\"]")) {
      if (link.textContent.trim() !== "My Home Page") continue;
      const match = link.getAttribute("href").match(/[?&]cid=(\d+)/i);
      if (match) return match[1];
    }
    return null;
  }

  // The header renders "Logged in: <name>" on every page while a session is
  // active. Only drop a cached id when a page positively looks logged out, so
  // that a page without the usual header doesn't throw away a good session.
  function isLoggedOut() {
    return (
      !document.body.textContent.includes("Logged in:") &&
      !!document.querySelector("a[href*=\"ogin.aspx\" i]")
    );
  }

  function cacheSession() {
    const climberId = findClimberId();
    if (climberId) {
      chrome.storage.local.set({
        [SESSION_KEY]: { climberId, updatedAt: Date.now() },
      });
    } else if (isLoggedOut()) {
      chrome.storage.local.remove(SESSION_KEY);
    }
  }

  async function proxyFetch(url) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action !== "pbFetch") return;
    proxyFetch(request.url)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true; // Keep the message channel open for the async response
  });

  cacheSession();
})();
