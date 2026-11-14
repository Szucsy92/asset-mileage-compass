import sys; sys.path.insert(0,'.')
import numpy as np, cv2, json, os
from PIL import Image
from hf import *
from r3d import rasterize
OUT='../../src/assets/sprites'
def rgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)],np.float32)
class Layer:
    def __init__(s,Z,alb,N,rough,spec,refl,warm=0): s.Z=Z; s.alb=alb; s.N=N; s.rough=rough; s.spec=spec; s.refl=refl
def merge(a,b):
    if a is None: return b
    m=b.Z>a.Z
    pick=lambda x,y: np.where(m[...,None],y,x) if x.ndim==3 else np.where(m,y,x)
    return Layer(np.where(m,b.Z,a.Z),pick(a.alb,b.alb),pick(a.N,b.N),pick(a.rough,b.rough),pick(a.spec,b.spec),pick(a.refl,b.refl))
def hf_layer(fr,hmap,alb,rough,spec,refl):
    n=normals_from_h(hmap,fr.ppu)
    mask=hmap>NEG+1
    return Layer(np.where(mask,hmap,-1e30),alb,n,rough,spec,refl)
def finish(fr,L,shade_kw):
    mask=L.Z>-1e29
    rgbs=shade(L.alb,L.N,L.Z,mask,rough=L.rough,spec=L.spec,refl=L.refl,**shade_kw)
    return finalize(rgbs,mask.astype(np.float32),fr.ss)
def blend_parts(fr,parts,k=18.0):
    """parts: list of (hmap, albedo rgb, rough, spec, refl); smooth-max union."""
    H=np.stack([p[0] for p in parts],0); m=H.max(0)
    w=np.exp(k*(H-m))*(H>NEG+1); sw=w.sum(0)+1e-9; w=w/sw[None]
    h=np.where(m>NEG+1,m+np.log(sw)/k*0+0,NEG)
    alb=sum(w[i][...,None]*np.array(p[1],np.float32) for i,p in enumerate(parts))
    rough=sum(w[i]*p[2] for i,p in enumerate(parts)); spec=sum(w[i]*p[3] for i,p in enumerate(parts)); refl=sum(w[i]*p[4] for i,p in enumerate(parts))
    return h,alb,rough,spec,refl
