import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {setWorkspacePanel} from './workspace-controls.mjs';
const base=process.env.APP_URL??'http://127.0.0.1:5185/';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Run against local preview only.');
const password=(await readFile('.local/editing-password.txt','utf8')).trim();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  await mkdir('tests/artifacts/notes-toolbar',{recursive:true});
  for(const width of[1512,1200,390,320]){
    const context=await browser.newContext({viewport:{width,height:1100}});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}#/demo/cleaning-machine/models/bw05s/home`);
    await page.locator('[data-device-frame]').waitFor();
    await setWorkspacePanel(page,'交互说明',true);
    const panel=page.locator('.info-panel');
    const refresh=panel.getByRole('button',{name:'读取最新说明',exact:true});
    await refresh.click({trial:true});
    const header=panel.locator(':scope > header');
    const checkButtons=async()=>{
      const parent=await header.boundingBox();
      for(const button of await header.locator('button').all()){
        const rect=await button.boundingBox();
        assert.ok(rect.x>=parent.x&&rect.x+rect.width<=parent.x+parent.width+1,`${width}: action stays in header`);
        assert.ok(rect.y>=parent.y&&rect.y+rect.height<=parent.y+parent.height+1,`${width}: actions share the title row`);
      }
    };
    await checkButtons();
    assert.equal(await panel.locator('.notes-toolbar,.notes-message').count(),0);
    const content=panel.locator('.tool-body > details').first();
    const initial=await content.boundingBox();
    await page.route('**/api/notes/pages/home',async route=>{
      if(route.request().method()==='GET')await new Promise(resolve=>setTimeout(resolve,250));
      await route.continue();
    });
    await refresh.click();
    assert.deepEqual(await content.boundingBox(),initial,'refresh loading does not shift description');
    const toast=header.getByRole('status').filter({hasText:'已读取最新说明'});
    await toast.waitFor();
    assert.deepEqual(await content.boundingBox(),initial,'Toast does not shift description');
    const toastBounds=await toast.boundingBox(),headerBounds=await header.boundingBox(),panelBounds=await panel.boundingBox();
    assert.ok(toastBounds.y>=headerBounds.y&&toastBounds.y<=headerBounds.y+headerBounds.height+16,'Toast sits beside header actions');
    assert.ok(toastBounds.x>=panelBounds.x&&toastBounds.x+toastBounds.width<=panelBounds.x+panelBounds.width,'Toast fits inside panel');
    await page.screenshot({path:`tests/artifacts/notes-toolbar/read-toast-${width}.png`});
    await toast.waitFor({state:'hidden',timeout:5000});
    assert.deepEqual(await content.boundingBox(),initial,'Toast dismissal does not shift description');
    await panel.getByRole('button',{name:'编辑',exact:true}).click();
    if(width===1512){
      await panel.getByLabel('编辑密码',{exact:true}).fill('incorrect-toolbar-test');
      await panel.getByRole('button',{name:'解锁编辑',exact:true}).click();
      await header.getByRole('alert').filter({hasText:'编辑密码不正确'}).waitFor();
      assert.equal(await panel.locator('.tool-body [role=alert]').count(),0,'errors are also header Toasts');
    }
    await panel.getByLabel('编辑密码',{exact:true}).fill(password);
    await panel.getByRole('button',{name:'解锁编辑',exact:true}).click();
    await panel.getByRole('textbox',{name:'说明 1 正文',exact:true}).waitFor();
    await checkButtons();
    await page.screenshot({path:`tests/artifacts/notes-toolbar/edit-header-${width}.png`});
    await panel.getByRole('button',{name:'取消',exact:true}).click();
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('PASS: title-row refresh/edit/save actions at 1512,1200,390,320 px; anchored success/error Toasts, automatic dismissal, no description shift during refresh or Toasts.');
}finally{await browser.close()}
