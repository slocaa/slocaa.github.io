(function(){
"use strict";
var C=document.getElementById("c");
var gl=C.getContext("webgl");
if(!gl){document.body.textContent="WebGL required";return;}

var FS='precision highp float;\n'+
'uniform vec2 uR;\n'+
'uniform float uT;\n'+
'uniform vec3 uP;\n'+
'uniform vec2 uA;\n'+
'uniform vec4 uO[5];\n'+
'uniform float uF;\n'+
'#define S 100\n'+
'#define D 80.0\n'+
'#define E 0.001\n'+
'#define B 8\n'+
'#define RX 7.0\n'+
'#define RY 4.0\n'+
'#define RZ 10.0\n'+
'float mW(vec3 p){vec3 d=vec3(RX,RY,RZ)-abs(p);return min(d.x,min(d.y,d.z));}\n'+
'vec2 mO(vec3 p){float b=1e10;float x=-1.0;for(int i=0;i<5;i++){if(uO[i].w<.5)continue;float d=length(p-uO[i].xyz)-.25;if(d<b){b=d;x=float(i);}}return vec2(b,x);}\n'+
'vec2 sc(vec3 p){float w=mW(p);vec2 o=mO(p);if(o.x<w)return vec2(o.x,1.);return vec2(w,0.);}\n'+
'vec3 wN(vec3 p){vec3 a=abs(p);vec3 d=vec3(RX,RY,RZ)-a;if(d.x<d.y&&d.x<d.z)return vec3(-sign(p.x),0,0);if(d.y<d.z)return vec3(0,-sign(p.y),0);return vec3(0,0,-sign(p.z));}\n'+
'vec3 oN(vec3 p){float b=1e10;vec3 c=vec3(0);for(int i=0;i<5;i++){if(uO[i].w<.5)continue;float d=length(p-uO[i].xyz);if(d<b){b=d;c=uO[i].xyz;}}return normalize(p-c);}\n'+
'vec3 rm(vec3 ro,vec3 rd){float t=0.;for(int i=0;i<S;i++){vec2 h=sc(ro+rd*t);if(h.x<E)return vec3(t,h.y,float(i));if(t>D)break;t+=h.x;}return vec3(-1,-1,0);}\n';


// Lighting + materials part of shader
var FS2=
'vec3 gLP(int i){if(i==0)return vec3(2.5,RY-.05,3.5);if(i==1)return vec3(-2.5,RY-.05,3.5);if(i==2)return vec3(2.5,RY-.05,-3.5);return vec3(-2.5,RY-.05,-3.5);}\n'+
'float isLP(vec3 p){if(abs(p.y-RY)>.05)return 0.;float v=0.;for(int i=0;i<4;i++){vec3 l=gLP(i);if(abs(p.x-l.x)<.8&&abs(p.z-l.z)<1.2)v=1.;}return v;}\n'+
'vec3 cL(vec3 p,vec3 n,vec3 V,vec3 al,float ro,float me){\n'+
'  vec3 c=vec3(0);vec3 lc=vec3(1,.96,.9);\n'+
'  for(int i=0;i<4;i++){\n'+
'    vec3 lp=gLP(i);vec3 L=lp-p;float di=length(L);L/=di;\n'+
'    float at=12./(di*di+.5);\n'+
'    float NdL=max(dot(n,L),0.);\n'+
'    vec3 df=al*(1.-me)*NdL;\n'+
'    vec3 H=normalize(L+V);float NdH=max(dot(n,H),0.);\n'+
'    float sp=pow(NdH,2./max(ro*ro,.001))*(1.-ro)*.5;\n'+
'    vec3 sc=mix(vec3(1),al,me);\n'+
'    c+=(df+sc*sp)*lc*at;\n'+
'  }\n'+
'  c+=al*vec3(.02,.02,.04);\n'+
'  float ao=1.;for(int j=1;j<=3;j++){float fi=float(j);float ex=.15*fi;float ac=mW(p+n*ex);ao-=(ex-min(ac,ex))/(fi*.8);}ao=clamp(ao,0.,1.);\n'+
'  return c*ao;\n'+
'}\n'+
'float fres(float ct,float f0){return f0+(1.-f0)*pow(1.-ct,5.);}\n'+
'vec3 fM(vec3 p){vec2 uv=p.xz*.5;vec2 id=floor(uv);vec2 f=fract(uv);float ch=mod(id.x+id.y,2.);vec3 c=mix(vec3(.08,.08,.1),vec3(.12,.12,.15),ch);float gx=smoothstep(0.,.02,f.x)*smoothstep(0.,.02,1.-f.x);float gy=smoothstep(0.,.02,f.y)*smoothstep(0.,.02,1.-f.y);return c*gx*gy;}\n'+
'float wP(vec3 p,vec3 n){vec3 a=abs(n);vec2 uv;if(a.y>.5)uv=p.xz;else if(a.x>.5)uv=p.yz;else uv=p.xy;uv*=.4;vec2 f=fract(uv);return smoothstep(0.,.025,f.x)*smoothstep(0.,.025,1.-f.x)*smoothstep(0.,.025,f.y)*smoothstep(0.,.025,1.-f.y);}\n'+
'vec3 oG(vec3 ro,vec3 rd){vec3 g=vec3(0);for(int i=0;i<5;i++){if(uO[i].w<.5)continue;vec3 oc=uO[i].xyz-ro;float t=max(dot(oc,rd),0.);float d=length(oc-rd*t);float g1=.06/(d*d+.008);float g2=.005/(d*d*d+.0001);float pu=.75+.25*sin(uT*2.5+float(i)*1.7);vec3 c=.5+.5*cos(6.283*(float(i)*.18+vec3(0,.33,.67)));g+=c*(g1+g2)*pu;}return g;}\n';


// Main function of shader
var FS3=
'void main(){\n'+
'  vec2 uv=(gl_FragCoord.xy-uR*.5)/min(uR.x,uR.y);\n'+
'  float yw=uA.x;float pt=uA.y;\n'+
'  vec3 fw=vec3(sin(yw)*cos(pt),sin(pt),-cos(yw)*cos(pt));\n'+
'  vec3 rt=normalize(cross(vec3(0,1,0),fw));\n'+
'  vec3 up=cross(fw,rt);\n'+
'  vec3 rd=normalize(fw+uv.x*rt+uv.y*up);\n'+
'  vec3 ro=uP;\n'+
'  vec3 col=vec3(0);vec3 tp=vec3(1);\n'+
'  for(int bounce=0;bounce<B;bounce++){\n'+
'    col+=tp*oG(ro,rd)*.15;\n'+
'    vec3 hit=rm(ro,rd);\n'+
'    if(hit.x<0.){col+=tp*vec3(.003);break;}\n'+
'    vec3 p=ro+rd*hit.x;\n'+
'    if(hit.y>.5){\n'+
'      vec3 n=oN(p);\n'+
'      vec3 oc=.5+.5*cos(6.283*(uT*.12+vec3(0,.33,.67)));\n'+
'      vec3 lt=cL(p,n,-rd,oc,.1,.3);\n'+
'      col+=tp*(lt*2.+oc*2.);\n'+
'      float fr=fres(abs(dot(rd,n)),.04)*.4;\n'+
'      rd=reflect(rd,n);ro=p+n*.02;tp*=oc*fr;continue;\n'+
'    }\n'+
'    vec3 n=wN(p);\n'+
'    float lp=isLP(p);\n'+
'    if(lp>.5){col+=tp*vec3(1,.97,.92)*4.;break;}\n'+
'    float pn=wP(p,n);\n'+
'    vec3 al=vec3(.92,.92,.95);float ro2=.02;float me=.95;float rf=.92;\n'+
'    if(n.y>.5){al=fM(p);ro2=.05;me=.1;rf=.7;}\n'+
'    if(n.y<-.5){al=vec3(.15,.15,.18);ro2=.3;me=0.;rf=.3;}\n'+
'    al=mix(vec3(.005),al,pn);rf*=pn;\n'+
'    vec3 lt=cL(p,n,-rd,al,ro2,me);\n'+
'    col+=tp*lt*(1.-rf*.5);\n'+
'    float ct=abs(dot(rd,n));float fr=fres(ct,rf);\n'+
'    rd=reflect(rd,n);ro=p+n*.01;\n'+
'    tp*=mix(vec3(1),al,me)*fr;\n'+
'    if(dot(tp,tp)<.0001)break;\n'+
'  }\n'+
'  float lm=dot(col,vec3(.299,.587,.114));\n'+
'  col+=col*smoothstep(1.,3.,lm)*.15;\n'+
'  col+=vec3(.12,.35,1)*uF*.6;\n'+
'  float ca=length(uv)*.003;\n'+
'  col.r*=(1.+ca);col.b*=(1.-ca);\n'+
'  col*=1.-dot(uv,uv)*.4;\n'+
'  col+=vec3(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+uT)*43758.5453)-.5)*.015;\n'+
'  col=col*(2.51*col+.03)/(col*(2.43*col+.59)+.14);\n'+
'  col=pow(clamp(col,0.,1.),vec3(.88));\n'+
'  gl_FragColor=vec4(col,1);\n'+
'}\n';

var FRAG=FS+FS2+FS3;
var VERT='attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}';


// ── GL SETUP ──
function mk(type,src){
  var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
    var e=gl.getShaderInfoLog(s);console.error("SHADER:",e);
    document.body.textContent="Shader error: "+e;return null;
  }return s;
}
var vs=mk(gl.VERTEX_SHADER,VERT);
var fs=mk(gl.FRAGMENT_SHADER,FRAG);
if(!vs||!fs)return;
var pg=gl.createProgram();
gl.attachShader(pg,vs);gl.attachShader(pg,fs);gl.linkProgram(pg);
if(!gl.getProgramParameter(pg,gl.LINK_STATUS)){
  document.body.textContent="Link error: "+gl.getProgramInfoLog(pg);return;
}
gl.useProgram(pg);
var bf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,bf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
var al=gl.getAttribLocation(pg,"a");gl.enableVertexAttribArray(al);
gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);

