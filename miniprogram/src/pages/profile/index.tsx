import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { getState, setState, clearStore, getAuthHeaders } from '../../store'
import { api } from '../../services/api'
import './index.css'

export default function ProfilePage() {
  const state = getState()
  const [user, setUser] = useState(state.user)
  const [showLogin, setShowLogin] = useState(!state.user)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)

  Taro.useDidShow(() => {
    const s = getState()
    if (s.user) {
      setUser(s.user)
      setShowLogin(false)
    }
  })

  const handleLogin = async () => {
    if (!email || !password) {
      Taro.showToast({ title: '请输入邮箱和密码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const res = await api.login(email, password)
      if (res.success && res.token) {
        setState({ token: res.token, user: res.user })
        setUser(res.user)
        setShowLogin(false)
        Taro.showToast({ title: '登录成功', icon: 'success' })
      } else {
        Taro.showToast({ title: res.message || '登录失败', icon: 'none' })
      }
    } catch (err) {
      Taro.showToast({ title: '网络错误', icon: 'none' })
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    if (!email || !password || !nickname) {
      Taro.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const res = await api.register(email, password, nickname)
      if (res.success && res.token) {
        setState({ token: res.token, user: res.user })
        setUser(res.user)
        setShowLogin(false)
        Taro.showToast({ title: '注册成功', icon: 'success' })
      } else {
        Taro.showToast({ title: res.message || '注册失败', icon: 'none' })
      }
    } catch (err) {
      Taro.showToast({ title: '网络错误', icon: 'none' })
    }
    setLoading(false)
  }

  const handleLogout = () => {
    clearStore()
    setUser(null)
    setShowLogin(true)
    Taro.showToast({ title: '已退出登录', icon: 'success' })
  }

  const handleUpdateNickname = async () => {
    if (!nickname.trim()) return
    try {
      const res = await api.updateNickname(nickname)
      if (res.success && user) {
        const updated = { ...user, nickname }
        setState({ user: updated })
        setUser(updated)
        Taro.showToast({ title: '修改成功', icon: 'success' })
      }
    } catch { /* ignore */ }
  }

  return (
    <View className='profile-page'>
      {/* 登录/注册界面 */}
      {showLogin ? (
        <View style='padding: 64rpx 48rpx;'>
          <View style='text-align: center; margin-bottom: 64rpx;'>
            <Text style='font-size: 96rpx; display: block; margin-bottom: 24rpx;'>🗺️</Text>
            <Text style='font-size: 48rpx; font-weight: 800; color: #1C1917; display: block;'>梦想智游</Text>
            <Text style='font-size: 28rpx; color: #7A7068; margin-top: 12rpx; display: block;'>
              {isRegister ? '创建账号，开启旅程' : '登录账号，同步你的行程'}
            </Text>
          </View>

          <View style='display: flex; flex-direction: column; gap: 24rpx;'>
            <View style='border-radius: 20rpx; border: 2rpx solid #E7E0D8; background: #ffffff;'>
              <Input
                style='height: 96rpx; padding: 0 32rpx; font-size: 28rpx;'
                placeholder='邮箱'
                type='text'
                value={email}
                onInput={(e) => setEmail(e.detail.value)}
              />
            </View>
            {isRegister && (
              <View style='border-radius: 20rpx; border: 2rpx solid #E7E0D8; background: #ffffff;'>
                <Input
                  style='height: 96rpx; padding: 0 32rpx; font-size: 28rpx;'
                  placeholder='昵称'
                  value={nickname}
                  onInput={(e) => setNickname(e.detail.value)}
                />
              </View>
            )}
            <View style='border-radius: 20rpx; border: 2rpx solid #E7E0D8; background: #ffffff;'>
              <Input
                style='height: 96rpx; padding: 0 32rpx; font-size: 28rpx;'
                placeholder='密码'
                password
                value={password}
                onInput={(e) => setPassword(e.detail.value)}
              />
            </View>

            <View
              style={`width: 100%; height: 96rpx; border-radius: 20rpx; display: flex; align-items: center; justify-content: center; ${loading ? 'background: #E7E0D8;' : 'background: linear-gradient(135deg, #E8735A, #D4553D); box-shadow: 0 8rpx 24rpx rgba(232,115,90,0.3);'}`}
              onClick={() => !loading && (isRegister ? handleRegister() : handleLogin())}
            >
              <Text style={`font-size: 30rpx; font-weight: 600; ${loading ? 'color: #7A7068;' : 'color: #ffffff;'}`}>
                {loading ? '处理中...' : isRegister ? '注册' : '登录'}
              </Text>
            </View>

            <View style='text-align: center; margin-top: 24rpx;'>
              <Text
                style='font-size: 28rpx; color: #E8735A; font-weight: 500;'
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        /* 已登录个人中心 */
        <View>
          {/* 用户信息头部 */}
          <View style='background: linear-gradient(135deg, #E8735A, #E8A44A); padding: 64rpx 40rpx 48rpx;'>
            <View style='display: flex; align-items: center; gap: 24rpx;'>
              <View style='width: 112rpx; height: 112rpx; border-radius: 50%; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center;'>
                <Text style='font-size: 48rpx; font-weight: 700; color: #ffffff;'>
                  {user?.nickname?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
              <View>
                <Text style='font-size: 36rpx; font-weight: 700; color: #ffffff; display: block;'>{user?.nickname || '旅行者'}</Text>
                <Text style='font-size: 26rpx; color: rgba(255,255,255,0.7); display: block; margin-top: 8rpx;'>{user?.email}</Text>
              </View>
            </View>
          </View>

          {/* 功能菜单 */}
          <View style='margin: -24rpx 32rpx 0; border-radius: 20rpx; background: #ffffff; box-shadow: 0 1px 3px rgba(28,25,23,0.04), 0 4px 12px rgba(28,25,23,0.04); border: 1rpx solid #E7E0D8; overflow: hidden;'>
            <View style='padding: 24rpx; border-bottom: 1rpx solid #F5F0EB;'>
              <Text style='font-size: 26rpx; font-weight: 500; color: #7A7068; display: block; margin-bottom: 12rpx;'>昵称</Text>
              <View style='display: flex; align-items: center; gap: 12rpx;'>
                <Input
                  style='flex: 1; font-size: 28rpx; color: #1C1917;'
                  value={nickname || user?.nickname || ''}
                  onInput={(e) => setNickname(e.detail.value)}
                  placeholder='修改昵称'
                />
                <View
                  style='border-radius: 12rpx; background: #E8735A; padding: 10rpx 24rpx;'
                  onClick={handleUpdateNickname}
                >
                  <Text style='font-size: 24rpx; color: #ffffff;'>保存</Text>
                </View>
              </View>
            </View>

            <View style='padding: 24rpx; border-bottom: 1rpx solid #F5F0EB; display: flex; align-items: center; justify-content: space-between;' onClick={() => Taro.switchTab({ url: '/pages/my-trips/index' })}>
              <View style='display: flex; align-items: center; gap: 12rpx;'>
                <Text style='font-size: 32rpx;'>🗺️</Text>
                <Text style='font-size: 28rpx; color: #1C1917;'>我的行程</Text>
              </View>
              <Text style='font-size: 24rpx; color: #7A7068;'>查看全部 ›</Text>
            </View>

            <View style='padding: 24rpx; display: flex; align-items: center; justify-content: space-between;' onClick={() => Taro.switchTab({ url: '/pages/notes/index' })}>
              <View style='display: flex; align-items: center; gap: 12rpx;'>
                <Text style='font-size: 32rpx;'>📖</Text>
                <Text style='font-size: 28rpx; color: #1C1917;'>旅行灵感</Text>
              </View>
              <Text style='font-size: 24rpx; color: #7A7068;'>查看全部 ›</Text>
            </View>
          </View>

          {/* 退出登录 */}
          <View style='margin: 32rpx;'>
            <View
              style='width: 100%; height: 88rpx; border-radius: 20rpx; border: 2rpx solid #E7E0D8; display: flex; align-items: center; justify-content: center; background: #ffffff;'
              onClick={handleLogout}
            >
              <Text style='font-size: 28rpx; color: #D4553D;'>退出登录</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
