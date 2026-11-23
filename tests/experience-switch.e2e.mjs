import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.APP_URL??'http://127.0.0.1:5185/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1512,height:1100}});
 await context.addInitScript(()=>{
   window.__experienceDocumentId=crypto.randomUUID();
   new MutationObserver(()=>{
     if(document.querySelector('main > h1')?.textContent==='页面不存在')console.error('VALID_ROUTE_NOT_FOUND');
   }).observe(document,{childList:true,subtree:true});
 });
 const page=await context.newPage();
 const errors=[],missing=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.text()==='VALID_ROUTE_NOT_FOUND')missing.push(page.url())});
 const ready=async(mode,hash)=>{
   await page.waitForFunction(mode=>document.documentElement.dataset.experience===mode&&!!document.querySelector(mode==='app'?'[data-app-screen]':'[data-device-frame]'),mode);
   assert.equal(new URL(page.url()).hash,hash);
   if(mode==='app')assert.equal(await page.locator('.global-panel,.console-panel,.control-dock,.directory-panel,.info-panel,.mobile-preview-controls,.preview-controls,[aria-label="预览版本"]').count(),0,'mobile contains no consoles or switching UI');
 };
 await mkdir('tests/artifacts/experience-switch',{recursive:true});
 for(const model of['bw05p','bw05a','bw05s'])for(const screen of['home','settings','consumables','run-control']){
   const route=`/cleaning-machine/models/${model}/${screen}`;
   await page.goto(`${base}#/demo${route}`);await ready('demo',`#/demo${route}`);
   const before=await page.evaluate(()=>window.__experienceDocumentId);
   await page.getByRole('button',{name:'移动版',exact:true}).click();
   await ready('app',`#/app${route}`);
   assert.notEqual(await page.evaluate(()=>window.__experienceDocumentId),before,'switch loads a new document');
   await page.reload();await ready('app',`#/app${route}`);
   await page.goBack();await ready('demo',`#/demo${route}`);
   await page.goForward();await ready('app',`#/app${route}`);
   await page.evaluate(hash=>{window.location.hash=hash},`#/demo${route}`);
   await ready('demo',`#/demo${route}`);
   if(model==='bw05p'&&screen==='home')await page.screenshot({path:'tests/artifacts/experience-switch/bw05p-home-fixed.png'});
 }
 // A second click before unloading must not insert a duplicate mobile history entry.
 await page.goto(`${base}#/demo/cleaning-machine/models/bw05p/home`);await ready('demo','#/demo/cleaning-machine/models/bw05p/home');
 await page.evaluate(()=>{const button=document.querySelector('[aria-label="预览版本"] button[title="移动版"]');button.click();button.click()});
 await ready('app','#/app/cleaning-machine/models/bw05p/home');
 await page.goBack();await ready('demo','#/demo/cleaning-machine/models/bw05p/home');
 for(const width of[320,390,1024,1512,1920]){
   await page.setViewportSize({width,height:1100});
   await page.goto(`${base}#/app/cleaning-machine/models/bw05p/home`);await ready('app','#/app/cleaning-machine/models/bw05p/home');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===1512)await page.screenshot({path:'tests/artifacts/experience-switch/mobile-no-consoles.png'});
 }
 assert.deepEqual(missing,[],'no transient NotFound during valid switches or history navigation');
 assert.deepEqual(errors,[]);
 console.log('PASS: 12 model/page combinations, complete document switches, reload, browser back/forward, manual hash entry, rapid duplicate click, no NotFound flash; no mobile consoles at 5 widths.');
}finally{await browser.close()}
