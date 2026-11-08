const fs = require('fs');
const {spawnSync} = require('child_process');
const file = 'metro.config.js';
const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
if (before) throw new Error('Existing Metro configuration: preserve it and review before preview export');
const pattern = '^(react-native-google-mobile-ads|expo-iap|@shopify\\/react-native-skia|expo-notifications|expo-file-system|expo-speech-recognition|expo-store-review|expo-audio)(\\/.*)?$';
fs.writeFileSync(file, `const path = require('path');\nconst config = require('expo/metro-config').getDefaultConfig(__dirname);\nconst native = new RegExp(${JSON.stringify(pattern)});\nconfig.resolver.resolveRequest = (ctx,name,platform) => platform==='web' && native.test(name) ? {type:'sourceFile',filePath:path.join(__dirname,'.agf/web-stub.js')} : ctx.resolveRequest(ctx,name,platform);\nmodule.exports=config;\n`);
try {
 const out = spawnSync('npx',['expo','export','--platform','web','--output-dir','.agf/shot-web-check'], {stdio:'inherit',env:{...process.env,EXPO_NO_DOTENV:'1',CI:'1'}});
 process.exitCode = out.status ?? 1;
} finally { fs.unlinkSync(file); }
