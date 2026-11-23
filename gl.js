// Pic rendering engine: one WebGL2 pipeline used for the live preview and the full-resolution export.
// Order of operations follows a raw-converter style: white balance → exposure → tone → colour → HSL → look curves → detail → effects.

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

// Gaussian blur, one direction per pass
const BLUR = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D t; uniform vec2 dir;
void main(){
  vec4 s = texture(t,uv)*0.2270270270;
  s += (texture(t,uv+dir*1.3846153846)+texture(t,uv-dir*1.3846153846))*0.3162162162;
  s += (texture(t,uv+dir*3.2307692308)+texture(t,uv-dir*3.2307692308))*0.0702702703;
  o = s;
}`;

// copy with geometry transform (crop / rotate / flip / straighten)
const COPY = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D t; uniform mat3 M;
void main(){ vec2 s=(M*vec3(uv,1.)).xy; o = texture(t,clamp(s,0.,1.)); }`;

const MAIN = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D src; uniform sampler2D bS; uniform sampler2D bL; uniform sampler2D lut;
uniform float exposure, brightness, contrast, highlights, shadows, whites, blacks, saturation, vibrance, warmth, tint;
uniform float clarity, sharpen, vignette, grain, fade, glow, mono, lutAmt, original;
uniform vec3 shTone, hiTone; uniform float toneBal;
uniform float hslH[8], hslS[8], hslL[8];
uniform vec2 res; uniform float grainScale;
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec3 rgb2hsl(vec3 c){ float mx=max(max(c.r,c.g),c.b), mn=min(min(c.r,c.g),c.b), l=(mx+mn)*.5, h=0., s=0.;
  if(mx>mn){ float d=mx-mn; s = l>.5 ? d/(2.-mx-mn) : d/(mx+mn);
    if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.:0.); else if(mx==c.g) h=(c.b-c.r)/d+2.; else h=(c.r-c.g)/d+4.; h/=6.; }
  return vec3(h,s,l); }
