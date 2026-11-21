"""Sippy, an original Burgundy Trail design with a quilted vest and headphones."""
from fieldwear import jacket, pack, portrait, quiff, trouser
from illustrator import Plate

if __name__ == '__main__':
    drawing = Plate('sippy')
    portrait(drawing, False)
    quiff(drawing)
    trouser(drawing, False)
    jacket(drawing, False)
    pack(drawing, False)
    drawing.render()
