"""Draw Roma's independent orthographic design plates from original costume patterns.

Run with Python, NumPy and Pillow. All dimensions below are the illustrator's
design coordinates, with one unit from the soles to the crown. The stage and its
character builders are deliberately outside this artwork's dependency tree.
"""

from pathlib import Path
import json
import math
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "characters-review/blueprints/roma/design"
TARGET = json.loads((HERE / "roma.json").read_text())
PALETTE = {r["id"]: np.array(list(bytes.fromhex(r["hex"][1:]))) / 255
           for r in TARGET["palette"]}
VIEWS = {"front": (0, 0), "back": (180, 0), "left": (90, 0), "right": (-90, 0),
         "high-front": (-35, 22), "rear-three-quarter": (145, 0), "top": (0, 90)}
TAU = 2 * math.pi
surfaces = []


def color(c):
    return PALETTE[c] if isinstance(c, str) else np.asarray(c)


def pattern(rows, count=32):
    """Monotone cubic interpolation of hand-drawn horizontal contour stations."""
    rows = np.array(rows, dtype=float)
    ys = rows[:, 0]
    v = rows[:, 1:]
    steps = np.diff(ys)
    secants = np.diff(v, axis=0) / steps[:, None]
    slopes = np.vstack([secants[0], (secants[:-1] + secants[1:]) * .5, secants[-1]])
    slopes[1:-1] = np.where(secants[:-1] * secants[1:] <= 0, 0, slopes[1:-1])
    y = np.linspace(ys[0], ys[-1], count)
    i = np.clip(np.searchsorted(ys, y) - 1, 0, len(steps) - 1)
    t = ((y - ys[i]) / steps[i])[:, None]
    h = steps[i, None]
    p = ((2*t**3-3*t**2+1)*v[i] + (t**3-2*t**2+t)*h*slopes[i]
         + (-2*t**3+3*t**2)*v[i+1] + (t**3-t**2)*h*slopes[i+1])
    return np.column_stack((y, p))


def paint(grid, pigments, spec=0, soft=False):
    p = np.asarray(grid, dtype=float)
    along = np.gradient(p, axis=0)
    across = np.gradient(p, axis=1)
    n = np.cross(along, across)
    # Positive contour angles run from the front towards the wearer's left.
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-9)
    rows = p.shape[0]-1
    pigments = np.array([color(pigments(t/rows)) if callable(pigments) else color(pigments) for t in range(rows)])
    corners = [p[:-1,:-1],p[:-1,1:],p[1:,1:],p[1:,:-1]]
    normals = [n[:-1,:-1],n[:-1,1:],n[1:,1:],n[1:,:-1]]
    for a,b,c in [(0,1,2),(0,2,3)]:
        tri = np.stack((corners[a], corners[b], corners[c]), axis=-2)
        norm = (normals[a]+normals[b]+normals[c])/3
        norm /= np.maximum(np.linalg.norm(norm,axis=-1,keepdims=True),1e-9)
        rgb = np.broadcast_to(pigments[:,None,:],norm.shape)
        surfaces.append((tri.reshape(-1,3,3),norm.reshape(-1,3),rgb.reshape(-1,3),spec,soft))


def shell(rows, pigment, segments=40, levels=32, opening=None, pleat=0, spec=0, neckline=None):
    """Contour rows give y, centre x/z, then half-width and front/back depth."""
    vals = pattern(rows,levels)
    grid=[]
    for j,(y,x,z,w,d) in enumerate(vals):
        t=j/(len(vals)-1)
        a=opening(y) if opening else 0
        u=np.linspace(a,TAU-a,segments+1)
        r=1+pleat*(1-t)**1.3*(.58*np.cos(6*u+.4)+.42*np.sin(9*u))
        yy=np.full(u.shape,y)
        if neckline is not None: yy-=neckline(u)*max(0,(y-.53)/(rows[-1][0]-.53))**1.5
        grid.append(np.column_stack((x+w*np.sin(u)*r,yy,z+d*np.cos(u)*r)))
    # With vertically ascending rows, reverse traversal to obtain outside normals.
    paint(np.array(grid)[:,::-1],pigment,spec)


