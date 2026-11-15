import{t as e}from"./active.CF3RI9IG.js";var t=[`--gl-void`,`--gl-shadow`,`--gl-silver`,`--gl-cool`,`--gl-pink`,`--gl-blue`,`--gl-sand`];function n(e){let t=/^#?([0-9a-f]{6})$/i.exec(e.trim());if(!t)return[0,0,0];let n=parseInt(t[1],16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}function r(){let e=getComputedStyle(document.documentElement);return t.map(t=>n(e.getPropertyValue(t)))}var i=`attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`,a=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPtr;
uniform float uPtrAmt;
uniform float uScroll;
uniform vec2 uSeed;
uniform float uScale;
uniform float uDim;
uniform float uAA;
uniform vec3 cVoid, cShadow, cSilver, cCool, cPink, cBlue, cSand;

vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2. - 1.;
}
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(dot(hash22(i), f), dot(hash22(i + vec2(1., 0.)), f - vec2(1., 0.)), u.x),
             mix(dot(hash22(i + vec2(0., 1.)), f - vec2(0., 1.)), dot(hash22(i + vec2(1., 1.)), f - vec2(1., 1.)), u.x), u.y);
}
const mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 3; i++){ s += a * gnoise(p); p = R * p; a *= .5; }
  return s;
}
float fbm4(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 4; i++){ s += a * gnoise(p); p = R * p; a *= .42; }
  return s;
}

