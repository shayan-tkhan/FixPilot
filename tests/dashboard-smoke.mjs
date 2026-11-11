import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
mkdirSync('work',{recursive:true});
const base=process.env.BASE_URL || 'http://localhost:3000';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
for(const role of ['reporter','reviewer','operator','admin']){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const response=await context.request.post(base+'/api/login',{headers:{Origin:base},data:{email:role+'@fixpilot.demo',password:'demo123'}});assert.equal(response.status(),200);
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/operations');await p.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await p.getByRole('heading',{name:'Quick access',exact:true}).waitFor();
 assert.equal(await p.locator('.dashboard-metric').count(),4);assert.equal(await p.locator('.dashboard-section').count(),4);
 const data=await(await context.request.get(base+'/api/coordination')).json();
 const expected=role==='reporter'?data.issues.filter(i=>!['Resolved','Closed'].includes(i.status)).length:role==='operator'?data.cases.filter(i=>i.status==='Assigned').length:role==='reviewer'?data.cases.filter(i=>i.status==='Needs triage').length:data.cases.filter(i=>!['Resolved','Closed'].includes(i.status)).length;
 assert.equal(Number(await p.locator('.dashboard-metric strong').first().innerText()),expected);
 await p.screenshot({path:'work/dashboard-'+role+'.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:'work/dashboard-'+role+'-mobile.png',fullPage:true});
 await p.locator('.dashboard-metric').first().click();await p.getByRole('heading',{name:role==='reporter'?'My Issues':role==='operator'?'My Tasks':'Issues',exact:true}).waitFor();
 assert.equal(await p.locator('.role-dashboard').count(),0);await context.close();console.log(role+' dashboard: matching counts, shared panels, mobile and metric navigation passed.');
}
assert.deepEqual(errors,[]);await browser.close();
