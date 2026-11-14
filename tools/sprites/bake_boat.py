import sys; sys.path.insert(0,'.')
from toylib import *
def capsule(X,Y,p0,p1,r):
    p0=np.array(p0,float); p1=np.array(p1,float)
    d=p1[:2]-p0[:2]; L2=(d**2).sum()
    t=np.clip(((X-p0[0])*d[0]+(Y-p0[1])*d[1])/L2,0,1)
    cx=p0[0]+t*d[0]; cy=p0[1]+t*d[1]; dist=np.hypot(X-cx,Y-cy)
    z=p0[2]+t*(p1[2]-p0[2])
    return np.where(dist<r,z+np.sqrt(np.clip(r*r-dist**2,0,None)),NEG)
def sail_mesh(T,Hd,C,billow,nu=16,nv=16,flip=False):
    T,Hd,C=map(np.array,(T,Hd,C))
    us,vs=np.meshgrid(np.linspace(0,1,nu),np.linspace(0,1,nv))
    P=T+us[...,None]*(C-T)*(1-vs[...,None])+vs[...,None]*(Hd-T)
    P=P+np.array([0,1,0.0])*(billow*4*us*(1-us)*vs*(1-vs)*4)[...,None]
    gy,gx=np.gradient(P,axis=(0,1)); n=np.cross(gx,gy); n/=np.maximum(np.linalg.norm(n,axis=-1,keepdims=True),1e-9)
    n=np.where(n[...,2:3]<0,-n,n)
    idx=np.arange(nu*nv).reshape(nv,nu); tris=[]
    for j in range(nv-1):
        for i in range(nu-1):
            a,b,c,d=idx[j,i],idx[j,i+1],idx[j+1,i],idx[j+1,i+1]; tris+= [(a,b,c),(b,d,c)]
    tris=np.array(tris)
    return P.reshape(-1,3),n.reshape(-1,3),np.stack([us.ravel(),vs.ravel()],1),tris
def mesh_layer(fr,mesh,ang,alb_fn,rough,spec,refl):
    V,N,UV,tri=mesh; c,s=np.cos(ang),np.sin(ang)
    def rot(a): a=a.copy(); x,y=a[:,0].copy(),a[:,1].copy(); a[:,0]=x*c-y*s; a[:,1]=x*s+y*c; return a
    Vr,Nr=rot(V),rot(N)
    P=np.stack([Vr[tri][...,0]*fr.ppu+fr.N/2,Vr[tri][...,1]*fr.ppu+fr.N/2,Vr[tri][...,2]],-1)
    A=np.zeros((len(tri),3,8),np.float32); A[...,0:3]=Nr[tri]; A[...,3:5]=UV[tri]
    out=rasterize(P,A,np.zeros(len(tri)),fr.N,fr.N)
    m=out[...,0]>-1e29; u=out[...,4]; v=out[...,5]
    n=out[...,1:4]; n=n/np.maximum(np.linalg.norm(n,axis=-1,keepdims=True),1e-6)
    alb=alb_fn(u,v)
    Z=np.where(m,out[...,0],-1e30)
    return Layer(Z,alb.astype(np.float32),n.astype(np.float32),np.full(m.shape,rough,np.float32),np.full(m.shape,spec,np.float32),np.full(m.shape,refl,np.float32))
LT=0.5
MAIN=sail_mesh((0.42,0.0,0.52),(0.42,LT*0.95,1.85),(-0.85,0.46,0.58),0.5)
JIB=sail_mesh((1.08,0.0,0.4),(0.42,LT*0.9,1.7),(0.25,0.34,0.5),0.35)
cloth=np.array([0.96,0.95,0.92],np.float32)
def main_alb(u,v):
    seam=1-0.10*smooth(0.0,1.0,np.abs(((v*5)%1.0)-0.5)*0+ (1-np.minimum(1,np.abs(((v*5)%1.0)-0.0)*14)))
    a=np.ones(u.shape+(3,),np.float32)*cloth
    band=smooth(0.0,0.02,np.abs(v-0.62))   # red stripe near the top
    stripe=(np.abs(v-0.7)<0.05)
    a=np.where(stripe[...,None],np.array([0.85,0.14,0.1],np.float32),a)
    return a*seam[...,None]*(0.93+0.07*np.cos(u*40))[...,None]
