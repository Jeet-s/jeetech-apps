// Render the real scene/component trees with inert native adapters. This checks
// render contracts and content in both themes; it is not native layout QA.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert/strict');
const crypto = require('crypto');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = process.cwd();
const scheme = process.argv[2] || 'light';
const originalLoad = Module._load;
const noop = () => {};
const primitive = tag => function Primitive({ children, visible, ...props }) {
  if (visible === false) return null;
  const attrs = { 'data-native': tag };
  if (props.accessibilityLabel) attrs['aria-label'] = props.accessibilityLabel;
  return React.createElement(tag === 'Text' ? 'span' : 'div', attrs, children);
};
const native = {
  Appearance: { getColorScheme: () => scheme },
  Platform: { OS: 'android', select: opts => opts.android ?? opts.default },
  StyleSheet: { create: x => x, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1, flatten: x => Object.assign({}, ...[x].flat(Infinity).filter(Boolean)) },
  useWindowDimensions: () => ({ width: 360, height: 800 }),
  Keyboard: { addListener: () => ({ remove: noop }), dismiss: noop },
  Linking: { openURL: noop, canOpenURL: async () => true },
  Alert: { alert: noop },
};
for (const key of ['View','Text','Modal','ScrollView','KeyboardAvoidingView','Image','TextInput','Pressable','ActivityIndicator']) native[key] = primitive(key);
const transition = new Proxy(noop, { get: () => transition, apply: () => transition });
const animated = { View: native.View, Text: native.Text, createAnimatedComponent: x => x };
const reanimated = {
  __esModule: true, default: animated, ...animated,
  useSharedValue: value => ({ value }), useAnimatedStyle: fn => fn(),
  withTiming: x => x, withSpring: x => x, withRepeat: x => x,
  LinearTransition: transition, Easing: { out: x => x, cubic: noop, quad: noop, linear: noop },
};
function persisted(_key, initial) {
  let value = initial;
  return { get: () => value, set: next => { value = typeof next === 'function' ? next(value) : { ...value, ...next }; }, load: async () => value, subscribe: () => noop };
}
const settings = persisted('settings', { onboarded: true });
const stubs = {
  layout: { useBannerHeight: () => 0 },
  persist: { persisted, usePersisted: s => s.get() },
  store: { store: settings, useSettings: () => settings.get() },
  cloud: { syncStore: noop, cloud: {} },
  analytics: { analytics: { track: noop } },
  ai: { ai: { enabled: true } },
  ads: { ads: {} },
  review: { review: { actionCompleted: noop } },
  'purchase-ui': { canOfferPro: () => true },
  'restore-purchases': { restorePurchases: noop },
  iap: { iap: { plans: () => [], price: () => null } },
  speech: { tts: { stop: noop }, useDictation: () => ({ level: { value: 0 }, transcript: '', reset: noop, supported: true }) },
};
Module._load = function(name, parent, isMain) {
  if (name === 'react-native') return native;
  if (name === 'react-native-reanimated') return reanimated;
  if (name === 'react-native-svg') return { __esModule: true, default: ({ accessibilityLabel, children, ...props }) => React.createElement('svg', { ...props, 'aria-label': accessibilityLabel }, children), Path: 'path', G: 'g', Rect: 'rect', Circle: 'circle', Ellipse: 'ellipse', Line: 'line' };
  if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) };
  if (name === 'expo-linear-gradient') return { LinearGradient: native.View };
  if (name === 'expo-audio') return { useAudioPlayer: () => ({}) };
  if (name === '@shopify/react-native-skia') return { Canvas: () => null, Path: () => null, Group: () => null, Skia: { PathBuilder: { Make: () => ({ addCircle: () => ({ build: () => ({}) }) }) } } };
  if (name.startsWith('.') && parent?.filename.startsWith(root)) {
    const resolved = path.resolve(path.dirname(parent.filename), name);
    if (resolved.includes('/src/modules/')) {
      const key = path.basename(resolved).replace(/\.tsx?$/, '');
      if (!(key in stubs)) throw Error(`Missing native adapter: ${key}`);
      return stubs[key];
    }
    if (resolved.endsWith('/audio/sfx')) return { play: noop, feedback: noop, haptic: noop, initAudio: noop };
    if (resolved.endsWith('/ui/Account')) return { AccountSheet: () => null, useCloudUser: () => null };
    if (resolved.endsWith('/fx/Confetti')) return { Confetti: () => null };
  }
  return originalLoad.call(this, name, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  mod._compile(output, file);
};
const { ScreenshotScene } = require('../src/screenshots.tsx');
const { gymStore } = require('../src/core/data.ts');
const scenes = JSON.parse(fs.readFileSync('shots.json', 'utf8')).scenes;
const expected = {
  practice: ['Practice saved today', 'Resume session', '2 of 6', '21-day streak', 'Open my 3-sound plan'],
  plan: ['Your 3 priority sounds', 'V sound', 'TH (think)', 'W sound', 'Next drill: vest / west'],
  feedback: ['Your phrase', '1 of 1', 'V sound in “vest”', 'Teeth touch lip', 'Lips round forward', 'Text-based coaching, not an acoustic score'],
  review: ['4 to review', 'comfortable', 'vest', 'thin', 'those', 'Say it'],
  pro: ['$6.99/month', '$52.99/year', 'Restore purchases', 'Free practice stays yours'],
};
const out = `.agf/store-scene-smoke/${scheme}`;
fs.mkdirSync(out, { recursive: true });
for (const scene of scenes) {
  const html = renderToStaticMarkup(React.createElement(ScreenshotScene, { id: scene.id }));
  const text = html.replace(/<[^>]*>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  for (const content of expected[scene.id]) assert(text.includes(content), `${scene.id} missing: ${content}`);
  if (scene.id === 'feedback') {
    const attempt = gymStore.get().attempts.at(-1);
    assert.equal(attempt.customText, 'vest');
    assert.equal(attempt.wordScores.length, 1);
    assert.equal(attempt.wordScores[0].phonemes[0].heardIPA, 'w');
    assert.equal(attempt.wordScores[0].score, Math.round(attempt.wordScores[0].phonemes.reduce((n,p) => n+p.score,0)/4));
  }
  fs.writeFileSync(`${out}/${scene.id}.html`, html);
}
for (const id of ['record','drill','sounds','progress']) {
  assert(renderToStaticMarkup(React.createElement(ScreenshotScene, { id })).length > 1000, `${id} no longer renders`);
}
for (const line of fs.readFileSync('.agf/store-pass-before/approved-sources.sha256', 'utf8').trim().split('\n')) {
  const [, hash, file] = line.match(/^(\w+)\s+(.+)$/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, `QA-approved source changed: ${file}`);
}
console.log(JSON.stringify({ scheme, scenes: scenes.map(s => s.id), legacyScenes: 4, approvedSources: 'unchanged', status: 'render smoke passed; native layout review remains required' }));
