import sys; sys.path.insert(0,'.')
from toylib import *
# ---------------- ring ----------------
def ring(fr,sleeve,spin=0.0):
    X,Y=fr.SX,fr.SY; rho=np.hypot(X,Y); th=np.arctan2(Y,X)+spin
    R,rt=1.0,0.33; mid=R-rt
    ph=((th/(2*np.pi))*8)%1.0; sector=np.floor(((th/(2*np.pi))*8))%2
    edge=np.minimum(ph,1-ph)
    S=smooth(0.035,0.075,edge)*(sector==0)          # sleeve indicator with rounded ends
    rte=rt*(1+0.07*S)
    d=np.abs(rho-mid)
    h=np.where(d<rte,np.sqrt(np.clip(rte**2-d**2,0,None))+0.0,NEG)
    white=np.array([0.95,0.95,0.93],np.float32); col=np.array(sleeve,np.float32)
    alb=white*(1-S[...,None])+col*S[...,None]
    # darker seam where sleeve ends meet tube
    seam=smooth(0.0,0.03,edge)*(sector==0)
    alb=alb*(0.72+0.28*np.where(sector==0,seam,1.0))[...,None]
    rough=np.where(S>0.5,0.28,0.38)*np.ones_like(h); spec=np.ones_like(h)*0.7; refl=np.ones_like(h)*0.4
    return hf_layer(fr,h,alb,rough,spec,refl)
fr=Frame(448,2.16)
meta={}
for nm,sl in [('ring0','#f0761a'),('ring1','#1d7fc0')]:
    L=ring(fr,rgb(sl)); img=finish(fr,L,dict(ambient=0.75,diffuse=0.7,ao_k=0.7,ao_rad=10,exposure=1.08))
    Image.fromarray(img,'RGBA').save(f'{OUT}/{nm}.webp','WEBP',quality=90,alpha_quality=100,method=6)
meta['ring']=dict(size=448,extent=2.16,outer=1.0)
# ---------------- duck ----------------
def duck(fr,ang):
    X,Y=fr.rot(ang)
    Y_=np.float32(1.0)
    yel=rgb('#ffc712'); yel2=rgb('#f7b60c'); org=rgb('#e8520a'); blk=rgb('#0b0b0b')
    parts=[(ellipsoid(X,Y,-0.12,0,0.0,1.0,0.74,0.62),yel,0.26,0.8,0.45),
           (ellipsoid(X,Y,-0.9,0,0.2,0.46,0.3,0.4),yel,0.26,0.8,0.45),
           (ellipsoid(X,Y,0.62,0,0.52,0.45,0.42,0.46),yel,0.24,0.85,0.5)]
    for s in (-1,1):
        parts.append((ellipsoid(X,Y,-0.2,s*0.47,0.2,0.56,0.3,0.36,ang=s*-0.12),yel2,0.26,0.8,0.45))
    parts.append((ellipsoid(X,Y,1.05,0,0.55,0.28,0.25,0.1,power=2.4),org,0.4,0.35,0.12))
    h,alb,rough,spec,refl=blend_parts(fr,parts,k=14)
    L=hf_layer(fr,h,alb,rough,spec,refl)
    eyes=[(ellipsoid(X,Y,0.74,s*0.26,0.85,0.085,0.085,0.085),blk,0.06,1.0,0.7) for s in (-1,1)]
    he,ae,re,se,fe=blend_parts(fr,eyes,k=60)
    L=merge(L,hf_layer(fr,he,ae,re,se,fe)); return L
fr=Frame(256,2.9)
NH=16
sheet=np.zeros((2*256,8*256,4),np.uint8)
for k in range(NH):
    L=duck(fr,2*np.pi*k/NH); img=finish(fr,L,dict(ambient=0.72,diffuse=0.72,ao_k=1.3,ao_rad=7,warm=0.5,exposure=1.05))
    r,c=divmod(k,8); sheet[r*256:(r+1)*256,c*256:(c+1)*256]=img
Image.fromarray(sheet,'RGBA').save(f'{OUT}/duck.webp','WEBP',quality=90,alpha_quality=100,method=6)
meta['duck']=dict(size=256,extent=2.9,frames=NH,cols=8)
json.dump(meta,open('./toy_meta.json','w'))
print('ring+duck done')