def oval(center, radii, ink, az=0, spec=0, N=28, M=16):
    a=np.linspace(0,TAU,N+1); h=np.linspace(-math.pi/2+.0005,math.pi/2-.0005,M)
    x=radii[0]*np.cos(h[:,None])*np.sin(a)
    z=radii[2]*np.cos(h[:,None])*np.cos(a)
    y=np.broadcast_to(radii[1]*np.sin(h)[:,None],x.shape)
    s,c=math.sin(az),math.cos(az)
    points=np.stack((center[0]+c*x+s*z,center[1]+y,center[2]-s*x+c*z),axis=-1)
    paint(points[:,::-1],ink,spec)


def stroke(points, radius, pigment, sides=8, spec=0):
    path=np.asarray(points)
    tangent=np.gradient(path,axis=0)
    tangent/=np.maximum(np.linalg.norm(tangent,axis=1,keepdims=True),1e-10)
    # Parallel transport the painted cross-section so it follows a spiral smoothly.
    u=np.cross(tangent[0],[0,0,1])
    if np.linalg.norm(u)<.02: u=np.cross(tangent[0],[0,1,0])
    u/=np.linalg.norm(u)
    circle=np.linspace(0,TAU,sides+1)
    grid=[]
    for j,(v,n) in enumerate(zip(path,tangent)):
        u=u-np.dot(u,n)*n
        u/=max(1e-10,np.linalg.norm(u))
        w=np.cross(n,u)
        t=j/(len(path)-1)
        r=radius(t) if callable(radius) else radius
        grid.append(v+r*(np.cos(circle)[:,None]*u+np.sin(circle)[:,None]*w))
    paint(np.array(grid)[:,::-1],pigment,spec)


def spline(points,n=28):
    p=np.asarray(points,dtype=float); t=np.linspace(0,len(p)-1,n)
    i=np.minimum(t.astype(int),len(p)-2); v=(t-i)[:,None]
    a=p[np.maximum(0,i-1)];b=p[i];c=p[i+1];d=p[np.minimum(len(p)-1,i+2)]
    return .5*((2*b)+(-a+c)*v+(2*a-5*b+4*c-d)*v**2+(-a+3*b-3*c+d)*v**3)


def cord(points,r,ink,spec=0):
    stroke(spline(points),r,ink,spec=spec)


def loop(center,rx,ry,az,r,ink):
    a=np.linspace(0,TAU,45); u=np.cos(a)*rx
    stroke(np.column_stack((center[0]+u*np.cos(az),center[1]+ry*np.sin(a),
                            center[2]-u*np.sin(az))),r,ink,spec=.4)


