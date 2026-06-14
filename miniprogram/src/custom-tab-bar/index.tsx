import { View, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import './index.css'

const TAB_LIST = [
  {
    key: 'explore',
    page: '/pages/index/index',
    icon: '/assets/tab-home.png',
    iconActive: '/assets/tab-home-active.png',
  },
  {
    key: 'trips',
    page: '/pages/my-trips/index',
    icon: '/assets/tab-trips.png',
    iconActive: '/assets/tab-trips-active.png',
  },
  {
    key: 'create',
    page: '/pages/create-trip/index',
    icon: '/assets/tab-create.png',
    iconActive: '/assets/tab-create-active.png',
  },
  {
    key: 'notes',
    page: '/pages/notes/index',
    icon: '/assets/tab-notes.png',
    iconActive: '/assets/tab-notes-active.png',
  },
  {
    key: 'profile',
    page: '/pages/profile/index',
    icon: '/assets/tab-profile.png',
    iconActive: '/assets/tab-profile-active.png',
  },
]

export default function CustomTabBar() {
  const [selected, setSelected] = useState(0)

  Taro.useDidShow(() => {
    const page = Taro.getCurrentPages().pop()
    if (page) {
      const route = `/${page.route}`
      const idx = TAB_LIST.findIndex(t => t.page === route)
      if (idx >= 0) setSelected(idx)
    }
  })

  const handleSwitch = (idx: number, page: string) => {
    setSelected(idx)
    Taro.switchTab({ url: page })
  }

  const handleCreate = () => {
    setSelected(2)
    Taro.switchTab({ url: '/pages/create-trip/index' })
  }

  return (
    <View className='custom-tab-bar'>
      <View className='tab-bar-content'>
        {TAB_LIST.map((tab, idx) => {
          if (tab.key === 'create') {
            return (
              <View key={tab.key} className='tab-create-wrap'>
                <View className='tab-create-btn' onClick={handleCreate}>
                  <View className='tab-create-icon'>+</View>
                </View>
              </View>
            )
          }
          const isActive = selected === idx
          return (
            <View
              key={tab.key}
              className='tab-item'
              onClick={() => handleSwitch(idx, tab.page)}
            >
              <Image
                src={isActive ? tab.iconActive : tab.icon}
                className='tab-item-img'
                mode='aspectFit'
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}
