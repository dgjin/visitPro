
import React, { useState } from 'react';
import { View as TaroView, Text as TaroText, ScrollView as TaroScrollView } from '@tarojs/components';
import { navigateTo, useDidShow } from '@tarojs/taro';
import { getStorageData } from '../../services/storage';
import { Visit } from '../../types';
import './index.scss';

const View = TaroView as any;
const Text = TaroText as any;
const ScrollView = TaroScrollView as any;

const DashboardPage = () => {
  const [stats, setStats] = useState<any[]>([]);
  const [recentVisits, setRecentVisits] = useState<Visit[]>([]);
  const [teamStats, setTeamStats] = useState<any[]>([]);
  const [userName, setUserName] = useState('');
  const [weeklyData, setWeeklyData] = useState<{day: string, count: number}[]>([]);

  useDidShow(() => {
      const data = getStorageData();
      setUserName(data.settings?.userName || '用户');
      
      const totalClients = data.clients.length;
      const visits = data.visits;
      
      const thisMonthVisits = visits.filter(v => {
          const d = new Date(v.date);
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;
      const positive = visits.filter(v => v.outcome === 'Positive').length;
      const pending = visits.filter(v => v.outcome === 'Pending' || v.outcome === 'Negative').length;

      setStats([
        { label: '客户总数', value: totalClients, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: '本月拜访', value: thisMonthVisits, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: '积极结果', value: positive, color: 'text-green-600', bg: 'bg-green-50' },
        { label: '需关注', value: pending, color: 'text-red-600', bg: 'bg-red-50' },
      ]);

      setRecentVisits(visits.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5));

      // Weekly Data
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const weekCounts = [];
      for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const count = visits.filter(v => v.date.startsWith(dateStr)).length;
          weekCounts.push({ day: days[d.getDay()], count });
      }
      setWeeklyData(weekCounts);

      // Team Stats
      const tStats = data.users.map(u => {
          const uVisits = visits.filter(v => v.userId === u.id || (v.userId === 'current-user' && u.role === 'Admin')); // simplistic matching
          const positive = uVisits.filter(v => v.outcome === 'Positive').length;
          return {
              name: u.name,
              department: u.department,
              count: uVisits.length,
              rate: uVisits.length ? Math.round((positive/uVisits.length)*100) : 0
          };
      }).sort((a,b) => b.count - a.count);
      setTeamStats(tStats);
  });

  const maxCount = Math.max(...weeklyData.map(d => d.count), 1);

  return (
    <ScrollView className="page-container h-screen bg-gray-50" scrollY>
      <View className="header p-6 bg-white pb-4 pt-safe">
        <Text className="text-gray-500 text-sm">欢迎回来,</Text>
        <Text className="text-2xl font-bold text-gray-900 block mt-1">{userName}</Text>
      </View>

      <View className="p-4 space-y-4">
        {/* KPI Cards */}
        <View className="grid grid-cols-2 gap-4">
            {stats.map((stat, idx) => (
            <View key={idx} className="card bg-white p-4 rounded-2xl shadow-sm flex flex-col justify-between h-24">
                <Text className="text-gray-500 text-xs">{stat.label}</Text>
                <View className="flex items-end justify-between">
                <Text className={`text-2xl font-bold ${stat.color}`}>{stat.value}</Text>
                <View className={`w-2 h-2 rounded-full mb-1 ${stat.bg.replace('bg-', 'bg-')}`}></View>
                </View>
            </View>
            ))}
        </View>

        {/* Weekly Chart */}
        <View className="bg-white p-5 rounded-2xl shadow-sm">
            <Text className="text-lg font-bold text-gray-800 mb-6 block">本周活动趋势</Text>
            <View className="flex justify-between items-end h-32 space-x-2">
                {weeklyData.map((d, i) => (
                    <View key={i} className="flex-1 flex flex-col items-center">
                        <View className="w-full flex justify-center items-end h-24 bg-gray-50 rounded-lg overflow-hidden relative">
                            <View 
                                className="w-full bg-blue-500 rounded-t-sm absolute bottom-0 transition-all duration-500"
                                style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? '6px' : '0' }}
                            ></View>
                        </View>
                        <Text className="text-[10px] text-gray-400 mt-2 font-medium">{d.day}</Text>
                    </View>
                ))}
            </View>
        </View>

        {/* Team Stats */}
        <View className="bg-white p-5 rounded-2xl shadow-sm">
             <Text className="text-lg font-bold text-gray-800 mb-4 block">团队业绩榜</Text>
             {teamStats.map((t, i) => (
                 <View key={i} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
                     <View className="flex items-center">
                         <View className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 ${i===0?'bg-yellow-100 text-yellow-700': i===1?'bg-gray-200 text-gray-600':'bg-orange-50 text-orange-600'}`}>
                             {i+1}
                         </View>
                         <View>
                            <Text className="text-sm font-bold text-gray-700 block">{t.name}</Text>
                            <Text className="text-[10px] text-gray-400 block">{t.department}</Text>
                         </View>
                     </View>
                     <View className="flex items-center space-x-4">
                         <Text className="text-xs text-gray-500">拜访 {t.count}</Text>
                         <Text className={`text-xs font-bold ${t.rate>70?'text-green-600':'text-blue-600'}`}>转化 {t.rate}%</Text>
                     </View>
                 </View>
             ))}
        </View>

        {/* Recent Visits */}
        <View>
            <View className="flex justify-between items-center mb-3">
                <Text className="text-lg font-bold text-gray-800">近期动态</Text>
                <View className="bg-blue-50 px-3 py-1 rounded-full" onClick={() => navigateTo({ url: '/pages/visit/index' })}>
                    <Text className="text-blue-600 text-xs font-bold">查看全部</Text>
                </View>
            </View>
            
            <View className="space-y-3 pb-safe">
                {recentVisits.map(visit => (
                    <View key={visit.id} className="bg-white p-4 rounded-2xl shadow-sm flex flex-col active:scale-[0.98] transition-transform" onClick={() => navigateTo({ url: `/pages/visit/index?id=${visit.id}` })}>
                        <View className="flex justify-between items-start mb-2">
                            <Text className="font-bold text-gray-900 text-base">{visit.clientName}</Text>
                            <Text className="text-xs text-gray-400">{new Date(visit.date).toLocaleDateString()}</Text>
                        </View>
                        <Text className="text-sm text-gray-600 mb-3 line-clamp-2">{visit.summary}</Text>
                        <View className="flex justify-between items-center">
                            <Text className={`text-[10px] px-2 py-1 rounded-lg font-bold ${
                                visit.outcome === 'Positive' ? 'bg-green-50 text-green-700' : 
                                visit.outcome === 'Negative' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                                {visit.outcome === 'Positive' ? '积极' : visit.outcome === 'Negative' ? '消极' : '中立'}
                            </Text>
                             {visit.attachments && visit.attachments.length > 0 && (
                                <Text className="text-[10px] text-gray-400">📎 有附件</Text>
                            )}
                        </View>
                    </View>
                ))}
            </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default DashboardPage;
