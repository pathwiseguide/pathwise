// One-off script to convert HTML to PDF using Puppeteer
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const htmlPath = path.resolve('C:\\Users\\jiayu\\Downloads\\Pathwise Waiver.html');
const pdfPath = path.resolve('C:\\Users\\jiayu\\Downloads\\Pathwise Waiver.pdf');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0'
  });
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  await browser.close();
  console.log('PDF saved to:', pdfPath);
})();
