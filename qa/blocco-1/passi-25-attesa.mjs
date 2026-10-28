export default async (page) => { await page.waitForSelector("main h1", { timeout: 30000 }); await page.waitForTimeout(1500); return "pronto"; };
