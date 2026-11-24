import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.APP_URL??'http://127.0.0.1:5185/';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Deletion tests run only against local preview.');
const password=(await readFile('.local/editing-password.txt','utf8')).trim();
const browser=await chromium.launch({channel:'chrome',headless:true});
let context,original;
const endpoint=base+'api/notes/pages/devices';
try{
 context=await browser.newContext({viewport:{width:1512,height:1100}});
 original=await(await context.request.get(endpoint)).json();
 assert.ok(original.notes.length>=2&&original.notes.every(note=>note.id),'local notes must have stable identities');
 await writeFile('.local/notes-deletion-backup.json',JSON.stringify(original,null,2),{mode:0o600});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'#/demo');await page.locator('[data-device-frame]').waitFor();
 const panel=page.locator('.info-panel');
 await panel.getByRole('button',{name:'编辑',exact:true}).click();
 await panel.getByLabel('编辑密码',{exact:true}).fill(password);
 await panel.getByRole('button',{name:'解锁编辑',exact:true}).click();
 await panel.locator('.note-editor').first().waitFor();
 assert.equal(await panel.locator('.note-remove').count(),original.notes.length,'every existing note is deletable');
 await mkdir('tests/artifacts/notes-deletion',{recursive:true});
 await page.screenshot({path:'tests/artifacts/notes-deletion/existing-delete-buttons.png'});
 await panel.getByRole('button',{name:'删除说明 1',exact:true}).click();
 assert.equal(await panel.getByRole('textbox',{name:'说明 1 标题',exact:true}).inputValue(),original.notes[1].title);
 assert.equal(await panel.locator('.note-editor').first().getAttribute('data-note-target'),original.notes[1].target);
 assert.equal(await panel.locator('.notes-comparison').count(),0,'remaining note is not compared against deleted note');
 await panel.getByRole('textbox',{name:'说明 1 正文',exact:true}).fill(original.notes[1].body+'\n临时草稿');
 await panel.locator('.notes-comparison summary').click();
 assert.equal(await panel.locator('.notes-comparison p').innerText(),original.notes[1].title+'\n'+original.notes[1].body);
 await panel.getByRole('button',{name:'取消',exact:true}).click();
 assert.deepEqual((await(await context.request.get(endpoint)).json()).notes,original.notes,'cancel never persists deletion');
 await panel.getByRole('button',{name:'编辑',exact:true}).click();
 await panel.getByRole('button',{name:'删除说明 1',exact:true}).click();
 const save=async()=>{await panel.getByRole('button',{name:'保存到线上',exact:true}).click();await panel.getByRole('status').filter({hasText:'已保存到线上'}).waitFor()};
 await save();
 assert.deepEqual((await(await context.request.get(endpoint)).json()).notes,original.notes.slice(1),'saved deletion keeps other ids/targets');
 await page.reload();await panel.getByRole('button',{name:'锁定编辑',exact:true}).waitFor();
 assert.equal(await panel.locator('.tool-body > details').count(),original.notes.length-1);
 await panel.getByRole('button',{name:'编辑',exact:true}).click();
 while(await panel.locator('.note-remove').count())await panel.locator('.note-remove').first().click();
 await panel.getByRole('button',{name:'取消',exact:true}).click();
 assert.equal(await panel.locator('.tool-body > details').count(),original.notes.length-1,'cancel restores a cleared draft');
 await panel.getByRole('button',{name:'编辑',exact:true}).click();
 while(await panel.locator('.note-remove').count())await panel.locator('.note-remove').first().click();
 await save();await panel.getByText('暂无交互说明。',{exact:true}).waitFor();
 assert.deepEqual((await(await context.request.get(endpoint)).json()).notes,[]);
 await page.reload();await panel.getByText('暂无交互说明。',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'锁定编辑',exact:true}).waitFor();
 await panel.getByRole('button',{name:'编辑',exact:true}).click();
 await panel.getByRole('button',{name:'新增说明',exact:true}).click();
 await panel.getByRole('textbox',{name:'说明 1 标题',exact:true}).fill('删除后重新添加');
 await panel.getByRole('textbox',{name:'说明 1 正文',exact:true}).fill('本地回归正文');
 await save();
 const recreated=await(await context.request.get(endpoint)).json();
 assert.equal(recreated.notes.length,1);assert.equal(recreated.notes[0].target,'');assert.match(recreated.notes[0].id,/^custom-/);
 assert.deepEqual(errors,[]);
 console.log('PASS: existing delete buttons, cancel restore, stable connector/comparison after deleting first, save/reload deletion, clear all without default fallback, add again from empty page.');
}finally{
 if(context&&original){
  const current=await(await context.request.get(endpoint)).json();
  if(JSON.stringify(current.notes)!==JSON.stringify(original.notes)){
   const restore=await context.request.put(endpoint,{data:{notes:original.notes,revision:current.revision}});
   assert.equal(restore.status(),200,'restore original local notes');
  }
 }
 await browser.close();
}
