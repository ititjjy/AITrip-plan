
import { mergeAndDeduplicate } from './agent/merger.js'
import { cleanPOIs, evaluateQuality } from './agent/quality.js'
import { loadRawPOIs } from './agent/db.js'
import { loadCities } from './agent/config.js'

const city = loadCities().find(c => c.id === 'shanghai')
const allRawPOIs = []
for (const s of ['ai','doubao','osm','spark','siliconflow']) {
  const pois = loadRawPOIs('shanghai', s)
  if (pois.length > 0) allRawPOIs.push(...pois)
}

const start = Date.now()
const { pois, stats } = mergeAndDeduplicate(allRawPOIs, city, 100)
const cleaned = cleanPOIs(pois, city)
const report = evaluateQuality(cleaned, city)
const duration = Date.now() - start

console.log(JSON.stringify({ pois: cleaned, stats, report, duration }))
