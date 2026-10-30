// Web pre-check stub for a native-only module (lib/qa/web-check.ts): every export is a harmless no-op that can be
// called, awaited, rendered (renders nothing) or chained (Skia.Path.Make().moveTo(...)), so the app's JS logic runs on web.
const React = require("react");
function make(name) {
  const fn = function StubNative() { return null; };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === "__esModule") return true;
      if (prop === "default") return make(name + ".default");
      if (prop === "then") return undefined; // not a thenable itself
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === "displayName" || prop === "name") return "Stub(" + name + ")";
      if (prop === "$$typeof") return undefined;
      if (prop === "prototype") return fn.prototype;
      return make(name + "." + String(prop));
    },
    apply(_t, _this, args) {
      // A React component (capitalised name, called with a props object) renders nothing; anything else resolves.
      const last = name.split(".").pop() || "";
      if (/^[A-Z]/.test(last) && args.length >= 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) return null;
      const p = Promise.resolve(undefined); return new Proxy(p, { get(t, k) { if (k in t) { const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } return make(name + "()." + String(k)); } }); },
    construct() { return make(name + " instance"); },
  });
}
module.exports = make("native");
void React;
