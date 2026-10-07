const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const out = path.resolve(process.env.ASHES_TABLET_EVIDENCE || path.join(require('node:os').tmpdir(), 'ashes-tablet-aspect-'+process.pid));
const payload = path.resolve(__dirname, '..');
const started = Date.now();
const report = { started_at: new Date().toISOString(), target: payload, target_kind:'source-candidate',
  request_trace:[], environment: { headless: true, browser_instances: 1, concurrency: 1,
    hooks_read_only: true, hook_start_used: false, native_bridge_emulated: false, service_workers: 'block',
    gpu_disabled: true, physical_device: false, native_ios_runtime: false }, cases: [], cleanup: {} };
const save = () => fs.writeFile(path.join(out, 'tablet-aspect-result.json'), JSON.stringify(report, null, 2)+'\n');
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.css':'text/css','.webmanifest':'application/manifest+json',
  '.otf':'font/otf','.woff2':'font/woff2','.wav':'audio/wav' };
let browser, server, activeCase;
async function screenshot(page, item, name) {
  const file = path.join(out, item.name+'-'+name+'.png');
  await page.screenshot({ path:file, timeout:20000 });
  const bytes = await fs.readFile(file);
  item.screenshots.push({ path:file, bytes:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),transformed:false });
}
async function state(page) {
  return page.evaluate(() => {
    const s = window.__test.getState();
    return {mode:s.mode,time:s.time,paused:s.paused,over:s.over,wave:s.wave,seed:s.seed,vehicleId:s.vehicleId,
      vehicle:s.vehicle?{x:s.vehicle.x,y:s.vehicle.y,hp:s.vehicle.hp,aimX:s.vehicle.aimX,aimY:s.vehicle.aimY}:null,
      input:s.input,stats:s.stats,enemies:s.enemies?.length,bullets:s.bullets?.length,gateChoice:!!s.gateChoice,supplyChoice:!!s.supplyChoice};
  });
}
function check(test, message) { if (!test) throw new Error(message); }
async function tap(page, item, selector) {
  const locator = page.locator(selector);
  await locator.waitFor({state:'visible',timeout:15000});
  const box = await locator.boundingBox();
  const text = await locator.innerText();
  check(box && box.width>=44 && box.height>=44, 'Touch target below 44 CSS px: '+selector);
  check(box.x>=-1 && box.y>=-1 && box.x+box.width<=page.viewportSize().width+1 && box.y+box.height<=page.viewportSize().height+1,'Control not within viewport before touch: '+selector);
  await locator.tap({timeout:15000});
  item.interactions.push({kind:'real-touch-tap',selector,text,box,at_ms:Date.now()-started});
}
async function runCase(spec) {
  const item={...spec,passed:false,interactions:[],states:[],screenshots:[],page_errors:[],console_errors:[],failed_requests:[],http_errors:[]};
  report.cases.push(item);
  const context=await browser.newContext({viewport:spec.viewport,hasTouch:true,isMobile:true,deviceScaleFactor:2,serviceWorkers:'block'});
  try {
    const page=await context.newPage();
    page.on('pageerror',e=>item.page_errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')item.console_errors.push({text:m.text(),location:m.location()});});
    page.on('requestfailed',r=>item.failed_requests.push({url:r.url(),failure:r.failure()?.errorText}));
    page.on('response',r=>{if(r.status()>=400)item.http_errors.push({url:r.url(),status:r.status()});});
    item.phase='load';console.log('SMOKE_PHASE '+spec.name+' load');await save();
    activeCase=spec.name;
    await page.goto(report.local_url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__test?.spritesReady?.(),null,{timeout:120000,polling:250});
    await page.waitForFunction(()=>['sortieBtn','startBtn'].some(id=>{const n=document.getElementById(id);const r=n?.getBoundingClientRect();return n&&!n.hidden&&r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden';}),null,{timeout:30000});
    item.actual_environment=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,maxTouchPoints:navigator.maxTouchPoints,
      capacitorPlatform:window.Capacitor?.getPlatform?.(),native:window.MarsGameNative?.native,version:window.DSVersion,
      sourceScripts:[...document.scripts].map(s=>s.getAttribute('src')).filter(Boolean)}));
    item.states.push({stage:'menu',state:await state(page)});
    item.menu_buttons=await page.locator('button:visible').evaluateAll(nodes=>nodes.map(n=>({id:n.id,text:n.innerText})));
    await screenshot(page,item,'menu');
    const startSelector=await page.locator('#sortieBtn:visible, #startBtn:visible').first().evaluate(n=>'#'+n.id);
    item.phase='ui-start';await tap(page,item,startSelector);
    await page.waitForFunction(()=>window.__test.getState().mode==='playing',null,{timeout:20000});
    item.states.push({stage:'started',state:await state(page)});
    item.geometry=await page.evaluate(()=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};const r=gameCanvas.getBoundingClientRect();const logic=window.DSConfig.LOGIC;return{stage:box('battleStage'),canvas:box('gameCanvas'),backing:{width:gameCanvas.width,height:gameCanvas.height},hud:box('hud'),joystick:box('virtualJoystick'),worldPixelScale:r.width>r.height?{x:r.width/logic.height,y:r.height/logic.width}:{x:r.width/logic.width,y:r.height/logic.height}};});
    const g=item.geometry;
    check(Math.abs(g.worldPixelScale.x-g.worldPixelScale.y)<0.01,'Nonuniform world presentation: '+JSON.stringify(g.worldPixelScale));
    check(g.stage.x>=-1&&g.stage.y>=-1&&g.stage.x+g.stage.width<=spec.viewport.width+1&&g.stage.y+g.stage.height<=spec.viewport.height+1,'Stage outside viewport');
    if(g.canvas.width>g.canvas.height){check(Math.abs(g.backing.width-g.canvas.width)<=0.51&&Math.abs(g.backing.height-g.canvas.height)<=0.51,'Landscape backing not matched to CSS pixels');}
    else check(g.backing.width===390&&g.backing.height===844,'Portrait backing contract changed');
    if(spec.name==='phone-landscape')check(g.backing.width===844&&g.backing.height===390,'844x390 compatibility changed');
    const aimTarget=await page.evaluate(()=>{const r=gameCanvas.getBoundingClientRect();const l=DSConfig.LOGIC;return r.width>r.height?{x:r.left+(1-140/l.height)*r.width,y:r.top+60/l.width*r.height}:{x:r.left+60/l.width*r.width,y:r.top+140/l.height*r.height};});
    const session=await context.newCDPSession(page);
    const point=(x,y)=>({x,y,id:1,radiusX:3,radiusY:3,force:1});
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(aimTarget.x,aimTarget.y)]});
    await page.waitForTimeout(50);
    const aim=await state(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    // Existing touch input shifts aim forward by 28 world units to avoid the
    // finger. Verify both inverse projection and that unchanged touch contract.
    item.interactions.push({kind:'real-touch-aim-inverse',target_world:{x:60,y:140},expected_touch_aim:{x:60,y:112},screen:aimTarget,actual_world:{x:aim.vehicle.aimX,y:aim.vehicle.aimY}});
    check(Math.abs(aim.vehicle.aimX-60)<0.75&&Math.abs(aim.vehicle.aimY-112)<0.75,'Inverse aim / touch offset mapping regression');
    item.phase='move';console.log('SMOKE_PHASE '+spec.name+' real-touch-move');await save();
    const joystick=page.locator('#virtualJoystick');
    await joystick.waitFor({state:'visible',timeout:15000});
    const box=await joystick.boundingBox();check(box&&box.width>=44&&box.height>=44,'Joystick not touch sized');
    const before=await state(page);
    const cx=box.x+box.width/2,cy=box.y+box.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(cx,cy)]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(cx+box.width*0.23,cy+box.height*0.23)]});
    await page.waitForTimeout(850);
    const held=await state(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(150);
    const released=await state(page);
    const movement=Math.hypot(held.vehicle.x-before.vehicle.x,held.vehicle.y-before.vehicle.y);
    item.interactions.push({kind:'real-CDP-touch-drag',selector:'#virtualJoystick',box,before,held,released,movement_world_units:movement});
    check(movement>1,'Joystick did not move vehicle');
    check(held.input.dragging===true&&released.input.dragging===false,'Touch press/release state did not clear');
    const vehiclePoint=await page.evaluate(()=>{const s=window.__test.getState();const l=DSConfig.LOGIC;const r=gameCanvas.getBoundingClientRect();return r.width>r.height?{x:r.left+(1-s.vehicle.y/l.height)*r.width,y:r.top+s.vehicle.x/l.width*r.height}:{x:r.left+s.vehicle.x/l.width*r.width,y:r.top+s.vehicle.y/l.height*r.height};});
    await page.touchscreen.tap(vehiclePoint.x,vehiclePoint.y);
    await page.locator('#quickUpgradeWheel:not([hidden])').waitFor({state:'visible',timeout:8000});
    item.interactions.push({kind:'real-touch-vehicle-hit',screen:vehiclePoint,wheel_opened:true});
    await tap(page,item,'#quickUpgradeCloseBtn');
    await page.waitForFunction(()=>quickUpgradeWheel.hidden);
    item.phase='natural-combat';
    await page.waitForTimeout(6500);
    const combat=await state(page);item.states.push({stage:'natural-combat',state:combat});
    check(combat.mode==='playing'&&combat.time>before.time+4,'Natural game progression missing');
    check((combat.enemies||0)>0||(combat.stats?.kills||0)>0,'No natural enemies or kills');
    await screenshot(page,item,'combat');
    item.phase='pause-resume';await tap(page,item,'#pauseBtn');
    await page.waitForFunction(()=>window.__test.getState().mode==='paused',null,{timeout:10000});
    const paused=await state(page);await page.waitForTimeout(700);const stillPaused=await state(page);
    item.states.push({stage:'paused',state:paused},{stage:'pause-held-700ms',state:stillPaused});
    check(Math.abs(stillPaused.time-paused.time)<0.02,'World time advanced during pause');
    await screenshot(page,item,'pause');
    await tap(page,item,'#resumeBtn');
    await page.waitForFunction(()=>window.__test.getState().mode==='playing',null,{timeout:10000});
    await page.waitForTimeout(850);const resumed=await state(page);item.states.push({stage:'resumed',state:resumed});
    check(resumed.time>stillPaused.time+0.3,'Resume did not advance time');
    item.phase='settle-return';await tap(page,item,'#pauseBtn');await tap(page,item,'#quitBtn');
    await page.locator('#settlementPanel:not([hidden])').waitFor({state:'visible',timeout:15000});
    item.states.push({stage:'settlement',state:await state(page),title:await page.locator('#settlementTitle').innerText()});
    await screenshot(page,item,'settlement');
    const beforeScroll=await page.locator('#garageBtn').boundingBox();
    for(let n=0;n<10;n++){
      const button=await page.locator('#garageBtn').boundingBox();
      if(button.y>=0&&button.y+button.height<=spec.viewport.height)break;
      const panel=await page.locator('#settlementPanel').boundingBox();
      const x=panel.x+panel.width*0.75, y=Math.min(spec.viewport.height-35,panel.y+panel.height-35), end=Math.max(panel.y+55,45);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(x,y)]});
      for(let step=1;step<=8;step++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(x,y+(end-y)*step/8)]});await page.waitForTimeout(25);}
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
      item.interactions.push({kind:'real-touch-scroll',selector:'#settlementPanel',from:{x,y},to:{x,y:end}});
    }
    item.return_scroll={before:beforeScroll,after:await page.locator('#garageBtn').boundingBox(),touch_swipes:item.interactions.filter(x=>x.kind==='real-touch-scroll').length};
    await tap(page,item,'#garageBtn');
    await page.locator('#garagePanel:not([hidden])').waitFor({state:'visible',timeout:15000});
    item.states.push({stage:'returned',state:await state(page)});await screenshot(page,item,'returned');
    check(item.page_errors.length===0,'JavaScript page errors occurred');
    check(item.failed_requests.length===0&&item.http_errors.length===0,'Payload request failures occurred');
    item.passed=true;item.phase='complete';console.log('SMOKE_CASE_PASS '+spec.name);
  } catch(e) {item.error=String(e.stack||e);console.log('SMOKE_CASE_FAIL '+spec.name+' '+e.message);}
  finally {await context.close();item.context_closed=true;await save();}
}
(async()=>{
  try {
    await fs.mkdir(out,{recursive:true});
    report.source_sha256={};for(const rel of ['index.html','src/game.js','scripts/test-tablet-aspect.js'])report.source_sha256[rel]=crypto.createHash('sha256').update(await fs.readFile(path.join(payload,rel))).digest('hex');
    server=http.createServer(async(req,res)=>{
      const request={case:activeCase,method:req.method,url:'http://127.0.0.1:'+server.address().port+req.url,fetch_dest:req.headers['sec-fetch-dest'],at_ms:Date.now()-started};
      try{const u=new URL(req.url,'http://localhost');const file=path.resolve(payload,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
        if(!file.startsWith(payload+path.sep)){res.writeHead(403);res.end();return;}
        const data=await fs.readFile(file);request.status=200;res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
      }catch{request.status=404;res.writeHead(404);res.end('not found');}
      finally{report.request_trace.push(request);}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    report.local_url='http://127.0.0.1:'+server.address().port+'/';
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined,executablePath:process.env.ASHES_CHROME||undefined,args:['--disable-gpu','--disable-accelerated-2d-canvas']});
    report.browser_version=browser.version();
    for(const spec of [{name:'phone-landscape',viewport:{width:844,height:390}},{name:'phone-portrait',viewport:{width:390,height:844}},
      {name:'tablet-landscape',viewport:{width:1024,height:768}},{name:'tablet-portrait',viewport:{width:768,height:1024}}])await runCase(spec);
  } catch(e){report.fatal=String(e.stack||e);}
  finally{
    if(browser){await browser.close();report.cleanup.browser_closed=true;}
    if(server){await new Promise(resolve=>server.close(resolve));report.cleanup.server_closed=true;}
    report.elapsed_ms=Date.now()-started;report.finished_at=new Date().toISOString();
    report.passed=report.cases.length===4&&report.cases.every(c=>c.passed)&&!report.fatal;
    await save();console.log('SMOKE_FINAL '+JSON.stringify({passed:report.passed,elapsed_ms:report.elapsed_ms,cases:report.cases.map(c=>({name:c.name,passed:c.passed,error:c.error})),cleanup:report.cleanup}));
    process.exitCode=report.passed?0:1;
  }
})();
