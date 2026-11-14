import numpy as np, cv2
from common import *
NEG=-50.0
def smax_stack(hs,cols,k=16.0):
    """hs: list of (H,W) height maps (NEG outside), cols: list of (...,C) arrays/consts -> smooth max height + blended attrs."""
    H=np.stack(hs,0)
    m=H.max(0)
    w=np.exp(k*(H-m))*(H>NEG+1)
    sw=w.sum(0)+1e-9
    h=m+np.log(sw)/k*(m>NEG+1)
    out=[]
    for c in cols:
        c=np.stack([np.broadcast_to(ci,H.shape[1:]+ (np.shape(ci)[-1:] if np.ndim(ci)==3 else ())) if np.ndim(ci)>=2 else np.full(H.shape[1:],ci,dtype=np.float32) for ci in c],0)
        out.append(c)
    return h,w/sw,out
def ellipsoid(X,Y,cx,cy,cz,ax,ay,hz,ang=0.0,power=2.0):
    c,s=np.cos(ang),np.sin(ang)
    dx=X-cx; dy=Y-cy
    u=(dx*c+dy*s)/ax; v=(-dx*s+dy*c)/ay
    r=np.clip(1-np.abs(u)**power-np.abs(v)**power,0,None)
    inside=(np.abs(u)**power+np.abs(v)**power)<1
    h=cz+hz*np.power(r,1.0/power if power!=2.0 else 0.5)
    return np.where(inside,h,NEG)
def normals_from_h(h,scale_px_per_unit,fill=None):
    hh=np.where(h>NEG+1,h,fill if fill is not None else h[h>NEG+1].min()-0.3)
    hh=cv2.GaussianBlur(hh.astype(np.float32),(0,0),0.8)
    gy,gx=np.gradient(hh)
    gx=gx*scale_px_per_unit; gy=gy*scale_px_per_unit    # d(height units)/d(unit)
    n=np.dstack([-gx,-gy,np.ones_like(gx)])
    return n/np.linalg.norm(n,axis=-1,keepdims=True)
class Frame:
    def __init__(s,size,extent,ss=SS):
        s.S=size; s.ss=ss; s.N=size*ss; s.ext=extent      # model units spanned by the sprite width/height
        s.ppu=s.N/extent
        ax=(np.arange(s.N)+0.5)/s.N-0.5
        s.sx=ax*extent; s.sy=ax*extent
        s.SX,s.SY=np.meshgrid(s.sx,s.sy)      # screen coords (x right, y down), model units
    def rot(s,ang):
        c,sn=np.cos(ang),np.sin(ang)
        return s.SX*c+s.SY*sn, -s.SX*sn+s.SY*c
