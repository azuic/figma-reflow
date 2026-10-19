import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,stat} from 'node:fs/promises';
test('distribution manifest resolves, bundled JavaScript parses, Pretext license is retained',async()=>{
 const m=JSON.parse(await readFile('manifest.json','utf8'));
 assert.deepEqual(m.networkAccess.allowedDomains,['none']);
 assert.equal(m.documentAccess,'dynamic-page');
 await stat(m.main);await stat(m.ui);
 new vm.Script(await readFile(m.main,'utf8'));
 const html=await readFile(m.ui,'utf8'),script=html.match(/<script>([\s\S]*)<\/script>/)[1];new vm.Script(script);
 assert.ok(!script.includes('/* BUNDLED_SCRIPT */'));
 assert.match(await readFile('dist/PRETEXT-LICENSE.txt','utf8'),/Copyright \(c\) 2026 Pretext contributors/);
 assert.ok(html.includes('FigmaNative'));assert.ok(html.includes('new Worker'));
});