def body():
    for side in [-1,1]:
        def legrows(rows):
            return [(y,side*x,z,w,d) for y,x,z,w,d in rows]
        shell(legrows([(.032,.071,.002,.028,.027),(.063,.074,.001,.027,.029),
              (.117,.075,-.004,.035,.041),(.163,.075,-.002,.043,.045),
              (.205,.073,.002,.035,.036),(.240,.070,.006,.038,.039),
              (.277,.066,.001,.050,.049),(.354,.066,-.001,.057,.054),
              (.407,.067,0,.058,.054)]),"skin")
        shell(legrows([(.0004,.073,.026,.042,.068),(.007,.073,.027,.047,.075),
              (.019,.073,.030,.049,.079),(.026,.073,.027,.047,.077)]),"sole",levels=12)
        shell(legrows([(.017,.073,.03,.048,.077),(.027,.073,.028,.048,.075),
              (.041,.073,.022,.043,.063),(.057,.073,-.002,.034,.038),
              (.067,.074,-.005,.031,.034)]),"leather",levels=22)
        shell(legrows([(.058,.074,-.004,.033,.036),(.061,.074,-.005,.035,.037),
              (.065,.074,-.005,.033,.035)]),"strap",levels=6)
    # The sweep of the skirt is a flared, softly pleated A line below the belt.
    shell([(.164,0,.003,.153,.098),(.175,0,.002,.155,.099),(.210,0,.004,.147,.097),
           (.282,0,.002,.140,.094),(.369,0,-.002,.134,.087),(.421,0,-.003,.122,.077),
           (.477,0,0,.092,.064),(.511,0,.001,.100,.060),(.573,0,.003,.119,.075),
           (.617,0,.004,.123,.072),(.646,0,-.001,.105,.059)],
          "dress",levels=65,pleat=.025,neckline=lambda a:.057*np.maximum(0,np.cos(a))**3.5)
    shell([(.467,0,0,.096,.068),(.480,0,0,.096,.068),(.493,0,0,.097,.067)],
          "leather",levels=8)
    loop((0,.480,.070),.016,.010,0,.0032,"brass")
    # Shoulder and neck appear above the scoop. The jacket curves into the lapels.
    shell([(.566,0,.001,.102,.054),(.600,0,.002,.108,.057),(.622,0,.001,.116,.059),
           (.649,0,-.001,.113,.057),(.658,0,-.001,.071,.041),(.672,0,0,.042,.037),
           (.704,0,.003,.038,.035),(.718,0,.004,.041,.040)],"skin")
    shell([(.421,0,-.003,.135,.083),(.463,0,.001,.117,.078),(.486,0,.001,.103,.073),
           (.533,0,.001,.119,.077),(.593,0,.002,.141,.082),(.627,0,-.002,.152,.078),
           (.649,0,-.003,.144,.067),(.660,0,-.004,.113,.053),(.662,0,-.004,.076,.042)],
          "satin",opening=lambda y:.43+.21*max(0,min(1,(.64-y)/.15)),spec=.40)
    for s in (-1,1):
        cord([(s*.025,.654,.044),(s*.057,.629,.066),(s*.080,.610,.070),
              (s*.063,.596,.077),(s*.073,.587,.076),(s*.050,.542,.072),
              (s*.055,.487,.065),(s*.083,.423,.065)],.0024,"binding",.38)
        # The elbow stays softly bent. Five relaxed fingers taper separately.
        def armrows(rows):
            return [(y,s*x,z,w,d) for y,x,z,w,d in rows]
        shell(armrows([(.347,.199,.019,.025,.024),(.368,.197,.014,.028,.028),
              (.410,.190,.008,.031,.031),(.458,.185,.003,.034,.035),(.496,.180,-.003,.034,.036),
              (.555,.173,-.003,.039,.042),(.607,.160,.001,.049,.048),
              (.639,.151,0,.048,.047),(.658,.142,.002,.034,.035),
              (.662,.141,.002,.024,.023)]),"satin",spec=.38)
        shell(armrows([(.348,.198,.019,.026,.026),(.359,.198,.016,.029,.029),
                      (.367,.197,.015,.028,.028)]),"facing",levels=7,spec=.29)
        oval((s*.202,.324,.027),(.026,.041,.024),"skin")
        for j,length in enumerate([.025,.031,.029,.021]):
            xx=s*(.183+j*.012)
            cord([(xx,.319,.031),(xx+s*.001,.304,.033),(xx,.318-length,.040),
                  (xx-s*.002,.311-length,.045)],lambda t:.0078*(1-.42*t),"skin")
            oval((xx,.312-length,.048),(.0040,.006,.0014),"nail")
        cord([(s*.186,.329,.036),(s*.171,.320,.041),(s*.170,.307,.046)],.0085,"skin")
        for y in [.445,.477]:
            oval((s*.071,y,.070),(.0047,.005,.003),"brass",spec=.5)
    for yy,size in [(.634,.089),(.614,.096)]:
        a=np.linspace(-1.3,1.3,40)
        stroke(np.column_stack((size*np.sin(a),yy+.025*(1-np.cos(a)),.003+.061*np.cos(a))),
               .0017,"jewelry",spec=.55)
    oval((0,.609,.065),(.006,.011,.0032),"jewelry",spec=.6)

