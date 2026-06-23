import Taro from '@tarojs/taro'
import { getState } from '../store'

// 本地调试时取消下面注释，正式环境用 https
// const BASE_URL = 'http://localhost:3001/api'
const BASE_URL = 'https://www.mxaitrip.cn/api'

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  header?: Record<string, string>
}

export function request<T = any>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, header } = options
  const state = getState()
  const authHeader = state.token ? { Authorization: `Bearer ${state.token}` } : {}

  return new Promise((resolve, reject) => {
    Taro.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...header,
      },
      success: (res) => {
        console.log(`[API] ${method} ${BASE_URL}${url}`, `status=${res.statusCode}`, `dataLength=${Array.isArray((res.data as any)?.data) ? (res.data as any).data.length : 'N/A'}`)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T)
        } else if (res.statusCode === 401) {
          // token过期，清除登录态
          Taro.removeStorageSync('aitrip_token')
          Taro.removeStorageSync('aitrip_user')
          reject(new Error('登录已过期，请重新登录'))
        } else {
          reject(new Error(`请求失败 (${res.statusCode})`))
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

/* ── API Endpoints ── */

export const api = {
  // POI / 城市
  getCities: () => request({ url: '/cities' }),
  getPOIs: (cityId: string, cityName?: string, cityNameEn?: string) =>
    request({ url: `/pois/${cityId}`, data: { cityName, cityNameEn } }),
  refreshPOIs: (cityId: string, cityName?: string, cityNameEn?: string) =>
    request({ url: `/pois/${cityId}/refresh`, method: 'POST', data: { cityName, cityNameEn } }),

  // 酒店
  getHotels: (cityId: string, cityName?: string, cityNameEn?: string) =>
    request({ url: `/hotels/${cityId}`, data: { cityName, cityNameEn } }),

  // 行程
  getTrips: () => request({ url: '/trips' }),
  getTrip: (id: string) => request({ url: `/trips/${id}` }),
  createTrip: (data: any) => request({ url: '/trips', method: 'POST', data }),
  updateTrip: (id: string, data: any) => request({ url: `/trips/${id}`, method: 'PUT', data }),
  deleteTrip: (id: string) => request({ url: `/trips/${id}`, method: 'DELETE' }),

  // 游记
  getNotes: (params?: { page?: number; limit?: number }) =>
    request({ url: '/notes', data: params }),
  getNote: (id: string) => request({ url: `/notes/${id}` }),
  publishTrip: (id: string, data?: any) =>
    request({ url: `/trips/${id}/publish`, method: 'POST', data }),
  unpublishTrip: (id: string) =>
    request({ url: `/trips/${id}/unpublish`, method: 'POST' }),

  // 评论
  getComments: (noteId: string) => request({ url: `/notes/${noteId}/comments` }),
  addComment: (noteId: string, content: string) =>
    request({ url: `/notes/${noteId}/comments`, method: 'POST', data: { content } }),

  // Auth
  login: (email: string, password: string) =>
    request({ url: '/auth/login', method: 'POST', data: { email, password } }),
  register: (email: string, password: string, nickname: string) =>
    request({ url: '/auth/register', method: 'POST', data: { email, password, nickname } }),
  getMe: () => request({ url: '/auth/me' }),
  updateNickname: (nickname: string) =>
    request({ url: '/auth/nickname', method: 'PUT', data: { nickname } }),
  wxLogin: (code: string) =>
    request({ url: '/auth/wx-login', method: 'POST', data: { code } }),

  // 路线规划 — 服务端接收 coords 参数（格式: lng1,lat1;lng2,lat2）
  getRoute: (from: [number, number], to: [number, number]) =>
    request({ url: '/transit/route', data: { coords: `${from[1]},${from[0]};${to[1]},${to[0]}` } }),

  // 健康
  health: () => request({ url: '/health' }),
}
