"""Draws the SAMPLE test documents for every scenario.

Reads test-data/scenarios.json (exported from lib/scenarios.ts) and writes PDFs/PNGs into
test-data/documents/. Every document is fictional, uses no real logos or emblems, and carries a
"SAMPLE - SYNTHETIC TEST DOCUMENT" watermark so it can never pass as a real record.

Run: python3 scripts/make_documents.py
"""
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-data" / "documents"
OUT.mkdir(parents=True, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
WATERMARK = "SAMPLE - SYNTHETIC TEST DOCUMENT"

ENTITY_LABEL = {
    "PRIVATE_LIMITED": "Private Limited Company",
    "LLP": "Limited Liability Partnership",
    "PARTNERSHIP": "Partnership",
    "PROPRIETORSHIP": "Proprietorship",
    "CORPORATION": "Corporation",
}


def f(path, size):
    return ImageFont.truetype(path, size)


def png_watermark(img):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = f(FONT_B, max(26, img.size[0] // 28))
    for y in range(-img.size[1], img.size[1] * 2, img.size[1] // 3):
        d.text((-50, y), (WATERMARK + "     ") * 3, font=font, fill=(200, 30, 30, 60))
    layer = layer.rotate(18, expand=False)
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def pdf_watermark(c, w, h):
    c.saveState()
    c.setFillColor(Color(0.8, 0.1, 0.1, alpha=0.12))
    c.setFont("Helvetica-Bold", 30)
    c.translate(w / 2, h / 2)
    c.rotate(35)
    for dy in (-260, -130, 0, 130, 260):
        c.drawCentredString(0, dy, WATERMARK)
    c.restoreState()


def gst_certificate(path, form, fields):
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    c.setTitle("GST Registration Certificate (SAMPLE)")
    c.setFillColor(HexColor("#1f2937"))
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(w / 2, h - 70, "GOODS AND SERVICES TAX - REGISTRATION CERTIFICATE")
    c.setFont("Helvetica", 10)
    c.drawCentredString(w / 2, h - 88, "Synthetic test document for a vendor onboarding demo. Not issued by any authority.")
    c.line(50, h - 100, w - 50, h - 100)
    a = form["address"]
    rows = [
        ("Registration Number (GSTIN)", fields.get("gstin", "")),
        ("1. Legal Name", fields.get("legal_name", "")),
        ("2. Trade Name, if any", form.get("trade_name") or "-"),
        ("3. Constitution of Business", ENTITY_LABEL.get(form.get("entity_type"), "")),
        ("4. Address of Principal Place of Business", f'{a["street"]}, {a["city"]}, {fields.get("registration_state", a["state"])} - {a["postal_code"]}'),
        ("5. Date of Liability", "01/04/2021"),
        ("6. Type of Registration", "Regular"),
        ("7. Particulars of Approving Authority", "SAMPLE - none (synthetic)"),
    ]
    y = h - 140
    for label, value in rows:
        c.setFont("Helvetica-Bold", 10.5)
        c.drawString(60, y, label)
        c.setFont("Helvetica", 10.5)
        # wrap long values
        words, line, lines = str(value).split(), "", []
        for word in words:
            if c.stringWidth(line + " " + word, "Helvetica", 10.5) > 250:
                lines.append(line)
                line = word
            else:
                line = (line + " " + word).strip()
        lines.append(line)
        for i, ln in enumerate(lines):
            c.drawString(300, y - i * 14, ln)
        y -= 26 + 14 * (len(lines) - 1)
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(60, 80, "This is a SAMPLE generated for testing. It carries no legal validity.")
    pdf_watermark(c, w, h)
    c.showPage()
    c.save()


def pan_card(path, fields, entity_type):
    img = Image.new("RGB", (1012, 638), (236, 242, 250))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 1012, 92], fill=(41, 74, 130))
    d.text((36, 22), "PERMANENT ACCOUNT NUMBER CARD", font=f(FONT_B, 34), fill="white")
    d.text((36, 112), "SAMPLE - synthetic test card, not issued by any authority", font=f(FONT, 20), fill=(120, 30, 30))
    d.rectangle([40, 170, 240, 420], outline=(90, 90, 90), width=2)
    d.text((88, 280), "PHOTO", font=f(FONT, 24), fill=(140, 140, 140))
    d.text((280, 180), "Name", font=f(FONT, 20), fill=(80, 80, 80))
    d.text((280, 210), fields.get("legal_name", "").upper(), font=f(FONT_B, 30), fill=(20, 20, 20))
    label = "Date of Birth" if (fields.get("pan", "    P")[3:4] == "P") else "Date of Incorporation"
    d.text((280, 280), label, font=f(FONT, 20), fill=(80, 80, 80))
    d.text((280, 310), "14/08/2016", font=f(FONT_B, 28), fill=(20, 20, 20))
    d.text((280, 380), "Permanent Account Number", font=f(FONT, 20), fill=(80, 80, 80))
    d.text((280, 410), fields.get("pan", ""), font=f(MONO, 46), fill=(10, 10, 10))
    d.text((40, 560), "Signature", font=f(FONT, 18), fill=(80, 80, 80))
    d.line([140, 575, 420, 560], fill=(30, 30, 90), width=3)
    png_watermark(img).save(path)


def cheque(path, fields, city, blurry=False):
    img = Image.new("RGB", (1500, 680), (248, 246, 236))
    d = ImageDraw.Draw(img)
    rnd = random.Random(path.name)
    for _ in range(140):  # faint security pattern
        x, y = rnd.randint(0, 1500), rnd.randint(0, 680)
        d.ellipse([x, y, x + 40, y + 40], outline=(232, 228, 210))
    d.text((40, 30), "DEMO SAMPLE BANK (fictional)", font=f(FONT_B, 34), fill=(30, 60, 110))
    d.text((40, 76), f"Branch: {city}    IFSC: {fields.get('ifsc', '')}", font=f(FONT, 24), fill=(50, 50, 50))
    d.text((1180, 40), "Date  __/__/____", font=f(FONT, 24), fill=(60, 60, 60))
    d.text((40, 170), "Pay ____________________________________________ or Bearer", font=f(FONT, 26), fill=(60, 60, 60))
    d.text((40, 240), "Rupees __________________________________________", font=f(FONT, 26), fill=(60, 60, 60))
    d.rectangle([1120, 230, 1440, 290], outline=(60, 60, 60), width=2)
    d.text((1135, 242), "Rs.", font=f(FONT, 26), fill=(60, 60, 60))
    d.text((40, 330), f"A/c No. {fields.get('account_number', '')}", font=f(MONO, 32), fill=(20, 20, 20))
    d.text((40, 400), "Account holder:", font=f(FONT, 22), fill=(80, 80, 80))
    d.text((40, 432), fields.get("account_holder", ""), font=f(FONT_B, 32), fill=(20, 20, 20))
    d.text((1000, 470), "Authorised Signatory", font=f(FONT, 22), fill=(80, 80, 80))
    d.text((40, 600), '"000000"  000000000:  000000  00', font=f(MONO, 30), fill=(40, 40, 40))
    # CANCELLED stamp across the cheque
    stamp = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(stamp)
    sd.text((330, 240), "CANCELLED", font=f(FONT_B, 150), fill=(190, 20, 20, 120))
    stamp = stamp.rotate(12)
    img = Image.alpha_composite(img.convert("RGBA"), stamp).convert("RGB")
    img = png_watermark(img)
    if blurry:
        img = img.resize((375, 170)).filter(ImageFilter.GaussianBlur(2.2)).resize((1500, 680))
        img = img.filter(ImageFilter.GaussianBlur(3))
    img.save(path)


def letter_pdf(path, title, lines):
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    c.setTitle(title + " (SAMPLE)")
    c.setFont("Helvetica-Bold", 15)
    c.drawString(60, h - 80, title)
    c.setFont("Helvetica", 10)
    c.drawString(60, h - 96, "Synthetic test document for a vendor onboarding demo. Not issued by any authority or bank.")
    y = h - 140
    c.setFont("Helvetica", 11.5)
    for ln in lines:
        c.drawString(60, y, ln)
        y -= 20
    pdf_watermark(c, w, h)
    c.showPage()
    c.save()


def main():
    scenarios = json.loads((ROOT / "test-data" / "scenarios.json").read_text())
    made = 0
    for s in scenarios:
        versions = [s] + ([s["resubmission"]] if s.get("resubmission") else [])
        for v in versions:
            form = v["form"]
            for doc in v["docs"]:
                path = OUT / doc["file_name"]
                t = doc["truth"]
                fields, kind = t["fields"], t["doc_type"]
                if kind == "GST_CERTIFICATE":
                    gst_certificate(path, form, fields)
                elif kind == "PAN_CARD":
                    pan_card(path, fields, form.get("entity_type"))
                elif kind == "BANK_PROOF" and path.suffix == ".png":
                    clear = {**fields}
                    if t["overall_confidence"] < 0.75:  # blurry scenario: draw the real values, then blur
                        clear = {"account_holder": form["bank"]["account_holder"], "account_number": form["bank"]["account_number"], "ifsc": form["bank"].get("ifsc", "")}
                    cheque(path, clear, form["address"]["city"], blurry=t["overall_confidence"] < 0.75)
                elif kind == "BANK_PROOF":
                    letter_pdf(path, "Bank Account Confirmation Letter", [
                        "To whom it may concern,", "",
                        f"This letter confirms that the account below is held with Demo Sample Bank (fictional).", "",
                        f"Account holder:   {fields.get('account_holder', '')}",
                        f"Account number:   {fields.get('account_number', '')}",
                        f"Routing number:   {form['bank'].get('routing_number', '')}", "",
                        "Sincerely,", "Branch Operations (SAMPLE)",
                    ])
                elif kind == "EIN_NOTICE":
                    letter_pdf(path, "Employer Identification Number Confirmation", [
                        f"Business name:   {fields.get('legal_name', '')}",
                        f"Assigned EIN:    {fields.get('ein', '')}",
                        f"Address:         {form['address']['street']}, {form['address']['city']}, {form['address']['state']} {form['address']['postal_code']}",
                        "", "Keep this notice with your permanent records.",
                    ])
                made += 1
    print(f"wrote {made} documents to {OUT}")


if __name__ == "__main__":
    main()
