import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {openGlobalTools,openPageExceptions,setWorkspacePanel} from './workspace-controls.mjs';

const base=process.env.APP_URL??'http://127.0.0.1:5185/';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'This test writes only to an isolated local preview.');
const password=(await readFile('.local/editing-password.txt','utf8')).trim();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1512,height:1100}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await mkdir('tests/artifacts/notes-additions',{recursive:true});
  await page.goto(`${base}#/demo`);
  await page.locator('[data-device-frame]').waitFor();
  const panel=page.locator('.info-panel');
  for(const width of [1200,1366,1512,1920]){
    await page.setViewportSize({width,height:1100});
    await page.waitForFunction(()=>Math.abs(document.querySelector('[data-device-frame]').getBoundingClientRect().x+document.querySelector('[data-device-frame]').getBoundingClientRect().width/2-innerWidth/2)<1);
    for(const directory of [true,false]){
      await setWorkspacePanel(page,'页面目录',directory);
      const frame=await page.locator('[data-device-frame]').boundingBox();
      for(const [open,name]of [[openGlobalTools,'global'],[openPageExceptions,'exceptions']]){
        await open(page);
        const dock=await page.locator('.control-dock').boundingBox();
        const global=await page.locator('.global-panel').boundingBox();
        const exceptions=await page.locator('.console-panel').boundingBox();
        assert.ok(global.y+global.height<=exceptions.y,'global controls stay above exceptions');
        assert.ok(exceptions.y+exceptions.height<=1100-24,'both panels fit in desktop viewport');
        assert.equal(await page.locator('.global-panel > header button, .console-panel > header button').count(),0);
        assert.equal(await page.getByRole('button',{name:/打开全局控制台|打开异常控制台|隐藏控制台|折叠控制台/}).count(),0);
        assert.ok(dock.x>=12&&dock.x+dock.width<=frame.x-12,`${width}: ${name} stays left of Demo`);
        if(directory){const rail=await page.locator('.directory-panel').boundingBox();assert.ok(dock.x>=rail.x+rail.width+10,`${width}: controls do not cover directory`)}
        assert.deepEqual(await page.locator('[data-device-frame]').boundingBox(),frame,'control switches keep Demo centered');
        if(width===1512&&directory)await page.screenshot({path:`tests/artifacts/notes-additions/left-${name}.png`});
      }
    }
  }
  await page.setViewportSize({width:1512,height:400});
  await page.waitForFunction(()=>document.querySelector('.control-dock').getBoundingClientRect().bottom<=innerHeight);
  for(const panelClass of ['.global-panel','.console-panel']){
    const header=await page.locator(panelClass+' > header').boundingBox();
    assert.ok(header.y>=0&&header.y+header.height<=400,'both headers remain visible in short windows');
  }
  await page.setViewportSize({width:1512,height:1100});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.global-panel,.console-panel').count(),2,'Escape keeps both controls mounted');
  await setWorkspacePanel(page,'页面目录',true);
  await setWorkspacePanel(page,'交互说明',true);
  const original=await (await context.request.get(`${base}api/notes/pages/devices`)).json();
  await panel.getByRole('button',{name:'编辑',exact:true}).click();
  await panel.getByLabel('编辑密码',{exact:true}).fill(password);
  await panel.getByRole('button',{name:'解锁编辑',exact:true}).click();
  await panel.locator('.note-editor').first().waitFor();
  const index=original.notes.length+1;
  await panel.getByRole('button',{name:'新增说明',exact:true}).click();
  const title=panel.getByRole('textbox',{name:`说明 ${index} 标题`,exact:true});
  const body=panel.getByRole('textbox',{name:`说明 ${index} 正文`,exact:true});
  await title.fill('新增交互说明回归');
  await panel.getByRole('button',{name:'保存到线上',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'每项说明需要标题和正文'}).waitFor();
  assert.equal((await (await context.request.get(`${base}api/notes/pages/devices`)).json()).revision,original.revision,'empty body never persists');
  await body.fill('新增正文第一行\n新增正文第二行');
  await setWorkspacePanel(page,'交互说明',false);
  await setWorkspacePanel(page,'交互说明',true);
  assert.equal(await body.inputValue(),'新增正文第一行\n新增正文第二行');
  await page.screenshot({path:'tests/artifacts/notes-additions/new-title-body.png'});
  await panel.getByRole('button',{name:'保存到线上',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'已保存到线上'}).waitFor();
  const reader=await browser.newContext();
  const saved=await (await reader.request.get(`${base}api/notes/pages/devices`)).json();
  assert.deepEqual(saved.notes.slice(0,-1),original.notes);
  assert.deepEqual({...saved.notes.at(-1),id:undefined},{id:undefined,title:'新增交互说明回归',body:'新增正文第一行\n新增正文第二行',target:''});
  assert.ok(saved.notes.at(-1).id.startsWith('custom-'));
  await page.reload();
  await page.locator('.console-panel').waitFor();
  assert.equal(await page.locator('.global-panel,.console-panel').count(),2,'reload keeps both consoles visible');
  await panel.getByText('新增交互说明回归',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'编辑',exact:true}).click();
  await panel.getByRole('button',{name:`删除说明 ${index}`,exact:true}).click();
  assert.equal(await panel.locator('.note-editor').count(),original.notes.length);
  await panel.getByRole('button',{name:'保存到线上',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'已保存到线上'}).waitFor();
  assert.deepEqual((await (await reader.request.get(`${base}api/notes/pages/devices`)).json()).notes,original.notes);
  await page.setViewportSize({width:375,height:667});
  await openPageExceptions(page);
  const position=await page.evaluate(()=>({dock:document.querySelector('.control-dock').getBoundingClientRect().top+scrollY,stage:document.querySelector('.phone-stage').getBoundingClientRect().bottom+scrollY}));
  assert.ok(position.dock>=position.stage-1,'compact controls follow the Demo without covering it');
  assert.deepEqual(errors,[]);
  await reader.close();
  console.log('PASS: add title/body, required fields, draft preservation, persisted additions, refresh, independent read, removal, left controls at 4 desktop widths and persistent stacked controls. Local notes restored.');
}finally{await browser.close()}
