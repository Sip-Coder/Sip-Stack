"""Hand-drafted human explorer patterns, anatomy and field equipment."""
import numpy as np
from illustrator import TAU


def portrait(p, female):
    skin='skin'; blush='blush' if female else 'flush'
    dark='brow' if female else 'hair'
    white='eyeWhite' if female else 'sclera'
    eye_y=.903 if female else .907
    chin=.822 if female else .828
    scale=.94 if female else 1
    # Broad cheek, short tapered jaw and a softly recessed temple.
    p.shell(skin,[(chin,0,.013,.005,.008),(chin+.008,0,.012,.027,.030),
                 (chin+.025,0,.010,.047,.048),(eye_y-.023,0,.007,.061,.058),
                 (eye_y+.009,0,.003,.067*scale,.061),(eye_y+.049,0,-.002,.061,.057),
                 (.975,0,-.004,.040,.037),(.982,0,-.005,.003,.003)],sides=58)
    p.shell(skin,[(.742,0,-.002,.026,.025),(.793,0,0,.025,.029),
                 (chin+.011,0,.005,.023,.024)])
    for s in (-1,1):
        p.oval(skin,(s*.064,eye_y-.02,-.003),(.012,.016,.009))
        p.oval(blush,(s*.071,eye_y-.02,.003),(.0056,.009,.003))
        x=s*.026; z=.060
        p.oval(white,(x,eye_y,z),(.019,.016,.0062),tilt=s*.36)
        p.oval('iris',(x-s*.001,eye_y,.0655),(.010,.012,.0027),tilt=s*.28)
        p.oval('pupil',(x-s*.001,eye_y,.0687),(.0058,.0077,.0012),tilt=s*.28)
        p.oval('catchlight',(x-.003,eye_y+.0043,.070),(.0024,.0026,.001))
        p.stroke(dark,[(s*.008,eye_y+.019,.064),(s*.023,eye_y+.026,.060),
                       (s*.036,eye_y+.024,.054),(s*.045,eye_y+.020,.044)],
                 [.0017,.0035,.0032,.0007])
        p.stroke(dark,[(s*.008,eye_y+.001,.065),(s*.018,eye_y+.014,.069),
                       (s*.031,eye_y+.015,.065),(s*.044,eye_y+.004,.054)],
                 [.0004,.0013,.0014,.0004])
        if female:
            p.ellipse('jewelry',(s*.071,eye_y-.042,.006),.0075,.011,.0018)
        for j in range(3):
            p.oval(blush,(s*(.032+j*.004),eye_y-.024+(j%2)*.002,.058-j*.003),
                   (.0009,.0007,.0007),sides=12)
    p.oval(skin,(0,eye_y-.018,.067),(.009,.011,.008))
    p.oval(skin,(0,eye_y-.023,.072),(.010,.006,.006))
    lip='lip' if female else 'lips'
    p.stroke('mouth',[(-.024,chin+.036,.055),(-.014,chin+.032,.063),(0,chin+.030,.067),
                      (.013,chin+.033,.064),(.024,chin+.038,.055)],
             [.0006,.0028,.0035,.0026,.0004],.0014)
    p.stroke(lip,[(-.016,chin+.030,.061),(0,chin+.0255,.067),(.016,chin+.031,.061)],
             [.0005,.0020,.0006])
    p.stroke('teeth' if female else 'sclera',[(-.014,chin+.033,.064),(0,chin+.0317,.068),
             (.014,chin+.034,.065)],[.0004,.001,.0004])


