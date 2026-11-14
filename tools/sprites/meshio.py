import numpy as np
from fbx import parse
def _layer(g,name,datakey,idxkey):
    L=g.find(name)
    if not L: return None
    L=L[0]
    mp=L.find('MappingInformationType')[0].props[0]; rf=L.find('ReferenceInformationType')[0].props[0]
    data=L.find(datakey)[0].props[0]
    idx=L.find(idxkey)[0].props[0] if L.find(idxkey) else None
    return mp,rf,data,idx
def load_fbx_geoms(path):
    ver,root=parse(path)
    out={}
    for o in root.find('Objects')[0].children:
        if o.name!='Geometry' or o.props[2]!='Mesh': continue
        V=o.find('Vertices')[0].props[0].reshape(-1,3).astype(np.float64)
        pvi=o.find('PolygonVertexIndex')[0].props[0].astype(np.int64)
        ends=np.where(pvi<0)[0]
        poly_start=np.concatenate([[0],ends[:-1]+1])
        corner_vi=np.where(pvi<0,~pvi,pvi)
        # triangulate fans -> corner indices (into polygon-vertex list)
        tri=[]
        for s,e in zip(poly_start,ends):
            n=e-s+1
            for k in range(1,n-1): tri.append((s,s+k,s+k+1))
        tri=np.array(tri,dtype=np.int64)
        res={'V':V,'corner_vi':corner_vi,'tri':tri,'ncorner':len(pvi)}
        uv=_layer(o,'LayerElementUV','UV','UVIndex')
        if uv:
            mp,rf,data,idx=uv; data=data.reshape(-1,2)
            res['uv']=data[idx] if (idx is not None and rf=='IndexToDirect') else data
            if mp=='ByPolygonVertex': pass
            elif mp=='ByVertice' or mp=='ByVertex': res['uv']=res['uv'][corner_vi]
        nm=_layer(o,'LayerElementNormal','Normals','NormalsIndex')
        if nm:
            mp,rf,data,idx=nm; data=data.reshape(-1,3)
            res['n']=data[idx] if (idx is not None and rf=='IndexToDirect') else data
            if mp!='ByPolygonVertex': res['n']=res['n'][corner_vi]
        # per-polygon material
        mt=o.find('LayerElementMaterial')
        if mt:
            m=mt[0].find('Materials')[0].props[0]
            res['mat_poly']=m
        res['name']=o.props[1].split('\x00')[0]; res['id']=o.props[0]
        out[o.props[0]]=res
    return out
