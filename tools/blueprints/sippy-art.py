"""Draw the seven original Sippy construction plates. No runtime assets are inputs.

All dimensions are in standing heights. The illustrator builds closed paint shapes
from hand-placed cross sections and brush paths, then projects them with an
orthographic z-buffer. Requires Python, NumPy and Pillow.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'characters-review' / 'blueprints' / 'sippy' / 'design'
TAU = 2 * math.pi
VIEWS = {'front': (0, 0), 'back': (180, 0), 'left': (90, 0), 'right': (-90, 0),
         'high-front': (-35, 22), 'rear-three-quarter': (145, 0), 'top': (0, 90)}
# These are the illustrator's intended lit colours, selected from the original
# vineyard and cellar art before looking at any colour or silhouette comparison.
PALETTE = {
    'skin': ('Warm apricot skin', '#D8A076'), 'flush': ('Warm ear and cheek', '#C68A70'),
    'lips': ('Rosewood lips', '#AE6F58'), 'mouth': ('Smile shadow', '#602F29'),
    'lining': ('Macaroon Cream waistcoat lining', '#EDD4A8'),
    'sclera': ('Warm ivory sclera', '#F5E8D8'), 'iris': ('Chestnut iris', '#734621'),
    'pupil': ('Deep umber pupil and lash', '#251A17'), 'catchlight': ('Eye and glass glint', '#FFF8E7'),
    'hair': ('Espresso hair base and brows', '#3B281F'), 'chestnut': ('Creamy Espresso comb highlights', '#914C2C'),
    'jacket': ('Smoked charcoal wool', '#514740'), 'stripe': ('Fine warm pinstripe', '#776A5E'),
    'lapel': ('Turned charcoal lapel', '#63564B'), 'vest': ('Walnut waistcoat', '#685447'),
    'trousers': ('Charcoal trousers', '#48413E'), 'shirt': ('Warm white cotton', '#F3E6D3'),
    'bow': ('Burgundy bow silk', '#7D3037'), 'pocketSquare': ('Wine pocket square', '#8B3740'),
    'metalButton': ('Dark horn button', '#3E302A'), 'gold': ('Aged gold', '#B98E52'),
    'shoe': ('Polished oxford leather', '#44342D'), 'sole': ('Dark leather welt', '#2E2724'),
    'glass': ('Cool wineglass edge', '#BDD0CE'), 'wine': ('Red wine', '#712536'),
}

pieces = []


def unit(v):
    a = np.asarray(v, dtype=float)
    return a / max(1e-10, np.linalg.norm(a))


def rgb(s):
    return np.asarray([int(s[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def paint(material, points, triangles, marker='', tone=None):
    points = np.asarray(points, float)
    faces = np.asarray(triangles, int)
    color = rgb(PALETTE[material][1])
    tint = np.ones((len(points), 1)) if tone is None else np.asarray(tone, float).reshape(-1, 1)
    pieces.append([material, marker, points, faces, color * tint])


def lattice(material, fn, longitudinal, around, marker='', closed=True, shade=None):
    points, triangles, tones = [], [], []
    cols = around if closed else around + 1
    for i in range(longitudinal + 1):
        v = i / longitudinal
        for j in range(cols):
            u = j / around
            points.append(fn(v, u))
            tones.append(shade(v, u) if shade else 1.0)
            if i < longitudinal and (closed or j < around):
                a, b = i * cols + j, i * cols + (j + 1) % cols
                triangles.extend(((a, b, a + cols), (b, b + cols, a + cols)))
    paint(material, points, triangles, marker, tones)


def smooth_profile(controls, samples):
    # Shape-preserving cubic interpolant through the drawn control points.
    controls = np.asarray(controls, float)
    t = np.clip(samples, 0, len(controls) - 1).reshape(-1, 1)
    k = np.minimum(np.floor(t[:, 0]).astype(int), len(controls) - 2)
    f = t - k[:, None]
    p0, p1 = controls[k], controls[k + 1]
    slopes = np.diff(controls, axis=0)
    tangents = np.zeros_like(controls)
    tangents[0], tangents[-1] = slopes[0], slopes[-1]
    for n in range(1, len(controls) - 1):
        a, b = slopes[n - 1], slopes[n]
        same = (a * b) > 0
        tangents[n, same] = 2 * a[same] * b[same] / (a[same] + b[same])
    return (1 - f)**2 * ((1 + 2*f)*p0 + f*tangents[k]) + f*f*((3 - 2*f)*p1 + (f-1)*tangents[k+1])


def profiles(material, rows, marker='', angles=None, sections=42):
    # Rows run from hem to collar: y, centre x, centre z, width and depth.
    sampled = smooth_profile(rows, np.linspace(0, len(rows)-1, (len(rows)-1)*3+1))
    def vertex(v,u):
        i = round(v*(len(sampled)-1))
        y,x,z,w,d = sampled[i]
        a = u*TAU if angles is None else angles(y,u)
        return x+w*np.sin(a), y, z+d*np.cos(a)
    lattice(material, vertex, len(sampled)-1, sections, marker, angles is None)
    return sampled


def oval(material, center, radii, marker='', rot=0, tilt=0, seg=28):
    x,y,z = center
    rx,ry,rz = radii
    def vertex(v,u):
        phi, a = (v-.5)*math.pi, u*TAU
        xx, yy, zz = rx*math.cos(phi)*math.sin(a), ry*math.sin(phi), rz*math.cos(phi)*math.cos(a)
        xx, yy = xx*math.cos(rot)-yy*math.sin(rot),xx*math.sin(rot)+yy*math.cos(rot)
        xx, zz = xx*math.cos(tilt)+zz*math.sin(tilt), zz*math.cos(tilt)-xx*math.sin(tilt)
        return x+xx,y+yy,z+zz
    lattice(material, vertex, 18, seg, marker)


def stroke(material, points, widths, depths=None, marker='', radial=None, around=12):
    # A tapered brush swept through the illustration, with explicit roll
    # direction for the flat silk folds and brushed hair clumps.
    if np.isscalar(widths):
        widths = [widths]*len(points)
    if depths is None:
        depths = widths
    if np.isscalar(depths):
        depths = [depths]*len(points)
    controls = [list(p)+[w,d] for p,w,d in zip(points,widths,depths)]
    sampled = smooth_profile(controls, np.linspace(0,len(controls)-1, 4*(len(controls)-1)+1))
    tangent = np.gradient(sampled[:,:3], axis=0)
    basis=[]
    for i, (pos, direction) in enumerate(zip(sampled,tangent)):
        axis=unit(direction)
        ref=unit(radial(pos[:3]) if radial else (0,0,1))
        if abs(np.dot(axis,ref))>.97:
            ref=unit((0,1,.1))
        side=unit(np.cross(ref,axis))
        out=unit(np.cross(axis,side))
        basis.append((side,out))
    def vertex(v,u):
        k=round(v*(len(sampled)-1)); p=sampled[k]; s,n=basis[k]
        a=u*TAU
        return p[:3]+p[3]*math.cos(a)*s+p[4]*math.sin(a)*n
    lattice(material,vertex,len(sampled)-1,around,marker)


def flat(material, polygon, marker=''):
    # The paper shapes are convex or simple fans in their local plane.
    c=np.mean(polygon,axis=0)
    paint(material,[c,*polygon],[(0,i+1,(i+1)%len(polygon)+1) for i in range(len(polygon))],marker)


def face():
    profiles('skin',[
        [.701,0,.010,.005,.011],[.709,0,.015,.050,.047],
        [.729,0,.014,.084,.071],[.769,0,.009,.108,.088],
        [.809,0,.004,.114,.095],[.849,0,.001,.117,.098],
        [.885,0,-.003,.115,.094],[.915,0,-.007,.109,.085],
        [.945,0,-.008,.082,.065],[.959,0,-.008,.030,.030],
    ],'face',sections=64)
    for side in [-1,1]:
        oval('skin',(side*.112,.795,-.004),(.022,.031,.019),rot=-side*.16)
        oval('flush',(side*.121,.795,.009),(.012,.022,.006),rot=-side*.18)
        stroke('skin',[(side*.121,.805,.014),(side*.115,.799,.015),(side*.118,.787,.014)],
               [.0025,.0034,.0014])
        eye_center=(side*.047,.835,.090)
        oval('sclera',eye_center,(.039,.033,.0125),'eye',rot=-side*.04,tilt=side*.30)
        oval('iris',(side*.045,.8358,.103),(.0208,.0248,.005),'iris',tilt=side*.26)
        oval('pupil',(side*.0447,.837,.1078),(.0119,.0152,.0018),tilt=side*.26)
        oval('catchlight',(side*.045-.006,.8447,.110),(.0044,.005,.0015))
        oval('catchlight',(side*.045+.006,.828,.110),(.0016,.0017,.0007))
        lids=[(side*x,y,z) for x,y,z in [(.012,.839,.100),(.028,.857,.106),(.052,.864,.103),(.077,.854,.094),(.085,.842,.083)]]
        stroke('skin',lids,[.001,.004,.0057,.004,.001],[.001,.0028,.0031,.002,.0005])
        stroke('pupil',[(x,y-.0021,z+.0014)for x,y,z in lids],[.0006,.0012,.0017,.0013,.0004])
        stroke('hair',[(side*x,y,z) for x,y,z in [(.013,.873,.097),(.030,.881,.098),(.050,.886,.093),
               (.074,.880,.078),(.088,.871,.065)]],[.0028,.0068,.0078,.0053,.0017],
               [.002,.0038,.0046,.0035,.001],marker='brow')
    profiles('skin',[
        [.780,0,.101,.003,.003],[.783,0,.104,.016,.010],[.791,0,.108,.018,.014],
        [.805,0,.103,.010,.009],[.826,0,.095,.007,.007],[.843,0,.091,.006,.004]
    ],sections=32)
    for s in [-1,1]:
        oval('flush',(s*.010,.784,.116),(.004,.0017,.0012))
    # A curved painted smile wraps the cheeks rather than lying flat across
    # them. A narrow ivory arc shows the teeth within the open grin.
    def smile_surface(v,u,teeth=False):
        t=2*u-1; x=.048*t
        top=.758+.010*t*t+.003*t; gap=.011*(1-t*t)
        y=top-(.34*v if teeth else v)*gap
        slices=np.array([[.709,.050,.047,.015],[.729,.084,.071,.014],[.769,.108,.088,.009],
                         [.809,.114,.095,.004]])
        w=np.interp(y,slices[:,0],slices[:,1]);d=np.interp(y,slices[:,0],slices[:,2]);cz=np.interp(y,slices[:,0],slices[:,3])
        return x,y,cz+d*math.sqrt(max(0.,1-(x/w)**2))+.0042+(.0010 if teeth else 0.)
    lattice('mouth',lambda v,u:smile_surface(v,u),5,26,closed=False)
    lattice('sclera',lambda v,u:smile_surface(v,u,True),3,26,closed=False)
    stroke('lips',[smile_surface(1,u)for u in np.linspace(.03,.97,11)],
           [.0005,.0013,.0018,.0021,.0023,.0025,.0024,.0021,.0018,.0013,.0005])
    for s in [-1,1]:
        stroke('flush',[(s*.047,.768,.091),(s*.052,.773,.089),(s*.053,.777,.088)],[.0008,.0012,.0005])
    profiles('skin',[[.628,0,0,.031,.030],[.679,0,.004,.033,.030],[.718,0,.009,.030,.028]])


def groom():
    first=len(pieces)
    def scalp(v,u):
        a=u*TAU
        local=math.atan2(math.sin(a),math.cos(a)); f=(1+math.cos(a))*.5
        low=.756+.145*f**1.35+.019*math.exp(-((abs(local)-1.57)/.25)**2)-.014*math.exp(-((abs(local)-1.14)/.20)**2)
        phi=v*math.pi/2
        y=low+(.970-low)*math.sin(phi)
        rx=.119+.003*f;rz=.099+.002*f
        # Fitted short back and sides leave the ears and nape visible.
        return (-.006*math.sin(phi)+rx*math.cos(phi)*math.sin(a),y,
                -.006+rz*math.cos(phi)*math.cos(a))
    lattice('hair',scalp,22,80,'groom',shade=lambda v,u:.90+.08*v+.035*math.cos(u*TAU*32+v*8))
    # Single swept crown, broad at the front with a broken crest and a low taper.
    profiles('hair',[
        [.875,-.004,-.002,.105,.085],[.902,-.003,-.001,.119,.099],
        [.933,-.010,-.004,.118,.091],[.953,-.012,-.002,.116,.082],
        [.972,-.012,-.006,.092,.065],[.983,-.020,-.007,.051,.038],
        [.988,-.026,-.008,.005,.008],
    ],'groom',sections=60)
    radial=lambda p:np.array([p[0],p[1]-.843,p[2]+.011])
    for j in range(7):
        f=j/6; x=(f-.5)*.186; edge=abs(2*f-1)
        pts=[(x+.013,.896-.012*edge,.095-.030*edge),
             (x+.012,.923-.008*edge,.110-.034*edge),
             (x-.004,.956-.008*edge,.104-.030*edge),
             (x-.023,.980-.011*edge,.069-.014*edge),
             (x-.020,.989-.014*edge,.023-.008*edge),
             (x-.007,.973-.011*edge,-.044),
             (x+.003,.939-.011*edge,-.078+.012*edge)]
        stroke('hair',pts,[.002,.015,.019,.020,.020,.015,.002],[.001,.006,.009,.011,.010,.006,.0009],
               'groom',radial,20)
        high=[]
        for i,q in enumerate(pts[1:-1]):
            n=unit(radial(q)); surface=np.asarray(q)+n*[.0064,.0094,.012,.0112,.0064][i]
            surface[0]-=.002; high.append(surface)
        stroke('chestnut',high,[.0005,.0014,.0018,.0013,.0004],[.0003,.0008,.0009,.0007,.0002],'groom',radial)
    for s in [-1,1]:
        for j in range(5):
            az=s*(1.15+.39*j)
            path=[scalp(v,(az+s*.45*v)/TAU)for v in [.84,.62,.39,.18,.025]]
            path=[tuple(np.array(q)+unit(radial(q))*.0045) for q in path]
            stroke('hair',path,[.003,.011,.014,.010,.001],[.001,.0058,.006,.0045,.0006],'groom',radial)
        stroke('hair',[(s*.106,.891,.051),(s*.120,.857,.033),(s*.121,.825,.021),
                       (s*.118,.801,.020)], [.005,.010,.010,.0018],[.003,.004,.004,.001],'groom',radial)
    # Hold the drawn silhouette to the construction guides: the top guide and
    # full-width guide are design constraints in this illustration.
    cloud=np.vstack([p[2] for p in pieces[first:]])
    lo,hi=cloud[:,0].min(),cloud[:,0].max()
    for p in pieces[first:]:
        p[2][:,0]=(p[2][:,0]-(hi+lo)/2)*.268/(hi-lo)-.004
        p[2][:,1]=.756+(p[2][:,1]-.756)*(.244/(cloud[:,1].max()-.756))


def clothes():
    trunk=[
      [.391,0,-.003,.117,.073],[.421,0,-.001,.123,.076],[.466,0,.000,.116,.077],
      [.509,0,.002,.116,.077],[.563,0,.003,.129,.079],[.600,0,.000,.140,.077],
      [.634,0,-.003,.150,.070],[.654,0,-.004,.135,.058],[.669,0,-.002,.061,.040],
      [.675,0,.001,.036,.029]]
    data=np.asarray(trunk)
    def shellz(x,y):
        _,_,cz,w,d=[np.interp(y,data[:,0],data[:,i]) for i in range(5)]
        return cz+d*math.sqrt(max(.011,1-(x/w)**2))
    def on(x,y,layer=.001):
        return (x,y,shellz(x,y)+layer)
    def opening(y,u):
        f=np.interp(y,[.391,.445,.515,.615,.675],[.46,.31,.22,.51,.74])
        return f+(TAU-2*f)*u
    profiles('jacket',trunk,angles=opening,sections=64)
    vest=[(y,0,cz,w*.95,d*.94) for y,_,cz,w,d in trunk if .390<y<.67]
    profiles('vest',vest,sections=48)
    def bib(v,u):
        y=.548+.113*v
        width=np.interp(v,[0,.35,.76,1],[.001,.020,.046,.036])
        return on((2*u-1)*width,y,.0043)
    lattice('shirt',bib,18,12,closed=False)
    stroke('lining',[on(-.030,.590,.0057),on(-.015,.569,.0057),on(0,.545,.0057),on(.016,.569,.0057),on(.031,.590,.0057)],[.0007,.0013,.0018,.0013,.0007],around=8)
    for side in [-1,1]:
        ground=lambda arr:[on(side*x,y,.0035)for x,y in arr]
        flat('lapel',ground([(.018,.493),(.058,.584),(.086,.625),(.065,.632),(.082,.649),(.057,.660),(.038,.627)]))
        flat('shirt',ground([(.008,.648),(.025,.670),(.046,.651),(.030,.620)]))
        stroke('stripe',ground([(.018,.494),(.049,.564),(.073,.607),(.087,.624)]),.0012)
        for j in range(11):
            a=side*(.54+j*.221)
            pts=[]
            for y,_,cz,w,d in trunk[:-1]:
                if abs(a)<opening(y,0)+.005:continue
                pts.append(((w+.00045)*math.sin(a),y,cz+(d+.00045)*math.cos(a)))
            if len(pts)>1:stroke('stripe',pts,.00052,around=6)
    for j in range(4):
        y=.548-.027*j;oval('metalButton',on(0,y,.0027),(.0045,.0047,.0022))
        oval('gold',on(-.0013,y+.0007,.0046),(.0008,.0008,.0006))
    for s in [-1,1]:
        oval('bow',(s*.019,.641,.068),(.024,.014,.010),rot=s*.24)
        stroke('bow',[(s*.004,.641,.079),(s*.016,.644,.080),(s*.035,.649,.074)],[.001,.0018,.0006])
    oval('bow',(0,.641,.080),(.009,.010,.006))
    flat('pocketSquare',[on(x,y,.0045)for x,y in [(.066,.579),(.069,.592),(.075,.588),(.081,.596),(.085,.579)]])
    stroke('stripe',[on(.062,.579,.004),on(.074,.579,.004),on(.090,.578,.004)],.0012)
    watch=[on(.005+.084*t,.495-.036*4*t*(1-t)+.005*t,.0045)for t in np.linspace(0,1,14)]
    stroke('gold',watch,.0018,around=9)
    oval('gold',on(.085,.499,.005),(.006,.006,.0023))
    # Two jacket vents overlap the seat, with a shallow rear cutaway.
    for s in [-1,1]:
        flat('jacket',[(s*.004,.439,-.071),(s*.100,.432,-.046),(s*.099,.365,-.067),
                       (s*.061,.331,-.085),(s*.006,.348,-.093)])
    profiles('trousers',[[.337,0,-.002,.075,.052],[.369,0,.000,.114,.067],
                        [.423,0,.000,.112,.069],[.451,0,.001,.104,.063]],'waistband')


def limbs():
    for s in [-1,1]:
        right=s<0
        x=.070*s
        leg=[
            [.055,x,.002,.044,.049],[.068,x,.004,.047,.050],[.084,x,-.001,.040,.041],
            [.124,x,-.006,.042,.045],[.172,x,-.008,.045,.050],
            [.201,x,.000,.042,.045],[.218,x,.006,.044,.051],[.236,x,.003,.047,.051],
            [.291,x,-.001,.053,.056],[.346,x,-.003,.061,.064],[.381,x,-.003,.059,.064],
            [.406,x,-.001,.047,.051]
        ]
        profiles('trousers',leg,sections=36)
        for n in range(12):
            a=n*TAU/12+.10
            stroke('stripe',[(cx+(w+.00025)*math.sin(a),y,cz+(d+.00025)*math.cos(a)) for y,cx,cz,w,d in leg[:-1]],
                   .00040,around=6)
        profiles('sole',[[0,x,.027,.039,.074],[.006,x,.027,.046,.078],[.012,x,.029,.045,.078]],sections=36)
        profiles('shoe',[[.008,x,.027,.045,.076],[.020,x,.028,.044,.076],[.031,x,.021,.041,.066],
                         [.045,x,.011,.037,.054],[.066,x,.000,.031,.040]],sections=36)
        for j in range(3):
            stroke('sole',[(x-.016,.041-.002*j,.049+.004*j),(x,.045-.002*j,.052+.004*j),
                           (x+.016,.041-.002*j,.049+.004*j)],.0013,around=8)
        # Paint the pictured sleeve in one sweeping silhouette. The right
        # carrying arm turns forward from the elbow to cradle its glass.
        xp=s*(.164 if right else .167)
        z0=.059 if right else .006
        wrist=.414 if right else .381
        arm=[
            [wrist,xp+s*.007,z0,.028,.030],[wrist+.018,xp+s*.007,z0-.005,.030,.031],
            [.471,xp+s*.006,.048 if right else .000,.032,.034],
            [.507,xp+s*.004,.020 if right else -.001,.032,.036],
            [.548,xp+s*.002,.005 if right else -.002,.036,.040],
            [.600,xp,-.002,.041,.044],[.639,xp,-.004,.043,.046],
            [.659,xp-s*.005,-.006,.035,.042],[.667,xp-s*.010,-.003,.020,.029],
            [.670,xp-s*.011,-.002,.003,.006]
        ]
        profiles('jacket',arm,'shoulder',sections=36)
        for j in range(10):
            a=(j+.28)*TAU/10
            stroke('stripe',[(xx+(w+.0003)*math.sin(a),y,z+(d+.0003)*math.cos(a))for y,xx,z,w,d in arm[:-2]],
                   .00048,around=6)
        profiles('shirt',[[wrist-.009,xp+s*.007,z0+.001,.022,.024],[wrist+.004,xp+s*.007,z0,.025,.026]],sections=28)
        handx=xp+s*.006
        oval('skin',(handx,wrist-.030,z0+.003),(.019,.030,.024),rot=-s*.08)
        for j in range(4):
            z=z0+.018-.009*j
            sweep=[(handx+s*.004,wrist-.039,z),(handx+s*.005,wrist-.048,z),
                   (handx-s*.003,wrist-.060+.002*abs(j-1),z+.002),
                   (handx-s*.011,wrist-.060+.002*abs(j-1),z+.005)]
            stroke('skin',sweep,[.0055,.0062,.0052,.0041],[.0046,.0050,.0046,.0030])
            oval('flush',sweep[-1],(.0038,.0012,.0029))
        stroke('skin',[(handx-s*.010,wrist-.024,z0+.015),(handx-s*.017,wrist-.032,z0+.027),
                       (handx-s*.009,wrist-.044,z0+.030)], [.0068,.0065,.0046])
        if right:
            stemx=handx+.004; stemz=z0+.028
            profiles('glass',[[wrist-.077,stemx,stemz,.015,.015],[wrist-.073,stemx,stemz,.016,.016],
                              [wrist-.071,stemx,stemz,.0022,.0022],[wrist-.018,stemx,stemz,.0022,.0022],
                              [wrist-.016,stemx,stemz,.005,.005]],sections=32)
            profiles('glass',[[wrist-.018,stemx,stemz,.004,.004],[wrist-.011,stemx,stemz,.015,.015],
                              [wrist+.007,stemx,stemz,.025,.025],[wrist+.025,stemx,stemz,.024,.024],
                              [wrist+.038,stemx,stemz,.020,.020]],sections=36)
            # The wine reads through the fine glass walls in the illustration.
            profiles('wine',[[wrist-.016,stemx,stemz,.006,.006],[wrist-.010,stemx,stemz,.017,.017],
                             [wrist+.001,stemx,stemz,.024,.024],[wrist+.012,stemx,stemz,.0265,.0265]],sections=36)
            angle=np.linspace(0,TAU,28)
            stroke('glass',[(stemx+.02*math.sin(a),wrist+.038,stemz+.02*math.cos(a))for a in angle],.0010,around=7)
            stroke('catchlight',[(stemx-.012,wrist-.005,stemz+.021),(stemx-.015,wrist+.012,stemz+.020),
                                 (stemx-.014,wrist+.030,stemz+.014)],[.0007,.0012,.0004],around=6)


def arrays():
    verts, tint, faces, normals=[],[],[],[]
    count=0
    for _,_,p,f,color in pieces:
        vecs=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
        norm=np.zeros(p.shape)
        for j in range(3):
            np.add.at(norm,f[:,j],vecs)
        norm/=np.maximum(1.e-12,np.linalg.norm(norm,axis=1,keepdims=True))
        verts.append(p);faces.append(f+count);normals.append(norm);tint.append(color);count+=len(p)
    return np.vstack(verts),np.vstack(normals),np.vstack(tint),np.vstack(faces)


def draw(world,normals,colors,faces,yaw,elevation):
    scale=2;w=512*scale;h=768*scale
    a,e=math.radians(yaw),math.radians(elevation)
    direction=np.asarray([math.sin(a)*math.cos(e),math.sin(e),math.cos(a)*math.cos(e)])
    right=np.asarray([math.cos(a),0,-math.sin(a)])
    up=np.cross(direction,right)
    relative=world-np.asarray([0,.5,0])
    xy=np.column_stack((w/2+relative@right*(h/1.2),h/2-relative@up*(h/1.2)))
    depth=relative@direction
    key=unit([-.36,.82,.45]); fill=unit([.70,.32,-.57])
    # Matte illustration with a cool rim and broad, warm shapes. The reference
    # painter and its materials are deliberately independent of the game shader.
    lam=np.maximum(0,normals@key);rim=np.maximum(0,normals@fill)
    pigment=colors*(.82+.24*lam[:,None]+.060*rim[:,None])
    rgba=np.zeros((h,w,4),dtype=np.uint8)
    zbuffer=np.full((h,w),-np.inf)
    for ids in faces:
        x0,y0=xy[ids[0]];x1,y1=xy[ids[1]];x2,y2=xy[ids[2]]
        det=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0)
        if abs(det)<.00001:continue
        xx0=max(0,math.floor(min(x0,x1,x2)));xx1=min(w,math.ceil(max(x0,x1,x2)))
        yy0=max(0,math.floor(min(y0,y1,y2)));yy1=min(h,math.ceil(max(y0,y1,y2)))
        if xx1<=xx0 or yy1<=yy0:continue
        px=np.arange(xx0,xx1)[None,:]+.5-x0;py=np.arange(yy0,yy1)[:,None]+.5-y0
        u=(px*(y2-y0)-py*(x2-x0))/det;v=((x1-x0)*py-(y1-y0)*px)/det
        a0=1-u-v
        zz=a0*depth[ids[0]]+u*depth[ids[1]]+v*depth[ids[2]]
        old=zbuffer[yy0:yy1,xx0:xx1]; visible=(u>=-1e-8)&(v>=-1e-8)&(a0>=-1e-8)&(zz>old)
        if not visible.any():continue
        old[visible]=zz[visible]
        ink=(a0[visible,None]*pigment[ids[0]]+u[visible,None]*pigment[ids[1]]+v[visible,None]*pigment[ids[2]])
        dest=rgba[yy0:yy1,xx0:xx1]
        dest[visible,:3]=np.clip(ink,0,255).astype(np.uint8);dest[visible,3]=255
    return Image.fromarray(rgba).resize((512,768),Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    face();groom();clothes();limbs()
    world,norms,col,faces=arrays()
    for name,(yaw,elev) in VIEWS.items():
        draw(world,norms,col,faces,yaw,elev).save(OUT/(name+'.png'),optimize=True)
    spec={
       'name':'Sippy','role':'Young vineyard sommelier','heightM':1.78,
       'landmarks':{'eyes':16.42,'chin':29.90,'shoulders':33.0,'waist':54.9,
                    'knee':78.2,'ankleCuff':94.5,'hairWidth':26.8},
       'palette':[dict(id=k,label=val[0],hex=val[1])for k,val in PALETTE.items()],
       'callouts':[
         {'label':'Proportions','text':'3.34 heads tall. Broad sleeve caps, generous cheeks, compact waist and weighted oxford toes.'},
         {'label':'Hairline','text':'A high asymmetric pompadour rolls back over a fitted short nape. Seven overlapping tapered clumps carry chestnut highlights; two shorter temple curls frame the face.'},
         {'label':'Expression','text':'Large warm chestnut irises with twin catchlights, broad expressive brows, a rounded nose and an open, turned-up smile.'},
         {'label':'Tailoring','text':'Warm charcoal pinstripes follow the suit and trouser grain. Notched lapels reveal ivory cotton, a walnut waistcoat, burgundy silk and a wine pocket square.'},
         {'label':'Accessories','text':'The right hand carries a stemmed red-wine glass. A brass-gold watch chain loops across the left waistcoat and ends at a small keeper.'},
         {'label':'Construction','text':'Eye centres, mandibular base, sleeve-cap peaks, top waist seam, patella centres and lower ankle hems define the vertical guides.'},
       ]}
    (ROOT/'tools/blueprints/sippy.json').write_text(json.dumps(spec,indent=2)+'\n')


if __name__=='__main__':main()
