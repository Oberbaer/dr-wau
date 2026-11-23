'use strict';

// Homey Web themes the entire settings iframe. An app-level dark palette
// would be inverted a second time there. Other settings hosts use OS colors.
(() => {
  if (window.parent === window) return;
  const homeyWeb = 'https://my.homey.app';
  let referrerOrigin;
  try { referrerOrigin = new URL(document.referrer).origin; } catch { /* Missing referrer. */ }
  const ancestors = Array.from(window.location.ancestorOrigins || []);
  if (ancestors.includes(homeyWeb) || referrerOrigin === homeyWeb) {
    document.documentElement.classList.add('homey-web-theme');
  }
})();
