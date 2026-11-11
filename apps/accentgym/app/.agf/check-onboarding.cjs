// Component interaction regression check, with inert native/UI adapters.
// Supply a temporary install of react-test-renderer matching this app's React:
// node .agf/check-onboarding.cjs /path/to/renderer/node_modules light
// This checks real screen callbacks/telemetry, not native layout or speech.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert/strict');
const ts = require('typescript');
const rendererModules = process.argv[2];
const scheme = process.argv[3] || 'light';
const React = require(path.join(rendererModules, 'react'));
const { create, act } = require(path.join(rendererModules, 'react-test-renderer'));
global.IS_REACT_ACT_ENVIRONMENT = true;
const originalLoad = Module._load;
const root = process.cwd();
const events = [];
const noop = () => {};
function memoryStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set(next) { value = typeof next === 'function' ? next(value) : { ...value, ...next }; listeners.forEach(fn => fn()); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
let gymStore;
const settings = memoryStore({ onboarded: false });
const native = {
  Appearance: { getColorScheme: () => scheme },
  StyleSheet: { create: x => x, hairlineWidth: 1 },
  Text: 'Text', View: 'View',
};
const components = Object.fromEntries([
  'Button', 'Card', 'Chip', 'HeroCard', 'Icon', 'Segmented', 'FocusSentence',
  'MouthIllustration', 'Pill', 'ProgressRing', 'Screen',
].map(name => [name, name]));
let ui;
Module._load = function(name, parent, isMain) {
  if (name === 'react') return React;
  if (name === 'react-native') return native;
  if (name.startsWith('.') && parent?.filename.startsWith(root)) {
    const resolved = path.resolve(path.dirname(parent.filename), name);
    if (resolved.endsWith('/ui')) return ui;
    if (resolved.endsWith('/core/data')) return {
      gymStore,
      useGym: () => React.useSyncExternalStore(gymStore.subscribe, gymStore.get),
    };
    if (resolved.endsWith('/modules/store')) return { store: settings };
    if (resolved.endsWith('/modules/analytics')) return { analytics: { track: (e, p = {}) => events.push({ e, p }) } };
    if (resolved.endsWith('/modules/review')) return { review: { actionCompleted: noop } };
    if (resolved.endsWith('/modules/purchase-ui')) return { canOfferPro: () => false };
    if (resolved.endsWith('/screens/PairDrillSheet')) return { PairDrillSheet: () => null };
    if (resolved.endsWith('/screens/SpeakSheet')) return { SpeakSheet: props => props.visible ? React.createElement('SpeakSheet', props) : null };
  }
  return originalLoad.call(this, name, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, file) => {
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
};
ui = {
  ...require('../src/ui/theme.ts'), ...components, feedback: noop, toast: noop,
  FooterScreen: props => React.createElement('FooterScreen', props, props.top, props.children, props.footer),
};
const core = require('../src/core/state.ts');
const { dateKey } = require('../src/core/dates.ts');
gymStore = memoryStore(core.emptyState(dateKey(new Date())));
const { OnboardingScreen } = require('../src/screens/OnboardingScreen.tsx');
const { PracticeScreen } = require('../src/screens/PracticeScreen.tsx');
const button = (tree, label) => tree.root.findAllByType('Button').find(n => n.props.label === label);
const text = tree => {
  const visit = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(visit).join(' ') : visit(node?.children ?? []);
  return visit(tree.toJSON());
};
async function run() {
  let tree;
  let completed = 0;
  await act(() => { tree = create(React.createElement(OnboardingScreen, { onDone: () => completed++ })); });
  assert.deepEqual(events, [{ e: 'onboarding_step', p: { step: 1 } }]);
  assert(button(tree, 'Start practising')); assert(button(tree, 'Skip setup'));
  assert(!text(tree).includes('Fair pricing, shown up front'));
  assert.equal(tree.root.findAllByType('Button').filter(n => !n.props.variant || n.props.variant === 'primary').length, 1);
  await act(() => tree.root.findAllByType('Chip').find(n => n.props.label.includes('Spanish')).props.onPress());
  await act(() => tree.root.findByType('Segmented').props.onChange('uk'));
  assert.equal(events.length, 1); // Choices do not inflate viewed-step counts.
  assert.equal(gymStore.get().profile.nativeLanguage, 'other'); // Still a draft.
  const start = button(tree, 'Start practising').props.onPress;
  await act(() => { start(); start(); });
  assert.equal(completed, 1);
  assert.equal(events.filter(e => e.e === 'onboarding_done').length, 1);
  assert.equal(gymStore.get().profile.nativeLanguage, 'es');
  assert.equal(gymStore.get().profile.targetAccent, 'uk');
  assert(settings.get().onboarded); assert(gymStore.get().onboarded);
  await act(() => tree.unmount());

  await act(() => { gymStore.set(() => core.emptyState(dateKey(new Date()))); });
  events.length = 0;
  await act(() => { tree = create(React.createElement(OnboardingScreen, { onDone: noop })); });
  await act(() => tree.root.findAllByType('Chip').find(n => n.props.label.includes('Hindi')).props.onPress());
  await act(() => button(tree, 'Skip setup').props.onPress());
  assert.equal(gymStore.get().profile.nativeLanguage, 'other');
  assert.equal(events.filter(e => e.e === 'onboarding_done').length, 1);
  await act(() => tree.unmount());

  let assessmentOpened = false;
  await act(() => { tree = create(React.createElement(PracticeScreen, { bottomInset: 80, onPro: noop, onAssessment: () => { assessmentOpened = true; } })); });
  const hero = tree.root.findByType('HeroCard');
  assert(hero.findAllByType('Button').some(n => n.props.label === 'Tap to speak'));
  assert(!hero.findAllByType('Button').some(n => n.props.label.includes('focus sounds')));
  await act(() => button(tree, 'Find my 3 focus sounds').props.onPress());
  assert(assessmentOpened);
  await act(() => button(tree, 'Tap to speak').props.onPress());
  assert.equal(tree.root.findByType('SpeakSheet').props.mode.kind, 'practice');
  assert.equal(tree.root.findByType('SpeakSheet').props.startWithoutMic, false);
  await act(() => tree.root.findByType('SpeakSheet').props.onClose());
  await act(() => button(tree, 'Listen & say without a mic').props.onPress());
  const guided = tree.root.findByType('SpeakSheet');
  assert.equal(guided.props.startWithoutMic, true);
  assert.equal(guided.props.mode.text, hero.findByType('FocusSentence').props.text);
  await act(() => guided.props.onClose());
  await act(() => button(tree, 'Start session').props.onPress());
  assert.equal(tree.root.findByType('SpeakSheet').props.startWithoutMic, false);
  assert.equal(gymStore.get().diagnostics.length, 0);
  await act(() => gymStore.set(s => core.completeGuidedPractice(s, 'We have very warm weather.', dateKey(new Date()))));
  assert.equal(tree.root.findByType('HeroCard').props.status.label, 'Practice saved today');
  assert(text(tree).includes('Come back tomorrow'));
  await act(() => tree.unmount());

  events.length = 0;
  await act(() => { tree = create(React.createElement(OnboardingScreen, { assessmentOnly: true, onDone: noop })); });
  assert.deepEqual(events, [{ e: 'screen_view', p: { screen: 'sound_check' } }]);
  await act(() => button(tree, 'Skip the check').props.onPress());
  assert.equal(events.filter(e => e.e === 'onboarding_done').length, 0);
  await act(() => tree.unmount());
  console.log(JSON.stringify({ scheme, status: 'passed', checks: ['first-screen telemetry', 'single setup screen', 'draft choices', 'completion once', 'skip', 'primary practice action', 'optional assessment', 'saved streak nudge', 'assessment telemetry'] }));
}
run().catch(e => { console.error(e); process.exitCode = 1; });
