"""Roma, the field explorer with red headband and two distinct leather bags."""
from fieldwear import curls, jacket, pack, portrait, trouser
from illustrator import Plate

if __name__ == '__main__':
    drawing = Plate('roma')
    portrait(drawing, True)
    curls(drawing)
    trouser(drawing, True)
    jacket(drawing, True)
    pack(drawing, True)
    drawing.render()
