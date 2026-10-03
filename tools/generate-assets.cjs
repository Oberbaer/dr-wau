'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
// Already included by the Homey CLI; no dependency installation or API calls.
const sharp = require(path.join(root, 'node_modules', 'sharp'));
const assets = path.join(root, 'assets');
(async () => {
  const mascot = fs.readFileSync(path.join(assets, 'dr-wau.png'));
  await sharp(mascot).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(path.join(assets, 'dr-wau-avatar.png'));
  const source = fs.readFileSync(path.join(assets, 'images', 'source.svg'), 'utf8')
    .replace('href="../dr-wau.png"', 'href="data:image/png;base64,' + mascot.toString('base64') + '"');
  for (const [name, width, height] of [['small', 250, 175], ['large', 500, 350], ['xlarge', 1000, 700]]) {
    await sharp(Buffer.from(source)).resize(width, height).png()
      .toFile(path.join(assets, 'images', name + '.png'));
  }
  console.log('Generated transparent avatar and three Homey images from the selected mascot and source SVG.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