def head():
    shell([(.697,0,.028,.013,.016),(.704,0,.018,.041,.046),
           (.718,0,.014,.068,.064),(.743,0,.014,.095,.079),
           (.778,0,.012,.116,.090),(.812,0,.009,.124,.098),
           (.852,0,.007,.124,.103),(.891,0,.003,.126,.101),
           (.929,0,-.002,.118,.092),(.954,0,-.006,.091,.076),
           (.969,0,-.009,.049,.044)],"skin",segments=56,levels=62)
    for s in [-1,1]:
        oval((s*.120,.801,.004),(.022,.034,.017),"skin")
        oval((s*.129,.801,.016),(.013,.022,.009),"blush")
        loop((s*.135,.766,.018),.014,.022,.43*s,.0030,"jewelry")
        # Round eyes with tapered corners and an asymmetric higher left brow.
        a=s*.34; ex=s*.055; ez=.099
        def eye(u,v,w):
            return [ex+math.cos(a)*u+math.sin(a)*w,.835+v,ez-math.sin(a)*u+math.cos(a)*w]
        # Paint an almond aperture with a gentle corneal dome.
        us=np.linspace(-.999,.999,55); lens=[]
        for v in np.linspace(0,1,26):
            row=[]
            for u in us:
                q=(1-u*u)**.61
                yy=(-.024+.053*v)*q+s*.0045*u
                ww=.006+.0155*(1-u*u)*math.sin(math.pi*v)
                row.append(eye(.041*u,yy,ww))
            lens.append(row)
        paint(np.array(lens)[:,::-1],"eyeWhite")
        oval(eye(-s*.002,-.001,.021),(.021,.023,.0032),"iris",a,N=32,M=20)
        oval(eye(-s*.002,0,.026),(.011,.015,.0026),"pupil",a)
        oval(eye(-.007,.012,.029),(.0057,.0064,.002),"catchlight",a)
        oval(eye(.007,-.006,.028),(.0026,.0027,.0015),"catchlight",a)
        for upper in [True,False]:
            samples=[]
            for t in np.linspace(-1,1,28):
                q=max(0,1-t*t)**.58
                samples.append(eye(.040*t,(.029 if upper else -.024)*q+s*.0045*t,.006))
            stroke(samples,lambda t:(.0026 if upper else .0017)*(.16+.84*math.sin(t*math.pi)**.6),
                   "brow" if upper else "blush")
        for k in range(3):
            u=s*(.025+.005*k);z=math.sqrt(max(.01,1-(u/.041)**2))
            cord([eye(u,.028*z,.007),eye(u+s*.005,.031*z+.003,.008)],.0014,"brow")
        bow=[eye(-s*.036,.052,.000),eye(-s*.017,.063+.003*(s>0),.003),
             eye(s*.009,.063+.004*(s>0),.000),eye(s*.032,.053,-.004),eye(s*.039,.048,-.009)]
        cord(bow,lambda t:.0052*(.18+.82*math.sin(math.pi*t)**.55),"brow")
    # Nose bridge, nostril wings and Cupid's bow articulate the central face.
    cord([(0,.822,.104),(0,.805,.111),(0,.788,.119),(0,.781,.125)],
         lambda t:.005+.006*t,"skin")
    oval((0,.780,.120),(.016,.014,.015),"skin")
    for s in [-1,1]:
        oval((s*.012,.778,.115),(.010,.008,.009),"skin")
        oval((s*.011,.775,.122),(.0031,.0022,.0021),"blush")
    u=np.linspace(-1,1,50)
    cheek=.015+.082*np.sqrt(1-(.047*u/.10)**2)
    upper=.751+.009*u*u+.0012*np.cos(2*math.pi*u)
    lower=upper-.014*(1-u*u)
    def smile(top,bottom,z,ink):
        p=np.stack([np.column_stack((.047*u,bottom+(top-bottom)*t,cheek+z))
                    for t in np.linspace(0,1,10)])
        paint(p[:,::-1],ink)
    smile(upper,lower,.003,"mouth")
    smile(upper-.001*(1-u*u),upper-.005*(1-u*u),.0041,"teeth")
    for edge,r in [(upper,.0027),(lower,.0032)]:
        stroke(np.column_stack((.047*u,edge,cheek+.0038)),
               lambda t:r*(.05+.95*math.sin(t*math.pi)**.65),"lip")
    for x,y in [(-.077,.786),(-.084,.791),(-.089,.784)]:
        oval((x,y,.012+.092*math.sqrt(1-(x/.117)**2)),(.0017,.0016,.002),"blush")


