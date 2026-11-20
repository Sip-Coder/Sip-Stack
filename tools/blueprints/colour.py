"""D65 sRGB to CIELAB and the CIEDE2000 colour difference (unit weights)."""
from math import atan2, cos, degrees, exp, hypot, radians, sin, sqrt


def srgb_lab(colour):
    value = colour.removeprefix('#')
    if len(value) != 6:
        raise ValueError(f'Expected a six-digit sRGB swatch, got {colour!r}')
    srgb = [int(value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    r, g, b = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb]
    xyz = ((.4124564*r + .3575761*g + .1804375*b) / .95047,
           .2126729*r + .7151522*g + .0721750*b,
           (.0193339*r + .1191920*g + .9503041*b) / 1.08883)
    delta = 6 / 29
    x, y, z = [v ** (1/3) if v > delta**3 else v / (3*delta**2) + 4/29 for v in xyz]
    return 116*y - 16, 500*(x-y), 200*(y-z)


def delta_e_2000(first, second):
    l1, a1, b1 = first
    l2, a2, b2 = second
    mean_c = (hypot(a1, b1) + hypot(a2, b2)) / 2
    stretch = 1 + (1 - sqrt(mean_c**7 / (mean_c**7 + 25**7))) / 2
    a1, a2 = stretch*a1, stretch*a2
    c1, c2 = hypot(a1, b1), hypot(a2, b2)
    h1 = degrees(atan2(b1, a1)) % 360
    h2 = degrees(atan2(b2, a2)) % 360
    dh = h2 - h1
    if c1*c2 == 0:
        dh, mean_h = 0, h1 + h2
    elif abs(dh) <= 180:
        mean_h = (h1 + h2) / 2
    else:
        dh += -360 if dh > 0 else 360
        mean_h = (h1 + h2 + (360 if h1 + h2 < 360 else -360)) / 2
    mean_l, mean_c = (l1+l2)/2, (c1+c2)/2
    t = (1 - .17*cos(radians(mean_h - 30)) + .24*cos(radians(2*mean_h))
         + .32*cos(radians(3*mean_h + 6)) - .20*cos(radians(4*mean_h - 63)))
    sl = 1 + .015*(mean_l-50)**2 / sqrt(20+(mean_l-50)**2)
    sc, sh = 1 + .045*mean_c, 1 + .015*mean_c*t
    rotation = -2*sqrt(mean_c**7 / (mean_c**7 + 25**7))*sin(radians(60*exp(-((mean_h-275)/25)**2)))
    dl, dc = (l2-l1)/sl, (c2-c1)/sc
    d_h = 2*sqrt(c1*c2)*sin(radians(dh/2))/sh
    return sqrt(dl**2 + dc**2 + d_h**2 + rotation*dc*d_h)
