import sys, json; sys.path.insert(0,'.')
from fishbake import *
from PIL import Image
OUT='../../src/assets/sprites'
import os; os.makedirs(OUT,exist_ok=True)
PH=8
def samp(img,u,v):
    h,w=img.shape[:2]
    return cv2.remap(img,(np.clip(u,-2,3)*w).astype(np.float32)-0.5,((1-np.clip(v,-2,3))*h).astype(np.float32)-0.5,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
def tex_rgb(path): return cv2.cvtColor(cv2.imread(path),cv2.COLOR_BGR2RGB).astype(np.float32)/255
def hsv_recolor(tex,body_hue,body_sat,body_val,stripe_rgb):
    hsv=cv2.cvtColor(tex,cv2.COLOR_RGB2HSV)  # H 0..360, S,V 0..1
    sat=hsv[...,1]; val=hsv[...,2]
    stripe=smooth(0.0,1.0,np.clip((0.42-sat)/0.2,0,1))*(val>0.45)   # low-saturation bright = stripes
    out=hsv.copy(); out[...,0]=body_hue; out[...,1]=np.clip(sat*body_sat,0,1); out[...,2]=np.clip(val*body_val,0,1)
    rgb=cv2.cvtColor(out,cv2.COLOR_HSV2RGB)
    st=np.array(stripe_rgb,np.float32)*np.clip(val[...,None]*1.1,0,1)
    return rgb*(1-stripe[...,None])+st*stripe[...,None]
def bake(name,P,Nn,UV,tex_fn,alpha_fn,Lpx,cw,ch,twist,bank0,bank1,amp,bend_max,shade_kw,xn,xt):
    Lm=xn-xt; pivot=xn-0.444*Lm; scale=Lpx/Lm
    Pc=P.copy(); Pc[...,0]-=pivot
    cells={}
    sheet=np.zeros(((3+1)*ch,PH*cw,4),np.uint8)
    rows=[(0.0,bank0),(0.55,(bank0+bank1)/2),(1.0,bank1)]
    for r,(bm,bk) in enumerate(rows):
        for k in range(PH):
            Pd,Nd=deform(Pc,Nn,xn-pivot,xt-pivot,2*np.pi*k/PH,bm*bend_max,amp,twist,bank_deg=bk)
            img=render_mesh(Pd,Nd,UV,tex_fn,cw,ch,scale,alpha_fn=alpha_fn,shade_kw=shade_kw)
            sheet[r*ch:(r+1)*ch,k*cw:(k+1)*cw]=img
        print(name,'row',r,flush=True)
    Pd,Nd=deform(Pc,Nn,xn-pivot,xt-pivot,0,0,0.0,twist,bank_deg=bank0)
    sheet[3*ch:4*ch,0:cw]=render_mesh(Pd,Nd,UV,tex_fn,cw,ch,scale,alpha_fn=alpha_fn,shade_kw=shade_kw)
    save_webp(sheet,f'{OUT}/{name}.webp',q=86)
    return dict(name=name,cw=cw,ch=ch,cols=PH,rows=3,lenPx=float(Lpx),pivot=0.444,w=int(sheet.shape[1]),h=int(sheet.shape[0]))
meta=[]
if 'clown' in sys.argv[1:]:
    g=list(load_fbx_geoms('../../assets-src/clown-fish/source/cab939cb4ecb4ab583940af6e5c384c5.fbx.fbx').values())[0]
    canon=lambda p: np.stack([-p[...,1],-p[...,0],-p[...,2]],-1)
    P=canon(g['V'][g['corner_vi'][g['tri']]]); Nn=canon(g['n'][g['tri']]); UV=g['uv'][g['tri']]
    P,Nn,UV=subdivide_phong(P,Nn,UV,2)
    tex=tex_rgb('../../assets-src/clown-fish/textures/Fish_001_diff.jpeg')
    opac=cv2.imread('../../assets-src/clown-fish/textures/Fish_001_opac.jpeg',0).astype(np.float32)/255
    variants={'koi':tex,
      'tang':hsv_recolor(tex,218,0.95,0.95,(1.0,0.86,0.28)),
      'perch':hsv_recolor(tex,68,0.85,0.78,(0.96,0.93,0.74))}
    xn,xt=float(P[...,0].max()),float(P[...,0].min())
    for nm,tx in variants.items():
        m=bake(nm,P,Nn,UV,lambda u,v,tx=tx: samp(tx,u,v),lambda u,v: np.clip(samp(opac,u,v)*1.6,0,1),224,256,176,45,14,30,0.05,0.16,
               dict(rough=0.45,spec=0.3,ambient=0.8,diffuse=0.62,ao_k=0.25,exposure=1.22),xn,xt)
        meta.append(m)
if 'shark' in sys.argv[1:]:
    G=load_fbx_geoms('../../assets-src/realistic-shark/source/Realistic Shark.fbx')
    g=[v for v in G.values() if len(v['V'])==186862][0]
    canon=lambda p: np.stack([-p[...,1],p[...,0],p[...,2]],-1)
    P=canon(g['V'][g['corner_vi'][g['tri']]]); Nn=canon(g['n'][g['tri']]); UV=g['uv'][g['tri']]
    tex=tex_rgb('../../assets-src/realistic-shark/textures/Shark_Skin.jpeg')
    # colour grade: neutral grey -> slate blue-grey, lifted
    lum=tex.mean(-1,keepdims=True)
    tex=np.clip((lum**0.85*1.25)*np.array([0.72,0.86,1.02]),0,1)
    xn,xt=float(P[...,0].max()),float(P[...,0].min())
    m=bake('shark',P,Nn,UV,lambda u,v: samp(tex,u,v),None,400,480,256,38,12,26,0.045,0.14,
           dict(rough=0.5,spec=0.3,ambient=0.8,diffuse=0.6,ao_k=0.3,exposure=1.05),xn,xt)
    meta.append(m)
mp='./fish_meta.json'
old=json.load(open(mp)) if os.path.exists(mp) else {}
for m in meta: old[m['name']]=m
json.dump(old,open(mp,'w'),indent=1); print(json.dumps(old))
