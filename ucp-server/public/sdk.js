// ucp-server/public/sdk.js
// Publisher-embeddable SDK loader. Task 26 will replace/extend this with Shadow DOM
// ad slot logic. This skeleton just exposes a minimal UcpSdk global that can fetch the
// demo catalog, so publisher-site smoke tests work before the real components land.
(function () {
  'use strict';
  var UCP_API = (typeof window !== 'undefined' && window.__UCP_API__) || 'http://localhost:3001';

  function uuid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'fallback-' + Math.random().toString(36).slice(2);
  }

  function agentHeaders() {
    var origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null')
      ? location.origin
      : UCP_API;
    return {
      'UCP-Agent': 'profile="' + origin + '/profile"',
      'Request-Id': uuid()
    };
  }

  window.UcpSdk = {
    version: '0.1.0-skeleton',
    async getCatalog() {
      var r = await fetch(UCP_API + '/catalog', { headers: agentHeaders() });
      if (!r.ok) throw new Error('catalog fetch failed: ' + r.status);
      return (await r.json()).products;
    }
  };

  document.dispatchEvent(new CustomEvent('ucp-sdk-ready', { detail: { version: window.UcpSdk.version } }));
})();
