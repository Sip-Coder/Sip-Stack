#!/usr/bin/env python3
"""Draw Hummin's original orthographic design on transparent paper.

The paths, dimensions, seam placement and palette in this file are the cellar
automaton reference artwork. Projection aligns the seven drawings to the same
datum. No game code, geometry, renders, masks or textures are inputs.
"""
from pathlib import Path
import argparse
import json
import math
import subprocess
import tempfile
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PALETTE = {s["id"]: s["hex"] for s in json.loads((HERE / "hummin.json").read_text())["palette"]}
INK = "#242929"
GOLD = PALETTE["brass"]
STEP = 640
TAU = 2 * math.pi


def rgb_mix(a, b, t):
    v = [round(int(a[i:i + 2], 16) * (1-t) + int(b[i:i + 2], 16)*t) for i in (1, 3, 5)]
    return "#" + "".join(f"{n:02x}" for n in v)


def f(n):
    return f"{n:.4f}"


def xy(point):
    return " ".join(f(v) for v in point)


def path(d, fill="none", stroke="none", width=1, extra=""):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'


def ellipse(cx, cy, rx, ry, fill, stroke="none", width=1, more=""):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(abs(rx))}" ry="{f(abs(ry))}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" {more}/>'


def stamp(center, width, height, art, rotation=0):
    return f'<g transform="translate({xy(center)}) rotate({f(rotation)}) scale({f(width)} {f(height)})">{art}</g>'


def line(points, colour, width=1, dash=None):
    d = "M " + " L ".join(xy(p) for p in points)
    return path(d, "none", colour, width, f'stroke-dasharray="{dash}"' if dash else "")


def polygon(points, fill, stroke="none", width=1):
    return path("M " + " L ".join(xy(p) for p in points) + " Z", fill, stroke, width)


def fill(name):
    return f"url(#g-{name})"


def paint_definitions():
    stops = {
        "pearl": [(.0,"#FCF9EB"),(.18,"#F0ECDD"),(.43,PALETTE["pearl"]),(.66,"#BABAB0"),(.81,"#9EA49F"),(1,"#CCC8B8")],
        "rim":[(0,"#EAE5D3"),(.25,PALETTE["ceramicRim"]),(.72,"#797E7D"),(1,"#ADB3AC")],
        "steel":[(0,"#535E64"),(.25,"#C9D0CD"),(.48,PALETTE["steel"]),(.75,"#697477"),(1,"#BBC2BE")],
        "alloy":[(0,"#626769"),(.4,PALETTE["darkMetal"]),(.8,"#282D2E"),(1,"#585C59")],
        "rubber":[(0,"#4A4B43"),(.6,PALETTE["rubber"]),(1,"#383B38")],
        "brass":[(0,"#E2CB91"),(.28,"#B39A64"),(.58,PALETTE["brass"]),(.83,"#705936"),(1,"#B59A60")],
        "glass":[(0,"#354D57"),(.20,"#1B3543"),(.52,PALETTE["visor"]),(.87,"#081820"),(1,"#28404A")],
        "hide":[(0,"#79614E"),(.2,PALETTE["leather"]),(.46,"#604A3A"),(.75,"#44342B"),(1,"#5C493B")],
        "edge":[(0,"#967658"),(.45,PALETTE["leatherEdge"]),(1,"#4F3D30")],
        "pouch":[(0,"#685141"),(.4,PALETTE["pocket"]),(.8,"#392C25"),(1,"#594839")],
        "linen":[(0,"#E6DDC5"),(.28,PALETTE["linen"]),(.51,"#E1D7BC"),(.83,"#AFA387"),(1,"#D2C7AC")],
        "bow":[(0,"#424646"),(.45,PALETTE["bow"]),(.8,"#151B1E"),(1,"#444846")],
    }
    out = []
    for name, points in stops.items():
        out.append(f'<linearGradient id="g-{name}" x1="0" y1="0" x2="1" y2=".5" gradientUnits="objectBoundingBox">')
        for at, col in points:
            out.append(f'<stop offset="{at}" stop-color="{col}"/>')
        out.append('</linearGradient>')
    # Original stippled grain and short raised wrinkles in the hide, printed
    # sparsely enough to read as leather at the actual sheet scale.
    out.append('<pattern id="grain" width="9" height="7" patternUnits="userSpaceOnUse">')
    out.append(path("M.4 1.3q.7-.4 1.4.1m3.1 3.7q1.5-1 2.4-.7M2.1 5.1l.7.3M7 1.7l.3-.2", "none", "#211B16", .46, 'opacity=".25"'))
    out.append(path("M.4 1.8l1.1-.2m3.4 3.9 1.7-.5", "none", "#CFAC7C", .32, 'opacity=".27"'))
    out.append('</pattern>')
    return "".join(out)


