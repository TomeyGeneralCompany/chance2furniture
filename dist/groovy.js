(() => {
  'use strict';
  const canvas=document.getElementById('groovy-background'),ctx=canvas?.getContext('2d');
  if(!ctx)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const style=getComputedStyle(document.documentElement);
  const palette=['#6a109d',style.getPropertyValue('--ink').trim(),style.getPropertyValue('--teal').trim(),style.getPropertyValue('--ink').trim(),style.getPropertyValue('--cream').trim(),style.getPropertyValue('--ink').trim()];
  let width=0,height=0,frame=0,last=0,phase=0,scroll=window.scrollY,targetScroll=scroll;
  let pointer={x:innerWidth/2,y:innerHeight/2},target={...pointer};
  function resize(){width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);request();}
  function boundary(x,y){const bend=Math.exp(-Math.pow((x-pointer.x)/(width*.34),2));return y+Math.sin(x/180+y/260+phase+scroll/650)*65+Math.sin(x/350-y/190+phase*.55)*45+bend*Math.sin(y/210+pointer.y/height*3)*95;}
  function draw(){ctx.fillStyle=palette[1];ctx.fillRect(0,0,width,height);const stripe=26,start=-360,end=height+360;
    for(let y=start,i=0;y<end;y+=stripe,i++){ctx.beginPath();for(let x=-30;x<=width+30;x+=18){const z=boundary(x,y);x===-30?ctx.moveTo(x,z):ctx.lineTo(x,z);}for(let x=width+30;x>=-30;x-=18)ctx.lineTo(x,boundary(x,y+stripe+1));ctx.closePath();ctx.fillStyle=palette[i%palette.length];ctx.fill();}}
  function tick(now){frame=0;const dt=Math.min((now-(last||now))/1000,.05);last=now;
    if(!motion.matches){phase+=dt*.09;pointer.x+=(target.x-pointer.x)*.09;pointer.y+=(target.y-pointer.y)*.09;scroll+=(targetScroll-scroll)*.1;}
    draw();if(!motion.matches&&!document.hidden)request();}
  function request(){if(!frame&&!document.hidden)frame=requestAnimationFrame(tick);}
  addEventListener('pointermove',e=>{target={x:e.clientX,y:e.clientY};request();},{passive:true});
  addEventListener('scroll',()=>{targetScroll=window.scrollY;request();},{passive:true});
  addEventListener('resize',resize,{passive:true});
  motion.addEventListener('change',()=>{last=0;request();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{last=0;request();}});
  resize();
})();