def curls(p):
    # A dense chocolate crown, cropped above the brow; the parted banks are
    # made from independent spiral brush paths, with a small open face wedge.
    p.shell('curlDeep',[(.872,0,-.034,.040,.035),(.915,0,-.022,.067,.054),
                        (.952,0,-.009,.078,.066),(.981,-.002,-.010,.062,.052),
                        (.997,-.003,-.012,.025,.027),(1,-.006,-.010,.004,.006)],sides=56)
    for j in range(47):
        a=.64+(TAU-1.28)*j/46
        rear=(1-np.cos(a))/2
        height=.963-.015*np.cos(2*a)
        drop=.150+.077*rear+.013*np.sin(j*1.32)
        t=np.linspace(0,1,49)
        wave=TAU*(1.7+.62*(.5+.5*np.sin(2.4*j)))*t+j*1.618
        radius=.061+.037*np.sin(t*np.pi*.75)
        turn=.004+.002*np.sin(np.pi*t)
        x=(radius+turn*np.cos(wave))*np.sin(a)+.003*np.sin(wave)*np.cos(a)
        z=-.011+(.051+.027*np.sin(t*np.pi*.72)+turn*np.cos(wave))*np.cos(a)
        y=height-drop*t+.003*np.sin(wave)
        ink=['curlBase','curlWarm','curlDeep','curlBase','curlLight'][j%5]
        r=(.005+.0014*np.sin(.7*j))*(1-.35*t)*np.minimum(1,(1-t)*10+.08)
        p.stroke(ink,np.column_stack((x,y,z)),r,facets=8,smooth=False)
    # The printed band is tilted over the part and visible across the front.
    a=np.linspace(-np.pi,np.pi,76)
    for ofs in np.linspace(-.0038,.0038,4):
        p.stroke('headband',np.column_stack((.076*np.sin(a),.948-.010*np.cos(a)+.006*np.sin(a)+ofs,
                                              -.005+.067*np.cos(a))),.0020,facets=7,smooth=False)
    for k in range(6):
        p.stroke('curlWarm' if k%3==0 else 'curlBase',
                 [(.048+k*.002,.971,.040),(.029,.976+k*.001,.059),
                  (-.011,.969+k*.001,.066),(-.048,.951+k*.001,.058),
                  (-.061,.938+k*.001,.040)],[.001,.003,.004,.003,.0006])


def quiff(p):
    p.shell('hair',[(.862,0,-.029,.039,.029),(.901,0,-.023,.067,.043),
                    (.937,0,-.008,.073,.065),(.967,-.003,-.004,.074,.058),
                    (.988,-.008,-.007,.053,.045),(.996,-.012,-.006,.021,.018),
                    (1,-.015,-.006,.002,.003)],sides=54)
    for j in range(9):
        u=j/8; x=(u-.5)*.116; edge=abs(u*2-1)
        path=[(x+.001,.941-.007*edge+.011*u,.063-.020*edge),(x+.010,.961-.005*edge,.069-.023*edge),
              (x-.004,.979-.004*edge,.063-.022*edge),(x-.013,.991-.012*edge,.035),
              (x-.015,.994-.014*edge,.006),(x-.009,.980-.012*edge,-.032),(x+.003,.951,-.054+.005*edge)]
        p.stroke('hair',path,[.002,.008,.010,.010,.010,.008,.001],[.001,.0035,.004,.005,.004,.004,.001])
        p.stroke('chestnut',[(a-.001,b+.003,c+.0016)for a,b,c in path[1:-1]],
                 [.0003,.0009,.0014,.0008,.0003])
    for j in range(5):
        p.stroke('chestnut',[(-.051+j*.012,.941+j*.002,.060),(-.044+j*.012,.953+j*.002,.065),(-.042+j*.012,.966+j*.002,.064),(-.053+j*.012,.974+j*.002,.054)],[.0005,.0014,.0015,.0004])
    for s in (-1,1):
        p.stroke('hair',[(s*.064,.956,.036),(s*.070,.940,.027),(s*.070,.919,.017),(s*.064,.893,.010)],
                 [.005,.007,.006,.0008])


def grape(p, xyz, size, ink, leaf):
    x,y,z=xyz
    for row,n in enumerate((3,3,2,1)):
        for j in range(n):
            p.oval(ink,(x+(j-(n-1)/2)*size*.46+(row%2)*size*.08,y-row*size*.40,z),
                   (size*.28,size*.29,size*.11),sides=13)
    p.stroke(leaf,[(x,y+size*.16,z),(x+.15*size,y+.55*size,z),(x+.67*size,y+.69*size,z)],
             [.09*size,.10*size,.035*size])
    p.oval(leaf,(x-.23*size,y+.43*size,z),(size*.34,size*.16,size*.08),rotate=.4,sides=14)


