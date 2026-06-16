// 模拟 Step 7 对花间堂的处理
const poi = {
  namePrimary: '北京天安门花间堂·御道',
  categoryL1: 'scenic',
  tags: ['住宿服务;住宿服务相关;住宿服务相关'],
  source: 'amap'
}

const tagsStr = (poi.tags || []).join(' ')
console.log('tagsStr:', JSON.stringify(tagsStr))
console.log('includes 住宿服务:', tagsStr.includes('住宿服务'))
console.log('condition:', tagsStr.includes('住宿服务') && poi.categoryL1 !== 'hotel')