def groom():
    # A left-side part sends the long diagonal sweep across the forehead.
    angles=np.linspace(0,TAU,85)
    crown=[]; back=[]
    for t in np.linspace(0,1,49):
        front=np.maximum(0,np.cos(angles))
        hairline=.840+.076*front**2+.009*np.sin(2*angles+.35)*front
        phi=t*math.pi/2
        grow=np.cos(phi)**.83
        crown.append(np.column_stack(((.136*grow)*np.sin(angles)+.008*t,
                         hairline+(1.0-hairline)*np.sin(phi),-.012+.120*grow*np.cos(angles))))
        aperture=.95+.37*(1-t)
        angles2=np.linspace(aperture,TAU-aperture,85)
        spill=.015*np.sin(angles2*10+3*t)+.007*np.cos(angles2*7-5*t)
        bottom=.635+.022*np.cos(angles2)+.018*np.sin(6*angles2+1.3)
        fullness=1-.13*(1-t)**2
        rr=.146+.0055*np.cos(angles2*12+4*t)
        back.append(np.column_stack((fullness*rr*np.sin(angles2),
                    bottom+(hairline.mean()+.014-bottom)*t+spill*(1-t),
                    -.017+fullness*(.117+.004*np.sin(angles2*10-6*t))*np.cos(angles2))))
    paint(np.array(crown)[:,::-1],"curlDeep",.28)
    paint(np.array(back)[:,::-1],lambda t:(1-t)*color("curlWarm")+t*color("curlDeep"),.32)
    for k in range(40):
        outer=k*TAU/40
        verts=[]
        for t in np.linspace(0,1,41):
            fan=t**.65
            ang=.83+(outer-.83)*fan+.17*math.sin(math.pi*t)
            fr=max(0,math.cos(ang)); edge=.840+.076*fr**2+.009*math.sin(2*ang+.35)*fr
            phi=(1-t)*1.38
            radial=math.cos(phi)**.83
            verts.append([.008*(1-t)+(.1375*radial)*math.sin(ang),
                          edge+(1-edge)*math.sin(phi)+.001,
                          -.012+(.1216*radial)*math.cos(ang)])
        stroke(verts,lambda t:(.0009+.0027*math.sin(math.pi*t))*(.4+.6*min(1,t*5)),
               "curlWarm" if k%4==1 else "curlBase",sides=7,spec=.39)
    # Slanting forelock sweeps across the forehead from the wearer's left part.
    for k in range(7):
        offset=k*.003
        path=spline([(.064+offset*.40,.967+offset*.16,.060),
                     (.031,.950+offset,.098+offset*.20),
                     (-.031,.938+offset*.55,.112+offset*.12),
                     (-.086,.918+offset*.4,.094),
                     (-.119,.887+offset*.55,.061),
                     (-.125,.868+offset,.050)],34)
        stroke(path,lambda t:(.0057-.00021*k)*(.25+.75*math.sin(t*math.pi)**.52),
               "curlWarm" if k in (1,4) else "curlBase",sides=8,spec=.45)
    # A full bank of small alternating spirals rather than a few rope-like braids.
    # Each curl has its own terminal turn, slim highlight and designed downward taper.
    for k in range(83):
        a=.63+(TAU-1.26)*k/82
        side=1 if math.sin(a)>0 else -1
        face=abs(math.sin(a/2))*2
        back=max(0,-math.cos(a))
        seed=math.sin(3.713*k+1.78)
        length=.258+.064*back+.026*seed+.016*abs(math.sin(a))
        start=.933+.022*math.sin(k*2.88)
        r=.0045+.0021*(.5+.5*math.cos(k*1.73))
        verts=[];acc=[]
        for t in np.linspace(0,1,52):
            pang=TAU*(2.17+.76*(.5+.5*math.sin(k*1.89)))*t+.87*k
            turn=.0041+.0053*math.sin(math.pi*t*.82)**.8
            at=a+side*.17*math.sin(t*math.pi)+.029*math.sin(3*t+k)
            breadth=.116+.044*math.sin(min(1,t*2)*math.pi/2)+.003*seed-.012*t*t
            depth=.087+.035*math.sin(min(1,t*2.4)*math.pi/2)
            x=(breadth+turn*math.cos(pang))*math.sin(at)
            z=-.014+(depth+turn*math.cos(pang))*math.cos(at)
            # Forelocks sweep away from the eyes and arch back along both cheeks.
            if min(a,TAU-a)<1.05:
                x+=side*.014*math.sin(math.pi*t)
                z+=.015*(1-t)
            x+=turn*.7*math.sin(pang)*math.cos(at)
            z-=turn*.7*math.sin(pang)*math.sin(at)
            y=start-length*t+.0045*math.sin(pang)
            verts.append([x,y,z])
            acc.append([x+.0028*math.sin(at),y+.001,z+.0028*math.cos(at)])
        mid=color("curlWarm" if k%3==0 else "curlBase")
        def tint(t):
            rgb=(1-min(1,t*2.2))*color("curlDeep")+min(1,t*2.2)*mid
            light=max(0,(t-.61)/.39)*(.75 if k%4==0 else .46)
            return rgb*(1-light)+light*color("curlLight")
        stroke(verts,lambda t:r*(1-.42*t)*max(.04,min(1,(1-t)*7))**.55,tint,sides=8,spec=.32)
        if k%3==1: stroke(acc,lambda t:.00105*(.15+.85*math.sin(math.pi*t)**.6),
                          lambda t:tint(min(1,t+.26)),sides=5,spec=.42)
    # Face-framing tendrils stop above the jewelled hoops on the part side;
    # the longer opposite sweep trails the cheek, distinct from the back bank.
    for s in [-1,1]:
        for k in range(3):
            path=[]
            for t in np.linspace(0,1,44):
                a=TAU*(1.08+k*.18)*t+.6*k
                path.append([s*(.073+.065*math.sin(t*1.83)+.006*math.sin(a)+k*.003),
                             .955-(.203+.025*(s<0)+.014*k)*t,
                             .069+.026*math.sin(1.4*math.pi*t)+.0065*math.cos(a)])
            stroke(path,lambda t:(.0061-.0011*k)*(1-.82*t),
                   lambda t:(1-t)*color("curlBase")+t*color("curlWarm"),spec=.35)

