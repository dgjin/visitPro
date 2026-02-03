
export default {
  pages: [
    'pages/visit/index',
    'pages/dashboard/index',
    'pages/clients/index',
    'pages/admin/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'VisitPro',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#2563EB',
    backgroundColor: '#ffffff',
    list: [
      {
        pagePath: 'pages/dashboard/index',
        text: '仪表盘'
      },
      {
        pagePath: 'pages/visit/index',
        text: '拜访'
      },
      {
        pagePath: 'pages/clients/index',
        text: '客户'
      },
      {
        pagePath: 'pages/admin/index',
        text: '我的'
      }
    ]
  }
}