float h2r(float p,float q,float t){ t=fract(t); if(t<1./6.) return p+(q-p)*6.*t; if(t<.5) return q; if(t<2./3.) return p+(q-p)*(2./3.-t)*6.; return p; }
vec3 hsl2rgb(vec3 h){ if(h.y==0.) return vec3(h.z); float q=h.z<.5?h.z*(1.+h.y):h.z+h.y-h.z*h.y, p=2.*h.z-q; return vec3(h2r(p,q,h.x+1./3.),h2r(p,q,h.x),h2r(p,q,h.x-1./3.)); }
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec3 c = texture(src,uv).rgb;
  if(original>.5){ o=vec4(c,1.); return; }
  vec3 bs = texture(bS,uv).rgb, bl = texture(bL,uv).rgb;
  // detail first, on the original signal
  c += (c-bs)*sharpen*1.6;
  float lc = luma(c);
  float mid = 1.-pow(abs(lc*2.-1.),2.);
  c += (c-bl)*clarity*0.9*mid;
  c = max(c,0.);
  // white balance
  c *= vec3(1.+warmth*.18, 1.+tint*-.10, 1.-warmth*.18) * vec3(1.+tint*.06,1.,1.+tint*.06);
  // exposure (stops)
  c *= exp2(exposure*2.);
  // tone
  float L = luma(c);
  float hiM = smoothstep(.35,1.,L), shM = 1.-smoothstep(0.,.65,L);
  c += c*highlights*.5*hiM;
  c += (shadows*.45)*shM*(1.-c)*.9;
  c = mix(c, c+ (whites*.25), smoothstep(.55,1.,L));
  c = mix(c, c+ (blacks*.3), 1.-smoothstep(0.,.45,L));
  c = pow(max(c,0.), vec3(1./(1.+brightness*.55)));
  c = (c-.5)*(1.+contrast*.75)+.5;
  c = clamp(c,0.,1.);
  // saturation and vibrance
  float g = luma(c);
  float satNow = max(max(c.r,c.g),c.b)-min(min(c.r,c.g),c.b);
  c = mix(vec3(g), c, 1.+saturation);
  c = mix(vec3(g), c, 1.+vibrance*(1.-satNow)*1.3);
  c = clamp(c,0.,1.);
  // 8-band HSL
  vec3 h = rgb2hsl(c);
  float centers[8] = float[8](0.,30.,60.,120.,180.,220.,270.,315.);
  float dh=0., ds=0., dl=0., wsum=0.;
  for(int i=0;i<8;i++){ float d=abs(h.x*360.-centers[i]); d=min(d,360.-d); float w=max(0.,1.-d/45.); w=w*w*(3.-2.*w);
    dh+=hslH[i]*w; ds+=hslS[i]*w; dl+=hslL[i]*w; wsum+=w; }
  float sw = smoothstep(.02,.25,h.y);
  h.x = fract(h.x + dh*60./360.*sw);
  h.y = clamp(h.y*(1.+ds*sw),0.,1.);
  vec3 c2 = hsl2rgb(h);
  c2 = mix(c2, dl>0.? mix(c2,vec3(1.),dl*.55) : c2*(1.+dl*.6), sw*smoothstep(0.,.4,h.y));
  c = clamp(c2,0.,1.);
  // look: curves + split tone + mono
  vec3 graded = vec3(texture(lut,vec2(c.r,.5)).r, texture(lut,vec2(c.g,.5)).g, texture(lut,vec2(c.b,.5)).b);
  float gl2 = luma(graded);
  graded += shTone*(1.-smoothstep(0.,.55+toneBal*.3,gl2)) + hiTone*smoothstep(.45+toneBal*.3,1.,gl2);
  graded = mix(graded, vec3(luma(graded)), mono);
  c = mix(c, clamp(graded,0.,1.), lutAmt);
  // effects
  c = mix(c, c*(1.-fade*.32)+fade*.16, 1.);
  float blL = luma(bl);
  c += bl*smoothstep(.55,1.,blL)*glow*.65;
  vec2 q = uv-.5; q.x *= res.x/res.y;
  float v = smoothstep(.95,.18,length(q)*1.15);
  c *= mix(1., v, max(vignette,0.)); c = mix(c, c+(1.-v)*.6, max(-vignette,0.));
  float n = noise(uv*res/grainScale) - .5 + (hash(uv*res)-.5)*.5;
  c += n*grain*.22*(1.-abs(luma(c)*2.-1.)*.5);
  o = vec4(clamp(c,0.,1.),1.);
}`;

function compile(gl, type, src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function program(gl, fs){ const p=gl.createProgram(); gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,VS)); gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs)); gl.bindAttribLocation(p,0,'p'); gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u={}; const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS); for(let i=0;i<n;i++){ const a=gl.getActiveUniform(p,i), nm=a.name.replace(/\[0\]$/,''); u[nm]=gl.getUniformLocation(p,a.name); } return {p,u}; }

/* ---------- curves → 256 LUT (monotone cubic) ---------- */
function curve(points){
  const pts=[...points].sort((a,b)=>a[0]-b[0]), n=pts.length, xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const d=[], m=[]; for(let i=0;i<n-1;i++) d.push((ys[i+1]-ys[i])/(xs[i+1]-xs[i]||1));
  m[0]=d[0]; m[n-1]=d[n-2]; for(let i=1;i<n-1;i++) m[i]=d[i-1]*d[i]<=0?0:(d[i-1]+d[i])/2;
  for(let i=0;i<n-1;i++){ if(d[i]===0){m[i]=m[i+1]=0;continue} const a=m[i]/d[i], b=m[i+1]/d[i], s=a*a+b*b; if(s>9){const t=3/Math.sqrt(s);m[i]=t*a*d[i];m[i+1]=t*b*d[i]} }
  const out=new Float32Array(256);
  for(let k=0;k<256;k++){ const x=k/255; let i=0; while(i<n-2&&x>xs[i+1]) i++; const h=xs[i+1]-xs[i]||1, t=Math.min(1,Math.max(0,(x-xs[i])/h)), t2=t*t, t3=t2*t;
    out[k]=Math.min(1,Math.max(0,(2*t3-3*t2+1)*ys[i]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*ys[i+1]+(t3-t2)*h*m[i+1])); }
  return out;
}
export function buildLut(look){
  const id=[[0,0],[1,1]], mst=curve(look&&look.curve||id), r=curve(look&&look.r||id), g=curve(look&&look.g||id), b=curve(look&&look.b||id);
  const data=new Uint8Array(256*4);
  for(let i=0;i<256;i++){ const m=mst[i]; const pick=(c)=>c[Math.round(m*255)]; data[i*4]=pick(r)*255; data[i*4+1]=pick(g)*255; data[i*4+2]=pick(b)*255; data[i*4+3]=255; }
  return data;
}

/* ---------- geometry: output uv → source uv ---------- */
const mul=(a,b)=>{const o=new Array(9);for(let r=0;r<3;r++)for(let c=0;c<3;c++){o[r*3+c]=a[r*3]*b[c]+a[r*3+1]*b[3+c]+a[r*3+2]*b[6+c]}return o};
const T=(x,y)=>[1,0,x,0,1,y,0,0,1], S=(x,y)=>[x,0,0,0,y,0,0,0,1], R=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,-s,0,s,c,0,0,0,1]};
export function orientedSize(w,h,rot){return rot%2?[h,w]:[w,h]}
export function straightenZoom(geo,W,H){
  const [OW,OH]=orientedSize(W,H,geo.rot), cx=(geo.crop.x+geo.crop.w/2)*OW, cy=(geo.crop.y+geo.crop.h/2)*OH, hw=geo.crop.w*OW/2, hh=geo.crop.h*OH/2, a=geo.angle*Math.PI/180;
  let s=1; for(const [dx,dy] of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]){ const rx=dx*Math.cos(a)-dy*Math.sin(a), ry=dx*Math.sin(a)+dy*Math.cos(a);
    s=Math.max(s, rx>0?rx/Math.max(1e-6,OW-cx):-rx/Math.max(1e-6,cx), ry>0?ry/Math.max(1e-6,OH-cy):-ry/Math.max(1e-6,cy)); }
  return s;
}
export function geoMatrix(geo,W,H,{full=false}={}){
  const [OW,OH]=orientedSize(W,H,geo.rot);
  const crop=full?{x:0,y:0,w:1,h:1}:geo.crop, ang=full?0:geo.angle*Math.PI/180, z=full?1:straightenZoom(geo,W,H);
  // output uv (y up in GL) → oriented pixels
  let M=mul(T(crop.x*OW,crop.y*OH),S(crop.w*OW,crop.h*OH));
  M=mul(M,[1,0,0,0,-1,1,0,0,1]); // flip v so row 0 is the top
  const cx=(crop.x+crop.w/2)*OW, cy=(crop.y+crop.h/2)*OH;
  M=mul(mul(mul(T(cx,cy),R(ang)),S(1/z,1/z)),mul(T(-cx,-cy),M));
  if(geo.flip) M=mul([-1,0,OW,0,1,0,0,0,1],M);
  // oriented pixels → source pixels (inverse of clockwise rot*90)
  const inv={0:[1,0,0,0,1,0,0,0,1],1:[0,1,0,-1,0,H,0,0,1],2:[-1,0,W,0,-1,H,0,0,1],3:[0,-1,W,1,0,0,0,0,1]}[geo.rot];
  M=mul(inv,M);
  M=mul([1/W,0,0,0,1/H,0,0,0,1],M); // source pixels → texture uv (row 0 of the texture is the image's top row)
  // GLSL mat3 is column-major
  return new Float32Array([M[0],M[3],M[6],M[1],M[4],M[7],M[2],M[5],M[8]]);
}
export function outputSize(geo,W,H){const [OW,OH]=orientedSize(W,H,geo.rot);return [Math.max(1,Math.round(geo.crop.w*OW)),Math.max(1,Math.round(geo.crop.h*OH))]}

export class Engine{
  constructor(canvas){
    const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false,premultipliedAlpha:false});
    if(!gl) throw new Error('nogl');
    this.gl=gl;this.canvas=canvas;
    this.copy=program(gl,COPY);this.blur=program(gl,BLUR);this.main=program(gl,MAIN);
    const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    this.lut=this.tex(256,1,null);this.setLook(null);
    this.maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }
  tex(w,h,data){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
  target(w,h){const gl=this.gl,t=this.tex(w,h,null),f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);return {t,f,w,h}}
  free(x){if(!x)return;const gl=this.gl;if(x.t)gl.deleteTexture(x.t);if(x.f)gl.deleteFramebuffer(x.f)}
  setImage(bitmap){
    const gl=this.gl;if(this.src)gl.deleteTexture(this.src);
    this.W=bitmap.width;this.H=bitmap.height;
    this.src=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.src);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.geoKey=null;
  }
  setLook(look){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.lut);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,buildLut(look));this.look=look}
  pass(prog,target,bind){const gl=this.gl;gl.useProgram(prog.p);gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.f:null);gl.viewport(0,0,target?target.w:this.canvas.width,target?target.h:this.canvas.height);bind(prog.u);gl.drawArrays(gl.TRIANGLES,0,3)}
  // geometry + blur buffers are rebuilt only when crop/size changes
  prepare(geo,w,h,full){
    const key=JSON.stringify(geo)+w+'x'+h+full;if(key===this.geoKey)return;this.geoKey=key;
    const gl=this.gl;['base','s1','s2','l1','l2'].forEach(k=>{this.free(this[k]);this[k]=null});
    this.base=this.target(w,h);
    const M=geoMatrix(geo,this.W,this.H,{full});
    this.pass(this.copy,this.base,u=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.src);gl.uniform1i(u.t,0);gl.uniformMatrix3fv(u.M,false,M)});
    const sw=Math.max(1,Math.round(w/2)),sh=Math.max(1,Math.round(h/2)),lw=Math.max(1,Math.round(w/8)),lh=Math.max(1,Math.round(h/8));
    this.s1=this.target(sw,sh);this.s2=this.target(sw,sh);this.l1=this.target(lw,lh);this.l2=this.target(lw,lh);
    const blur=(from,a,b,scale)=>{this.pass(this.blur,a,u=>{gl.bindTexture(gl.TEXTURE_2D,from);gl.uniform1i(u.t,0);gl.uniform2f(u.dir,scale/a.w,0)});this.pass(this.blur,b,u=>{gl.bindTexture(gl.TEXTURE_2D,a.t);gl.uniform1i(u.t,0);gl.uniform2f(u.dir,0,scale/a.h)})};
    blur(this.base.t,this.s1,this.s2,1);
    blur(this.base.t,this.l1,this.l2,1.5);blur(this.l2.t,this.l1,this.l2,2.5);blur(this.l2.t,this.l1,this.l2,4);
  }
  render(P,{w,h,full=false,original=false}){
    const gl=this.gl;if(!this.src)return;
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}
    this.prepare(P.geo,w,h,full);
    const look=P.look,amt=look?P.lookAmt:0;
    if(this.look!==look)this.setLook(look);
    this.pass(this.main,null,u=>{
      const bindT=(unit,t,name)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(u[name],unit)};
      bindT(0,this.base.t,'src');bindT(1,this.s2.t,'bS');bindT(2,this.l2.t,'bL');bindT(3,this.lut,'lut');
      const A=P.adj,f=k=>(A[k]||0)/100;
      const lk=look||{};
      const set=(n,v)=>u[n]&&gl.uniform1f(u[n],v);
      set('exposure',f('exposure')+(lk.exposure||0)*amt);set('brightness',f('brightness')+(lk.brightness||0)*amt);set('contrast',f('contrast')+(lk.contrast||0)*amt);
      set('highlights',f('highlights'));set('shadows',f('shadows')+(lk.shadows||0)*amt);set('whites',f('whites'));set('blacks',f('blacks'));
      set('saturation',f('saturation')+(lk.saturation||0)*amt);set('vibrance',f('vibrance'));set('warmth',f('warmth')+(lk.warmth||0)*amt);set('tint',f('tint')+(lk.tint||0)*amt);
      set('clarity',f('clarity'));set('sharpen',f('sharpen'));set('vignette',f('vignette')+(lk.vignette||0)*amt);set('grain',f('grain')+(lk.grain||0)*amt);set('fade',f('fade')+(lk.fade||0)*amt);set('glow',f('glow')+(lk.glow||0)*amt);
      set('mono',lk.mono?1:0);set('lutAmt',amt);set('original',original?1:0);set('toneBal',lk.toneBal||0);
      gl.uniform3fv(u.shTone,lk.shTone||[0,0,0]);gl.uniform3fv(u.hiTone,lk.hiTone||[0,0,0]);
      gl.uniform1fv(u.hslH,P.hsl.map(b=>b[0]/100));gl.uniform1fv(u.hslS,P.hsl.map(b=>b[1]/100));gl.uniform1fv(u.hslL,P.hsl.map(b=>b[2]/100));
      gl.uniform2f(u.res,w,h);gl.uniform1f(u.grainScale,Math.max(1,Math.max(w,h)/900));
    });
  }
}