var U={};
["uR","uT","uP","uA","uF"].forEach(function(n){U[n]=gl.getUniformLocation(pg,n);});
var uO=[];
for(var i=0;i<5;i++)uO.push(gl.getUniformLocation(pg,"uO["+i+"]"));

// ═══ GAME ═══
var RX=7,RY=4,RZ=10;
var px=0,py=0,pz=0,yaw=0,pitch=0;
var started=false,score=0,total=5,tStart=0,flash=0,won=false;
var orbs=[];

function spawn(){
  orbs=[];score=0;won=false;
  for(var i=0;i<total;i++)orbs.push({
    x:(Math.random()-.5)*(RX*2-2),
    y:-RY+.8+Math.random()*(RY*2-2),
    z:(Math.random()-.5)*(RZ*2-2),
    on:true
  });
}
spawn();

var keys={};
window.addEventListener("keydown",function(e){keys[e.code]=true;});
window.addEventListener("keyup",function(e){keys[e.code]=false;});

var locked=false;

// MOUSE — positive movementX = yaw increases = look right
window.addEventListener("mousemove",function(e){
  if(!started)return;
  yaw+=e.movementX*.002;
  pitch-=e.movementY*.002;
  pitch=Math.max(-1.4,Math.min(1.4,pitch));
});

