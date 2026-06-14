export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/my-trips/index',
    'pages/create-trip/index',
    'pages/notes/index',
    'pages/profile/index',
    'pages/planner/index',
    'pages/overview/index',
    'pages/detail/index',
    'pages/hotel-detail/index',
    'pages/note-detail/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '梦想智游',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    custom: true,
    color: '#999',
    selectedColor: '#FF6B6B',
    borderStyle: 'white',
    backgroundColor: '#fff',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '探索',
        iconPath: 'assets/tab-home.png',
        selectedIconPath: 'assets/tab-home-active.png',
      },
      {
        pagePath: 'pages/my-trips/index',
        text: '行程',
        iconPath: 'assets/tab-trips.png',
        selectedIconPath: 'assets/tab-trips-active.png',
      },
      {
        pagePath: 'pages/create-trip/index',
        text: '创建',
        iconPath: 'assets/tab-create.png',
        selectedIconPath: 'assets/tab-create-active.png',
      },
      {
        pagePath: 'pages/notes/index',
        text: '游记',
        iconPath: 'assets/tab-notes.png',
        selectedIconPath: 'assets/tab-notes-active.png',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tab-profile.png',
        selectedIconPath: 'assets/tab-profile-active.png',
      },
    ],
  },
})