def jib_alb(u,v):
    a=np.ones(u.shape+(3,),np.float32)*np.array([0.82,0.9,0.96],np.float32)
    seam=1-0.08*(1-np.minimum(1,np.abs(((v*4)%1.0))*14))
    return a*seam[...,None]
def boat(fr,ang):
    X,Y=fr.rot(ang)
    # hull outline
    x=X; w=np.where(x>=0,0.6*np.clip(1-(x/1.3)**2,0,None)**0.55,0.6*np.clip(1-(-x/1.05)**5,0,None)**0.5)
    inside=(np.abs(Y)<w)&(x<1.3)&(x>-1.05)
    u=np.where(w>1e-4,np.abs(Y)/np.maximum(w,1e-4),2)
    hh=0.34*np.clip(1-u**6,0,None)**0.5+0.05*np.exp(-((u-0.93)/0.05)**2)
    h=np.where(inside,hh,NEG)
    # albedo: deck planks / paint / trim
    plank=np.abs(((Y/0.11)%1.0)-0.5)
    grain=0.04*np.sin(X*23+np.sin(Y*7)*3)+0.03*np.sin(X*57+Y*11)
    wood=np.array([0.72,0.48,0.26],np.float32)
    deck=(wood*(0.92+grain)[...,None])*(1-0.35*(plank>0.46))[...,None]
    paint=np.array([0.7,0.09,0.07],np.float32); trim=np.array([0.95,0.92,0.84],np.float32)
    alb=np.where((u<0.86)[...,None],deck,np.where(((u>=0.9)&(u<0.97))[...,None],trim,paint))
    L=hf_layer(fr,h,alb.astype(np.float32),np.where(u<0.86,0.5,0.25),np.where(u<0.86,0.25,0.6),np.where(u<0.86,0.12,0.35))
    # cabin
    ch=ellipsoid(X,Y,-0.22,0,0.34,0.42,0.3,0.2,power=5.0)
    cab=np.array([0.93,0.89,0.8],np.float32)
    win=((np.abs(X+0.22)<0.22)&(np.abs(np.abs(Y)-0.0)<0.1))
    calb=np.where(win[...,None],np.array([0.1,0.12,0.15],np.float32),cab)
    L=merge(L,hf_layer(fr,ch,calb.astype(np.float32),np.full(h.shape,0.4),np.full(h.shape,0.4),np.full(h.shape,0.2)))
    # mast + boom
    mast=capsule(X,Y,(0.42,0,0.34),(0.42,LT,1.9),0.04)
    boom=capsule(X,Y,(0.42,0,0.52),(-0.85,0.46,0.58),0.032)
    dark=np.array([0.32,0.2,0.1],np.float32)
    for hm in (mast,boom):
        L=merge(L,hf_layer(fr,hm,np.broadcast_to(dark,hm.shape+(3,)).copy(),np.full(h.shape,0.45),np.full(h.shape,0.3),np.full(h.shape,0.1)))
    L=merge(L,mesh_layer(fr,JIB,ang,jib_alb,0.75,0.05,0.04))
    L=merge(L,mesh_layer(fr,MAIN,ang,main_alb,0.75,0.05,0.04))
    return L
if __name__=='__main__':
    fr=Frame(288,3.3)
    NH=16; sheet=np.zeros((2*288,8*288,4),np.uint8)
    for k in range(NH):
        L=boat(fr,2*np.pi*k/NH); img=finish(fr,L,dict(ambient=0.78,diffuse=0.7,ao_k=1.0,ao_rad=8,exposure=1.05))
        r,c=divmod(k,8); sheet[r*288:(r+1)*288,c*288:(c+1)*288]=img
    Image.fromarray(sheet,'RGBA').save(f'{OUT}/boat.webp','WEBP',quality=90,alpha_quality=100,method=6)
    meta=json.load(open('./toy_meta.json')); meta['boat']=dict(size=288,extent=3.3,frames=NH,cols=8)
    json.dump(meta,open('./toy_meta.json','w')); print('boat done')
