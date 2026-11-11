// Real SpeakSheet callbacks with inert native adapters; no device/AI claims.
// node .agf/check-activation.cjs /path/to/renderer/node_modules light|dark
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert/strict');
const ts = require('typescript');
const React = require(path.join(process.argv[2], 'react'));
const { create, act } = require(path.join(process.argv[2], 'react-test-renderer'));
global.IS_REACT_ACT_ENVIRONMENT = true;
const scheme = process.argv[3] || 'light';
const noop = () => {};
const events = [];
let micStarts = 0, aiCalls = 0, reviews = 0, gymStore;
const dict = { reset: noop, stop: noop, start: () => { micStarts++; }, level: { value: 0 }, status: 'denied', finalText: null, transcript: '' };
const native = { Appearance: { getColorScheme: () => scheme }, StyleSheet: { create: x => x, hairlineWidth: 1 }, Text: 'Text', View: 'View', Keyboard: { dismiss: noop } };
let ui;
const originalLoad = Module._load;
const root = process.cwd();
Module._load = function(name, parent, isMain) {
  if (name === 'react') return React;
  if (name === 'react-native') return native;
  if (name === 'react-native-reanimated') return { __esModule: true, default: { View: 'View' }, useAnimatedStyle: fn => fn(), LinearTransition: { springify: () => ({ damping: noop }) } };
  if (name === 'expo-audio') return { useAudioPlayer: () => ({}) };
  if (name.startsWith('.') && parent?.filename.startsWith(root)) {
    const resolved = path.resolve(path.dirname(parent.filename), name);
    if (resolved.endsWith('/ui')) return ui;
    if (resolved.endsWith('/ui/ModelPlayback')) return { ModelPlayback: 'ModelPlayback' };
    if (resolved.endsWith('/ui/MouthGuide')) return { MouthGuide: 'MouthGuide' };
    if (resolved.endsWith('/core/data')) return { gymStore, useGym: () => React.useSyncExternalStore(gymStore.subscribe, gymStore.get) };
    if (resolved.endsWith('/modules/speech')) return { useDictation: () => dict, tts: { stop: noop } };
    if (resolved.endsWith('/modules/ai')) return { ai: { enabled: true, run: () => { aiCalls++; throw Error('Unexpected AI call'); } } };
    if (resolved.endsWith('/modules/ads')) return { ads: {} };
    if (resolved.endsWith('/modules/analytics')) return { analytics: { track: (e, p) => events.push({ e, p }) } };
    if (resolved.endsWith('/modules/review')) return { review: { actionCompleted: () => { reviews++; } } };
    if (resolved.endsWith('/modules/purchase-ui')) return { canOfferPro: () => false };
  }
  return originalLoad.call(this, name, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const components = Object.fromEntries(['Button', 'Card', 'Confetti', 'HeroCard', 'Icon', 'FocusSentence', 'InputMeter', 'Pill', 'TextField', 'Tappable', 'AiReport'].map(x => [x, x]));
ui = { ...require('../src/ui/theme.ts'), ...components, feedback: noop,
  Sheet: props => React.createElement('Sheet', props, props.children, props.footer) };
const core = require('../src/core/state.ts');
const { dateKey } = require('../src/core/dates.ts');
const today = dateKey(new Date());
let value = core.finishOnboarding(core.emptyState(today));
const listeners = new Set();
gymStore = { get: () => value, set: fn => { value = fn(value); listeners.forEach(fn => fn()); }, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
const { SpeakSheet } = require('../src/screens/SpeakSheet.tsx');
const button = (tree, label) => tree.root.findAllByType('Button').find(n => n.props.label === label);
async function run() {
  let tree, closed = 0;
  const mode = { kind: 'practice', sentenceId: 's_start_1', text: 'We have very warm weather.', soundTags: ['w'] };
  const props = { visible: true, mode, onClose: () => { closed++; } };
  // Even exhausted AI allowance must leave the existing unscored core flow usable.
  value = { ...value, quota: { ...value.quota, scoredUsed: 5 } };
  const before = value;
  await act(() => { tree = create(React.createElement(SpeakSheet, { ...props, startWithoutMic: true })); });
  assert.equal(tree.root.findByType('ModelPlayback').props.text, mode.text);
  assert.equal(tree.root.findAllByType('TextField').length, 0);
  assert(button(tree, 'I said it — save practice'));
  await act(() => button(tree, 'I said it — save practice').props.onPress());
  assert.deepEqual(value.guidedPractice, { text: mode.text, date: today });
  assert.equal(value.streak.current, 1);
  assert.deepEqual(value.quota, before.quota);
  assert.deepEqual(value.attempts, before.attempts);
  assert.deepEqual(value.mastery, before.mastery);
  assert.deepEqual(events, [{ e: 'core_action', p: { feature: 'guided_practice' } }]);
  assert.equal(reviews, 1);
  await act(() => button(tree, 'Continue practising').props.onPress());
  assert.equal(closed, 1); assert.equal(events.length, 1);
  await act(() => tree.update(React.createElement(SpeakSheet, { ...props, visible: false, startWithoutMic: true })));
  await act(() => tree.update(React.createElement(SpeakSheet, { ...props, startWithoutMic: true })));
  assert(button(tree, 'I said it — save practice')); // no stale saved state on reopen
  await act(() => tree.unmount());
  value = before;
  value = { ...value, quota: { ...value.quota, scoredUsed: 0 } };
  await act(() => { tree = create(React.createElement(SpeakSheet, props)); });
  await act(() => button(tree, 'Listen & say without a mic').props.onPress());
  assert.equal(tree.root.findByType('ModelPlayback').props.text, mode.text);
  assert(button(tree, 'I said it — save practice'));
  assert.equal(micStarts, 0); assert.equal(aiCalls, 0);
  await act(() => tree.unmount());
  console.log(JSON.stringify({ scheme, status: 'passed', checks: ['direct offline entry', 'no retyping', 'quota-independent', 'persisted result and streak', 'unchanged scores and quota', 'core telemetry and review', 'reopen reset', 'recording fallback', 'no mic or AI required'] }));
}
run().catch(e => { console.error(e); process.exitCode = 1; });
