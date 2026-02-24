import React, { useState, useEffect, useMemo } from 'react';
import { User, Order, Package, ActivationStatus, PaymentStatus } from '../types';
import * as api from '../services/api';
import { formatCurrency, exportToExcel } from '../utils'; // Sử dụng exportToExcel
import { format, isThisMonth, isToday, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { TrendingUp, Coins, CalendarDays, AlertCircle, Trophy, X } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

interface AgentDashboardProps {
  user: User;
  onLogout: () => void;
}

const calculateNetRevenue = (order: Order, agentDiscountPct: number): number => {
  if (order.paymentStatus === PaymentStatus.Refunded) return 0;
  if (order.actual_revenue != null) return order.actual_revenue;
  const baseNet = order.price * (1 - agentDiscountPct / 100);
  const match = order.notes?.match(/\[Giảm thêm: ([\d.,]*\d)đ\]/);
  let extraDiscount = 0;
  if (match) {
    extraDiscount = Number(match[1].replace(/\./g, '').replace(/,/g, ''));
  }
  return Math.max(0, baseNet - extraDiscount);
};

const calculateGrossRevenue = (order: Order): number => {
  if (order.paymentStatus === PaymentStatus.Refunded) return 0;
  return order.price;
};

const calculateAgentCommission = (order: Order, agentDiscountPct: number): number => {
  if (order.paymentStatus === PaymentStatus.Refunded) return 0;
  return Math.max(0, calculateGrossRevenue(order) - calculateNetRevenue(order, agentDiscountPct));
};

const AgentDashboard: React.FC<AgentDashboardProps> = ({ user, onLogout }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isUnpaidModalOpen, setIsUnpaidModalOpen] = useState(false);

  const [emailFilter, setEmailFilter] = useState('');
  const [dateFilterStart, setDateFilterStart] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const fetchAgentData = async () => {
    try {
      const [ordersData, packagesData] = await Promise.all([
        api.getOrders(user),
        api.getPackages(),
      ]);
      setOrders(ordersData);
      setPackages(packagesData);
    } catch (error) {
      console.error("Failed to fetch data", error);
    }
  };

  useEffect(() => {
    const initialLoad = async () => {
      setIsLoading(true);
      await fetchAgentData();
      setIsLoading(false);
    }
    initialLoad();
  }, [user]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const emailMatch = !emailFilter || order.account_email?.toLowerCase().includes(emailFilter.toLowerCase());

      let dateMatch = true;
      if (dateFilterStart && dateFilterEnd) {
        const soldDate = parseISO(order.sold_at);
        dateMatch = isWithinInterval(soldDate, { start: startOfDay(new Date(dateFilterStart)), end: endOfDay(new Date(dateFilterEnd)) });
      }

      return emailMatch && dateMatch;
    }).reverse();
  }, [orders, emailFilter, dateFilterStart, dateFilterEnd]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [emailFilter, dateFilterStart, dateFilterEnd]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const agentCommission = user.discountPercentage || 0;

  const filteredStats = useMemo(() => {
    const grossRevenue = filteredOrders.reduce((sum, order) => sum + calculateGrossRevenue(order), 0);
    const netRevenueCompany = filteredOrders.reduce((sum, order) => {
      return sum + calculateNetRevenue(order, agentCommission);
    }, 0);
    const agentReceived = filteredOrders
      .reduce((sum, order) => sum + calculateAgentCommission(order, agentCommission), 0);

    return { grossRevenue, netRevenueCompany, agentReceived };
  }, [filteredOrders, agentCommission]);

  const stats = useMemo(() => {
    const monthlyOrders = orders.filter(o => isThisMonth(parseISO(o.sold_at)));

    const monthlyRevenue = monthlyOrders.reduce((sum, order) => sum + calculateGrossRevenue(order), 0);

    const monthlyCommissionReceived = monthlyOrders
      .reduce((sum, order) => sum + calculateAgentCommission(order, agentCommission), 0);

    const todayOrders = orders.filter(o => isToday(parseISO(o.sold_at)));
    const todayRevenue = todayOrders.reduce((sum, order) => sum + calculateGrossRevenue(order), 0);

    const todayCommissionReceived = todayOrders
      .reduce((sum, order) => sum + calculateAgentCommission(order, agentCommission), 0);

    const unpaidOrders = orders.filter(o => o.paymentStatus === PaymentStatus.Unpaid);
    const unpaidDebt = unpaidOrders.reduce((sum, order) => sum + calculateNetRevenue(order, agentCommission), 0);

    const groupedByDate = orders.reduce((acc, order) => {
      const date = format(parseISO(order.sold_at), 'dd/MM/yyyy');
      if (!acc[date]) acc[date] = { count: 0, gross: 0, commission: 0 };
      acc[date].count += 1;
      acc[date].gross += calculateGrossRevenue(order);
      if (order.paymentStatus === PaymentStatus.Paid) {
        acc[date].commission += calculateAgentCommission(order, agentCommission);
      }
      return acc;
    }, {} as Record<string, { count: number; gross: number; commission: number }>);

    let maxGross = 0;
    let recordDate = '';
    let recordStats = { count: 0, gross: 0, commission: 0 };

    for (const [date, data] of Object.entries(groupedByDate)) {
      if (data.gross > maxGross) {
        maxGross = data.gross;
        recordDate = date;
        recordStats = data;
      }
    }

    return { monthlyRevenue, monthlyCommissionReceived, todayRevenue, todayCommissionReceived, unpaidDebt, unpaidOrders, recordDate, recordStats };
  }, [orders, agentCommission]);


  const handleClearFilters = () => {
    setEmailFilter('');
    setDateFilterStart('');
    setDateFilterEnd('');
  };

  const handleExport = () => {
    const discount = user.discountPercentage || 0;
    const dataToExport = filteredOrders.map(o => ({
      'ID Khách': o.id,
      'Tên khách Hàng': o.account_name,
      'Email khách': o.account_email,
      'Gói': packages.find(p => p.id === o.packageId)?.name || 'N/A',
      'Giá gói gốc (VND)': o.paymentStatus === PaymentStatus.Refunded ? 0 : o.price,
      'Hoa hồng nhận về (VND)': calculateAgentCommission(o, discount),
      'Tiền thanh toán cho cty (VND)': calculateNetRevenue(o, discount),
      'Ghi chú': o.notes || '',
      'Ngày hoàn thành': format(parseISO(o.sold_at), 'dd/MM/yyyy HH:mm'),
      'Trạng thái': o.status === ActivationStatus.Activated ? 'Đã duyệt' : 'Chờ duyệt',
      'Thanh toán': o.paymentStatus
    }));
    exportToExcel(dataToExport, `tsoft_revenue_${user.username}_orders`);
  };

  const getPackageName = (packageId: number) => packages.find(p => p.id === packageId)?.name || 'N/A';

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen text-xl">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="container p-4 mx-auto md:p-8">
      <header className="flex flex-col items-start justify-between gap-4 mb-8 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-md bg-slate-700">
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <h1 className="text-5xl font-extrabold text-white">Chào mừng, {user.name}!</h1>
            <p className="text-xl text-slate-400">Đây là trang tổng quan bán hàng của bạn.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsChangePasswordModalOpen(true)} className="px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 bg-slate-600 rounded-lg shadow-md hover:bg-slate-500">Đổi mật khẩu</button>
          <button onClick={onLogout} className="px-6 py-2 text-sm font-semibold text-white transition-colors duration-200 bg-red-600 rounded-lg shadow-md hover:bg-red-700">Đăng xuất</button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 mb-4 md:grid-cols-5">
        <div className="p-6 rounded-xl bg-gradient-to-br from-orange-600/30 to-orange-900/60 border border-orange-500/50 shadow-[0_4px_20px_rgba(234,88,12,0.15)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-orange-200 uppercase tracking-wider">Doanh thu Hôm nay</h4>
            <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400"><TrendingUp size={20} /></div>
          </div>
          <p className="text-4xl font-extrabold text-white mt-4">{formatCurrency(stats.todayRevenue)}</p>
        </div>

        <div className="p-6 rounded-xl bg-gradient-to-br from-green-600/30 to-green-900/60 border border-green-500/50 shadow-[0_4px_20px_rgba(34,197,94,0.15)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-green-200 uppercase tracking-wider">Hoa hồng Hôm nay</h4>
            <div className="p-2 bg-green-500/20 rounded-lg text-green-400"><Coins size={20} /></div>
          </div>
          <p className="text-4xl font-extrabold text-white mt-4">{formatCurrency(stats.todayCommissionReceived)}</p>
        </div>

        <div className="p-6 rounded-xl bg-gradient-to-br from-blue-600/30 to-slate-800/80 border border-blue-500/30 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-blue-200 uppercase tracking-wider">Doanh thu Tháng này</h4>
            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><CalendarDays size={20} /></div>
          </div>
          <p className="text-4xl font-extrabold text-white mt-4">{formatCurrency(stats.monthlyRevenue)}</p>
        </div>

        <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-600/30 to-slate-800/80 border border-emerald-500/30 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-emerald-200 uppercase tracking-wider">Hoa hồng Tháng</h4>
            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Coins size={20} /></div>
          </div>
          <p className="text-4xl font-extrabold text-white mt-4">{formatCurrency(stats.monthlyCommissionReceived)}</p>
        </div>

        <div
          onClick={() => setIsUnpaidModalOpen(true)}
          className="p-6 rounded-xl bg-gradient-to-br from-red-600/30 to-red-900/60 border border-red-500/50 shadow-[0_4px_20px_rgba(239,68,68,0.15)] flex flex-col justify-between cursor-pointer hover:from-red-600/40 hover:to-red-900/70 transition-all group"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-red-200 uppercase tracking-wider">Công nợ CTY</h4>
            <div className="p-2 bg-red-500/20 rounded-lg text-red-400 group-hover:scale-110 transition-transform"><AlertCircle size={20} /></div>
          </div>
          <p className="text-4xl font-extrabold text-red-100 mt-4">{formatCurrency(stats.unpaidDebt)}</p>
          <p className="text-xs text-red-300 mt-2 flex items-center gap-1 opacity-80"><span className="underline">Nhấn để xem chi tiết</span></p>
        </div>
      </div>

      {stats.recordDate && (
        <div className="mb-8 p-4 rounded-xl bg-gradient-to-r from-yellow-600/20 via-yellow-500/10 to-transparent border-l-4 border-yellow-500 flex items-center gap-4">
          <div className="bg-yellow-500/20 p-3 rounded-full text-yellow-500">
            <Trophy size={28} />
          </div>
          <div>
            <h4 className="text-lg font-bold text-yellow-500">🏆 Kỷ lục bán hàng của bạn!</h4>
            <p className="text-slate-300">
              Ngày xuất sắc nhất là <span className="font-bold text-white">{stats.recordDate}</span> với tổng số <span className="font-bold text-white">{stats.recordStats.count}</span> đơn hàng.
              Doanh số đạt <span className="font-bold text-yellow-400">{formatCurrency(stats.recordStats.gross)}</span> và hoa hồng nhận về là <span className="font-bold text-green-400">{formatCurrency(stats.recordStats.commission)}</span>. Tuyệt vời!
            </p>
          </div>
        </div>
      )}


      {/* Filters and Search Bar Container */}
      <div className="p-6 mb-6 rounded-lg bg-slate-800 shadow-lg flex flex-col gap-4">
        <h3 className="text-xl font-semibold text-slate-200">Tìm kiếm & Bộ lọc nâng cao</h3>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-slate-400 mb-1">Email khách hàng</label>
            <input
              type="text"
              placeholder="Nhập email cần tìm..."
              value={emailFilter}
              onChange={e => setEmailFilter(e.target.value)}
              className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-primary-focus focus:border-primary-focus"
            />
          </div>
          <div className="flex-1 w-full md:w-auto">
            <label className="block text-sm font-medium text-slate-400 mb-1">Từ ngày</label>
            <input type="date" value={dateFilterStart} onChange={e => setDateFilterStart(e.target.value)} className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
          </div>
          <div className="flex-1 w-full md:w-auto">
            <label className="block text-sm font-medium text-slate-400 mb-1">Đến ngày</label>
            <input type="date" min={dateFilterStart} value={dateFilterEnd} onChange={e => setDateFilterEnd(e.target.value)} className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
          </div>
          <button onClick={handleClearFilters} className="px-4 py-3 text-lg font-semibold text-white bg-slate-600 rounded-md hover:bg-slate-500 w-full md:w-auto">Xoá bộ lọc</button>
        </div>

      </div>

      {/* Filter Summary */}
      <div className="flex flex-col md:flex-row gap-6 mt-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
        <div>
          <p className="text-sm text-slate-400 uppercase tracking-wider">Doanh số Đại lý</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(filteredStats.grossRevenue)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-400 uppercase tracking-wider">Tiền thanh toán cho cty</p>
          <p className="text-2xl font-bold text-yellow-400">{formatCurrency(filteredStats.netRevenueCompany)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-400 uppercase tracking-wider">Hoa hồng nhận về (Tất cả)</p>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(filteredStats.agentReceived)}</p>
        </div>
      </div>

      {/* Orders Table */}
      <div className="p-6 mt-6 overflow-x-auto bg-slate-800 rounded-lg shadow-lg">
        <div className="flex flex-col items-start justify-between gap-4 mb-6 md:flex-row md:items-center">
          <h2 className="text-3xl font-bold text-slate-100">Báo cáo dữ liệu Đại lý</h2>
          <button onClick={handleExport} className="px-5 py-3 text-lg transition-colors duration-200 rounded-md bg-green-600 hover:bg-green-500 font-bold flex items-center gap-2 text-white shadow-lg">
            Xuất CSDL ra Excel
          </button>
        </div>
        <table className="w-full text-left table-auto">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="p-3 text-sm font-semibold tracking-wide">STT</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Tài khoản</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Gói</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Giá</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Hoa hồng</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Thanh toán cho cty</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Ghi chú</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Ngày bán</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Tình trạng approve</th>
              <th className="p-3 text-sm font-semibold tracking-wide">Thanh toán</th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.map((order, index) => {
              return (
                <tr key={order.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                  <td className="p-3 text-sm">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td className="p-3"><p className="font-bold text-sm text-slate-300">{order.account_email}</p></td>
                  <td className="p-3 text-sm">{getPackageName(order.packageId)}</td>
                  <td className="p-3 text-sm font-bold text-slate-300">
                    {order.paymentStatus === PaymentStatus.Refunded ? (
                      <span className="line-through opacity-50">{formatCurrency(order.price)}</span>
                    ) : formatCurrency(order.price)}
                  </td>
                  <td className="p-3 text-sm font-bold text-green-400">
                    {order.paymentStatus === PaymentStatus.Refunded ? (
                      <span className="line-through opacity-50">{formatCurrency(calculateAgentCommission(order, user.discountPercentage || 0))}</span>
                    ) : formatCurrency(calculateAgentCommission(order, user.discountPercentage || 0))}
                  </td>
                  <td className="p-3 text-sm font-bold text-yellow-400">
                    {order.paymentStatus === PaymentStatus.Refunded ? (
                      <span className="line-through opacity-50">{formatCurrency(calculateNetRevenue(order, user.discountPercentage || 0))}</span>
                    ) : formatCurrency(calculateNetRevenue(order, user.discountPercentage || 0))}
                  </td>
                  <td
                    className="p-3 text-sm text-slate-400 max-w-[150px] truncate cursor-pointer hover:text-white transition-colors"
                    title="Nhấn để xem chi tiết"
                    onClick={() => { if (order.notes) alert(`Ghi chú:\n${order.notes}`); }}
                  >
                    {order.notes}
                  </td>
                  <td className="p-3 text-sm">{format(parseISO(order.sold_at), 'dd/MM/yyyy')}</td>
                  <td className="p-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${order.status === ActivationStatus.Activated ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{order.status === ActivationStatus.Activated ? 'Approved' : 'Not Approved'}</span></td>
                  <td className="p-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${order.paymentStatus === PaymentStatus.Paid ? 'bg-blue-500/20 text-blue-400' :
                      order.paymentStatus === PaymentStatus.Refunded ? 'bg-slate-500/20 text-slate-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filteredOrders.length === 0 && <p className="mt-4 text-center text-slate-400">Không có đơn hàng nào khớp với bộ lọc.</p>}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-4">
            <p className="text-slate-400 text-sm">
              Hiển thị <span className="font-semibold text-white">{(currentPage - 1) * itemsPerPage + 1}</span> đến <span className="font-semibold text-white">{Math.min(currentPage * itemsPerPage, filteredOrders.length)}</span> trong số <span className="font-semibold text-white">{filteredOrders.length}</span> đơn hàng
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-slate-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
              >
                Tháng trước
              </button>
              <div className="flex items-center gap-1 font-semibold text-slate-300">
                Trang {currentPage} / {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-slate-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
              >
                Kế tiếp
              </button>
            </div>
          </div>
        )}
      </div>

      {
        isChangePasswordModalOpen && (
          <ChangePasswordModal
            user={user}
            onClose={() => setIsChangePasswordModalOpen(false)}
            onSuccess={() => {
              setIsChangePasswordModalOpen(false);
              alert("Đổi mật khẩu thành công!");
            }}
          />
        )
      }

      {isUnpaidModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800/50">
              <h3 className="text-2xl font-bold text-red-200 flex items-center gap-2">
                <AlertCircle className="text-red-500" /> Chi tiết Công nợ phải thanh toán cho CTY
              </h3>
              <button onClick={() => setIsUnpaidModalOpen(false)} className="p-2 text-slate-400 transition-colors hover:text-white hover:bg-slate-700 rounded-lg">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {stats.unpaidOrders.length === 0 ? (
                <p className="text-center text-slate-400 text-lg py-8">Tuyệt vời! Bạn không có khoản công nợ nào chưa thanh toán.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-700">
                  <table className="w-full text-left table-auto">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="p-4 font-semibold text-slate-200">Khách hàng</th>
                        <th className="p-4 font-semibold text-slate-200">Gói</th>
                        <th className="p-4 font-semibold text-slate-200">Ngày bán</th>
                        <th className="p-4 font-semibold text-slate-200">Doanh số</th>
                        <th className="p-4 font-semibold text-red-300 text-right">Cần thanh toán</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {stats.unpaidOrders.map(order => {
                        const netRevenue = order.actual_revenue != null ? order.actual_revenue : order.price * (1 - agentCommission / 100);
                        return (
                          <tr key={order.id} className="hover:bg-slate-700/30 transition-colors">
                            <td className="p-4">
                              <p className="font-medium text-white">{order.account_name}</p>
                              <p className="text-sm text-slate-400">{order.account_email}</p>
                            </td>
                            <td className="p-4 text-slate-300">{getPackageName(order.packageId)}</td>
                            <td className="p-4 text-slate-300">{format(parseISO(order.sold_at), 'dd/MM/yyyy')}</td>
                            <td className="p-4 text-slate-300">{formatCurrency(order.price)}</td>
                            <td className="p-4 font-bold text-red-400 text-right">{formatCurrency(netRevenue)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-700 bg-slate-800/80 flex justify-between items-center">
              <p className="text-slate-400">Tổng cộng {stats.unpaidOrders.length} đơn hàng chưa thanh toán.</p>
              <p className="text-xl font-medium text-slate-200">Tổng công nợ: <span className="font-bold text-red-500 text-3xl ml-2">{formatCurrency(stats.unpaidDebt)}</span></p>
            </div>
          </div>
        </div>
      )}

    </div >
  );
};

export default AgentDashboard;