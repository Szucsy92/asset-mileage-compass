import struct, zlib, numpy as np
class Node:
    def __init__(s,name,props): s.name=name; s.props=props; s.children=[]
    def find(s,name): return [c for c in s.children if c.name==name]
    def walk(s):
        yield s
        for c in s.children: yield from c.walk()
def parse(path):
    d=open(path,'rb').read()
    assert d[:20]==b'Kaydara FBX Binary  ', d[:30]
    ver=struct.unpack('<I',d[23:27])[0]
    big = ver>=7500
    pos=27
    def rd(pos):
        if big:
            end,np_,pl,nl=struct.unpack('<QQQB',d[pos:pos+25]); pos+=25
        else:
            end,np_,pl,nl=struct.unpack('<IIIB',d[pos:pos+13]); pos+=13
        if end==0: return None,pos
        name=d[pos:pos+nl].decode('latin1'); pos+=nl
        props=[]
        for _ in range(np_):
            t=chr(d[pos]); pos+=1
            if t in 'YCFDIL':
                fmt={'Y':'<h','C':'<?','F':'<f','D':'<d','I':'<i','L':'<q'}[t]
                v=struct.unpack(fmt,d[pos:pos+struct.calcsize(fmt)])[0]; pos+=struct.calcsize(fmt)
            elif t in 'fdilb':
                n,enc,cl=struct.unpack('<III',d[pos:pos+12]); pos+=12
                raw=d[pos:pos+cl]; pos+=cl
                if enc: raw=zlib.decompress(raw)
                v=np.frombuffer(raw,dtype={'f':'<f4','d':'<f8','i':'<i4','l':'<i8','b':'?'}[t])
            elif t in 'SR':
                n=struct.unpack('<I',d[pos:pos+4])[0]; pos+=4
                raw=d[pos:pos+n]; pos+=n
                v=raw.decode('latin1') if t=='S' else raw
            else: raise Exception('type '+t)
            props.append(v)
        node=Node(name,props)
        while pos<end:
            c,pos=rd(pos)
            if c is None: break
            node.children.append(c)
        return node,end
    root=Node('root',[])
    while pos<len(d)-200:
        n,pos=rd(pos)
        if n is None: break
        root.children.append(n)
    return ver,root
if __name__=='__main__':
    import sys
    ver,root=parse(sys.argv[1]); print('ver',ver)
    for ob in root.find('Objects')[0].children:
        nm=ob.props[1] if len(ob.props)>1 else ''
        extra=''
        if ob.name=='Geometry':
            v=ob.find('Vertices')[0].props[0]; extra=f'verts={len(v)//3}'
        print(ob.name, ob.props[0] if ob.props else '', nm, ob.props[2] if len(ob.props)>2 else '', extra)
