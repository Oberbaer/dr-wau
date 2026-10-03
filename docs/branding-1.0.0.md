# Dr. Wau 1.0.0 – Branding nach Privacy-Abnahme

Diese Änderungen folgen auf `BACKUP PRIVACY PASS` und sind ein separater
Branding-Commit. Sie wurden lokal geprüft, nicht erneut auf Homey installiert.
Auf Homey bleibt der live bestätigte Privacy-Stand `16ff364` aktiv.

## Umsetzung

- Professionelleres transparentes Hundemaskottchen mit Arztmütze und Türkis,
  ohne Anhänger; ausschließlich die Zunge ist magenta.
- Zentriertes Hundebadge auf Haupt- und Backup-Seite, auch bei schmaler Ansicht.
- Gemeinsames Farbsystem in `assets/brand.css`, mit Light/Dark-Flächen, Texten,
  Rändern und türkisen Akzenten. Weiße Buttontexte behalten einen dunklen Hintergrund.
- Backup-Seite verwendet das echte Maskottchen statt eines systemspezifischen
  Hunde-Emojis. Bestehende Formulare, IDs und API-Handler bleiben erhalten.
- `assets/dr-wau.png` (1.024 × 1.024) und `assets/dr-wau-avatar.png` (256 × 256)
  sowie die drei Homey-Bilder wurden aktualisiert. Das native monochrome
  `assets/icon.svg` bleibt im bestehenden Homey-Icon-System.
- `tools/generate-assets.ps1` rendert über `generate-assets.cjs` die ausgewählte
  Grafik und das vorhandene `assets/images/source.svg`. Das vorherige Werkzeug
  erzeugte noch ein altes Pulssymbol ohne Maskottchen. Keine neuen Dependencies.

## Prüfung

Headless Brave mit ausschließlich lokalen synthetischen API-Antworten:
Hauptseite und Backups, jeweils Light/Dark bei 320, 768 und 1.280 Pixeln.
Alle **12 Szenarien** laden das Bild, zeigen ein mittiges Badge und keinen
horizontalen Überlauf. Keine Browser-Exception. Screenshots der mobilen und
Desktop-Ansichten wurden visuell geprüft. Kein Homey-Aufruf, Export oder Restore.
Die bestehenden **251/251 Regressionstests** bestehen auch mit diesem Branding.

## Bildgenerierung

Verwendet wurde das eingebaute Bildgenerierungswerkzeug mit echter Transparenz.
Das vorherige eigene Hundemaskottchen war die Bearbeitungsreferenz.
Die endgültigen Projektdateien stehen unter den oben genannten Assetpfaden.

Prompt:

> Use case: identity-preserve / logo-brand. Edit target: the attached Dr. Wau dog mascot icon. Create one polished production app mascot on genuinely transparent background, square canvas, front-facing perfectly centered head and a very small neck, generous even safe margin. Preserve the cute golden brown floppy-ear puppy with cream muzzle, bright friendly eyes, small smiling open mouth, white doctor's cap with turquoise plus and turquoise cap rim, turquoise collar. Make it more professional and readable at 48 pixels: simplified balanced crisp contours, restrained smooth shading, clean symmetric cap and well controlled highlights, no tiny fur scratch marks, no oversized anime sparkle. Palette golden brown/cream fur, dark charcoal eyes/outline, white cap, turquoise #0F8F91. The small tongue is the ONLY magenta area, #D83980. IMPORTANT no pendant, no hanging badge, no stethoscope, no accessories, no text, no letters, no heart symbols, no extra magenta, no background disc or border, no watermark. Keep the character warm and cute and recognizable. Actual transparency with clean edges, full cap and ears visible.
