// Install dependencies first:
// npm install selenium-webdriver chromedriver

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

(async function testMultimovies() {
  const options = new chrome.Options();
  // options.addArguments('--headless=new'); // uncomment for headless mode
  // options.addArguments('--disable-gpu');
  
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  try {
    console.log('⏳ Navigating to multimovies site...');
    await driver.get('https://multimovies.coupons/');

    // Wait until a known element is present (e.g., the movies list)
    const moviesSelector = 'section#featured-movies, .featured-movies, .movies-list'; // tweak if needed
    await driver.wait(until.elementLocated(By.css(moviesSelector)), 10000);

    console.log('Page loaded — extracting data...');

    // Grab movie items (example: titles from featured list)
    const movieElements = await driver.findElements(By.css(`${moviesSelector} li, ${moviesSelector} .movie-item, .movies-list li`));

    const movies = [];
    for (const elem of movieElements) {
      let text = await elem.getText();
      text = text.trim();
      if (text) movies.push(text);
    }

    const output = {
      success: true,
      count: movies.length,
      movies
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    console.error('❌ Error during test:', err.message);
    console.log(JSON.stringify({
      success: false,
      error: err.message
    }, null, 2));
  } finally {
    await driver.quit();
  }
})();
