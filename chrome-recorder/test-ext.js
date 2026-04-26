const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const pathToExtension = path.join(__dirname, 'popup'); // actually the extension root is one level up
  const extPath = path.join('/Users/jnaguboina/.gemini/antigravity/scratch/chrome-recorder');
  
  const userDataDir = '/tmp/test-ext';
  
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`
    ]
  });

  // wait for extension to load
  await browserContext.waitForTimeout(2000);

  let [background] = browserContext.serviceWorkers();
  if (!background)
    background = await browserContext.waitForEvent('serviceworker');

  background.on('console', msg => console.log('BACKGROUND LOG:', msg.text()));
  background.on('pageerror', err => console.log('BACKGROUND ERROR:', err.message));

  const page = await browserContext.newPage();
  await page.goto('about:blank');
  
  // Try calling the message to background
  await page.evaluate(() => {
    chrome.runtime.sendMessage("id_here", { type: 'start_recording' });
  });

  await browserContext.waitForTimeout(5000);
  await browserContext.close();
})();
