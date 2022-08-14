const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless:true});
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/',{waitUntil: 'networkidle2',});
  await page.click('[id="btnConnect"]')
  await page.screenshot({path: 'example1.png'});

  await page.waitForFunction(
    'document.querySelector("#pState").innerText.toLowerCase().trim().includes("start")',
  );
  await page.screenshot({path: 'example2.png'});

  await page.click('[id="btnOne"]')

  await page.waitForFunction(
    'document.querySelector("#pState").innerText.toLowerCase().trim().includes("done")',
  );
  await page.screenshot({path: 'example3.png'});

  await browser.close();
})();