#!/usr/bin/env python3
"""Genera los íconos de la app Android a partir de web/public/icon-512.png.
Uso: python3 tools/android_icons.py android/app/src/main/res
(Capacitor trae un ícono genérico; esto lo reemplaza por el de tu app.)"""
import sys, os
from PIL import Image

res = sys.argv[1]
src = Image.open(os.path.join(os.path.dirname(__file__), '..', 'web', 'public', 'icon-512.png')).convert('RGBA')
legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for d, px in legacy.items():
    folder = os.path.join(res, 'mipmap-' + d)
    os.makedirs(folder, exist_ok=True)
    img = src.resize((px, px), Image.LANCZOS)
    img.save(os.path.join(folder, 'ic_launcher.png'))
    # versión redonda
    mask = Image.new('L', (px * 4, px * 4), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, px * 4 - 1, px * 4 - 1), fill=255)
    mask = mask.resize((px, px), Image.LANCZOS)
    rnd = Image.new('RGBA', (px, px), (0, 0, 0, 0)); rnd.paste(img, (0, 0), mask)
    rnd.save(os.path.join(folder, 'ic_launcher_round.png'))
    # primer plano del ícono adaptable (108dp, el dibujo ocupa ~61% central para que no se recorte)
    fg_px = round(px * 108 / 48)
    fg = Image.new('RGBA', (fg_px, fg_px), (0, 0, 0, 0))
    inner = round(fg_px * 0.61)
    fg.paste(src.resize((inner, inner), Image.LANCZOS), ((fg_px - inner) // 2, (fg_px - inner) // 2))
    fg.save(os.path.join(folder, 'ic_launcher_foreground.png'))
bg = os.path.join(res, 'values', 'ic_launcher_background.xml')
if os.path.isdir(os.path.dirname(bg)):
    open(bg, 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#4F46E5</color>\n</resources>\n')
print('Íconos generados en', res)
