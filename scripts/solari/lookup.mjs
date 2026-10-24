// FINRA BrokerCheck lookup in a Solari cloud browser.
// Usage: node lookup.mjs <crd> <screenshotPath>
// Prints one JSON line to stdout: {found, name, licenses, text, sourceUrl, screenshotPath, seconds}
// Called by api/adapters/solari.py with a hard timeout; any failure -> non-zero exit.
import { Solari } from '@solarisdk/browser'
import { writeFile } from 'node:fs/promises'

const [crd, shotPath] = process.argv.slice(2)
const key = (process.env.SOLARI_API_KEY || '').trim()
if (!crd || !key) {
  console.error('usage: SOLARI_API_KEY=... node lookup.mjs <crd> <screenshotPath>')
  process.exit(2)
}

const t0 = performance.now()
const client = new Solari({ apiKey: key, baseUrl: 'https://api.getsolari.com' })
let browser
try {
  browser = await client.launch()
  const page = await browser.newPage()
  const sourceUrl = `https://brokercheck.finra.org/individual/summary/${encodeURIComponent(crd)}`
  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
  // The Angular app renders after load; wait for either a profile or a not-found message.
  await page
    .waitForFunction(
      () => /Registrations|Exams|Series|not found|No results|Individual Not Found|CRD#/i.test(document.body.innerText),
      null,
      { timeout: 15000 },
    )
    .catch(() => {})
  await page.waitForTimeout(1500)
  const text = (await page.locator('body').innerText({ timeout: 10000 })).replace(/\s+\n/g, '\n').slice(0, 6000)
  const png = await page.screenshot({ fullPage: true })
  if (shotPath) await writeFile(shotPath, png)

  const licenses = [...new Set((text.match(/Series\s?(7|65|66|82)\b/gi) || []).map((s) => s.replace(/\s+/, ' ').replace(/series/i, 'Series')))]
  const notFound = /not found|no results|individual not found/i.test(text) && !licenses.length
  // Name: BrokerCheck shows the person's name in large type above "CRD#".
  let name = null
  const m = licenses.length ? text.match(/\n([A-Z][A-Za-z.'\- ]{3,60})\n[^\n]*CRD#/) : null
  if (m) name = m[1].trim()

  console.log(JSON.stringify({
    found: !notFound && licenses.length > 0,
    name,
    licenses,
    text: text.slice(0, 2000),
    sourceUrl,
    screenshotPath: shotPath || null,
    seconds: Math.round(performance.now() - t0) / 1000,
  }))
} catch (e) {
  console.error(`${e?.name}: ${e?.message}`)
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  await client.close?.().catch?.(() => {})
}
