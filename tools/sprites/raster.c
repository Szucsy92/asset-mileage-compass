#include <math.h>
#include <string.h>
/* P: ntri*3 corners * (x,y,z) ; A: ntri*3 corners * 8 floats (nx,ny,nz,u,v,a,b,c). Larger z = nearer to camera.
   OUT: W*H*9 floats: z,nx,ny,nz,u,v,tid,a,b ; (c unused) */
void raster(int ntri,const float*P,const float*A,const float*TID,int W,int H,float*OUT){
  memset(OUT,0,sizeof(float)*(long)W*H*9); for(long i=0;i<(long)W*H;i++){OUT[i*9]=-1e30f;}
  for(int t=0;t<ntri;t++){
    const float*p0=P+t*9,*p1=p0+3,*p2=p0+6;
    float x0=p0[0],y0=p0[1],x1=p1[0],y1=p1[1],x2=p2[0],y2=p2[1];
    float area=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);
    if(fabsf(area)<1e-9f) continue;
    float minx=fminf(x0,fminf(x1,x2)),maxx=fmaxf(x0,fmaxf(x1,x2));
    float miny=fminf(y0,fminf(y1,y2)),maxy=fmaxf(y0,fmaxf(y1,y2));
    int ix0=(int)floorf(minx-0.5f),ix1=(int)ceilf(maxx-0.5f),iy0=(int)floorf(miny-0.5f),iy1=(int)ceilf(maxy-0.5f);
    if(ix0<0)ix0=0; if(iy0<0)iy0=0; if(ix1>W-1)ix1=W-1; if(iy1>H-1)iy1=H-1;
    const float*a0=A+t*24,*a1=a0+8,*a2=a0+16;
    float inv=1.0f/area;
    for(int y=iy0;y<=iy1;y++){
      float py=y+0.5f;
      for(int x=ix0;x<=ix1;x++){
        float px=x+0.5f;
        float w0=((x1-px)*(y2-py)-(x2-px)*(y1-py))*inv;
        float w1=((x2-px)*(y0-py)-(x0-px)*(y2-py))*inv;
        float w2=1.0f-w0-w1;
        const float e=-1e-4f;
        if(w0<e||w1<e||w2<e) continue;
        float z=w0*p0[2]+w1*p1[2]+w2*p2[2];
        float*o=OUT+((long)y*W+x)*9;
        if(z<=o[0]) continue;
        o[0]=z;
        for(int k=0;k<3;k++) o[1+k]=w0*a0[k]+w1*a1[k]+w2*a2[k];
        o[4]=w0*a0[3]+w1*a1[3]+w2*a2[3];
        o[5]=w0*a0[4]+w1*a1[4]+w2*a2[4];
        o[6]=TID[t];
        o[7]=w0*a0[5]+w1*a1[5]+w2*a2[5];
        o[8]=w0*a0[6]+w1*a1[6]+w2*a2[6];
      }
    }
  }
}
