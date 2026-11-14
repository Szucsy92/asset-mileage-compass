import sys; sys.path.insert(0,'.')
import numpy as np, cv2
from meshio import *; from r3d import *; from common import *

def subdivide_phong(P,N,UV,levels=2,alpha=0.75):
    """Triangle soup (n,3,3),(n,3,3),(n,3,2) -> subdivided with Phong tessellation."""
    for _ in range(levels):
        def mid(a,b): return (a+b)/2
        p0,p1,p2=P[:,0],P[:,1],P[:,2]; n0,n1,n2=N[:,0],N[:,1],N[:,2]; u0,u1,u2=UV[:,0],UV[:,1],UV[:,2]
        pm=[mid(p0,p1),mid(p1,p2),mid(p2,p0)]
        nm=[mid(n0,n1),mid(n1,n2),mid(n2,n0)]
        um=[mid(u0,u1),mid(u1,u2),mid(u2,u0)]
        def proj(q,cs):
            # Phong: project q onto tangent plane of each corner, blend by barycentric-ish weights (equal for midpoints of the two corners)
            acc=np.zeros_like(q)
            for (pc,nc,w) in cs: acc+=w*(q-((q-pc)*nc).sum(-1,keepdims=True)*nc)
            return (1-alpha)*q+alpha*acc
        qm=[proj(pm[0],[(p0,n0,.5),(p1,n1,.5)]),proj(pm[1],[(p1,n1,.5),(p2,n2,.5)]),proj(pm[2],[(p2,n2,.5),(p0,n0,.5)])]
        nn=lambda x: x/np.maximum(np.linalg.norm(x,axis=-1,keepdims=True),1e-9)
        nm=[nn(x) for x in nm]
        def tri(a,b,c): return np.stack([a,b,c],1)
        P=np.concatenate([tri(p0,qm[0],qm[2]),tri(qm[0],p1,qm[1]),tri(qm[2],qm[1],p2),tri(qm[0],qm[1],qm[2])])
        N=np.concatenate([tri(n0,nm[0],nm[2]),tri(nm[0],n1,nm[1]),tri(nm[2],nm[1],n2),tri(nm[0],nm[1],nm[2])])
        UV=np.concatenate([tri(u0,um[0],um[2]),tri(um[0],u1,um[1]),tri(um[2],um[1],u2),tri(um[0],um[1],um[2])])
    return P,N,UV

def deform(P,N,x_nose,x_tail,phase,bend,amp,twist_deg,twist_from=0.78,bank_deg=0.0):
    """P,N canonical (fwd x, left y, up z). Tail twist about the spine, travelling wave, constant bend."""
    L=x_nose-x_tail
    P=P.copy(); N=N.copy()
    s=np.clip((x_nose-P[...,0])/L,0,1)
    # twist (reveals the vertical tail fin from above)
    tw=np.radians(twist_deg)*smooth(twist_from,1.0,s)
    c,sn=np.cos(tw),np.sin(tw)
    y,z=P[...,1].copy(),P[...,2].copy()
    P[...,1]=y*c-z*sn; P[...,2]=y*sn+z*c
    ny,nz=N[...,1].copy(),N[...,2].copy()
    N[...,1]=ny*c-nz*sn; N[...,2]=ny*sn+nz*c
    if bank_deg:
        bk=np.radians(bank_deg); c2,s2=np.cos(bk),np.sin(bk)
        y,z=P[...,1].copy(),P[...,2].copy(); P[...,1]=y*c2-z*s2; P[...,2]=y*s2+z*c2
        ny,nz=N[...,1].copy(),N[...,2].copy(); N[...,1]=ny*c2-nz*s2; N[...,2]=ny*s2+nz*c2
    # lateral displacement along the body (left positive); screen y = -left
    d=amp*L*(s**1.6)*np.sin(phase-2.8*s)+bend*L*s**2
    # slope dd/dx for normal rotation
    ds=amp*L*(1.6*s**0.6*np.sin(phase-2.8*s)-2.8*s**1.6*np.cos(phase-2.8*s))+2*bend*L*s
    P[...,1]+= -d   # canvas: positive bend/phase pushes to the screen-down side
    slope=ds/L      # d(d)/d(-x) ; dx = -L ds -> dd/dx = -slope
    ang=np.arctan(slope)  # rotation of the tangent about up axis
    ca,sa=np.cos(ang),np.sin(ang)
    nx,ny2=N[...,0].copy(),N[...,1].copy()
    N[...,0]=nx*ca-ny2*sa*(-1); N[...,1]=nx*sa*(-1)+ny2*ca
    return P,N

def render_mesh(P,N,UV,tex_fn,W,H,scale,ss=SS,light=LIGHT,shade_kw=None,alpha_fn=None,flip_v=True,tid=None):
    """P canonical coords centered at pivot. -> RGBA uint8 (H,W,4)."""
    Ws,Hs=W*ss,H*ss
    sx=P[...,0]*scale*ss+Ws/2; sy=-P[...,1]*scale*ss+Hs/2; sz=P[...,2]
    Ps=np.stack([sx,sy,sz],-1)
    Ns=np.stack([N[...,0],-N[...,1],N[...,2]],-1)  # canonical -> screen frame
    A=np.zeros(P.shape[:2]+(8,),np.float32); A[...,0:3]=Ns; A[...,3:5]=UV
    out=rasterize(Ps,A,np.zeros(len(P)) if tid is None else tid,Ws,Hs)
    m=out[...,0]>-1e29
    n=out[...,1:4]; u=np.nan_to_num(out[...,4]); v=np.nan_to_num(out[...,5])
    alb=tex_fn(u,v)
    a=m.astype(np.float32)
    if alpha_fn is not None: a=a*alpha_fn(u,v)
    rgb=shade(alb,n,out[...,0],m,**(shade_kw or {}),light=light)
    return finalize(rgb,a,ss)
