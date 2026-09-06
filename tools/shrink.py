# =========================================================================
# 焼き込んだ図版の幅と画質をそろえる。
#
# Wikimedia から落とした原寸は、1点で1〜2MBある。250点なら400MB近い。
# 暗い展示室で見るぶんには 1800px・画質88 で足りる。
# あわせて、一覧用の縮小版（480px）も作る。
# 一覧は札が小さいので、原寸を20枚並べると下のほうが延々と出てこない。
# =========================================================================
import glob
import os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = "assets/artworks"
THUMB = os.path.join(SRC, "thumb")
MAXW, QUALITY = 1800, 88
THUMBW, THUMBQ = 480, 82

os.makedirs(THUMB, exist_ok=True)

before = after = 0
count = 0

for path in sorted(glob.glob(os.path.join(SRC, "*.jpg"))):
    if os.path.isdir(path):
        continue
    before += os.path.getsize(path)

    try:
        im = Image.open(path)
    except Exception as e:
        # 握りつぶさない。壊れたファイルは名指しで残し、次へ進む。
        print(f"  読めない: {os.path.basename(path)} ── {e}")
        after += os.path.getsize(path)
        continue

    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")

    w, h = im.size
    if w > MAXW:
        im = im.resize((MAXW, round(h * MAXW / w)), Image.LANCZOS)
    im.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True)

    # 一覧用の縮小版
    tw, th = im.size
    if tw > THUMBW:
        t = im.resize((THUMBW, round(th * THUMBW / tw)), Image.LANCZOS)
    else:
        t = im
    t.save(os.path.join(THUMB, os.path.basename(path)), "JPEG",
           quality=THUMBQ, optimize=True, progressive=True)

    after += os.path.getsize(path)
    count += 1

mb = lambda n: f"{n / 1024 / 1024:.1f} MB"
print(f"{count} 点をそろえました： {mb(before)} → {mb(after)}（縮小版は別途 {THUMB}）")
