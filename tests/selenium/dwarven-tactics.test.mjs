import assert from "node:assert/strict";
import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5173/#/dwarven-tactics";
const timeoutMs = 10000;

const buildDriver = async () => {
  const options = new chrome.Options();
  const headless = process.env.HEADLESS !== "0";
  // Use headless Chrome by default; set HEADLESS=0 to show the browser.
  if (headless) {
    options.addArguments("--headless=new");
  }
  options.addArguments("--no-sandbox", "--disable-gpu", "--window-size=1280,800");
  return new Builder().forBrowser("chrome").setChromeOptions(options).build();
};

const waitForText = async (driver, selector, text) => {
  const element = await driver.findElement(By.css(selector));
  // Wait until the element contains the expected text.
  await driver.wait(async () => (await element.getText()).includes(text), timeoutMs);
  return element;
};

const run = async () => {
  const driver = await buildDriver();
  try {
    // Load the Dwarven Tactics page.
    await driver.get(baseUrl);

    // Ensure the board is ready.
    await driver.wait(until.elementLocated(By.css('[data-testid="board-square-6-0"]')), timeoutMs);

    // Start/reset the match to get a clean state.
    const resetButton = await driver.findElement(By.css('[data-testid="reset-match"]'));
    await resetButton.click();

    // Verify the move log is empty after reset.
    await waitForText(driver, '[data-testid="move-log"]', "No moves recorded yet.");

    // Select a difficulty level and assert it becomes active.
    const difficultyButton = await driver.findElement(By.css('[data-testid="difficulty-3"]'));
    await difficultyButton.click();
    const difficultyClass = await difficultyButton.getAttribute("class");
    assert.ok(difficultyClass.includes("active"));

    // Make a simple opening move (A2 -> A3).
    await driver.findElement(By.css('[data-testid="board-square-6-0"]')).click();
    await driver.findElement(By.css('[data-testid="board-square-5-0"]')).click();

    // Confirm the move is recorded in the log.
    await waitForText(driver, '[data-testid="move-log"]', "Pawn A2 -> A3");
  } finally {
    // Always quit the driver to clean up.
    await driver.quit();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
