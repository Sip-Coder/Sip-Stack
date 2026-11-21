"""Small orthographic illustrator for the field design sheets.

Patterns live in standing-height units, +X to the wearer's left and +Z forwards.
The only inputs are the named art palette, paper patterns and camera specification.
"""

import ctypes
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator

HERE = Path(__file__).resolve().parent
CAMERA = json.loads((HERE / 'views.json').read_text())
TAU = 2 * np.pi


class Plate:
    def __init__(self, hero):
        self.hero = hero
        self.spec = json.loads((HERE / (hero + '.json')).read_text())
        self.inks = {p['id']: np.array(list(bytes.fromhex(p['hex'][1:])), dtype=float) for p in self.spec['palette']}
        self.parts = []

    def surface(self, grid, ink):
        q = np.asarray(grid)
        front = np.stack([q[:-1, :-1], q[:-1, 1:], q[1:, :-1]], axis=2)
        back = np.stack([q[1:, :-1], q[:-1, 1:], q[1:, 1:]], axis=2)
        tri = np.concatenate((front.reshape(-1, 3, 3), back.reshape(-1, 3, 3)))
        self.parts.append((tri, self.inks.get(ink) if isinstance(ink, str) else np.asarray(ink)))

    def shell(self, ink, rows, *, gap=0, box=1, sides=36):
        """Horizontal stations, ordered by elevation: y, x, z, half breadth, half depth."""
        rows = np.asarray(rows, dtype=float)
        y = np.unique(np.r_[rows[:, 0], np.linspace(*rows[[0, -1], 0], max(12, 3*len(rows)))])
        x, z, w, d = PchipInterpolator(rows[:, 0], rows[:, 1:])(y).T
        a = np.linspace(gap, TAU-gap, sides + 1)
        sx, cz = np.sin(a), np.cos(a)
        sx, cz = np.sign(sx)*abs(sx)**box, np.sign(cz)*abs(cz)**box
        self.surface(np.stack((x[:,None]+w[:,None]*sx, np.broadcast_to(y[:,None],(len(y),len(a))),
                               z[:,None]+d[:,None]*cz),axis=-1), ink)

    def oval(self, ink, xyz, dimensions, *, rotate=0, tilt=0, sides=28):
        a, phi = np.meshgrid(np.linspace(0, TAU, sides+1), np.linspace(-np.pi/2, np.pi/2, 19))
        x, y, z = dimensions[0]*np.cos(phi)*np.sin(a), dimensions[1]*np.sin(phi), dimensions[2]*np.cos(phi)*np.cos(a)
        x, y = x*np.cos(rotate)-y*np.sin(rotate), x*np.sin(rotate)+y*np.cos(rotate)
        x, z = x*np.cos(tilt)+z*np.sin(tilt), -x*np.sin(tilt)+z*np.cos(tilt)
        self.surface(np.stack((x,y,z),axis=-1)+xyz, ink)

    def stroke(self, ink, coords, widths, depths=None, *, facets=8, smooth=True):
        """A swept brush, with independent breadth and relief at each control."""
        coords = np.asarray(coords, dtype=float)
        w=np.broadcast_to(widths,(len(coords),))
        d=w if depths is None else np.broadcast_to(depths,(len(coords),))
        values=np.column_stack((coords,w,d))
        if smooth:
            values=PchipInterpolator(np.arange(len(coords)),values)(np.linspace(0,len(coords)-1,1+3*(len(coords)-1)))
        p=values[:,:3]
        tangents=np.gradient(p,axis=0)
        tangents/=np.maximum(np.linalg.norm(tangents,axis=1,keepdims=True),1e-12)
        ref=np.tile([0.,0.,1.],(len(p),1))
        ref[np.abs(tangents[:,2])>.97]=[0,1,0]
        side=np.cross(tangents,ref)
        side/=np.maximum(np.linalg.norm(side,axis=1,keepdims=True),1e-12)
        outward=np.cross(side,tangents)
        a=np.linspace(0,TAU,facets+1)
        self.surface(p[:,None,:]+(side*values[:,3,None])[:,None,:]*np.cos(a)[None,:,None]
                     +(outward*values[:,4,None])[:,None,:]*np.sin(a)[None,:,None],ink)

    def ring(self, ink, center, rx, rz, radius, ydelta=0, front=1):
        a=np.linspace(0,TAU,49)
        self.stroke(ink,np.column_stack((center[0]+rx*np.sin(a), center[1]+ydelta*np.cos(a),
                                        center[2]+front*rz*np.cos(a))),radius,smooth=False)

    def ellipse(self, ink, center, rx, ry, radius, *, side=False):
        a=np.linspace(0,TAU,49); x,y,z=center
        points=np.column_stack((x+rx*np.sin(a),y+ry*np.cos(a),z+0*a))
        if side: points[:,0],points[:,2] = x+0*a,z+rx*np.sin(a)
        self.stroke(ink,points,radius,smooth=False)

    def render(self):
        dest=HERE.parents[1]/'characters-review'/'blueprints'/self.hero/'design'
        dest.mkdir(parents=True,exist_ok=True)
        triangles=np.concatenate([part[0] for part in self.parts])
        inks=np.concatenate([np.broadcast_to(part[1],(len(part[0]),3)) for part in self.parts])
        normal=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])
        normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-12)
        # Build the little depth-buffer shader into a private temporary directory.
        # A true depth comparison keeps close layers clean in every ortho view.
        temporary = tempfile.TemporaryDirectory()
        shared = Path(temporary.name) / 'paper.so'
        subprocess.run(['cc', '-O2', '-shared', '-fPIC', str(HERE/'paper-raster.c'),
                        '-o', str(shared), '-lm'], check=True)
        raster = ctypes.CDLL(str(shared)).paint_paper
        raster.argtypes = [ctypes.c_int]*3 + [ctypes.c_void_p]*4
        raster.restype = None
        triangles=triangles-[0,.5,0]
        for view,angles in CAMERA['views'].items():
            yaw,pitch=np.radians(angles)
            gaze=np.array([np.sin(yaw)*np.cos(pitch),np.sin(pitch),np.cos(yaw)*np.cos(pitch)])
            right=np.array([np.cos(yaw),0,-np.sin(yaw)]); up=np.cross(gaze,right)
            n=normal*np.where(normal@gaze>=0,1.,-1.)[:,None]
            key=np.array([-.45,.78,.44]); half=key+gaze; half/=np.linalg.norm(half)
            shine=np.maximum(0,n@half)**24
            lit=np.uint8(np.clip(inks*(.77+.28*np.maximum(0,n@key)[:,None])+7*shine[:,None],0,255))
            lit = np.ascontiguousarray(lit)
            w,h=CAMERA['width']*3,CAMERA['height']*3
            vertices = np.ascontiguousarray(np.stack((w/2+(triangles@right)*h/1.2,
                    h/2-(triangles@up)*h/1.2, triangles@gaze),axis=-1),dtype=np.float32)
            canvas=np.zeros((h,w,4),dtype=np.uint8)
            depth=np.full((h,w),-np.inf,dtype=np.float32)
            raster(w,h,len(vertices),vertices.ctypes.data,lit.ctypes.data,canvas.ctypes.data,depth.ctypes.data)
            Image.fromarray(canvas).resize((w//3,h//3),Image.Resampling.LANCZOS).save(dest/(view+'.png'),optimize=True)
        temporary.cleanup()
