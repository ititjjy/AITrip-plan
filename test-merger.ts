import { mergeAndDeduplicate } from './agent/merger.js'
import { cleanPOIs, evaluateQuality } from './agent/quality.js'
import { loadRawPOIsBySource } from './agent/db.js'
import { loadCities } from './agent/config.js'

const cityId = 'shanghai'
const city = loadCities().find(c => c.id === cityId)
console.log('City:', city?.name, city?.id)

const allRawPOIs = []
for (const s of ['qwen','doubao','osm','spark','siliconflow']) {
  const pois = loadRawPOIsBySource(cityId, s)
  console.log(`Source ${s}: ${pois?.length ?? 0} POIs`)
  if (pois && pois.length > 0) allRawPOIs.push(...pois)
}
console.log('Total raw:', allRawPOIs.length)

if (allRawPOIs.length === 0) {
  console.log('No raw POIs found!')
  process.exit(0)
}

const { pois, stats } = mergeAndDeduplicate(allRawPOIs, city, 100)
console.log('Merged POIs:', pois.length)
console.log('Stats afterMerge:', stats.afterMerge)

const cleaned = cleanPOIs(pois, city)
console.log('Cleaned:', cleaned.length)

const report = evaluateQuality(cleaned, city)
console.log('Quality score:', report.overallScore)
