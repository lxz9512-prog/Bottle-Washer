import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.APP_URL??'http://127.0.0.1:5185/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 await mkdir('tests/artifacts/self-clean',{recursive:true});
 for(const experience of['app','demo'])for(const model of['bw05s','bw05p','bw05a']){
  const context=await browser.newContext({viewport:experience==='app'?{width:390,height:844}:{width:1512,height:1100}});
  const prefix=`BW05S_${experience}_v1:`+(model==='bw05s'?'':`models:${model}:`);
  await context.addInitScript(({prefix})=>{
   const legacy=['wash','sterilize','dry','keep-warm'].map((id,index)=>({id,label:id,enabled:id==='wash',duration:[29,9,55,72][index],min:[19,7,40,10][index],max:[45,10,70,72][index],step:[1,1,5,1][index],unit:index===3?'h':'min'}));
   const key=prefix+'mode-preferences';
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({names:{},steps:{'self-clean':legacy},customIds:['custom']}));
  },{prefix});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}#/${experience}/cleaning-machine/models/${model}/home`);
  const screen=page.locator(experience==='app'?'[data-app-screen]':'[data-device-screen]');
  await screen.locator('[data-mode=self-clean]').waitFor();
  assert.equal(await screen.locator('[data-mode=self-clean] .bw-card-duration').innerText(),'30 分钟');
  const open=async()=>{await screen.locator('[data-mode=self-clean] .bw-mode-open').click();await page.getByRole('dialog',{name:'机器清洁',exact:true}).waitFor();await page.waitForTimeout(350)};
  const dialog=page.getByRole('dialog',{name:'机器清洁',exact:true});
  await open();
  const rows=dialog.locator('.bw-preset-step');
  assert.equal(await rows.count(),2);assert.equal(await dialog.locator('.bw-storage-section').count(),0);
  assert.deepEqual(await rows.locator('.bw-preset-label').allTextContents(),['清洗','烘干']);
  assert.deepEqual(await rows.locator('strong').allTextContents(),['20 分钟','10 分钟']);
  assert.equal(await dialog.locator('.bw-cycle-duration').innerText(),'清洗周期时长 · 30 分钟');
  assert.ok(await rows.evaluateAll(nodes=>nodes.every(node=>node.disabled&&node.getAttribute('aria-checked')==='true')));
  await rows.evaluateAll(nodes=>nodes.forEach(node=>node.click()));
  assert.ok(await rows.evaluateAll(nodes=>nodes.every(node=>node.getAttribute('aria-checked')==='true')),'neither step can be deselected');
  await page.screenshot({path:`tests/artifacts/self-clean/${experience}-${model}-options.png`});
  await dialog.getByRole('button',{name:'收起浮窗',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.reload();await screen.locator('[data-mode=self-clean]').waitFor();await open();
  assert.deepEqual(await rows.locator('strong').allTextContents(),['20 分钟','10 分钟'],'legacy preferences cannot bring back old durations');
  await dialog.getByRole('button',{name:'开始清洗',exact:true}).click();await screen.locator('.bw-progress').waitFor();
  assert.equal(await screen.locator('.bw-run-title').innerText(),'机器清洁');
  assert.match(await screen.locator('.bw-run-time').innerText(),/30/);
  assert.equal(await screen.locator('.bw-progress-row.pending').filter({hasText:'烘干'}).locator('span').last().innerText(),'10min');
  await screen.getByRole('button',{name:'暂停或继续清洗',exact:true}).click();
  await screen.getByRole('button',{name:'编辑',exact:true}).click();await dialog.waitFor();
  assert.equal(await dialog.getByRole('checkbox').count(),2);
  assert.ok(await dialog.getByRole('checkbox').evaluateAll(nodes=>nodes.every(node=>node.disabled&&node.getAttribute('aria-checked')==='true')),'paused editor keeps both steps required');
  assert.equal(await dialog.getByRole('textbox').count(),0,'fixed durations have no editor');
  await dialog.getByRole('button',{name:'完成',exact:true}).click();await dialog.waitFor({state:'hidden'});
  if(experience==='app'){
   const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),prefix+'machine');
   assert.deepEqual(stored.customConfig.filter(step=>step.enabled).map(step=>[step.id,step.duration]),[['wash',20],['dry',10]]);
   await page.evaluate(({key,elapsed})=>{const state=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...state,elapsedSeconds:elapsed,isRunning:false,runStartedAt:null}))},{key:prefix+'machine',elapsed:20*60});
   await page.reload();await screen.locator('.bw-progress-row.active').waitFor();
   assert.match(await screen.locator('.bw-progress-row.active').innerText(),/烘干/);
   assert.equal(await screen.locator('.bw-progress-row.active span').last().innerText(),'10min');
   await page.evaluate(({key})=>{const state=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...state,elapsedSeconds:30*60,isRunning:false,runStartedAt:null}))},{key:prefix+'machine'});
   await page.reload();await screen.getByRole('button',{name:'暂停或继续清洗',exact:true}).getByText('完成',{exact:true}).waitFor();
   assert.equal(await screen.locator('.bw-progress-row.completed').count(),2,'cycle completes after 30 minutes without storage');
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: S/P/A in mobile and PC, wash20+dry10, both required at selection and paused editing, legacy preferences ignored, 30-minute run and dry transition/completion.');
}finally{await browser.close()}
