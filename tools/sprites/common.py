import numpy as np, cv2
SS=3
LIGHT=np.array([-0.45,-0.55,0.78]); LIGHT/=np.linalg.norm(LIGHT)
def smooth(e0,e1,x):
    t=np.clip((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def srgb2lin(c): return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
def lin2srgb(c): c=np.clip(c,0,1); return np.where(c<=0.0031308,c*12.92,1.055*c**(1/2.4)-0.055)
def env(R, L=LIGHT, sky=(0.55,0.70,0.95), ground=(0.18,0.22,0.26), box=2.2):
    """Procedural studio/sky environment. R: (...,3) reflection dirs (screen frame, z toward viewer)."""
    t=np.clip(R[...,2]*0.5+0.5,0,1)[...,None]
    e=np.array(ground)*(1-t)+np.array(sky)*t
    d=np.clip((R*L).sum(-1),0,1)
    e=e+box*(smooth(0.80,0.97,d)[...,None])*np.array([1.0,0.97,0.9])
    # second weak window highlight opposite
    L2=np.array([0.5,0.4,0.6]); L2/=np.linalg.norm(L2)
    d2=np.clip((R*L2).sum(-1),0,1)
    e=e+0.35*(smooth(0.9,0.99,d2)[...,None])
    return e
def shade(albedo_srgb,N,Z,mask,rough=0.35,spec=0.5,ambient=0.5,diffuse=0.75,ao_k=1.0,ao_rad=6,warm=0.0,refl=0.35,sheen=0.0,light=LIGHT,exposure=1.0):
    """albedo (H,W,3) sRGB 0..1; N unit normals (H,W,3) screen frame; Z depth (H,W). returns sRGB (H,W,3)."""
    A=srgb2lin(albedo_srgb)
    N=N/np.maximum(np.linalg.norm(N,axis=-1,keepdims=True),1e-6) if False else N
    n=N/np.maximum(np.linalg.norm(N,axis=-1,keepdims=True),1e-6)
    ndl=np.clip((n*light).sum(-1),0,1)
    # wrapped diffuse for soft rubber/skin look
    wrap=np.clip(((n*light).sum(-1)+0.25)/1.25,0,1)
    hemi=0.55+0.45*n[...,2]
    # cavity AO from depth
    zf=np.where(mask,Z,Z[mask].min() if mask.any() else 0)
    blur=cv2.GaussianBlur(zf.astype(np.float32),(0,0),ao_rad)
    zr=max(1e-6,float(zf.max()-zf.min()))
    cav=np.clip((blur-zf)/zr*8.0*ao_k,0,1)
    ao=1-0.7*cav
    lin=A*( (ambient*hemi*ao)[...,None] + (diffuse*wrap)[...,None]*np.array([1.0,0.96,0.9]) )
    if warm>0: lin=lin+A*(warm*(1-wrap)*ao)[...,None]*np.array([0.5,0.2,0.0])
    lin=lin*exposure
    V=np.array([0,0,1.0])
    Hh=light+V; Hh/=np.linalg.norm(Hh)
    nh=np.clip((n*Hh).sum(-1),0,1)
    rough=np.asarray(rough,dtype=np.float32); spec=np.asarray(spec,dtype=np.float32)
    sh=2.0/(rough**2+1e-3)
    sp=(nh**sh)*spec*((sh+8)/40.0)
    ndv=np.clip(n[...,2],0,1); fres=0.04+0.96*(1-ndv)**5
    R=2*n[...,2:3]*n-V
    e=env(R,light)
    refl=np.asarray(refl,dtype=np.float32)
    lin=lin*(1-refl*fres*0.5)[...,None]+ (refl*(0.15+fres))[...,None]*e*0.55*ao[...,None]
    lin=lin+sp[...,None]*np.array([1.0,0.98,0.94])
    if sheen>0: lin=lin+(sheen*(1-ndv)**2)[...,None]*A
    return lin2srgb(lin)
def finalize(rgb,mask_alpha,ss=SS,out_size=None):
    """rgb (H,W,3) sRGB 0..1 at SSAA res, alpha (H,W) 0..1 -> RGBA uint8 downsampled by ss (premultiplied)."""
    a=mask_alpha.astype(np.float32)
    pm=np.dstack([rgb*a[...,None],a]).astype(np.float32)
    h,w=a.shape
    pm=cv2.resize(pm,(w//ss,h//ss),interpolation=cv2.INTER_AREA)
    al=pm[...,3:4]; col=np.where(al>1e-4,pm[...,:3]/np.maximum(al,1e-4),0)
    out=np.dstack([col,al]); return (np.clip(out,0,1)*255+0.5).astype(np.uint8)
def save_webp(rgba,path,q=90):
    from PIL import Image
    Image.fromarray(rgba,'RGBA').save(path,'WEBP',quality=q,alpha_quality=100,method=6)
