import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Users, Calendar, TrendingUp, AlertCircle, ChevronRight, Briefcase, Award } from 'lucide-react';
import { Visit, User } from '../types';

interface DashboardProps {
  visits: Visit[];
  users: User[];
  totalClients: number;
  onVisitClick: (visitId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ visits, users, totalClients, onVisitClick }) => {
  // Compute basic stats
  const totalVisits = visits.length;
  const positiveVisits = visits.filter(v => v.outcome === 'Positive').length;
  const negativeVisits = visits.filter(v => v.outcome === 'Negative').length;
  
  // Prepare chart data (Visits per day - Mocking last 7 days distribution)
  const data = [
    { name: '周一', visits: 4 },
    { name: '周二', visits: 3 },
    { name: '周三', visits: 7 },
    { name: '周四', visits: 5 },
    { name: '周五', visits: 6 },
    { name: '周六', visits: 2 },
    { name: '周日', visits: 1 },
  ];

  // Compute Team Stats
  const teamStats = users.map(user => {
      const userVisits = visits.filter(v => v.userId === user.id);
      const visitCount = userVisits.length;
      const positiveCount = userVisits.filter(v => v.outcome === 'Positive').length;
      const successRate = visitCount > 0 ? Math.round((positiveCount / visitCount) * 100) : 0;
      const lastVisit = userVisits.length > 0 
        ? userVisits.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] 
        : null;
      
      // Directly use the user object's fields
      const teamDisplay = user.department ? `${user.department} / ${user.teamName || '无小组'}` : (user.teamName || '未分配');

      return {
          user,
          teamDisplay,
          visitCount,
          successRate,
          lastVisit
      };
  }).sort((a, b) => b.visitCount - a.visitCount);

  const StatCard = ({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: string }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  );

  const translateOutcome = (outcome: string) => {
    switch (outcome) {
      case 'Positive': return '积极';
      case 'Neutral': return '中立';
      case 'Negative': return '消极';
      case 'Pending': return '待定';
      default: return outcome;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="客户总数" 
          value={totalClients} 
          icon={Users} 
          color="bg-blue-500" 
        />
        <StatCard 
          title="本月拜访" 
          value={totalVisits} 
          icon={Calendar} 
          color="bg-indigo-500" 
        />
        <StatCard 
          title="积极结果" 
          value={positiveVisits} 
          icon={TrendingUp} 
          color="bg-green-500" 
        />
        <StatCard 
          title="需关注" 
          value={negativeVisits} 
          icon={AlertCircle} 
          color="bg-red-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">每周活动分布</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                />
                <Bar dataKey="visits" fill="#4F46E5" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <Award className="w-5 h-5 mr-2 text-yellow-500" />
              团队业绩概览
          </h3>
          <div className="flex-1 overflow-auto">
             <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider">
                            <th className="pb-3 font-semibold pl-2">团队成员</th>
                            <th className="pb-3 font-semibold">所属团队</th>
                            <th className="pb-3 font-semibold text-center">拜访总数</th>
                            <th className="pb-3 font-semibold text-center">积极转化</th>
                            <th className="pb-3 font-semibold text-right pr-2">最近活动</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {teamStats.map((stat) => (
                            <tr key={stat.user.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="py-3 pl-2 flex items-center space-x-2">
                                    <img src={stat.user.avatarUrl} alt={stat.user.name} className="w-7 h-7 rounded-full bg-gray-200" />
                                    <div>
                                        <p className="font-semibold text-gray-900">{stat.user.name}</p>
                                        <p className="text-[10px] text-gray-400">{stat.user.role === 'Admin' ? '管理员' : '销售代表'}</p>
                                    </div>
                                </td>
                                <td className="py-3">
                                    <span className="text-gray-600 font-medium truncate max-w-[120px] inline-block">{stat.teamDisplay}</span>
                                </td>
                                <td className="py-3 text-center">
                                    <span className="font-bold text-gray-700">{stat.visitCount}</span>
                                </td>
                                <td className="py-3 text-center">
                                    <div className="flex items-center justify-center space-x-2">
                                        <div className="w-12 bg-gray-100 rounded-full h-1">
                                            <div 
                                                className={`h-1 rounded-full ${stat.successRate >= 80 ? 'bg-green-500' : stat.successRate >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`} 
                                                style={{ width: `${stat.successRate}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-500 w-7">{stat.successRate}%</span>
                                    </div>
                                </td>
                                <td className="py-3 text-right pr-2 text-gray-400 text-[10px]">
                                    {stat.lastVisit ? new Date(stat.lastVisit.date).toLocaleDateString('zh-CN') : '--'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">近期拜访追踪</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400 uppercase tracking-tight text-[11px] font-bold">
                <th className="pb-3 pl-1">客户名称</th>
                <th className="pb-3">拜访日期</th>
                <th className="pb-3">分析摘要</th>
                <th className="pb-3">反馈情绪</th>
                <th className="pb-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visits.slice(0, 5).map((visit) => (
                <tr 
                    key={visit.id} 
                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                    onClick={() => onVisitClick(visit.id)}
                >
                  <td className="py-3 pl-1 font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{visit.clientName}</td>
                  <td className="py-3 text-gray-500 tabular-nums">{new Date(visit.date).toLocaleDateString('zh-CN')}</td>
                  <td className="py-3 text-gray-500 max-w-xs truncate">{visit.summary}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                      ${visit.outcome === 'Positive' ? 'bg-green-50 text-green-600 border border-green-100' : 
                        visit.outcome === 'Negative' ? 'bg-red-50 text-red-600 border border-red-100' : 
                        'bg-gray-50 text-gray-500 border border-gray-100'}`}>
                      {translateOutcome(visit.outcome)}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-all opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1" />
                  </td>
                </tr>
              ))}
              {visits.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 italic">暂无近期拜访记录。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;