
from PIL import Image
im = Image.frombytes("RGB", (1191, 1684), open("tmp/oct-p2.raw", "rb").read())
band_top = int(734.4 / 841.89 * 1684)
band_bot = int((734.4 + 25) / 841.89 * 1684)
im.crop((0, band_top - 60, 1191, min(1684, band_bot + 60))).save("tmp/october-si1-band-p2.png")
m_bot = int((388.4 + 13*25) / 841.89 * 1684)
im.crop((0, m_bot - 100, 1191, min(1684, m_bot + 30))).save("tmp/october-moonlight-tail-p2.png")
print("ok", band_top, band_bot, im.size)
