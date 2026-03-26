import { chromium } from 'playwright';
import fs from 'fs';
import https from 'https';

const failedCities = [
  { id: 'chengdu', search: 'chengdu-china-panda' },
  { id: 'yibin', search: 'sichuan-bamboo-forest' },
  { id: 'shanghai', search: 'shanghai-bund-skyline' },
  { id: 'chongqing', search: 'chongqing-china-night' },
  { id: 'hangzhou', search: 'hangzhou-west-lake' },
  { id: 'kaifeng', search: 'kaifeng-china-ancient' },
  { id: 'lhasa', search: 'lhasa-potala-palace' },
  { id: 'guilin', search: 'guilin-china-karst' },
  { id: 'yangshuo', search: 'yangshuo-china-landscape' },
  { id: 'suzhou', search: 'suzhou-garden-china' },
  { id: 'shaoxing', search: 'shaoxing-china-water-town' },
  { id: 'jinhua', search: 'jinhua-zhejiang-china' },
  { id: 'wuxi', search: 'wuxi-china-lake' },
  { id: 'yangzhou', search: 'yangzhou-china-garden' },
  { id: 'changsha', search: 'changsha-china-city' },
  { id: 'hengyang', search: 'hengshan-mountain-china' },
  { id: 'shenzhen', search: 'shenzhen-china-skyline' },
  { id: 'tianjin', search: 'tianjin-china-architecture' },
  { id: 'quanzhou', search: 'quanzhou-fujian-temple' },
  { id: 'fuzhou', search: 'fuzhou-china-city' },
  { id: 'guangzhou', search: 'guangzhou-canton-tower' },
  { id: 'foshan', search: 'foshan-china-martial-arts' },
  { id: 'pingyao', search: 'pingyao-ancient-city-china' },
  { id: 'datong', search: 'yungang-grottoes-datong' },
  { id: 'taiyuan', search: 'taiyuan-china-temple' },
  { id: 'zhangye', search: 'zhangye-danxia-landform' },
  { id: 'chiangmai', search: 'chiang-mai-temple-thailand' },
  { id: 'hongkong', search: 'hong-kong-victoria-harbour' },
  { id: 'macau', search: 'macau-ruins-st-paul' },
  { id: 'dubrovnik', search: 'dubrovnik-croatia-old-town' },
  { id: 'valletta', search: 'valletta-malta-harbour' },
  { id: 'lisbon', search: 'lisbon-portugal-tram' },
  { id: 'vancouver', search: 'vancouver-canada-mountains' },
  { id: 'santiago', search: 'santiago-chile-andes' },
  { id: 'valparaiso', search: 'valparaiso-chile-colorful' },
  { id: 'lima', search: 'lima-peru-plaza' },
  { id: 'stockholm', search: 'stockholm-sweden-old-town' },
  { id: 'queenstown', search: 'queenstown-new-zealand-lake' },
  { id: 'petra', search: 'petra-jordan-treasury' },
  { id: 'amman', search: 'amman-jordan-citadel' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const results = {};
  
  for (const city of failedCities) {
    const url = `https://unsplash.com/s/photos/${city.search}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      
      const photoIds = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img[src*="images.unsplash.com/photo-"]');
        const ids = [];
        imgs.forEach(img => {
          const match = img.src.match(/(photo-[0-9]+-[a-f0-9]+)/);
          if (match && !ids.includes(match[1])) ids.push(match[1]);
        });
        return ids.slice(0, 3);
      });
      
      results[city.id] = photoIds[0] || null;
      console.log(`✓ ${city.id}: ${photoIds[0] || 'NONE'}`);
    } catch (e) {
      results[city.id] = null;
      console.log(`✗ ${city.id}: ${e.message}`);
    }
  }
  
  await browser.close();
  
  fs.writeFileSync('scripts/city-photo-fixes.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to scripts/city-photo-fixes.json');
}

main().catch(console.error);
