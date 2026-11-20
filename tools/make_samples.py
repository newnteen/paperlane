"""Render the sample documents used by the demo.

Everything here is synthetic: made-up names, addresses, card numbers and
phone numbers. No real person's paperwork is in this repository.

    python tools/make_samples.py

Outputs to samples/:
    receipt-photo.png    a phone photo of a thermal receipt
    fax-intake.png       a faxed new-client intake form
    statement-table.png  a clean parts statement with a table
"""

from __future__ import annotations

import pathlib
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

OUT = pathlib.Path(__file__).resolve().parent.parent / "samples"


def font_dir() -> pathlib.Path:
    for candidate in (
        pathlib.Path(r"C:\Windows\Fonts"),
        pathlib.Path("/usr/share/fonts/truetype/dejavu"),
        pathlib.Path("/Library/Fonts"),
    ):
        if candidate.is_dir():
            return candidate
    raise SystemExit("no font directory found; edit font_dir() in this file")


FONTS = font_dir()


def pick(*names: str) -> pathlib.Path:
    for name in names:
        candidate = FONTS / name
        if candidate.exists():
            return candidate
    raise SystemExit(f"none of these fonts exist in {FONTS}: {', '.join(names)}")


MONO = pick("consola.ttf", "DejaVuSansMono.ttf")
SANS = pick("arial.ttf", "DejaVuSans.ttf")
HAND = pick("segoepr.ttf", "DejaVuSans.ttf")


def font(path: pathlib.Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def add_lighting(img: Image.Image, dark_at_bottom: bool = True) -> Image.Image:
    w, h = img.size
    gradient = Image.linear_gradient("L").resize((w, h))
    if not dark_at_bottom:
        gradient = gradient.transpose(Image.FLIP_TOP_BOTTOM)
    # 200..255 -> gentle uneven light across the sheet
    gradient = gradient.point(lambda v: 200 + int(v * 55 / 255))
    return ImageChops.multiply(img.convert("RGB"), Image.merge("RGB", (gradient, gradient, gradient)))


def add_noise(img: Image.Image, sigma: float = 7.0) -> Image.Image:
    noise = Image.effect_noise(img.size, sigma).convert("RGB")
    return ImageChops.add(img, noise, scale=1.0, offset=-128)


def photo(img: Image.Image, angle: float, blur: float = 0.5, sigma: float = 7.0) -> Image.Image:
    img = img.convert("RGB")
    img = img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=(232, 230, 226))
    img = img.filter(ImageFilter.GaussianBlur(blur))
    img = add_noise(img, sigma)
    img = add_lighting(img, dark_at_bottom=False)
    return img


def fax(img: Image.Image) -> Image.Image:
    gray = img.convert("L")
    gray = gray.filter(ImageFilter.GaussianBlur(0.7))
    gray = gray.point(lambda v: 0 if v < 168 else 255)
    draw = ImageDraw.Draw(gray)
    w, h = gray.size
    rng = random.Random(7)
    for _ in range(1400):  # fax speckle
        x, y = rng.randrange(w), rng.randrange(h)
        draw.point((x, y), fill=0 if rng.random() < 0.75 else 140)
    for _ in range(12):  # scan streaks
        y = rng.randrange(h)
        draw.line([(0, y), (w, y)], fill=rng.choice([90, 110, 130]), width=1)
    return gray.convert("RGB")


def receipt() -> Image.Image:
    w, h = 560, 840
    img = Image.new("RGB", (w, h), (252, 250, 245))
    d = ImageDraw.Draw(img)
    mono = font(MONO, 19)
    mono_sm = font(MONO, 16)

    def line(y: int, text: str, f=mono, fill=(30, 30, 30)) -> None:
        d.text((34, y), text, font=f, fill=fill)

    y = 38
    line(y, "HARBOR HARDWARE", font(MONO, 22)); y += 32
    line(y, "118 Quay Street, Portland OR", mono_sm); y += 22
    line(y, "Tel (503) 555-0142", mono_sm); y += 30
    line(y, "-" * 34, mono_sm); y += 26
    line(y, "R-40218            2026-10-28", mono_sm); y += 30
    line(y, "-" * 34, mono_sm); y += 26

    items = [
        ("2  WOOD SCREW 4x40", "6.80"),
        ("1  HINGE SATIN 76mm", "9.45"),
        ("4  SHELF BRACKET", "12.00"),
        ("1  CORDLESS DRILL 18V", "129.00"),
        ("1  SANDING BELT P80", "14.95"),
    ]
    for name, amount in items:
        d.text((34, y), name, font=mono, fill=(30, 30, 30))
        d.text((w - 34 - d.textlength(amount, font=mono), y), amount, font=mono, fill=(30, 30, 30))
        y += 28

    y += 6
    line(y, "-" * 34, mono_sm); y += 26
    for name, amount in (("SUBTOTAL", "172.20"), ("TAX 7.0%", "12.05")):
        d.text((248, y), name, font=mono_sm, fill=(30, 30, 30))
        d.text((w - 34 - d.textlength(amount, font=mono_sm), y), amount, font=mono_sm, fill=(30, 30, 30))
        y += 26

    y += 4
    line(y, "-" * 34, mono_sm); y += 26
    d.text((248, y), "TOTAL", font=font(MONO, 20), fill=(10, 10, 10))
    d.text((w - 34 - d.textlength("184.25", font=font(MONO, 20)), y), "184.25", font=font(MONO, 20), fill=(10, 10, 10))
    y += 38
    line(y, "VISA ************4821", mono_sm); y += 30
    line(y, "AUTH 771204", mono_sm); y += 34
    line(y, "THANK YOU", mono_sm)
    return photo(img, angle=1.6, blur=0.6, sigma=8.0)