C.addEventListener("click",function(){
  if(!started)return;
  if(!locked)try{C.requestPointerLock();}catch(x){}
  collect();
});

document.getElementById("start-btn").addEventListener("click",function(e){
  e.stopPropagation();
  if(started)return;
  try{C.requestPointerLock();}catch(x){}
  started=true;tStart=performance.now();
  document.getElementById("start-screen").classList.add("hidden");
});

document.addEventListener("pointerlockchange",function(){
  locked=document.pointerLockElement===C;
});


function collect(){
  var fx=Math.sin(yaw)*Math.cos(pitch);
  var fy=Math.sin(pitch);
  var fz=-Math.cos(yaw)*Math.cos(pitch);
  for(var i=0;i<orbs.length;i++){
    if(!orbs[i].on)continue;
    var dx=orbs[i].x-px,dy=orbs[i].y-py,dz=orbs[i].z-pz;
    var dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(dist>15)continue;
    var d=(dx*fx+dy*fy+dz*fz)/dist;
    if(d>.88){
      orbs[i].on=false;score++;flash=1;
      document.getElementById("score-box").textContent="\u2726 "+score+" / "+total;
      var el=document.getElementById("collect-flash");
      el.classList.add("show");
      setTimeout(function(){el.classList.remove("show");},250);
      if(score>=total){
        won=true;
        document.getElementById("msg").textContent="\uD83C\uDF89 ALL ORBS FOUND \u2014 click to play again";
        document.getElementById("msg").style.color="rgba(100,200,255,.7)";
        setTimeout(function(){C.addEventListener("click",restart,{once:true});},500);
      }
      return;
    }
  }
}

function restart(){
  spawn();px=0;py=0;pz=0;tStart=performance.now();won=false;
  document.getElementById("score-box").textContent="\u2726 0 / "+total;
  document.getElementById("msg").textContent="WASD move \u00B7 Mouse look \u00B7 Click to collect orbs";
  document.getElementById("msg").style.color="rgba(255,255,255,.3)";
}

function resize(){
  var dpr=Math.min(window.devicePixelRatio||1,2);
  C.width=window.innerWidth*dpr;C.height=window.innerHeight*dpr;
  gl.viewport(0,0,C.width,C.height);
}
window.addEventListener("resize",resize);resize();

var last=performance.now();
function frame(now){
  var dt=Math.min((now-last)/1000,.05);last=now;
  if(started&&!won){
    var sp=3.8*dt;
    var fx=Math.sin(yaw),fz=-Math.cos(yaw);
    var rx=Math.cos(yaw),rz=Math.sin(yaw);
    if(keys.KeyW){px+=fx*sp;pz+=fz*sp;}
    if(keys.KeyS){px-=fx*sp;pz-=fz*sp;}
    if(keys.KeyA){px-=rx*sp;pz-=rz*sp;}
    if(keys.KeyD){px+=rx*sp;pz+=rz*sp;}
    var m=.4;
    px=Math.max(-RX+m,Math.min(RX-m,px));
    pz=Math.max(-RZ+m,Math.min(RZ-m,pz));
    var el=(now-tStart)/1000;
    var mn=Math.floor(el/60),sc=Math.floor(el%60);
    document.getElementById("timer-box").textContent="\u23F1 "+mn+":"+(sc<10?"0":"")+sc;
  }
  flash*=.9;
  var t=now/1000;
  gl.uniform2f(U.uR,C.width,C.height);
  gl.uniform1f(U.uT,t);
  gl.uniform3f(U.uP,px,py,pz);
  gl.uniform2f(U.uA,yaw,pitch);
  gl.uniform1f(U.uF,flash);
  for(var i=0;i<5;i++){
    var o=orbs[i];
    var bob=o.on?Math.sin(t*1.5+i*2)*.12:0;
    gl.uniform4f(uO[i],o.x,o.y+bob,o.z,o.on?1:0);
  }
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
