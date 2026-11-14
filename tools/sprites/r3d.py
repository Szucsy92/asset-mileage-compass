import ctypes, numpy as np, cv2
lib=ctypes.CDLL('./libraster.so')
lib.raster.argtypes=[ctypes.c_int,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_void_p]
def rasterize(P,A,TID,W,H):
    """P (ntri,3,3) screen xyz; A (ntri,3,8); TID (ntri,) -> dict of arrays"""
    P=np.ascontiguousarray(P,dtype=np.float32); A=np.ascontiguousarray(A,dtype=np.float32); T=np.ascontiguousarray(TID,dtype=np.float32)
    out=np.empty((H,W,9),dtype=np.float32)
    lib.raster(len(P),P.ctypes.data,A.ctypes.data,T.ctypes.data,W,H,out.ctypes.data)
    return out
def vertex_normals(V,F):
    n=np.zeros_like(V)
    fn=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]])
    for k in range(3): np.add.at(n,F[:,k],fn)
    l=np.linalg.norm(n,axis=1,keepdims=True); return n/np.maximum(l,1e-12)