// Estudio procedural: lo que "ve" el metal al reflejar. Casi todo negro; unas
// pocas fuentes de luz grandes y tiras finas dan los reflejos de lámina.
vec3 studio(vec3 r){
  vec2 e = r.xy;
  float amb = .018 + .05 * smoothstep(-.9, .9, e.y);
  float box = smoothstep(.55, .0, length((e - vec2(-.42, .5)) * vec2(1., 1.7)));
  float box2 = smoothstep(.42, .0, length((e - vec2(.55, -.35)) * vec2(1.4, 1.))) * .8;
  float s1 = smoothstep(.032 * uAA, .0, abs(dot(e, vec2(.82, .57)) - .2));
  float s2 = smoothstep(.02 * uAA, .0, abs(e.x - .46)) * smoothstep(1., .25, abs(e.y - .05));
  float s3 = smoothstep(.02 * uAA, .0, abs(dot(e, vec2(-.6, .8)) + .38)) * .7;
  float rim = smoothstep(.6, 1.1, length(e)) * .6;
  float l = amb + box * .85 + box2 * .5 + s1 * .8 + s2 * .7 + s3 + rim * .3;
  l = clamp(l, 0., 1.4);
  vec3 col = mix(cShadow, mix(cCool, cSilver, smoothstep(.3, 1., l)), smoothstep(.02, .55, l));
  return col * (.15 + .85 * smoothstep(0., .6, l)) * (.6 + .6 * l);
}

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / min(uRes.x, uRes.y);
  vec2 p = uv * uScale + uSeed;
  p.y += uScroll * .7;
  float t = uTime;

  // domain warping en dos pasos: el flujo viscoso
  vec2 b = p * .75;
  vec2 q = vec2(fbm3(b + vec2(0., t * .5)), fbm3(b + vec2(5.2, 1.3) - vec2(t * .4, 0.)));
  vec2 r = vec2(fbm3(b + 2.6 * q + vec2(1.7, 9.2) + t * .3), fbm3(b + 2.6 * q + vec2(8.3, 2.8) - t * .25));
  vec2 w = 1.8 * r;

  // abolladura que sigue al puntero
  float eps = .02;
  vec2 d0 = uv - uPtr;
  vec2 dx = d0 + vec2(eps / uScale, 0.);
  vec2 dy = d0 + vec2(0., eps / uScale);
  float k = uPtrAmt * .5;
  float h  = fbm4(p * .8 + w) + k * exp(-dot(d0, d0) * 9.);
  float hx = fbm4((p + vec2(eps, 0.)) * .8 + w) + k * exp(-dot(dx, dx) * 9.);
  float hy = fbm4((p + vec2(0., eps)) * .8 + w) + k * exp(-dot(dy, dy) * 9.);

  float bump = 2.9 * (1. - .5 * uScroll);
  vec3 n = normalize(vec3(-(hx - h) / eps * bump * .2, -(hy - h) / eps * bump * .2, 1.));
  vec3 refl = vec3(0., 0., -1.) + 2. * n.z * n;
  vec3 col = studio(refl);

  // especular duro (gotas de luz sobre el líquido)
  vec3 L = normalize(vec3(-.42, .5, .76));
  float spec = pow(max(dot(n, normalize(L + vec3(0., 0., 1.))), 0.), 140. / uAA);
  col += cSilver * spec * 1.4;

  // película delgada: rosa / azul / arena, solo en bordes y brillos
  float thick = h * 2.4 + (1. - n.z) * 4.;
  vec3 film = .5 + .5 * cos(6.2832 * (thick + vec3(0., .33, .67)));
  vec3 iris = mix(mix(cPink, cBlue, film.g), cSand, film.b * .45);
  float lum = dot(col, vec3(.33));
  float edge = smoothstep(.02, .22, 1. - n.z);
  col += iris * pow(lum, 1.6) * edge * .55 * (.35 + film.r);

  // negros profundos y curva de contraste
  col = pow(col, vec3(1.7)) * 1.15;
  col = mix(cVoid, col, .96);

  // viñeta y apagado con el scroll
  float vig = smoothstep(1.25, .15, length(uv * vec2(.72, 1.)));
  col *= mix(.5, 1., vig);
  col *= 1. - uDim;
  col += (hash12(gl_FragCoord.xy + uTime) - .5) / 220.;
  gl_FragColor = vec4(max(col, cVoid * .8), 1.);
}
`,o=class{canvas;gl;u={};colors;constructor(e,t=!1){this.canvas=e;let n=e.getContext(`webgl`,{antialias:!1,alpha:!1,depth:!1,stencil:!1,powerPreference:`low-power`,preserveDrawingBuffer:t});if(!n)throw Error(`webgl`);this.gl=n;let o=(e,t)=>{let r=n.createShader(e);if(n.shaderSource(r,t),n.compileShader(r),!n.getShaderParameter(r,n.COMPILE_STATUS))throw Error(`shader: `+n.getShaderInfoLog(r));return r},s=n.createProgram();if(n.attachShader(s,o(n.VERTEX_SHADER,i)),n.attachShader(s,o(n.FRAGMENT_SHADER,a)),n.linkProgram(s),!n.getProgramParameter(s,n.LINK_STATUS))throw Error(`link`);n.useProgram(s);let c=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,c),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW);let l=n.getAttribLocation(s,`p`);n.enableVertexAttribArray(l),n.vertexAttribPointer(l,2,n.FLOAT,!1,0,0);for(let e of[`uRes`,`uTime`,`uPtr`,`uPtrAmt`,`uScroll`,`uSeed`,`uScale`,`uDim`,`uAA`])this.u[e]=n.getUniformLocation(s,e);this.colors=r(),[`cVoid`,`cShadow`,`cSilver`,`cCool`,`cPink`,`cBlue`,`cSand`].forEach((e,t)=>n.uniform3fv(n.getUniformLocation(s,e),this.colors[t]))}draw(e){let{gl:t,canvas:n}=this;(n.width!==e.w||n.height!==e.h)&&(n.width=e.w,n.height=e.h),t.viewport(0,0,e.w,e.h),t.uniform2f(this.u.uRes,e.w,e.h),t.uniform1f(this.u.uTime,e.time),t.uniform2f(this.u.uPtr,e.ptr?.[0]??9,e.ptr?.[1]??9),t.uniform1f(this.u.uPtrAmt,e.ptrAmt??0),t.uniform1f(this.u.uScroll,e.scroll??0),t.uniform2f(this.u.uSeed,e.seed?.[0]??0,e.seed?.[1]??0),t.uniform1f(this.u.uScale,e.scale??1.7),t.uniform1f(this.u.uDim,e.dim??0),t.uniform1f(this.u.uAA,Math.min(2.2,Math.max(1,640/Math.min(e.w,e.h)))),t.drawArrays(t.TRIANGLES,0,3)}dispose(){this.gl.getExtension(`WEBGL_lose_context`)?.loseContext()}},s=()=>matchMedia(`(prefers-reduced-motion: reduce)`).matches;function c(t,n,r=t){let i;try{i=new o(n,s())}catch{return!1}let a=matchMedia(`(pointer: coarse)`).matches,c=Math.min(window.devicePixelRatio||1,a?2:1.5),l=a?38e4:17e5,u=s(),d=a?Math.min(.8,Math.max(.4,.8/c)):.58,f=.25,p=a?Math.min(.75,Math.max(.5,1/c)):.75,m=a?30:15,h=1,g=1,_=9.3,v=0,y=0,b=!0,x=!1,S=!1,C=0,w={x:9,y:9,tx:9,ty:9,a:0,ta:0},T=[],E=1e3,D=0,O=()=>{let e=t.getBoundingClientRect();h=Math.max(1,e.width),g=Math.max(1,e.height)},k=(e,t)=>{let n=Math.min(d*c,Math.sqrt(l/(h*g))),r=g>h;i.draw({w:Math.max(2,Math.round(h*n)),h:Math.max(2,Math.round(g*n)),time:e,ptr:[w.x,w.y],ptrAmt:w.a,scroll:Math.min(1,window.scrollY/Math.max(1,g)),seed:[3.1,1.7],scale:r?1.5:1.6,dim:t+(r?.2:0)})},A=()=>Math.min(.7,window.scrollY/Math.max(1,g)*.75),j=()=>{x||(x=!0,n.classList.add(`is-live`),t.classList.add(`is-gl`))};if(O(),k(_,0),j(),u)return new ResizeObserver(()=>{O(),k(_,0)}).observe(t),!0;let M={down:!1},N={on:!1,t0:0,done:!1},P={x:0,y:0,live:!1},F=e=>{let n=t.getBoundingClientRect(),r=Math.min(n.width,n.height);w.tx=(e.clientX-n.left-n.width/2)/r,w.ty=-(e.clientY-n.top-n.height/2)/r},I=()=>{N.on=!1,N.done=!0},L=e=>{e.gamma==null||e.beta==null||innerWidth>innerHeight||(P.x=Math.max(-1,Math.min(1,e.gamma/40))*.24,P.y=Math.max(-1,Math.min(1,(e.beta-55)/40))*-.16,P.live=!0)},R=a&&typeof DeviceOrientationEvent<`u`&&typeof DeviceOrientationEvent.requestPermission!=`function`,z=e=>{y=requestAnimationFrame(z);let t=D?e-D:0;if(D=e,t>0&&t<250&&(E=Math.min(E,t),T.push(t)),T.length>=90){T.sort((e,t)=>e-t);let e=T[45];if(T.length=0,e>Math.max(E*2.2,24)){if(d>f)d=Math.max(f,d*.8);else if(++C>=2){if(C=0,m<50)m=50;else{S=!0,V(),k(_,A());return}}}else C=0,e<E*1.25&&d<p&&(d=Math.min(p,d*1.06))}v||=e;let n=e-v;if(!(n<m-2)){if(v=e,_+=Math.min(n,100)*11e-5,!M.down&&N.on){let t=(e-N.t0)/2600;t>=1?(I(),w.ta=0):(w.tx=.26*Math.cos(t*Math.PI*1.5-.5),w.ty=.16*Math.sin(t*Math.PI*2.2),w.ta=Math.min(1,Math.sin(t*Math.PI)*1.6))}else!M.down&&P.live&&(w.tx=P.x,w.ty=P.y,w.ta=.5);w.x+=(w.tx-w.x)*.09,w.y+=(w.ty-w.y)*.09,w.a+=(w.ta-w.a)*.05,k(_,A())}},B=()=>{y||!b||document.hidden||S||(v=0,D=0,T.length=0,R&&addEventListener(`deviceorientation`,L,{passive:!0}),y=requestAnimationFrame(z))},V=()=>{cancelAnimationFrame(y),y=0,removeEventListener(`deviceorientation`,L)},H=e(`hero`,B,V);new IntersectionObserver(([e])=>{b=e.isIntersecting,H.want(b)},{threshold:0}).observe(t),new ResizeObserver(()=>{O(),y||k(_,A())}).observe(t),r.addEventListener(`pointerdown`,e=>{e.pointerType!==`mouse`&&(M.down=!0,I(),F(e),w.x>5&&(w.x=w.tx,w.y=w.ty),w.ta=1)},{passive:!0}),r.addEventListener(`pointermove`,e=>{(e.pointerType===`mouse`||M.down)&&(F(e),w.ta=1)},{passive:!0});let U=()=>{M.down=!1,w.ta=0};return r.addEventListener(`pointerup`,e=>e.pointerType!==`mouse`&&U(),{passive:!0}),r.addEventListener(`pointercancel`,U,{passive:!0}),r.addEventListener(`pointerleave`,()=>w.ta=0),a&&setTimeout(()=>{N.done||M.down||!y||window.scrollY>g*.3||(w.x>5&&(w.x=.3,w.y=0),N.on=!0,N.t0=performance.now())},3e3),n.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),V(),t.classList.remove(`is-gl`),n.classList.remove(`is-live`),x=!1}),n.addEventListener(`webglcontextrestored`,()=>{try{i=new o(n),j(),B()}catch{}}),!0}var l;function u(){if(l===void 0)try{l=new o(document.createElement(`canvas`))}catch{l=null}return l}function d(e,t,n,r=1.5,i=.25){let a=u(),o=e.getContext(`2d`);return!a||!o?!1:(a.draw({w:e.width,h:e.height,time:n,seed:t,scale:r,ptrAmt:0,dim:i}),o.drawImage(a.canvas,0,0),!0)}export{d as drawChromeStill,c as mountChromeHero};