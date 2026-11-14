import sys; sys.path.insert(0,'.')
import numpy as np, cv2, os
from PIL import Image
from glb import load, accessor
from r3d import rasterize
from common import *
OUT='../../src/assets/sprites'
js,bn=load('../../assets-src/beach-ball-free-download/source/beach_ball_free_download.glb')
p=js['meshes'][0]['primitives'][0]
Vv=accessor(js,bn,p['attributes']['POSITION']).astype(np.float64)
Nv=accessor(js,bn,p['attributes']['NORMAL']).astype(np.float64)
UVv=accessor(js,bn,p['attributes']['TEXCOORD_0']).astype(np.float64)
idx=accessor(js,bn,p['indices']).reshape(-1,3).astype(np.int64)
bv=js['bufferViews'][js['images'][0]['bufferView']]; 
import io
tex=np.array(Image.open(io.BytesIO(bn[bv['byteOffset']:bv['byteOffset']+bv['byteLength']])).convert('RGB')).astype(np.float32)/255
print('tris',len(idx),'tex',tex.shape)
# panels -> check which texture cells are used: sample UV centers
cells=set((int(u*2),int((1-v)*3)) for u,v in UVv)
print('cells',sorted(cells))
def hexrgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)],np.float32)
def pal_tex(colors):
    t=np.zeros((3,2,3),np.float32)   # rows (v from top), cols
    k=0
    for r in range(3):
        for c in range(2): t[r,c]=hexrgb(colors[k%len(colors)]); k+=1
    return cv2.resize(t,(64,64),interpolation=cv2.INTER_NEAREST)
variants={'ball0':tex,'ball1':pal_tex(['#e0158f','#2fb0f0','#e0158f','#2fb0f0','#e0158f','#2fb0f0'])}
FR=16; SZ=256
def render(rotang,tx):
    # rotate about screen-y axis (rolling along +x): x,z mix
    c,s=np.cos(rotang),np.sin(rotang)
    def rot(a): 
        a=a.copy(); x,z=a[:,0].copy(),a[:,2].copy(); a[:,0]=x*c+z*s; a[:,2]=-x*s+z*c; return a
    V=rot(Vv); N=rot(Nv)
    # also lay the sphere's pole direction horizontally so roll shows panels from the side too
    ss=SS; W=SZ*ss
    sc=W*0.455
    P=np.stack([V[idx][...,0]*sc+W/2, V[idx][...,1]*sc+W/2, V[idx][...,2]],-1)
    A=np.zeros((len(idx),3,8),np.float32); A[...,0:3]=N[idx]; A[...,3:5]=UVv[idx]
    out=rasterize(P,A,np.zeros(len(idx)),W,W)
    m=out[...,0]>-1e29
    u=np.nan_to_num(out[...,4]); v=np.nan_to_num(out[...,5])
    alb=cv2.remap(tx,(u*tx.shape[1]).astype(np.float32)-0.5,((1-v)*tx.shape[0]).astype(np.float32)-0.5,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    n=out[...,1:4]; nz=np.clip(n[...,2],0,1)
    rgb=np.clip(alb*(0.9+0.1*nz[...,None]),0,1)    # symmetric, light-free albedo
    return finalize(rgb,m.astype(np.float32),ss)
# pole alignment: find which axis the texture's top/bottom (v) varies with to tilt properly -> just pre-rotate 90deg about x so poles lie in screen y
for name,tx in variants.items():
    sheet=np.zeros((SZ,SZ*FR,4),np.uint8)
    for k in range(FR):
        sheet[:,k*SZ:(k+1)*SZ]=render(2*np.pi*k/FR,tx)
    Image.fromarray(sheet,'RGBA').save(f'{OUT}/{name}.webp','WEBP',quality=88,alpha_quality=100,method=6)
    print(name,sheet.shape)
# shading overlay (light baked, un-rotated): left cell = shadow (black, alpha), right cell = gloss (white, alpha)
ss=SS; W=SZ*ss; yy,xx=np.mgrid[0:W,0:W]; px=(xx+0.5-W/2)/(W*0.455); py=(yy+0.5-W/2)/(W*0.455)
r2=px**2+py**2; m=r2<1; nz=np.sqrt(np.clip(1-r2,0,1)); n=np.dstack([px,py,nz])
wrap=np.clip(((n*LIGHT).sum(-1)+0.3)/1.3,0,1)
M=0.42+0.78*wrap
shadow=np.clip(1-M,0,0.62)*m
Hh=LIGHT+np.array([0,0,1.0]); Hh/=np.linalg.norm(Hh)
nh=np.clip((n*Hh).sum(-1),0,1)
spec=(nh**160)*0.95+(nh**18)*0.16
R=2*n[...,2:3]*n-np.array([0,0,1.0]); e=env(R,LIGHT).mean(-1)
fres=0.04+0.96*(1-nz)**4
gloss=np.clip(spec+np.clip(M-1,0,0.3)*0.5+fres*np.clip(e,0,1.4)*0.22,0,0.95)*m
cellS=finalize(np.zeros((W,W,3)),shadow,ss)
cellG=finalize(np.ones((W,W,3)),gloss,ss)
Image.fromarray(np.concatenate([cellS,cellG],1),'RGBA').save(f'{OUT}/ball_shade.webp','WEBP',quality=90,alpha_quality=100,method=6)
print('shade ok')