def trouser(p,female):
    cloth='cargo' if female else 'trousers'
    edge='cargoSeam'; leg=.050 if female else .052
    hem=.094 if female else .082; knee=.259 if female else .253
    waist=.56 if female else .555
    p.shell(cloth,[(.449,0,-.001,.044,.036),(.473,0,-.002,.087,.057),
                  (.502,0,-.006,.099 if female else .095,.064),
                  (waist-.018,0,-.004,.090,.059),(waist,0,-.002,.086,.055)])
    p.ring(edge,(0,waist-.010,-.004),.089,.058,.0024)
    for s in (-1,1):
        def row(y,x,z,w,d): return (y,s*x,z,w,d)
        p.shell(cloth,[row(hem,leg,.004,.027,.032),row(hem+.018,leg,.004,.030,.036),
            row(.164,leg+.002,.002,.037,.041),row(knee,leg+.002,.011,.038,.040),
            row(.305,leg+.002,.007,.042,.050),row(.40,leg+.002,-.001,.047,.056),
            row(.465,leg,-.004,.049,.059),row(.49,leg*.90,-.006,.045,.055)])
        p.shell(edge,[row(hem,leg,.003,.027,.032),row(hem+.004,leg,.003,.030,.035),
                      row(hem+.016,leg,.003,.030,.035),row(hem+.018,leg,.003,.029,.033)])
        # Flapped bellows pocket wraps from trouser front to the outer side.
        x=s*(leg+.022)
        p.shell(cloth,[(.340,x,.030,.023,.016),(.345,x,.031,.027,.019),
                       (.387,x,.031,.028,.019),(.399,x,.028,.025,.018)],box=.48)
        p.stroke(edge,[(x-s*.027,.388,.046),(x,.380,.052),(x+s*.024,.388,.045)],.0014)
        p.oval(edge,(x,.383,.052),(.002,.002,.001),sides=12)
        p.stroke(edge,[(s*(leg+.039),.181,.010),(s*(leg+.038),knee,.023),
                        (s*(leg+.047),.327,.016)],.0009)
        sx=s*leg; shoe='sneaker' if female else 'shoe'
        p.shell('sole',[(.0003,sx,.022,.029,.057),(.003,sx,.025,.037,.065),(.012,sx,.026,.040,.069),
                        (.019,sx,.026,.039,.068)],box=.71)
        p.shell(shoe,[(.016,sx,.024,.038,.067),(.025,sx,.024,.038,.066),(.040,sx,.021,.036,.056),
                      (.053,sx,.009,.033,.045),(.076,sx,-.002,.030,.033),
                      (hem+.004,sx,-.002,.028,.032)],box=.79)
        p.oval('sole',(sx,.030,.073),(.030,.011,.020),sides=20)
        for j in range(4):
            z=.063-j*.008; y=.048+j*.005
            p.stroke('sole',[(sx-.016,y,z),(sx,y+.001,z-.002),(sx+.016,y+.0005,z)],.0014)
        p.stroke('sole',[(sx+s*.033,.034,.053),(sx+s*.040,.031,.029),(sx+s*.039,.035,.012)],.0020)


def hands(p,s,female):
    x=s*(.143 if female else .149); y=.425; z=.015
    p.oval('skin',(x,.446,.012),(.011,.015,.011))
    p.oval('skin',(x,y,z),(.016,.023,.014),rotate=-s*.10)
    for j in range(4):
        fx=x+s*(j-1.5)*.006; fy=y-.016; fz=z+.003*(1-abs(j-1))
        p.stroke('skin',[(fx,fy,fz),(fx+s*.0015,fy-.012,fz+.003),
                       (fx+s*.0005,fy-.024+.004*abs(j-1.2),fz+.006)],
                 [.0040,.0038,.0029],facets=9)
        if female:
            p.oval('nail',(fx,fy-.015,fz+.007),(.0022,.0034,.0007),sides=12)
    p.stroke('skin',[(x-s*.011,y+.007,z+.004),(x-s*.018,y-.003,z+.008),
                     (x-s*.020,y-.014,z+.013)], [.006,.0054,.0036])


