const fs = require('fs');

const file='qaReport.json';

if(!fs.existsSync(file)){
 fs.writeFileSync(file,JSON.stringify([],null,2));
}

module.exports = async(page,scenario)=>{

let issues=[];
let hasError=false;

/* ---------------- ERRORS ---------------- */

page.on('pageerror',err=>{
 hasError=true;
 issues.push(`JS Error: ${err.message}`);
});

page.on('requestfailed',req=>{
 hasError=true;
 issues.push(`Failed Request: ${req.url()}`);
});

page.on('console',msg=>{
 if(msg.type()==='error'){
   issues.push(`Console Error: ${msg.text()}`);
 }
});

/* ---------------- LOAD ---------------- */

await page.waitForSelector('body',{timeout:30000});
await page.waitForTimeout(5000);

/* ---------------- STABILIZE ---------------- */

await page.evaluate(()=>{

 document.querySelectorAll(
 '.ads,.popup,.modal,.cookie-banner'
 ).forEach(el=>el.remove());

 const style=document.createElement('style');

 style.innerHTML=`
 *,*:before,*:after{
  animation:none !important;
  transition:none !important;
 }
 `;

 document.head.appendChild(style);

});

/* ---------------- BROKEN IMAGES ---------------- */

const brokenImages=await page.evaluate(()=>{
 let count=0;

 document.querySelectorAll('img').forEach(img=>{
  if(!img.complete || img.naturalWidth===0){
    img.style.border='3px solid red';
    count++;
  }
 });

 return count;
});

if(brokenImages>0){
 issues.push(`Broken images: ${brokenImages}`);
}

/* ---------------- OVERFLOW ---------------- */

const overflowCount=await page.evaluate(()=>{
 let count=0;

 document.querySelectorAll('*').forEach(el=>{

   const r=el.getBoundingClientRect();

   if(
      r.right > window.innerWidth+3 &&
      getComputedStyle(el).position!=='fixed'
   ){
      el.style.outline='3px solid orange';
      count++;
   }

 });

 return count;
});

if(overflowCount>0){
 issues.push(`Overflow elements: ${overflowCount}`);
}

/* ---------------- OVERLAPS ---------------- */

const overlaps=await page.evaluate(()=>{

let count=0;

document.querySelectorAll(
'button,a,img,.card,input'
).forEach(el=>{

const r=el.getBoundingClientRect();

if(r.width<10 || r.height<10) return;

const topEl=document.elementFromPoint(
r.left+5,
r.top+5
);

if(
 topEl &&
 topEl!==el &&
 !el.contains(topEl)
){
 count++;
 el.style.outline='3px solid purple';
}

});

return count;

});

if(overlaps>0){
 issues.push(`Possible overlaps: ${overlaps}`);
}

/* ---------------- EMPTY BLOCKS ---------------- */

const emptyBlocks=await page.evaluate(()=>{

let count=0;

document.querySelectorAll(
'p,span,div'
).forEach(el=>{

 if(
   el.innerText.trim()==='' &&
   el.children.length===0
 ){
   count++;
 }

});

return count;

});

if(emptyBlocks>5){
 issues.push(`Empty elements: ${emptyBlocks}`);
}

/* ---------------- BUTTONS ---------------- */

const buttonIssues=await page.evaluate(()=>{

let bad=0;

document.querySelectorAll('button')
.forEach(btn=>{

const r=btn.getBoundingClientRect();

if(r.width<40 || r.height<20){
 bad++;
}

});

return bad;

});

if(buttonIssues>0){
 issues.push(
 `Misaligned/small buttons: ${buttonIssues}`
);
}

/* ---------------- BAD LINKS ---------------- */

const badLinks=await page.$$eval(
'a',
links=>
links.filter(
a=>!a.getAttribute('href')
).length
);

if(badLinks>0){
 issues.push(`Potential bad links: ${badLinks}`);
}

/* ---------------- CLS ---------------- */

const shifting=await page.evaluate(()=>{
try{
 return performance
 .getEntriesByType('layout-shift')
 .length;
}catch(e){
 return 0;
}
});

if(shifting>0){
 issues.push(`Layout shifts: ${shifting}`);
}

/* ---------------- FAQ ---------------- */

const faqCount=await page.$$eval(
'.faq,.accordion',
els=>els.length
);

if(faqCount>0){
 issues.push(
 `FAQ sections found: ${faqCount}`
);
}

/* ---------------- MODAL CLOSE ---------------- */

const closeButtons=await page.$$eval(
'.close,.modal-close,[aria-label="Close"]',
els=>els.length
);

if(closeButtons>0){
 issues.push(
 `Modal close buttons found: ${closeButtons}`
);
}

/* ===================================================
   NEW VISUAL HEURISTIC CHECKS
=================================================== */

/* ---- TEXT CONTRAST ---- */

const contrastIssues = await page.evaluate(()=>{

let bad=0;

function lum(rgb){
 const m=rgb.match(/\d+/g);
 if(!m) return 1;

 let [r,g,b]=m.map(v=>{
   v/=255;
   return v<=0.03928
    ? v/12.92
    : Math.pow((v+.055)/1.055,2.4);
 });

 return .2126*r+.7152*g+.0722*b;
}

document.querySelectorAll(
'p,h1,h2,h3,span,a'
).forEach(el=>{

 if(el.innerText.trim().length<3) return;

 const s=getComputedStyle(el);

 const l1=lum(s.color);
 const l2=lum(s.backgroundColor);

 const ratio=
(Math.max(l1,l2)+0.05)/
(Math.min(l1,l2)+0.05);

 if(ratio<3){
   bad++;
   el.style.outline='3px solid red';
 }

});

return bad;

});

if(contrastIssues>0){
issues.push(
`Low contrast text: ${contrastIssues}`
);
}

/* ---- ALIGNMENT ---- */

const alignmentIssues=await page.evaluate(()=>{

let bad=0;

document.querySelectorAll(
'section,img,button,.card'
).forEach(el=>{

 const r=el.getBoundingClientRect();

 if(
  r.width>200 &&
  Math.abs(
   ((r.left+r.right)/2)-
   (window.innerWidth/2)
  )>120
 ){
   bad++;
   el.style.outline='3px solid cyan';
 }

});

return bad;

});

if(alignmentIssues>0){
issues.push(
`Alignment issues: ${alignmentIssues}`
);
}

/* ---- FADED LINKS ---- */

const weakLinks=await page.evaluate(()=>{

let bad=0;

document.querySelectorAll('a').forEach(a=>{

 const s=getComputedStyle(a);

 if(
   parseFloat(s.opacity)<0.7
 ){
   bad++;
   a.style.outline='3px solid yellow';
 }

});

return bad;

});

if(weakLinks>0){
issues.push(
`Weak/faded links: ${weakLinks}`
);
}

/* ---- SPACING ---- */

const spacingIssues=await page.evaluate(()=>{

let bad=0;

document.querySelectorAll(
'button,p,a,input'
).forEach(el=>{

const r=el.getBoundingClientRect();

if(
 r.height<18 ||
 r.width<30
){
 bad++;
}

});

return bad;

});

if(spacingIssues>0){
issues.push(
`Spacing issues: ${spacingIssues}`
);
}

/* ---------------- BLANK PAGE ---------------- */

const bodyText=await page.evaluate(
()=>document.body.innerText
);

if(
 !bodyText ||
 bodyText.trim().length===0 ||
 hasError
){

issues.push('Page load error / blank page');

await page.evaluate(()=>{

const div=document.createElement('div');

div.innerText='⚠ PAGE LOAD ERROR';
div.style.position='fixed';
div.style.top='10px';
div.style.left='10px';
div.style.background='red';
div.style.color='white';
div.style.padding='10px';
div.style.zIndex='999999';

document.body.appendChild(div);

});

}

/* ---------------- REPORT ---------------- */

if(issues.length>0){

const report=
JSON.parse(
fs.readFileSync(file)
);

const viewport=
await page.evaluate(
()=>`${window.innerWidth}x${window.innerHeight}`
);

report.push({
page:scenario?.label||'unknown',
url:scenario?.url,
device:viewport,
issues:[...new Set(issues)],
timestamp:new Date().toISOString()
});

fs.writeFileSync(
file,
JSON.stringify(report,null,2)
);

}

};