const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const sharp = require('/Users/jagjeetsingh/ai-app-factory/node_modules/sharp');
const root = path.resolve('src/ui');
function load(file, resolver) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod = {exports:{}};
  new Function('require','module','exports', js)(resolver,mod,mod.exports);
  return mod.exports;
}
(async () => {
  const pictures = [];
  for (const scheme of ['light','dark']) {
    const theme = load(path.join(root,'theme.ts'), name => name === 'react-native' ? {Appearance:{getColorScheme:()=>scheme}} : name === './style.json' ? require(path.join(root,'style.json')) : require(name));
    const {MouthIllustration} = load(path.join(root,'SpeechVisuals.tsx'), name => {
      if (name === './theme') return theme;
      if (name === 'react-native') return {};
      if (name === 'react-native-reanimated') return {};
      if (name === 'react-native-svg') return {__esModule:true, default:'svg', Circle:'circle', Ellipse:'ellipse', G:'g', Path:'path', Rect:'rect'};
      if (name === '../core/practice') return {mouthPose:id=>({label:id,lipBite:id==='v',round:id==='w'})};
      if (name === '../core/sounds') return {SOUND_BY_ID:{v:{name:'V'},w:{name:'W'}}};
      return require(name);
    });
    for (const soundId of ['v','w']) {
      const svg = renderToStaticMarkup(React.createElement(MouthIllustration,{soundId,size:320})).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      pictures.push({input:await sharp(Buffer.from(svg)).png().toBuffer(),left:soundId==='v'?0:340,top:scheme==='light'?0:276});
    }
  }
  const style = require(path.join(root,'style.json'));
  const backing = `<svg width="680" height="552"><rect width="680" height="276" fill="${style.light.primarySoft}"/><rect y="276" width="680" height="276" fill="${style.dark.primarySoft}"/></svg>`;
  await sharp(Buffer.from(backing)).composite(pictures).png().toFile('.agf/sound-art-check.png');
  console.log('Rendered actual SVG components in both palettes');
})().catch(e=>{console.error(e);process.exitCode=1});