def jacket(p,female):
    coat='jacket' if female else 'quilt'; sleeve='jacket' if female else 'hoodie'
    rib='facing' if female else 'cuff'; edge='binding'; shirt='hoodie'
    half=.096 if female else .104; hem=.554 if female else .535
    p.shell(shirt,[(hem-.021,0,-.002,.083,.053),(.60,0,-.002,.087,.052),
                   (.686,0,-.002,half-.007,.057),(.738,0,-.002,.076,.046),
                   (.768,0,-.003,.040,.037)],box=.94)
    p.shell(coat,[(hem,0,-.003,.087,.061),(hem+.017,0,-.003,.091,.062),
                  (.640,0,-.002,.094,.067),(.685,0,-.001,half,.070),
                  (.726,0,-.003,half+.001,.063),(.759,0,-.003,.089,.051),
                  (.773,0,-.004,.058,.039)],gap=.30 if female else .105)
    p.ring(edge,(0,hem+.0045,-.002),.088,.062,.002)
    if not female:
        for j in range(5):
            y=hem+.032+j*.034
            a=np.linspace(.16,TAU-.16,67); w=np.interp(y,[hem,.647,.709,.765],[.093,.098,.105,.084])
            d=np.interp(y,[hem,.646,.70,.764],[.062,.068,.071,.050])
            p.stroke(edge,np.column_stack((w*np.sin(a),y+.004*np.cos(3*a),-.002+d*np.cos(a))),.00135,smooth=False)
    for s in (-1,1):
        center=.140 if female else .145
        rows=[(.448,center,.011,.017,.019),(.475,center-.001,.010,.020,.021),
              (.505,center-.003,.001,.022,.026),(.575,center-.006,-.010,.026,.028),
              (.615,center-.009,-.010,.026,.029),(.690,center-.022,-.004,.029,.033),
              (.730,center-.032,-.003,.030,.036),(.758,center-.040,-.002,.020,.024),
              (.768 if female else .770,center-.045,-.002,.005,.006)]
        p.shell(sleeve,[(y,s*x,z,w,d) for y,x,z,w,d in rows])
        p.oval(sleeve,(s*.099,.737,-.004),(.025,.030,.031),rotate=s*.32)
        p.shell(rib,[(.448,s*center,.011,.017,.019),(.453,s*center,.011,.019,.021),
                    (.473,s*(center-.001),.010,.019,.021)])
        front=[(s*.018,hem,.060),(s*.016,.644,.067),(s*.018,.703,.070),(s*.026,.750,.053)]
        p.stroke(edge,front,.0016)
        p.stroke('hoodie' if female else 'shirt',[(s*.022,.741,.049),(s*.024,.710,.067),(s*.023,.685,.069)],.0016)
        p.oval('brass' if female else 'metal',(s*.023,.682,.069),(.0020,.004,.0016))
        hands(p,s,female)
    # Rolled hood spreads over shoulders and bunches around the neck.
    p.oval(shirt,(0,.753,-.021),(.078,.031,.052),sides=44)
    p.ring(shirt,(0,.761,.001),.061,.046,.010,-.010)
    p.ring(rib if not female else 'hoodie',(0,.766,.002),.052,.043,.004,-.010)
    if female:
        for j in range(7):
            t=j/6; x=.119+t*.012; y=.700-t*.059; z=.028
            p.oval('binding',(x,y,z),(.0032,.006,.0017),rotate=(-1)**j*.57,sides=13)
        p.stroke('binding',[(.117,.708,.022),(.119,.682,.030),(.135,.635,.020)],.0013)
    else:
        grape(p,(.030,.698,.072),.008,'hoodie','gold')
        for s in (-1,1):
            p.stroke('binding',[(s*.064,.595,.052),(s*.043,.572,.057)],.0023)


