/**
 * imageProxy.ts – 图片加载失败时通过服务端代理重试
 *
 * 国内访问时 Unsplash / Picsum 等外部 CDN 被 GFW 屏蔽。
 * 服务端（阿里云）可以正常访问这些 CDN，因此通过 /api/img 代理中转。
 *
 * 策略：
 *   1. 直接加载外部 URL 失败 → 改用 /api/img?url=<原始URL> 重试
 *   2. 代理也失败 → 显示纯色 SVG 占位符，不再发起请求
 */

/** SVG 灰色占位图（data URI，无需任何外部请求） */
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E" +
  "%3Crect width='400' height='300' fill='%23f3f4f6'/%3E" +
  "%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' " +
  "font-size='40' fill='%23d1d5db'%3E%F0%9F%8F%9B%EF%B8%8F%3C/text%3E%3C/svg%3E"

/**
 * 通用 img onError 处理器
 *
 * 用法：
 *   <img src={url} onError={handleImgError} />
 */
export function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  // 已经尝试过代理 → 显示占位符，终止
  if (img.dataset.proxyTried) {
    img.src = PLACEHOLDER
    img.onerror = null
    return
  }
  img.dataset.proxyTried = '1'
  const original = img.src
  // 只对外部 http(s) URL 走代理，data URI 直接占位
  if (/^https?:\/\//.test(original)) {
    img.src = `/api/img?url=${encodeURIComponent(original)}`
  } else {
    img.src = PLACEHOLDER
    img.onerror = null
  }
}
