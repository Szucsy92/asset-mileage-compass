import json, struct, numpy as np
def load(path):
    d=open(path,'rb').read()
    magic,ver,ln=struct.unpack('<4sII',d[:12]); pos=12; js=None; bn=None
    while pos<ln:
        cl,ct=struct.unpack('<I4s',d[pos:pos+8]); pos+=8
        ch=d[pos:pos+cl]; pos+=cl
        if ct==b'JSON': js=json.loads(ch)
        elif ct.startswith(b'BIN'): bn=ch
    return js,bn
def accessor(js,bn,i):
    a=js['accessors'][i]; bv=js['bufferViews'][a['bufferView']]
    n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    dt={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1',5120:'i1',5122:'<i2'}[a['componentType']]
    off=bv.get('byteOffset',0)+a.get('byteOffset',0)
    stride=bv.get('byteStride',0) or n*np.dtype(dt).itemsize
    cnt=a['count']
    if stride==n*np.dtype(dt).itemsize:
        arr=np.frombuffer(bn,dtype=dt,count=cnt*n,offset=off).reshape(cnt,n)
    else:
        arr=np.stack([np.frombuffer(bn,dtype=dt,count=n,offset=off+k*stride) for k in range(cnt)])
    return arr
if __name__=='__main__':
    js,bn=load('../assets/beach-ball-free-download/source/beach_ball_free_download.glb')
    print(json.dumps({k:v for k,v in js.items() if k not in('accessors','bufferViews')},indent=1)[:2500])
    for m in js['meshes']:
        for p in m['primitives']:
            pos=accessor(js,bn,p['attributes']['POSITION']); print('prim',p, pos.shape,pos.min(0),pos.max(0))