def accessories():
    # This strap emerges over her left collar and returns up the back.
    for pts in [[(.103,.645,.039),(.086,.623,.070),(.052,.591,.081),(.010,.547,.081),
                 (-.041,.494,.069),(-.088,.446,.064),(-.136,.395,.040)],
                [(.103,.644,-.028),(.073,.613,-.066),(.032,.565,-.077),(-.028,.507,-.075),
                 (-.084,.457,-.063),(-.132,.400,-.044)]]:
        cord(pts,.0063,"strap")
    shell([(.314,-.141,-.002,.028,.033),(.325,-.146,0,.039,.046),
           (.351,-.149,.001,.041,.047),(.386,-.146,.002,.038,.043),
           (.402,-.139,.003,.031,.035)],"leather")
    oval((-.149,.381,.026),(.040,.032,.026),"strap",spec=.14)
    oval((-.150,.364,.050),(.009,.007,.003),"brass",spec=.64)
    # Hand-held hexagonal brass lantern, drawn from its open bail down to the foot.
    x,z=.207,.044
    cord([(x-.027,.261,z),(x-.028,.285,z),(x-.016,.299,z),(x,.307,z),
          (x+.018,.298,z),(x+.028,.287,z),(x+.027,.262,z)],.0030,"brass",.58)
    def lamp(rows,ink):
        shell([(y,x,z,w,w) for y,w in rows],ink,segments=6,levels=9,spec=.43)
    lamp([(.174,.024),(.180,.033),(.188,.032)],"brass")
    lamp([(.187,.029),(.203,.034),(.226,.035),(.249,.027)],"glass")
    lamp([(.204,.007),(.217,.010),(.236,.003)],"wick")
    lamp([(.245,.033),(.250,.036),(.257,.027),(.265,.015),(.268,.011)],"brass")
    for a in np.arange(6)*TAU/6:
        cc,ss=math.cos(a),math.sin(a)
        cord([(x+.029*ss,.183,z+.029*cc),(x+.033*ss,.211,z+.033*cc),
              (x+.028*ss,.248,z+.028*cc)],.0019,"brass",.51)


