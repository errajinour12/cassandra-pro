const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Intercepter et afficher les erreurs de console
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE EXCEPTION:', error.message);
  });

  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
  });

  console.log('Navigating to localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  
  // Set localStorage to simulate the user's state
  await page.evaluate(() => {
    localStorage.setItem('simcass_strategy', JSON.stringify({strategy: 'simple', rf: 3}));
    localStorage.setItem('strategy', JSON.stringify({strategy: 'simple', rf: 3})); // Just in case
  });
  
  // Reload to apply localStorage
  console.log('Reloading with localStorage...');
  await page.reload({ waitUntil: 'networkidle0' });
  
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Done.');
  await browser.close();
})();
