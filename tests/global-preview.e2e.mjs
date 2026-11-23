import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {setWorkspacePanel} from './workspace-controls.mjs';
const base=process.env.APP_URL??'http://127.0.0.1:5185/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await mkdir('tests/artifacts/global-preview',{recursive:true});
 for(const size of[{width:1512,height:1100},{width:1366,height:768},{width:1200,height:768},{width:1920,height:1080},{width:390,height:844},{width:320,height:568}]){
  await page.setViewportSize(size);
  await page.goto(`${base}#/demo/cleaning-machine/models/bw05p/settings`);
  await page.locator('[data-device-frame]').waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.workspace-header,.mobile-preview-header').count(),0);
  const global=page.locator('.global-panel');
  assert.equal(await global.getByRole('button',{name:'切换深色模式',exact:true}).count(),0);
  assert.equal(await global.getByRole('group',{name:'预览版本',exact:true}).count(),1);
  assert.ok(await global.locator('.console-toolbar > button').evaluateAll(buttons=>buttons.length===2&&buttons.every(button=>button.getBoundingClientRect().width===34&&button.getBoundingClientRect().height===34)),'toolbar icons retain their button size');
  const frame=await page.locator('[data-device-frame]').boundingBox();
  assert.ok(Math.abs(frame.x+frame.width/2-size.width/2)<1&&Math.abs(frame.y+frame.height/2-size.height/2)<1,`${size.width}: centered on full viewport`);
  assert.ok(frame.y>=23&&frame.y+frame.height<=size.height-23,'vertical breathing space');
  if(size.width>=1200){
   const dock=await page.locator('.control-dock').boundingBox();
   for(const [directory,info]of[[false,true],[false,false],[true,false],[true,true]]){
    await setWorkspacePanel(page,'页面目录',directory);await setWorkspacePanel(page,'交互说明',info);
    assert.deepEqual(await page.locator('.control-dock').boundingBox(),dock,'consoles remain fixed');
    assert.deepEqual(await page.locator('[data-device-frame]').boundingBox(),frame,'Demo remains fixed');
   }
   for(const rail of['.directory-panel','.info-panel'])assert.equal((await page.locator(rail).boundingBox()).y,0,'sidebars fill from top');
  }
  const qr=global.getByRole('button',{name:'手机体验二维码',exact:true});
  await qr.click();
  const dialog=page.getByRole('dialog',{name:'手机体验',exact:true});
  await dialog.waitFor();
  const url=new URL(await dialog.locator('a').getAttribute('href'));
  assert.equal(url.hash,'#/app/cleaning-machine/models/bw05p/settings');
  assert.equal(url.searchParams.has('preview'),false);
  const modal=await dialog.boundingBox();
  assert.ok(modal.x>=0&&modal.x+modal.width<=size.width+1&&modal.y>=0&&modal.y+modal.height<=size.height+1,'QR dialog fits');
  await page.getByRole('button',{name:'关闭手机体验',exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`tests/artifacts/global-preview/pc-${size.width}.png`,fullPage:true});
 }
 for(const size of[{width:1512,height:1100},{width:1024,height:600}]){
  await page.setViewportSize(size);
  await page.goto(`${base}#/app/cleaning-machine/models/bw05p/settings`);
  await page.locator('[data-app-screen]').waitFor();
  assert.equal(await page.locator('.workspace-header,.mobile-preview-header,.mobile-preview-controls,.global-panel,.console-panel,.preview-controls').count(),0,'mobile has no console or preview controls on desktop');
  await page.screenshot({path:'tests/artifacts/global-preview/app-'+size.width+'.png'});
  await page.goto(base+'#/demo/cleaning-machine/models/bw05p/settings');
  await page.locator('[data-device-frame]').waitFor();
  assert.equal(new URL(page.url()).hash,'#/demo/cleaning-machine/models/bw05p/settings');
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto(`${base}#/app`);await page.locator('[data-app-screen]').waitFor();
 assert.equal(await page.locator('.mobile-preview-controls,.global-panel,.workspace-header,.mobile-preview-header').count(),0,'phone keeps pure app view');
 assert.deepEqual(errors,[]);
 console.log('PASS: no top bar/theme toggle, version/QR controls inside global console, full-viewport centering, stable sidebars/consoles, QR routes and 6 responsive sizes, tool-free mobile mode at every size.');
}finally{await browser.close()}