def render():
    OUT.mkdir(parents=True,exist_ok=True)
    # Illustrative wash with quiet, directional highlights. Keep the alpha as an
    # unadorned figure silhouette so the panels can double as printed overlays.
    light=np.array([-.47,.68,.56]); light/=np.linalg.norm(light)
    for name,(az,el) in VIEWS.items():
        a,e=np.radians([az,el])
        eye=np.array([math.sin(a)*math.cos(e),math.sin(e),math.cos(a)*math.cos(e)])
        right=np.array([math.cos(a),0,-math.sin(a)])
        up=np.cross(eye,right)
        half=(eye+light);half/=np.linalg.norm(half)
        tris=[];z=[];rgb=[]
        for pts,norm,base,spec,soft in surfaces:
            centered=pts-np.array([0,.50,0])
            # Transparent threefold supersampling keeps hair tips and hoops intact.
            surfN=norm.copy()
            dot=np.maximum(0,np.sum(surfN*light,axis=1))
            value=.79+.22*dot
            shine=np.maximum(0,surfN@half)**(22 if spec>.30 else 15)
            lit=base*value[:,None]+(spec*.32)*shine[:,None]*np.array([1,.91,.70])
            X=256*3+(centered@right)*(768/1.20)*3
            Y=384*3-(centered@up)*(768/1.20)*3
            tris.append(np.stack((X,Y),axis=-1).reshape(-1,6))
            z.append((centered@eye).mean(axis=1))
            rgb.append(np.uint8(np.clip(lit,0,1)*255+.5))
        coords=np.concatenate(tris).astype(int).tolist()
        d=np.concatenate(z)
        ink=np.concatenate(rgb).tolist()
        order=np.argsort(d,kind='stable')
        img=Image.new('RGBA',(1536,2304),(0,0,0,0)); draw=ImageDraw.Draw(img)
        for i in order:
            draw.polygon(coords[i],fill=tuple(ink[i]))
        img.resize((512,768),Image.Resampling.LANCZOS).save(OUT/(name+'.png'),optimize=True)
        print(name,flush=True)


if __name__=='__main__':
    body();head();groom();accessories();render()
