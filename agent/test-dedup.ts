import { compositeSimilarity, stringSimilarity } from './similarity.js'

const pairs: [any, any, string][] = [
  // 故宫相关
  [
    { namePrimary: 'Forbidden City (Palace Museum) (故宫（博物院）)', categoryL1: 'scenic', lat: 39.9177, lng: 116.3907, source: 'foursquare' },
    { namePrimary: '故宫博物院', categoryL1: 'scenic', lat: 39.9174, lng: 116.3908, source: 'osm' },
    'foursquare故宫 vs osm故宫博物院'
  ],
  // 鸟巢：doubao vs spark(假设0,0被过滤后只剩doubao)
  // 八达岭
  [
    { namePrimary: '八达岭长城', categoryL1: 'scenic', lat: 40.3956, lng: 116.0264, source: 'doubao' },
    { namePrimary: '八达岭长城', categoryL1: 'scenic', lat: 40.3728, lng: 116.0074, source: 'qwen' },
    '八达岭长城 doubao vs qwen'
  ],
  // 南锣鼓巷
  [
    { namePrimary: '南锣鼓巷', categoryL1: 'scenic', lat: 39.9321, lng: 116.3968, source: 'osm' },
    { namePrimary: '南锣鼓巷', categoryL1: 'scenic', lat: 39.9412, lng: 116.4074, source: 'doubao' },
    '南锣鼓巷 osm vs doubao'
  ],
  // 国家博物馆
  [
    { namePrimary: '中国国家博物馆', categoryL1: 'scenic', lat: 39.904, lng: 116.3951, source: 'amap' },
    { namePrimary: '国家博物馆', categoryL1: 'scenic', lat: 39.9085, lng: 116.4063, source: 'qwen' },
    '中国国家博物馆 amap vs 国家博物馆 qwen'
  ],
]

for (const [a, b, label] of pairs) {
  const r = compositeSimilarity(a, b)
  const n = stringSimilarity(a.namePrimary, b.namePrimary)
  console.log(`${label}: nSim=${n.toFixed(3)}, score=${r.score.toFixed(4)}, path=${r.path}`)
}