def pack(p,female):
    # Rounded gusset plus close-fitting lid, rear zip pocket and leather pulls.
    y0=.530 if female else .512; y1=.747 if female else .754
    w=.072 if female else .075; back=-.133 if female else -.123
    trim='strap' if female else 'saddleEdge'; gold='brass' if female else 'gold'
    p.shell('leather',[(y0,0,-.081,.044,.024),(y0+.010,0,-.083,w-.007,.039),
            (y0+.038,0,-.084,w,.040),(y1-.041,0,-.078,w,.040),
            (y1-.011,0,-.071,w-.009,.029),(y1,0,-.069,.042,.018)],box=.56)
    p.shell(trim,[(y1-.10,0,back+.016,w*.68,.012),(y1-.083,0,back+.018,w*.94,.017),
            (y1-.048,0,back+.019,w,.022),(y1-.031,0,back+.023,w*.86,.019)],box=.63)
    for s in (-1,1):
        x=s*.039
        p.stroke(trim,[(x,y1-.066,back-.001),(x,y1-.104,back-.001),
                       (x,y1-.131,back+.003)],.0052,.0024)
        p.ellipse(gold,(x,y1-.104,back-.003),.006,.006,.0014)
        p.stroke('leather',[(s*.047,y0+.023,-.10),(s*.061,y1-.006,-.089),
            (s*.073,.768,-.046),(s*.075,.754,.021),(s*.069,.711,.050),
            (s*.080,.622,.035),(s*.082,.586,-.007),(s*.056,y0+.024,-.080)],.0065,.004)
    p.stroke(trim,[(-.026,y1-.002,-.086),(-.023,y1+.010,-.082),(0,y1+.015,-.081),
                   (.023,y1+.010,-.082),(.026,y1-.002,-.086)],.003)
    if female:
        p.oval('brass',(0,y1-.065,back-.006),(.009,.009,.002))
        p.stroke('strap',[(.073,.755,-.035),(.065,.761,.020),(.030,.719,.065),
                          (-.025,.649,.067),(-.074,.588,.040),(-.101,.515,.006)],.006,.0025)
        p.shell('leather',[(.446,-.100,.006,.023,.022),(.454,-.104,.007,.030,.029),
                (.504,-.105,.005,.033,.029),(.524,-.103,.004,.028,.025)],box=.49)
        p.oval('strap',(-.111,.504,.029),(.027,.019,.006),sides=20)
        p.oval('brass',(-.112,.493,.035),(.004,.005,.0015))
        p.stroke('jewelry',[(-.030,.760,.032),(-.019,.732,.056),(0,.698,.069),
                          (.019,.731,.056),(.030,.76,.032)],.0012)
        p.oval('brass',(0,.695,.071),(.008,.009,.003))
        p.oval('hoodie',(0,.695,.074),(.0058,.0068,.0015))
        p.stroke('headband',[(-.0025,.691,.075),(.0025,.699,.075)],.0009)
        for j,ink in enumerate(('headband','brass','cargo','jewelry')):
            p.ring(ink,(.141,.444+j*.003,.011),.017,.017,.0019)
    else:
        # The headphones rest against the neck, the arch behind the hood.
        p.stroke('pad',[(-.059,.714,.040),(-.066,.755,.014),(-.044,.773,-.030),
                         (0,.778,-.047),(.044,.773,-.030),(.066,.755,.014),(.059,.714,.040)],.0058)
        for s in (-1,1):
            p.oval('gold',(s*.052,.719,.053),(.016,.021,.011),rotate=s*.28)
            p.oval('shoe',(s*.053,.718,.060),(.013,.017,.009),rotate=s*.27)
            p.oval('gold',(s*.053,.718,.069),(.006,.008,.0016))
        p.ring('leather',(.145,.449,.011),.019,.020,.0032)
        p.oval('metal',(.147,.449,.032),(.009,.010,.002))
        p.oval('gold',(.147,.449,.034),(.006,.007,.001))
