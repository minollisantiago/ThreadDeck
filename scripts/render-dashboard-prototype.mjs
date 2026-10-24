// Throwaway visual proposals, not a running dashboard. Uses synthetic data only.
import { chromium } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const output=path.resolve('artifacts/dashboard-proposals')
await mkdir(output,{recursive:true})
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})
try {
 const page=await browser.newPage({viewport:{width:430,height:1100},deviceScaleFactor:1})
 const base=pathToFileURL(path.resolve('src/App.prototype.html'))
 for(const variant of ['A','B','C']){
  const images=[]
  for(const appearance of ['dark','light']){
   const url=new URL(base);url.search=new URLSearchParams({variant,appearance,capture:'1'}).toString()
   await page.goto(url.href);await page.evaluate(()=>document.fonts.ready)
   const filename=path.join(output,`${variant}-${appearance}.png`)
   await page.screenshot({path:filename});images.push(`data:image/png;base64,${(await readFile(filename)).toString('base64')}`)
  }
  const board=await browser.newPage({viewport:{width:916,height:1164},deviceScaleFactor:1})
  await board.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#25232d;color:#f4f3f6;font:12px monospace}.labels{display:flex;justify-content:space-between;padding:18px 20px}.screens{display:flex;gap:16px;padding:0 20px}img{width:430px;height:1100px;border:1px solid #ffffff16;border-radius:10px}</style><div class="labels"><b>${variant} · ${{A:'FRAMED PROJECTS',B:'ATTENTION LANES',C:'THREAD LEDGER'}[variant]}</b><span>DARK / LIGHT · 430px</span></div><div class="screens"><img src="${images[0]}"><img src="${images[1]}"></div>`)
  await board.screenshot({path:path.join(output,`${variant}-comparison.png`)});await board.close()
 }
 await page.setViewportSize({width:1440,height:1050})
 await page.goto(`${base.href}?variant=A&appearance=light&capture=1`);await page.evaluate(()=>document.fonts.ready)
 await page.screenshot({path:path.join(output,'A-wide.png')})
 for(const dark of ['charcoal','midnight','graphite']){
  await page.setViewportSize({width:430,height:1100})
  await page.goto(`${base.href}?variant=A&appearance=dark&dark=${dark}&capture=1`);await page.evaluate(()=>document.fonts.ready)
  const image=await page.screenshot()
  const board=await browser.newPage({viewport:{width:470,height:1164},deviceScaleFactor:1})
  await board.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#302d38;color:#f4f3f6;font:12px monospace}.label{padding:18px 20px}img{display:block;margin:0 20px;width:430px;height:1100px;border:1px solid #ffffff20;border-radius:10px}</style><div class="label">${{charcoal:'1 · CHARCOAL — closest to the loader',midnight:'2 · MIDNIGHT — cool ink + pink',graphite:'3 · GRAPHITE — raised, higher contrast'}[dark]}</div><img src="data:image/png;base64,${image.toString('base64')}">`)
  await board.screenshot({path:path.join(output,`A-dark-${dark}.png`)});await board.close()
 }
 console.log(`Dashboard proposals rendered to ${output}. Open src/App.prototype.html to compare layouts, themes, search and filters.`)
}finally{await browser.close()}
