"use strict";

(function attachVersion(root) {
  const APP_VERSION = "R79";
  const CACHE_VERSION = `ashes-convoy-${APP_VERSION.toLowerCase()}-v2`;
  const DSVersion = {
    APP_VERSION,
    CACHE_VERSION
  };

  root.DSVersion = DSVersion;
  if (typeof module !== "undefined" && module.exports) module.exports = DSVersion;
})(typeof globalThis !== "undefined" ? globalThis : this);
