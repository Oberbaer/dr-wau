'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
// Already included by the Homey CLI; no dependency installation or API calls.
const sharp = require(path.join(root, 'node_modules', 'sharp'));
const assets = path.join(root, 'assets');
(async () => {
  const original = path.join(root, 'Dr_Wau_Schaeferhund_Designvorlage.png');
  const metadata = await sharp(original).metadata();
  if (metadata.format !== 'png' || metadata.width !== 1254 || metadata.height !== 1254) {
    throw Error('Expected the original 1254 × 1254 Dr. Wau design PNG.');
  }

  const mascot = await sharp(original).resize(1024).png().toBuffer();
  fs.writeFileSync(path.join(assets, 'dr-wau.png'), mascot);

  // Keep both ears and the entire muzzle. The original lettering is below this crop.
  const head = { left: 217, top: 0, width: 790, height: 790 };
  for (const [file, size] of [['dr-wau-avatar.png', 256], ['dr-wau-avatar-128.png', 128], ['dr-wau-avatar-48.png', 48]]) {
    await sharp(original).extract(head).resize(size).png().toFile(path.join(assets, file));
  }
  const source = fs.readFileSync(path.join(assets, 'images', 'source.svg'), 'utf8')
    .replace('href="../dr-wau.png"', 'href="data:image/png;base64,' + mascot.toString('base64') + '"');
  for (const [name, width, height] of [['small', 250, 175], ['large', 500, 350], ['xlarge', 1000, 700]]) {
    await sharp(Buffer.from(source)).resize(width, height).png()
      .toFile(path.join(assets, 'images', name + '.png'));
  }
  console.log('Generated full artwork, head crops and Homey Store images from the supplied PNG.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