class Drawing:
    def __init__(self, yaw, pitch, pose):
        self.ca, self.sa = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        self.ce, self.se = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
        self.pose = pose
        self.layers = []
        self.defs = []
        self.counter = 0

    def p(self,x,y,z):
        return (256+STEP*(x*self.ca-z*self.sa),
                384-STEP*((y-.5)*self.ce-(x*self.sa+z*self.ca)*self.se))

    def depth(self,x,y,z):
        return self.sa*self.ce*x+self.se*y+self.ca*self.ce*z

    def layer(self, center, art, offset=0):
        self.layers.append((self.depth(*center)+offset,art))

    def band(self, points, width, colour, stitching=False):
        pp=[self.p(*v) for v in points]
        art=line(pp,INK,width+1.1)+line(pp,colour,width)
        if stitching:
            for sign in (-1,1):
                border=[]
                for i,(x,y) in enumerate(pp):
                    a,b=pp[max(0,i-1)],pp[min(len(pp)-1,i+1)]
                    dx,dy=b[0]-a[0],b[1]-a[1]; d=math.hypot(dx,dy) or 1
                    border.append((x-dy/d*sign*(width*.5-1.4),y+dx/d*sign*(width*.5-1.4)))
                art+=line(border,PALETTE['stitch'],.75,'1.7 1.5')
        return art

    def clip(self,d):
        self.counter+=1; key=f'c{self.counter}'
        self.defs.append(f'<clipPath id="{key}">{path(d,"white")}</clipPath>')
        return key

    def bulb(self, loc, width, depth, height, paint="pearl", edge=INK):
        x,y,z=loc; basis=math.hypot(width*self.ca,depth*self.sa)
        vertical=math.hypot(height*self.ce,math.hypot(width*self.sa,depth*self.ca)*self.se)
        return ellipse(*self.p(x,y,z),STEP*basis,STEP*vertical,fill(paint),edge,1.15)

    def bolt(self,loc,size,side=False):
        px,py=self.p(*loc)
        ratio=max(.27,abs(self.sa if side else self.ca)*self.ce)
        r=max(.8,size*STEP)
        return ellipse(px,py,r*ratio,r,fill("brass"),"#37372F",.63)+line([(px-.43*r*ratio,py+.35*r),(px+.43*r*ratio,py-.35*r)],"#544B3A",.65)

    def plate(self,loc,radii,outline,details):
        xx,zz,yy=radii
        w=STEP*math.hypot(xx*self.ca,zz*self.sa)
        h=STEP*math.hypot(yy*self.ce,math.hypot(xx*self.sa,zz*self.ca)*self.se)
        return stamp(self.p(*loc),w/100,h/100,path(outline,fill("pearl"),INK,2.0)+details)

    def beam(self,start,end,width,style="shell",mirror=1):
        a,b=self.p(*start),self.p(*end)
        dx,dy=b[0]-a[0],b[1]-a[1]; length=math.hypot(dx,dy)
        wid=width*STEP
        rotation=math.degrees(math.atan2(-dx,dy)); h=max(2.6,length)
        if style=="soft":
            d="M-77 -8 Q0 -22 77 -8 L78 86 Q65 103 0 104 Q-63 103 -78 87 Z"
            body=path(d,fill("rubber"),INK,2)
            for y in (7,21,35,49,63,77):
                body+=path(f'M-75 {y} Q0 {y+8} 76 {y}',"none","#535957",3.3)
                body+=path(f'M-72 {y+3} Q0 {y+10} 73 {y+2}',"none","#1D2121",3)
        else:
            d="M-82 1 C-64 -9 55 -11 83 1 Q99 9 96 27 L77 78 Q71 96 57 100 Q0 109 -61 100 Q-80 96 -82 85 L-97 32 Q-103 10 -82 1Z"
            if style=="calf":
                d="M-79 2Q-21 -12 64 -2 Q95 2 99 28 Q103 49 76 74 L61 95 Q57 104 11 104 L-53 100 Q-71 97 -72 88 L-97 35 Q-102 15 -79 2Z"
            if style=="bicep":
                d="M-72 1Q-39 -16 56 -3 Q99 0 98 22 L80 78 Q77 92 61 98 Q0 110 -64 97 Q-80 91 -83 77 L-97 32 Q-97 12 -72 1Z"
            body=path(d,fill("pearl"),INK,2.1)
            body+=path("M-86 8 Q-72 2 -49 2 M-88 16 Q-84 48 -70 67","none","#FFFAE8",3.2,'opacity=".78"')
            body+=path("M62 2 Q77 14 67 43 L55 70 Q49 84 37 92 L19 101","none","#939A96",1.8)
            body+=path("M65 3 Q80 15 70 43 L58 72 Q53 87 40 94","none","#F7F2DE",1.3)
            body+=path("M-77 85 Q-4 97 72 84 L65 95 Q-1 107 -64 97 Z",fill("rim"),"#787D76",1.25)
            body+=ellipse(56,15,5,2.4,fill("steel"),"#596062",1.2)
            body+=path("M53 16l6-2","none","#555A58",1.2)
            body+=path("M-66 78l9 1m-6 2 5 .6","none","#A3A49A",1,'opacity=".75"')
        return stamp(a,wid*mirror/100,h/100,body,rotation)

    def joint(self,loc,radius):
        body=self.bulb(loc,radius,radius*.89,radius*.83,"rubber")
        x,y,z=loc
        if abs(self.sa)>.19:
            lr=1 if self.sa>0 else -1; tip=(x+lr*radius*.72,y,z)
            px,py=self.p(*tip); r=radius*STEP*.66
            w=r*abs(self.sa);h=r*max(.3,self.ce)
            for m,paint in [(1,"alloy"),(.80,"steel"),(.60,"rubber"),(.28,"brass")]:
                body+=ellipse(px,py,w*m,h*m,fill(paint),INK,.55)
            body+=line([(px-w*.15,py+h*.13),(px+w*.15,py-h*.13)],INK,.65)
        else:
            px,py=self.p(x,y,z+radius*(1 if self.ca>=0 else -1))
            body+=path(f"M{f(px-radius*STEP*.6)} {f(py)} q{f(radius*STEP*.62)} {f(radius*STEP*.24)} {f(radius*STEP*1.22)} 0","none","#636760",1.3)
        return body

    def foot(self,s):
        x=s*.066
        # A lower projecting toe and squared-off heel keep the ground datum
        # legible from either orthographic flank.
        si=-1 if self.sa>0 else 1
        side=abs(self.sa); top=self.se>.9
        rx=math.hypot(.037*self.ca,.064*self.sa)*STEP
        at=self.p(x,.036,.018);hy=.039*STEP*self.ce+.057*STEP*self.se
        if top:
            d='M-65 -86 Q-90 -51 -92 13 Q-89 83 -65 94 Q0 111 65 94 Q89 78 92 13 Q91 -49 65 -86 Q0 -104 -65 -86Z'
        else:
            d='M-95 62 L-86 23 Q-79 -26 -46 -37 L-39 -72 Q-18 -91 32 -82 Q52 -73 59 -39 Q92 -19 95 21 L99 69 Q85 92 1 94 Q-83 92 -95 74Z'
            if side>.5:d='M-95 63L-91 -38 Q-85 -58 -61 -67 L-27 -68 Q-10 -72 3 -47 L24 -14 Q75 -7 94 24 Q103 42 99 68 L96 82 Q43 96 -89 88Z'
        art=path(d,fill('pearl'),INK,2.8)
        if not top:
            art+=path("M-95 66 Q0 81 98 62 L97 86 Q15 98 -88 89 Q-99 83 -95 66Z",fill("rubber"),INK,2.8)
            art+=path("M-84 72 Q-23 85 87 71","none","#7B7E73",1.6)
            art+=path("M-61 -23 Q-30 -4 20 -8 Q53 -4 69 11","none","#919891",1.7)
        else:art+=path("M-74 43Q0 60 74 43M-65 -47Q0 -36 65 -47","none","#868D87",2.5)
        return stamp(at,rx/100*(si if side>.5 else 1),hy/100,art)

    def leg(self,s):
        x=s*.066
        a=(x,.496,0);b=(x+s*.002,.27,.006);c=(x+s*.001,.058,-.003)
        upperA=(x,.477,0);upperB=(b[0],.303,.006)
        lowerA=(b[0],.238,.004);lowerB=(c[0],.09,-.002)
        piece=self.joint(a,.039)
        piece+=self.beam(a,b,.029,"soft")
        piece+=self.beam(upperA,upperB,.041,"bicep",s)
        piece+=self.joint(b,.036)
        piece+=self.beam((x,.231,.003),(.067*s,.054,-.003),.027,"soft")
        piece+=self.beam(lowerA,lowerB,.038,"calf",s)
        piece+=self.bulb(c,.032,.031,.015,"alloy")
        piece+=self.foot(s)
        self.layer((x,.29,0),piece)

    def hand(self,s,w):
        x,y,z=w
        art=self.beam((x,y+.003,z),(x+s*.003,y-.046,z+.004),.025,"bicep",s)
        # The four separated fingertips curl gently toward the palm. Their
        # stepped height and visible short thumb distinguish left and right.
        for i in (3,2,1,0):
            fx=x+s*(i-1.5)*.010
            length=(.034,.042,.039,.031)[i]
            fz=z+.004+(i-1.5)*.0014
            a=(fx,y-.040,fz);b=(fx+s*.0011,y-.040-length*.56,fz+.005)
            c=(fx-s*.0011,y-.040-length,fz+.008)
            art+=self.bulb(a,.0059,.0075,.0066,"alloy")
            art+=self.beam(a,b,.0057,"shell",s)
            art+=self.bulb(b,.0051,.0054,.004,"rubber")
            art+=self.beam(b,c,.005,"shell",s)
        tx=x-s*.020
        art+=self.bulb((tx,y-.019,z+.011),.009,.010,.011,"alloy")
        art+=self.beam((tx,y-.018,z+.012),(tx-s*.011,y-.043,z+.017),.0083,"shell",s)
        return art

    def arm(self,s):
        a=(s*.133,.782,-.0015); e=(s*.155,.609,.003); w=(s*.163,.463,.016)
        art=self.beam(a,e,.027,"soft")
        art+=self.beam((s*.141,.734,-.001),(s*.154,.641,.002),.035,"bicep",s)
        cap="M-97 23 Q-103 -42 -62 -77 Q-31 -103 10 -99 Q60 -101 84 -60 Q101 -38 99 -1 L88 47 Q43 80 -17 85 Q-76 83 -96 48Z"
        pauldron=path("M-94 28Q-44 68 84 37 L82 58Q20 96 -53 72Q-90 65 -94 47Z",fill("rim"),"#5D6864",2)
        pauldron+=path("M-76 -30Q-54 -77 8 -82","none","#FFFAE9",3.6)
        pauldron+=path("M49 -78Q70 -49 61 -19L54 24","none","#A1A69E",1.9)
        art+=self.plate(a,(.044,.044,.043),cap,pauldron)
        art+=self.joint(e,.0295)
        art+=self.beam(e,w,.021,"soft")
        art+=self.beam((s*.156,.585,.004),(s*.161,.485,.014),.034,"shell",s)
        art+=self.joint(w,.020)
        art+=self.hand(s,w)
        if self.se>.90:
            # From above the shoulder cup covers its assembly; only the
            # protruding knuckle line and outer forearm remain visible below.
            tip=self.hand(s,w)
            tip+=self.bulb((s*.16,.56,.006),.034,.033,.034,'pearl')
            at=self.p(*a)
            tip+=ellipse(*at,STEP*.043,STEP*.046,fill('pearl'),INK,1.05)
            tip+=path(f'M{f(at[0]-17)} {f(at[1]-15)}q8 -10 24 -9',"none","#FFFAE5",1.2)
            tip+=path(f'M{f(at[0]-22)} {f(at[1]+8)}q12 14 36 11',"none","#969D95",1.25)
            art=tip
        self.layer((s*.155,.61,.006),art)

    def chest(self):
        outline="M-40 -93Q-62 -94 -83 -73Q-104 -37 -99 -5Q-93 54 -62 75Q-37 99 0 99Q51 98 73 65Q100 27 99 -16Q94 -66 60 -87Q47 -94 40 -93Z"
        plate=path("M-88 -34Q-27 -10 0 -15Q43 -12 83 -39","none","#9C9F94",1.5)
        plate+=path("M-82 -51Q-76 -76 -50 -80","none","#FFF9E2",2.2)
        if self.ca < -.2:
            plate+=path("M-37 -64Q0 -78 37 -64L42 -20Q24 -9 0 -8Q-25 -9 -42 -20Z",fill("rim"),"#858982",1.8)
            for k in range(3):
                plate+=path(f"M-22 {-51+7*k} Q0 {-56+7*k} 22 {-51+7*k}","none","#656D68",1.9)
        body=self.bulb((0,.519,-.001),.083,.066,.061,"alloy")
        body+=self.bulb((0,.555,.002),.093,.065,.059,"pearl")
        for side in (-1,1):
            # Rigid clavicle housings and the floating ball joint link each
            # pauldron to the chest instead of leaving a hollow under the rim.
            pa=(side*.069,.765,-.002);pb=(side*.135,.781,-.002)
            body+=self.beam(pa,pb,.020,"soft")
            linkage=[(side*.047,.787,-.002),(side*.070,.793,-.002),(side*.101,.797,-.002),(side*.128,.787,-.002),(side*.125,.770,-.002),(side*.089,.757,-.002),(side*.060,.756,-.002)]
            body+=polygon([self.p(*p)for p in linkage],fill('pearl'),"#646A62",1)
        body+=self.plate((0,.673,-.004),(.108,.076,.127),outline,plate)
        self.layer((0,.648,-.004),body)
        neck=self.beam((0,.817,-.002),(0,.775,-.002),.032,"soft")
        neck+=self.bulb((0,.826,-.002),.042,.042,.018,"alloy")
        self.layer((0,.81,0),neck)

    def front_leather(self):
        # A fitted breast, an actual belt, and two low, independently cut
        # apron skirts. The curved orthographic embroidery follows the hide.
        def sheet(x,y,offset=0):
            rows=[(.388,.092,.080),(.448,.099,.096),(.54,.107,.093),(.625,.105,.091),(.72,.107,.077),(.749,.094,.070)]
            if y<=rows[0][0]:rx,rz=rows[0][1:]
            elif y>=rows[-1][0]:rx,rz=rows[-1][1:]
            else:
                for a,b in zip(rows,rows[1:]):
                    if a[0]<=y<=b[0]:
                        t=(y-a[0])/(b[0]-a[0]);rx=a[1]+t*(b[1]-a[1]);rz=a[2]+t*(b[2]-a[2]);break
            return x,y,rz*math.sqrt(max(.015,1-(x/rx)**2))+offset
        def pts(raw,offset=0):
            result=[]
            for (x0,y0),(x1,y1) in zip(raw,raw[1:]):
                count=max(1,round(math.hypot(x1-x0,y1-y0)*280))
                for j in range(count):
                    t=j/count
                    result.append(self.p(*sheet(x0+t*(x1-x0),y0+t*(y1-y0),offset)))
            return result+[self.p(*sheet(*raw[-1],offset))]
        def panel(raw,paint,stitching=True,grain=True):
            first=pts(raw)
            art=polygon(first,fill(paint),"#3D332C",1.2)
            if grain:art+=polygon(first,'url(#grain)')
            if stitching:
                cx=sum(x for x,y in first)/len(first);cy=sum(y for x,y in first)/len(first)
                pin=[(cx+(x-cx)*.960,cy+(y-cy)*.965) for x,y in first]
                art+=line(pin+[pin[0]],PALETTE['stitch'],.73,"1.75 1.9")
            return art
        leather=""
        if abs(self.sa)>.78:
            # The envelope at the front centreline is visible in profile.
            # A flat projection of the outside cut line alone would omit it.
            shell=[(.738,.047),(.734,.067),(.698,.080),(.644,.091),(.596,.095),(.548,.098),(.502,.099),(.446,.097),(.395,.083),(.398,.035),(.446,.028),(.526,.020),(.578,.014),(.638,.024),(.671,.039)]
            lr=1 if self.sa>0 else -1
            hull=[self.p(lr*.045,y,z)for y,z in shell]
            leather+=polygon(hull,fill('hide'),"#49392C",1.1)
            leather+=polygon(hull,'url(#grain)')
            leather+=line(hull[4:9],PALETTE['leatherEdge'],1.5)

        for side in (1,-1):
            raw=[(.003,.575),(.091,.563),(.100,.526),(.099,.485),(.095,.445),(.089,.403),(.074,.395),(.014,.400),(.006,.412),(.010,.48),(.003,.575)]
            leather+=panel([(side*x,y) for x,y in raw],"hide")
        leather+=panel([(-.017,.535),(.017,.534),(.018,.447),(.009,.43),(.001,.444),(-.012,.43),(-.018,.449),(-.017,.535)],"hide",False)
        bib=[(-.093,.537),(-.105,.572),(-.102,.632),(-.091,.652),(-.080,.674),(-.073,.722),(-.068,.741),(-.045,.733),(0,.727),(.046,.733),(.068,.741),(.074,.723),(.081,.675),(.091,.652),(.104,.631),(.105,.570),(.095,.538),(.058,.516),(.004,.510),(-.051,.514),(-.093,.537)]
        leather+=panel(bib,"hide")
        # Belt wraps around the apron at the natural waist.
        belt=[(-.107,.553),(-.055,.560),(.003,.558),(.058,.558),(.107,.553),(.106,.535),(.055,.541),(0,.540),(-.056,.542),(-.107,.537),(-.107,.553)]
        leather+=panel(belt,"edge",False)
        leather+=line(pts([(-.103,.551),(-.052,.556),(0,.555),(.053,.555),(.103,.551)]),PALETTE["stitch"],.62,"2 2")
        for s in (-1,1):
            leather+=self.bolt(sheet(s*.061,.725,.004),.0041)
            strap=[(s*.055,.797,-.013),(s*.065,.785,.020),(s*.067,.761,.052),(s*.060,.726,.067)]
            leather+=self.band(strap,6.1,fill("edge"),True)
            bx,by=self.p(s*.064,.758,.055)
            leather+=f'<rect x="{f(bx-3.1)}" y="{f(by-3.9)}" width="6.2" height="7.8" rx="1.4" fill="none" stroke="{GOLD}" stroke-width="1.55"/>'
        cx,cy=self.p(*sheet(-.019,.548,.003))
        leather+=f'<rect x="{f(cx-5.4)}" y="{f(cy-3.6)}" width="10.8" height="7.2" rx="1.6" fill="none" stroke="{GOLD}" stroke-width="1.65"/>'+line([(cx-2.8,cy),(cx+2,cy+.4)],GOLD,1)
        # Two broad pockets over the apron and a little chest ticket pocket.
        ticket=[(-.044,.687),(.033,.688),(.032,.668),(.023,.660),(-.030,.659),(-.042,.664),(-.044,.687)]
        leather+=panel(ticket,"pouch")
        # The corkscrew has a circular top and visible helical steel wire.
        def tool(x,y):return self.p(*sheet(x,y,.008))
        tx,ty=tool(-.051,.610)
        leather+=ellipse(tx,ty,3.1,3.8,fill("steel"),"#394249",.9)+ellipse(tx,ty,1.5,2.1,"#263138")
        leather+=line([tool(-.051,.605),tool(-.048,.594),tool(-.054,.587),tool(-.049,.580)],PALETTE["steel"],1.35)
        # Open spanner with an asymmetric cut jaw.
        tx,ty=tool(-.026,.628)
        leather+=line([tool(-.025,.626),tool(-.036,.570)],"#535B59",3.2)
        leather+=line([tool(-.025,.626),tool(-.036,.570)],PALETTE["steel"],1.8)
        leather+=path(f"M {f(tx-3.5)} {f(ty-3)} q-1 4 2 5 q4 1 5-3 l-2-.4 -1.3 1.4 -1.8-.5 -.2-1.3 Z",fill("steel"),"#57605F",.55)
        leather+=line([tool(.021,.614),tool(.012,.565)],"#342E2A",3.2)
        leather+=line([tool(.021,.613),tool(.018,.596)],PALETTE["pen"],2.3)
        leather+=line([tool(.020,.610),tool(.018,.602)],GOLD,.7)
        cloth=[(.043,.592),(.056,.616),(.078,.610),(.095,.580),(.091,.547),(.070,.544),(.051,.566),(.043,.592)]
        leather+=panel(cloth,"linen",False,False)
        for raw in [[(.055,.611),(.064,.595),(.074,.573)],[(.061,.614),(.072,.599),(.081,.578)],[(.069,.612),(.08,.599),(.089,.582)]]:
            leather+=line(pts(raw,.001),"#A79068",.7)
        pouch=[(-.079,.593),(-.052,.586),(-.022,.588),(.009,.587),(.035,.591),(.034,.552),(.021,.534),(-.006,.531),(-.051,.534),(-.075,.543),(-.079,.593)]
        leather+=panel(pouch,"pouch")
        leather+=line(pts([(-.073,.588),(-.038,.582),(.000,.583),(.029,.586)]),PALETTE["leatherEdge"],2.1)
        leather+=line(pts([(-.011,.583),(-.010,.549),(-.014,.536)]),PALETTE["stitch"],.77,"1.3 1.2")
        for s in (-1,1):leather+=self.bolt(sheet(-.023+s*.049,.583,.002),.0025)
        self.layer((0,.60,.061),leather)
        # Black silk bow, concave folds and separate center knot.
        x,y=self.p(0,.766,.069)
        w=.039*STEP*max(.23,abs(self.ca));h=.012*STEP*max(.35,self.ce)
        art=path("M-91 -69Q-99 -35 -98 26Q-95 65 -74 71Q-45 66 -7 25L6 25Q60 70 78 67Q103 61 97 -26Q97 -67 84 -75Q50 -71 4 -29L-7 -29Q-60 -78 -91 -69Z",fill("bow"),INK,3)
        art+=path('M-70 -34Q-35 -26 -17 -6M66 37Q35 27 17 11',"none","#5D5D56",4)
        art+=path('M-15 -38Q3 -48 19 -35L18 31Q1 40 -17 28Z',fill('alloy'),INK,3)
        self.layer((0,.762,.074),stamp((x,y),w/100,h/100,art))

    def rear_leather(self):
        belt=[]
        for i in range(31):
            ang=math.pi+math.pi*(i/30)
            belt.append((.101*math.cos(ang),.544,-.004+.068*math.sin(ang)))
        art=self.band(belt,7.1,fill('edge'),True)
        for s in (1,-1):
            raw=[(s*.054,.797,-.010),(s*.065,.778,-.038),(s*.059,.747,-.060),(s*.032,.706,-.073),(-s*.017,.643,-.080),(-s*.056,.591,-.061),(-s*.083,.550,-.044)]
            art+=self.band(raw,6.2,fill('edge'),True)
            art+=self.bolt(raw[-1],.0042)
        x,y=self.p(0,.666,-.081)
        art+=ellipse(x,y,2.8,3.3,fill('brass'),"#443C2E",.6)
        self.layer((0,.667,-.060),art)

    def ear(self,s,front=False):
        x,y,z=s*.114,.908,-.005
        at=self.p(x+s*.010,y,z)
        radius=.043*STEP
        w=radius*max(.13,abs(self.sa)*self.ce)
        h=radius*math.hypot(self.ce,self.se*self.ca)
        h=max(radius*.24,h)
        art=""
        for amount,paint in [(1.0,"alloy"),(.91,"pearl"),(.81,"rubber"),(.70,"alloy")]:
            art+=ellipse(*at,w*amount,h*amount,fill(paint),INK,.85)
        art+=ellipse(*at,w*.615,h*.615,"none",PALETTE["cyan"],1.65)
        art+=ellipse(*at,w*.48,h*.48,fill("steel"),"#29393A",.65)
        art+=ellipse(*at,w*.385,h*.385,fill("alloy"),"#414746",.6)
        if w>5:
            for ang in (.24,2.35,4.35):
                bx=at[0]+w*.815*math.cos(ang);by=at[1]+h*.815*math.sin(ang)
                art+=ellipse(bx,by,1.0,1.0,fill('brass'),INK,.4)
        return art

    def head(self):
        loc=(0,.91,-.002)
        w=STEP*math.hypot(.121*self.ca,.098*self.sa);h=STEP*math.hypot(.09*self.ce,.103*self.se)
        # The crown, lower jaw and rolled rim share one uninterrupted porcelain outline.
        outer="M0 -100C52 -100 85 -77 97 -35C102 -12 101 29 88 52C74 80 45 99 8 100C-30 101 -62 89 -82 67C-99 47 -103 16 -99 -17C-96 -64 -62 -99 0 -100Z"
        px,py=self.p(*loc)
        local=path(outer,fill('pearl'),INK,1.65)
        local+=path("M-85 -43Q-64 -85 -20 -90Q-7 -91 6 -90","none","#FFFBEA",2.5)
        local+=path("M-78 63Q-34 100 23 92Q66 83 88 48","none","#969A8D",1.45)
        local+=path("M-60 81Q-35 95 4 95","none","#FAF2D8",1.2)
        back=self.ca<-.14;side=abs(self.sa)
        if back or self.se>.65:
            local+=path("M-86 -43Q-42 -66 0 -62Q44 -66 85 -42","none","#969B91",1.6)
            local+=path("M-80 -45Q-43 -63 -3 -59Q58 -63 81 -41","none","#F2ECD6",1.2)
            local+=path("M-58 67Q0 78 58 67","none","#8E948E",1.6)
            for k in range(-2,3):
                local+=path(f'M{k*8-2} 68v4',"none","#6D746F",1.5)
        if self.se<.85 and self.ca>-.57:
            direction=-1 if self.sa>0 else 1
            # The painterly glazing in the front plate remains a dark field even
            # under the warm ivory shell. In profile the visor ends before the ear.
            if side>.92:
                glass="M-100 -24Q-99 -49 -83 -50Q-67 -49 -60 -28Q-55 0 -58 15Q-60 42 -76 53Q-91 58 -98 34Z"
                face=path(glass,fill("glass"),"#42494A",2.6)
                face+=path("M-91 -35Q-86 -45 -78 -42","none","#76939B",1.5)
                face+=path("M-92 -7Q-87 -12 -84 -5L-83 9Q-85 14 -90 14Z",PALETTE["cyan"])
                local+=f'<g transform="scale({-direction} 1)">'+face+'</g>'
            else:
                gx=side*23*direction
                visor="M-89 -24Q-88 -54 -62 -63Q-23 -75 39 -69Q72 -67 86 -48Q100 -28 94 7Q93 39 75 52Q50 70 10 71Q-37 72 -65 58Q-87 49 -92 23Q-97 -1 -89 -24Z"
                face=path(visor,fill("glass"),"#353F41",2.6)
                face+=path("M-80 -38Q-57 -68 5 -64Q24 -64 39 -62","none","#65818A",1.05)
                face+=path("M-70 -47Q-54 -57 -31 -59","none","#B4CFCC",1.2)
                for ey in (-1,1):
                    ex=ey*38;eyw=(13 if ey*direction<0 and side>.2 else 15.2)
                    face+=ellipse(ex,0,eyw+2.5,23.5,"#217896","none",0,'opacity=".65"')
                    face+=ellipse(ex,0,eyw,21.5,PALETTE["cyan"])
                    face+=ellipse(ex-1.5,-3,eyw*.52,12,"#B0F8FF","none",0,'opacity=".36"')
                face+=path("M-16 34Q0 39 17 29Q12 51 -3 49Q-14 48 -16 34Z",PALETTE['cyan'])
                face+=path("M-84 32Q-51 67 -13 63","none","#314A55",1.1)
                local+=f'<g transform="translate({f(gx)} {f(self.se*26)}) scale({f(1-side*.23)} .89)">'+face+'</g>'
        if self.se>.9:
            local+=path("M-65 -52Q-37 -72 3 -69Q46 -69 70 -48L61 -5Q10 12 -58 -1Z",fill("rim"),"#9B9F93",1.5)
            local+=path("M-51 -46Q-20 -61 12 -58","none","#FFF6DA",2)
        shell=stamp((px,py),w/100,h/100,local)
        # Ears are attached on their anatomical sides and the little service
        # pickup rises at the rear of his left receiver, below the crown.
        far=-1 if self.sa>0 else 1
        if abs(self.sa)<.05:
            art=self.ear(-1)+self.ear(1)+shell
        else:
            art=self.ear(far)+shell+self.ear(-far)
        art+=self.band([(.118,.920,-.022),(.121,.943,-.033),(.120,.961,-.038)],1.55,PALETTE['darkMetal'])
        x,y=self.p(.120,.961,-.038);art+=ellipse(x,y,1.85,2.15,fill('brass'),INK,.6)
        self.layer((0,.91,-.002),art,.02)

    def draw(self):
        self.leg(-1);self.leg(1)
        self.arm(-1);self.arm(1)
        self.chest()
        # On either flank the facing portions of the curved belts and aprons
        # overlap naturally, while the far-side bib is entirely hidden in back.
        if self.ca<.32 or self.se>.9:self.rear_leather()
        if self.ca>-.40 or self.se>.9:self.front_leather()
        self.head()
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768">'
                '<defs>'+paint_definitions()+''.join(self.defs)+'</defs>'+
                ''.join(art for _,art in sorted(self.layers,key=lambda item:item[0]))+'</svg>')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",type=Path,default=ROOT/"characters-review/blueprints/hummin/design")
    args=parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    views=json.loads((HERE/'views.json').read_text())
    with tempfile.TemporaryDirectory() as scratch:
        for name,(yaw,pitch) in views['views'].items():
            svg=Path(scratch)/(name+'.svg')
            svg.write_text(Drawing(yaw,pitch,name).draw())
            subprocess.run(['inkscape',str(svg),'--export-type=png',
                            '--export-filename='+str((args.out/(name+'.png')).resolve())],check=True,
                           stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


if __name__=="__main__":
    main()
