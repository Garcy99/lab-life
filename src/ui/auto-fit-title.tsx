import {useLayoutEffect,useRef} from 'react';

// The parent reserves a stable box. Measure real wrapping with the loaded font,
// then choose the largest size that fits both dimensions without truncation.
export default function AutoFitTitle({text,as='h2'}:{text:string;as?:'h2'|'h3'}){
 const box=useRef<HTMLDivElement>(null),heading=useRef<HTMLHeadingElement>(null);
 useLayoutEffect(()=>{
  const container=box.current,el=heading.current;if(!container||!el)return;
  let disposed=false;
  const fit=()=>{
   if(disposed||container.clientWidth<1||container.clientHeight<1)return;
   el.style.removeProperty('font-size');
   const max=parseFloat(getComputedStyle(el).fontSize),fits=()=>el.scrollWidth<=container.clientWidth&&el.scrollHeight<=container.clientHeight&&el.getBoundingClientRect().height<=container.getBoundingClientRect().height;
   if(fits())return;
   let low=1,high=max;
   for(let i=0;i<12;i++){const mid=(low+high)/2;el.style.fontSize=mid+'px';if(fits())low=mid;else high=mid}
   el.style.fontSize=(Math.floor(low*10)/10)+'px';
  };
  fit();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit);observer?.observe(container);
  document.fonts?.ready.then(fit);document.fonts?.addEventListener('loadingdone',fit);
  return()=>{disposed=true;observer?.disconnect();document.fonts?.removeEventListener('loadingdone',fit)};
 },[text]);
 const Tag=as;
 return <div className="fit-title-box" ref={box}><Tag ref={heading}>{text}</Tag></div>;
}