def intake_form() -> Image.Image:
    w, h = 820, 1060
    img = Image.new("RGB", (w, h), (253, 252, 249))
    d = ImageDraw.Draw(img)
    body = font(SANS, 20)
    head = font(SANS, 26)
    hand = font(HAND, 24)

    d.text((56, 44), "NORTHGATE FAMILY PRACTICE", font=head, fill=(20, 20, 20))
    d.text((56, 82), "NEW CLIENT INTAKE FORM", font=body, fill=(40, 40, 40))
    d.text((56, 112), "fax received 2026-11-03 09:41   page 1 of 1", font=font(SANS, 15), fill=(80, 80, 80))
    d.line([(56, 138), (w - 56, 138)], fill=(60, 60, 60), width=2)

    rows = [
        ("Full name", "Dana Whitfield"),
        ("Date of birth", "1979-04-02"),
        ("Phone", "+44 20 7946 0958"),
        ("Email", "d.whitfield@personal.example"),
        ("Address", "12 Elm Grove, Manchester M20 4AB"),
        ("Insurance no.", "NG-4471-88213"),
        ("Referred by", "Dr. A. Okafor"),
        ("Reason", "follow-up, repeat prescription"),
    ]
    y = 176
    for label, value in rows:
        d.text((56, y), f"{label}:", font=body, fill=(25, 25, 25))
        d.text((290, y - 3), value, font=hand, fill=(25, 35, 90))
        d.line([(288, y + 30), (w - 70, y + 30)], fill=(170, 170, 170), width=1)
        y += 78

    d.text((56, y + 26), "Signature:", font=body, fill=(25, 25, 25))
    d.text((230, y + 20), "D. Whitfield", font=hand, fill=(25, 35, 90))
    d.line([(228, y + 56), (520, y + 56)], fill=(120, 120, 120), width=1)
    return fax(img)


def statement() -> Image.Image:
    w, h = 900, 1080
    img = Image.new("RGB", (w, h), (255, 255, 255))
    d = ImageDraw.Draw(img)
    mono = font(MONO, 18)
    mono_sm = font(MONO, 15)

    d.text((56, 48), "QUARTERLY PARTS STATEMENT", font=font(SANS, 24), fill=(15, 15, 15))
    d.text((56, 88), "Account 88214        Period 2026-07-01 to 2026-09-30", font=mono_sm, fill=(50, 50, 50))

    cols = [56, 150, 520, 620, 740, 850]
    top = 150
    rows = [
        ("Line", "Part", "Qty", "Unit", "Amount"),
        ("1", "Bearing 6203-2RS", "40", "3.15", "126.00"),
        ("2", "Seal kit SK-220", "12", "8.40", "100.80"),
        ("3", "Shaft 12x420", "6", "22.50", "135.00"),
        ("4", "Coupling L-095", "18", "11.20", "201.60"),
        ("5", "Bushing 16mm", "60", "1.85", "111.00"),
        ("6", "Grease cartridge", "24", "4.10", "98.40"),
    ]
    row_h = 44
    y = top
    for i, row in enumerate(rows):
        if i == 0:
            d.line([(cols[0], y - 8), (cols[-1], y - 8)], fill=(0, 0, 0), width=2)
        for x, cell in zip(cols, row):
            d.text((x, y), cell, font=mono, fill=(20, 20, 20))
        if i == 0:
            d.line([(cols[0], y + 30), (cols[-1], y + 30)], fill=(0, 0, 0), width=2)
        y += row_h
    d.line([(cols[0], y - 8), (cols[-1], y - 8)], fill=(0, 0, 0), width=2)

    y += 16
    for label, value in (("Subtotal", "772.80"), ("Freight", "38.00"), ("Tax", "64.86"), ("Total", "875.66")):
        d.text((600, y), label, font=mono, fill=(20, 20, 20))
        d.text((cols[-1] - d.textlength(value, font=mono), y), value, font=mono, fill=(20, 20, 20))
        y += 34

    d.text((56, y + 40), "Terms net 30. Questions: accounts@northgate-supply.example", font=mono_sm, fill=(70, 70, 70))
    return photo(img, angle=0.5, blur=0.3, sigma=3.0)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, image in (
        ("receipt-photo.png", receipt()),
        ("fax-intake.png", intake_form()),
        ("statement-table.png", statement()),
    ):
        path = OUT / name
        image.save(path, optimize=True)
        print(f"{path.name:22} {image.size[0]}x{image.size[1]}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
