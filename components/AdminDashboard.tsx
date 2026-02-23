import React, { useState, useEffect, useMemo } from 'react';
import { User, Order, Package, DailyDebt, DebtStatus, ActivationStatus, PaymentStatus, Role, AdminLog } from '../types';
import * as api from '../services/api';
import AgentManagementModal from './AgentManagementModal';
import DebtDetailModal from './DebtDetailModal';
import RevenueChart from './RevenueChart';
import ChangePasswordModal from './ChangePasswordModal';
import { formatCurrency, exportToExcel } from '../utils';
import { format, isAfter, isBefore, subMonths, isWithinInterval, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, formatISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { TrendingUp, PiggyBank, ShoppingCart, Activity, Trophy, Award } from 'lucide-react';

interface AdminDashboardProps {
    user: User;
    onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    // Main data state
    const [orders, setOrders] = useState<Order[]>([]);
    const [agents, setAgents] = useState<User[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
    const [dailyDebts, setDailyDebts] = useState<DailyDebt[]>([]);
    const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'agents', 'debt', 'profit', 'logs'

    // Modal states
    const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
    const [agentToEdit, setAgentToEdit] = useState<User | null>(null);
    const [isDebtDetailModalOpen, setIsDebtDetailModalOpen] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState<DailyDebt | null>(null);
    const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
    const [isEditOrderModalOpen, setIsEditOrderModalOpen] = useState(false);
    const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
    const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
    const [isAdminUnpaidModalOpen, setIsAdminUnpaidModalOpen] = useState(false);


    // Filter states for orders tab
    const [orderAgentFilter, setOrderAgentFilter] = useState('all');
    const [startDateFilter, setStartDateFilter] = useState('');
    const [endDateFilter, setEndDateFilter] = useState('');
    const [orderEmailFilter, setOrderEmailFilter] = useState('');
    const [orderApprovalFilter, setOrderApprovalFilter] = useState('all');
    const [orderPaymentFilter, setOrderPaymentFilter] = useState('all');

    // Filter states for profit tab
    const [profitStartDate, setProfitStartDate] = useState('');
    const [profitEndDate, setProfitEndDate] = useState('');

    // Filter states for debt tab
    const [debtAgentFilter, setDebtAgentFilter] = useState('all');
    const [debtStatusFilter, setDebtStatusFilter] = useState('all');
    const [debtStartDate, setDebtStartDate] = useState('');
    const [debtEndDate, setDebtEndDate] = useState('');

    const [chartPeriod, setChartPeriod] = useState<'week' | 'month' | 'year'>('week');



    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [ordersData, usersData, packagesData, debtsData, logsData] = await Promise.all([
                api.getOrders(user),
                api.getUsers(),
                api.getPackages(),
                api.getDailyDebts(user),
                api.getAdminLogs(),
            ]);
            setOrders(ordersData);
            setAgents(usersData.filter(u => u.role === Role.Agent));
            setPackages(packagesData);
            setDailyDebts(debtsData);
            setAdminLogs(logsData);
        } catch (error) {
            console.error("Failed to fetch admin data", error);
            alert("Không thể tải dữ liệu. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [user]);

    // --- Memos for calculations and filtering ---
    const globalStats = useMemo(() => {
        const totalGrossRevenue = orders.reduce((sum, order) => sum + order.price, 0);
        const totalOrders = orders.length;

        const totalNetRevenue = orders.reduce((sum, order) => {
            if (order.actual_revenue != null) {
                return sum + order.actual_revenue;
            }
            const agent = agents.find(a => a.id === order.agentId);
            const discount = agent?.discountPercentage || 0;
            return sum + (order.price * (1 - discount / 100));
        }, 0);

        // Revenue comparison
        const now = new Date();
        const startOfTodayDate = startOfDay(now);
        const endOfTodayDate = endOfDay(now);

        const startOfThisWeekDate = startOfWeek(now, { weekStartsOn: 1 });
        const endOfThisWeekDate = endOfWeek(now, { weekStartsOn: 1 });

        const todayRevenue = orders
            .filter(o => isWithinInterval(parseISO(o.sold_at), { start: startOfTodayDate, end: endOfTodayDate }))
            .reduce((sum, o) => sum + o.price, 0);

        const thisWeekRevenue = orders
            .filter(o => isWithinInterval(parseISO(o.sold_at), { start: startOfThisWeekDate, end: endOfThisWeekDate }))
            .reduce((sum, o) => sum + o.price, 0);

        const startOfThisMonthDate = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
        const endOfThisMonthDate = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));

        const thisMonthRevenue = orders
            .filter(o => isWithinInterval(parseISO(o.sold_at), { start: startOfThisMonthDate, end: endOfThisMonthDate }))
            .reduce((sum, o) => sum + o.price, 0);

        return {
            totalGrossRevenue,
            totalNetRevenue,
            totalOrders,
            todayRevenue,
            thisWeekRevenue,
            thisMonthRevenue
        };
    }, [orders, agents]);

    const chartData = useMemo(() => {
        const data = [];
        const now = new Date();

        if (chartPeriod === 'week') {
            for (let i = 6; i >= 0; i--) {
                const date = startOfDay(now);
                date.setDate(date.getDate() - i);
                const dateStr = format(date, 'dd/MM');

                const dailyOrders = orders.filter(o => format(parseISO(o.sold_at), 'dd/MM') === dateStr);
                const dailyGross = dailyOrders.reduce((sum, o) => sum + o.price, 0);
                const dailyNet = dailyOrders.reduce((sum, order) => {
                    if (order.actual_revenue != null) {
                        return sum + order.actual_revenue;
                    }
                    const agent = agents.find(a => a.id === order.agentId);
                    const discount = agent?.discountPercentage || 0;
                    return sum + (order.price * (1 - discount / 100));
                }, 0);

                data.push({
                    date: dateStr,
                    revenue: dailyGross,
                    netRevenue: dailyNet
                });
            }
        } else if (chartPeriod === 'month') {
            for (let i = 29; i >= 0; i--) {
                const date = startOfDay(now);
                date.setDate(date.getDate() - i);
                const dateStr = format(date, 'dd/MM');

                const dailyOrders = orders.filter(o => format(parseISO(o.sold_at), 'dd/MM') === dateStr);
                const dailyGross = dailyOrders.reduce((sum, o) => sum + o.price, 0);
                const dailyNet = dailyOrders.reduce((sum, order) => {
                    if (order.actual_revenue != null) {
                        return sum + order.actual_revenue;
                    }
                    const agent = agents.find(a => a.id === order.agentId);
                    const discount = agent?.discountPercentage || 0;
                    return sum + (order.price * (1 - discount / 100));
                }, 0);

                data.push({
                    date: dateStr,
                    revenue: dailyGross,
                    netRevenue: dailyNet
                });
            }
        } else if (chartPeriod === 'year') {
            for (let i = 11; i >= 0; i--) {
                const date = subMonths(now, i);
                const monthStr = format(date, 'MM/yyyy');

                const monthlyOrders = orders.filter(o => format(parseISO(o.sold_at), 'MM/yyyy') === monthStr);
                const monthlyGross = monthlyOrders.reduce((sum, o) => sum + o.price, 0);
                const monthlyNet = monthlyOrders.reduce((sum, order) => {
                    if (order.actual_revenue != null) {
                        return sum + order.actual_revenue;
                    }
                    const agent = agents.find(a => a.id === order.agentId);
                    const discount = agent?.discountPercentage || 0;
                    return sum + (order.price * (1 - discount / 100));
                }, 0);

                data.push({
                    date: monthStr,
                    revenue: monthlyGross,
                    netRevenue: monthlyNet
                });
            }
        }

        return data;
    }, [orders, agents, chartPeriod]);

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const agentMatch = orderAgentFilter === 'all' || order.agentId === parseInt(orderAgentFilter, 10);
            const emailMatch = !orderEmailFilter || order.account_email?.toLowerCase().includes(orderEmailFilter.toLowerCase());
            const approvalMatch = orderApprovalFilter === 'all' || order.status === orderApprovalFilter;
            const paymentMatch = orderPaymentFilter === 'all' || order.paymentStatus === orderPaymentFilter;

            const dateMatch = (() => {
                if (!startDateFilter && !endDateFilter) return true;
                const orderDate = startOfDay(parseISO(order.sold_at));
                if (startDateFilter && isBefore(orderDate, startOfDay(parseISO(startDateFilter)))) {
                    return false;
                }
                if (endDateFilter && isAfter(orderDate, startOfDay(parseISO(endDateFilter)))) {
                    return false;
                }
                return true;
            })();

            return agentMatch && dateMatch && emailMatch && approvalMatch && paymentMatch;
        }).sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime());
    }, [orders, orderAgentFilter, startDateFilter, endDateFilter, orderEmailFilter, orderApprovalFilter, orderPaymentFilter]);

    const filteredDebts = useMemo(() => {
        return dailyDebts.filter(debt => {
            const agentMatch = debtAgentFilter === 'all' || debt.agentId === parseInt(debtAgentFilter, 10);
            const statusMatch = debtStatusFilter === 'all' || debt.status === debtStatusFilter;
            const debtDate = startOfDay(parseISO(debt.date));
            const startMatch = !debtStartDate || !isBefore(debtDate, startOfDay(parseISO(debtStartDate)));
            const endMatch = !debtEndDate || !isAfter(debtDate, startOfDay(parseISO(debtEndDate)));
            return agentMatch && statusMatch && startMatch && endMatch;
        });
    }, [dailyDebts, debtAgentFilter, debtStatusFilter, debtStartDate, debtEndDate]);

    const topAgents = useMemo(() => {
        const validOrders = orders.filter(o => o.paymentStatus === PaymentStatus.Paid || o.actual_revenue != null);

        const agentRevenueMap: Record<number, { agentId: number; totalNet: number }> = {};

        // Initialize map with all agents to ensure we always have candidates
        agents.forEach(agent => {
            agentRevenueMap[agent.id] = { agentId: agent.id, totalNet: 0 };
        });

        validOrders.forEach(order => {
            if (!agentRevenueMap[order.agentId]) {
                agentRevenueMap[order.agentId] = { agentId: order.agentId, totalNet: 0 };
            }

            let actualRevenue = order.actual_revenue;
            if (actualRevenue == null) {
                const agent = agents.find(a => a.id === order.agentId);
                const discount = agent?.discountPercentage || 0;
                actualRevenue = order.price * (1 - discount / 100);
            }
            agentRevenueMap[order.agentId].totalNet += actualRevenue;
        });

        return Object.values(agentRevenueMap)
            .sort((a, b) => b.totalNet - a.totalNet)
            .slice(0, 3);
    }, [orders, agents]);

    const revenueRecords = useMemo(() => {
        const validOrders = orders.filter(o => o.paymentStatus === PaymentStatus.Paid || o.actual_revenue != null);

        const dailyRevenue: Record<string, number> = {};
        const monthlyRevenue: Record<string, number> = {};

        validOrders.forEach(order => {
            let actualRevenue = order.actual_revenue;
            if (actualRevenue == null) {
                const agent = agents.find(a => a.id === order.agentId);
                const discount = agent?.discountPercentage || 0;
                actualRevenue = order.price * (1 - discount / 100);
            }

            const dayKey = format(parseISO(order.sold_at), 'yyyy-MM-dd');
            const monthKey = format(parseISO(order.sold_at), 'MM/yyyy');

            dailyRevenue[dayKey] = (dailyRevenue[dayKey] || 0) + actualRevenue;
            monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + actualRevenue;
        });

        let bestDay = { date: '', revenue: 0 };
        Object.entries(dailyRevenue).forEach(([date, revenue]) => {
            if (revenue > bestDay.revenue) {
                bestDay = { date, revenue };
            }
        });

        let bestMonth = { month: '', revenue: 0 };
        Object.entries(monthlyRevenue).forEach(([month, revenue]) => {
            if (revenue > bestMonth.revenue) {
                bestMonth = { month, revenue };
            }
        });

        return { bestDay, bestMonth };
    }, [orders, agents]);

    const adminUnpaidStats = useMemo(() => {
        const unpaidOrders = orders.filter(o => o.paymentStatus === PaymentStatus.Unpaid);

        const groupedByAgent = unpaidOrders.reduce((acc, order) => {
            if (!acc[order.agentId]) {
                acc[order.agentId] = {
                    agentId: order.agentId,
                    count: 0,
                    totalDebt: 0
                };
            }
            acc[order.agentId].count += 1;

            let actualRevenue = order.actual_revenue;
            if (actualRevenue == null) {
                const agent = agents.find(a => a.id === order.agentId);
                const discount = agent?.discountPercentage || 0;
                actualRevenue = order.price * (1 - discount / 100);
            }
            acc[order.agentId].totalDebt += actualRevenue;

            return acc;
        }, {} as Record<number, { agentId: number; count: number; totalDebt: number }>);

        return Object.values(groupedByAgent).sort((a, b) => b.totalDebt - a.totalDebt);
    }, [orders, agents]);

    // --- Helper functions ---
    const getAgentName = (agentId: number) => agents.find(a => a.id === agentId)?.name || 'N/A';
    const getPackageName = (packageId: number) => packages.find(p => p.id === packageId)?.name || 'N/A';
    const getAgentDiscountPercentage = (agentId: number) => agents.find(a => a.id === agentId)?.discountPercentage || 0;

    // --- Event Handlers ---
    const handleOpenAgentModal = (agent: User | null) => {
        setAgentToEdit(agent);
        setIsAgentModalOpen(true);
    };

    const handleSaveAgent = () => {
        setIsAgentModalOpen(false);
        setAgentToEdit(null);
        fetchData(); // Refresh all data, including logs
    };

    const handleDebtStatusChange = async (debtId: string, newStatus: DebtStatus) => {
        try {
            await api.updateDebtStatus(debtId, newStatus);
            const debt = dailyDebts.find(d => d.id === debtId);
            await api.logAction(user.id, user.name, `Cập nhật đối soát cho ${getAgentName(debt?.agentId || 0)} ngày ${format(parseISO(debt?.date || ''), 'dd/MM/yyyy')} thành '${newStatus}'.`);
            await fetchData();
        } catch (error) {
            console.error("Failed to update debt status", error);
            alert("Cập nhật trạng thái công nợ thất bại.");
        }
    };

    const handleOpenDebtDetailModal = (debt: DailyDebt) => {
        setSelectedDebt(debt);
        setIsDebtDetailModalOpen(true);
    }

    const handleClearOrderFilters = () => {
        setOrderAgentFilter('all');
        setStartDateFilter('');
        setEndDateFilter('');
        setOrderEmailFilter('');
        setOrderApprovalFilter('all');
        setOrderPaymentFilter('all');
    };

    const handleClearProfitFilters = () => {
        setProfitStartDate('');
        setProfitEndDate('');
    };

    const handleAddOrder = async (newOrderData: Omit<Order, 'id'>) => {
        // Check for duplicate email on the same day
        const today = new Date();
        const isDuplicate = orders.some(order => {
            if (!order.account_email) return false;
            const orderDate = parseISO(order.sold_at);
            return order.account_email.toLowerCase() === newOrderData.account_email?.toLowerCase() &&
                orderDate.getDate() === today.getDate() &&
                orderDate.getMonth() === today.getMonth() &&
                orderDate.getFullYear() === today.getFullYear();
        });

        if (isDuplicate) {
            alert('Đơn hàng với email này đã tồn tại trong ngày hôm nay. Không thể thêm mới.');
            return;
        }

        try {
            const newOrder = await api.addOrder(newOrderData);
            await api.logAction(user.id, user.name, `Tạo mới đơn hàng #${newOrder.id} (${formatCurrency(newOrder.price)}) cho đại lý '${getAgentName(newOrder.agentId)}'.`);
            await fetchData();
            setIsAddOrderModalOpen(false);
        } catch (error) {
            console.error('Failed to add order:', error);
            alert('Không thể thêm đơn hàng. Vui lòng thử lại.');
        }
    };

    const handleOpenEditModal = (order: Order) => {
        setOrderToEdit(order);
        setIsEditOrderModalOpen(true);
    };

    const handleUpdateOrder = async (updatedOrder: Order) => {
        try {
            await api.updateOrder(updatedOrder);
            await api.logAction(user.id, user.name, `Cập nhật đơn hàng #${updatedOrder.id}.`);
            await fetchData();
            setIsEditOrderModalOpen(false);
            setOrderToEdit(null);
        } catch (error) {
            console.error('Failed to update order:', error);
            alert('Không thể cập nhật đơn hàng.');
        }
    };

    const handleToggleActivation = async (order: Order) => {
        const newStatus = order.status === ActivationStatus.Activated ? ActivationStatus.NotActivated : ActivationStatus.Activated;
        try {
            await api.updateOrder({ ...order, status: newStatus });
            await api.logAction(user.id, user.name, `Cập nhật trạng thái đơn hàng #${order.id} thành '${newStatus}'.`);
            await fetchData();
        } catch (error) {
            console.error('Failed to update order status:', error);
            alert('Không thể cập nhật trạng thái đơn hàng.');
        }
    };

    const handleDeleteOrder = async (orderId: number) => {
        if (window.confirm("Bạn có chắc chắn muốn xoá đơn hàng này không?")) {
            try {
                await api.deleteOrder(orderId);
                await api.logAction(user.id, user.name, `Xoá đơn hàng #${orderId}.`);
                await fetchData();
                setIsEditOrderModalOpen(false);
                setOrderToEdit(null);
            } catch (error) {
                console.error('Failed to delete order:', error);
                alert('Không thể xoá đơn hàng.');
            }
        }
    };

    // --- Import/Export Handlers ---


    // --- Render Functions ---
    if (isLoading) {
        return <div className="flex items-center justify-center h-screen text-xl">Đang tải dữ liệu...</div>;
    }

    const handleExportOrders = () => {
        const dataToExport = filteredOrders.map(o => ({
            'ID Khách': o.id,
            'Đại lý phụ trách': getAgentName(o.agentId),
            'Tên khách hàng': o.account_name,
            'Email khách': o.account_email,
            'Gói': getPackageName(o.packageId),
            'Giá gói gốc (VND)': o.price,
            'Thực Thu (VND)': o.actual_revenue != null ? o.actual_revenue : o.price * (1 - (getAgentDiscountPercentage(o.agentId) / 100)),
            'Ngày hoàn thành': format(parseISO(o.sold_at), 'dd/MM/yyyy HH:mm'),
            'Trạng thái': o.status === ActivationStatus.Activated ? 'Đã kích hoạt' : 'Chưa kích hoạt',
            'Thanh toán': o.paymentStatus
        }));

        exportToExcel(dataToExport, `tsoft_all_orders_${format(new Date(), 'yyyy-MM-dd')}`);
    };

    const renderOrdersTab = () => {
        const filteredGrossRevenue = filteredOrders.reduce((sum, order) => sum + order.price, 0);
        const filteredNetRevenue = filteredOrders.reduce((sum, order) => {
            if (order.actual_revenue != null) {
                return sum + order.actual_revenue;
            }
            const agent = agents.find(a => a.id === order.agentId);
            const discount = agent?.discountPercentage || 0;
            return sum + (order.price * (1 - discount / 100));
        }, 0);
        const filteredDebt = filteredOrders.reduce((sum, order) => {
            if (order.paymentStatus === PaymentStatus.Unpaid) {
                if (order.actual_revenue != null) {
                    return sum + order.actual_revenue;
                }
                const agent = agents.find(a => a.id === order.agentId);
                const discount = agent?.discountPercentage || 0;
                return sum + (order.price * (1 - discount / 100));
            }
            return sum;
        }, 0);

        return (
            <div className="p-6 overflow-x-auto bg-slate-800 rounded-lg shadow-lg">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-bold text-slate-100">Tất cả Đơn hàng ({filteredOrders.length})</h2>
                    <div className="flex gap-4">
                        <button onClick={handleExportOrders} className="px-5 py-2 text-lg font-semibold text-white transition-colors duration-200 bg-green-600 rounded-md hover:bg-green-700">Xuất Excel</button>
                        <button onClick={() => setIsAddOrderModalOpen(true)} className="px-5 py-2 text-lg font-semibold text-white transition-colors duration-200 rounded-md bg-primary hover:bg-primary-focus">+ Thêm đơn hàng</button>
                    </div>
                </div>

                {/* FILTERS */}
                <div className="grid grid-cols-1 gap-4 p-4 mb-6 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 bg-slate-700/50 rounded-lg">
                    <input
                        type="text"
                        placeholder="Tìm email khách..."
                        value={orderEmailFilter}
                        onChange={e => setOrderEmailFilter(e.target.value)}
                        className="w-full px-4 py-2 text-base bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-primary-focus focus:border-primary-focus xl:col-span-2"
                    />
                    <select value={orderAgentFilter} onChange={e => setOrderAgentFilter(e.target.value)} className="px-4 py-2 text-base bg-slate-700 text-white border border-slate-600 rounded-md appearance-none focus:ring-primary-focus focus:border-primary-focus">
                        <option value="all">Lọc theo đại lý</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <select value={orderApprovalFilter} onChange={e => setOrderApprovalFilter(e.target.value)} className="px-4 py-2 text-base bg-slate-700 text-white border border-slate-600 rounded-md appearance-none focus:ring-primary-focus focus:border-primary-focus">
                        <option value="all">Tình trạng approve</option>
                        <option value={ActivationStatus.NotActivated}>Chưa kích hoạt</option>
                        <option value={ActivationStatus.Activated}>Đã kích hoạt</option>
                    </select>
                    <select value={orderPaymentFilter} onChange={e => setOrderPaymentFilter(e.target.value)} className="px-4 py-2 text-base bg-slate-700 text-white border border-slate-600 rounded-md appearance-none focus:ring-primary-focus focus:border-primary-focus">
                        <option value="all">Tất cả thanh toán</option>
                        <option value={PaymentStatus.Unpaid}>Chưa thanh toán</option>
                        <option value={PaymentStatus.Paid}>Đã thanh toán</option>
                    </select>

                    <div className="flex gap-2 col-span-1 md:col-span-2 lg:col-span-2">
                        <div className="flex items-center gap-2 flex-1">
                            <label htmlFor="startDate" className="text-slate-400 whitespace-nowrap">Từ:</label>
                            <input id="startDate" type="date" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)} className="w-full px-2 py-2 text-base bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-primary-focus focus:border-primary-focus" />
                        </div>
                        <div className="flex items-center gap-2 flex-1">
                            <label htmlFor="endDate" className="text-slate-400 whitespace-nowrap">Đến:</label>
                            <input id="endDate" type="date" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)} className="w-full px-2 py-2 text-base bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-primary-focus focus:border-primary-focus" />
                        </div>
                    </div>

                    <button onClick={handleClearOrderFilters} className="px-4 py-2 text-base font-semibold text-white bg-slate-600 rounded-md hover:bg-slate-500 md:col-span-3 lg:col-span-1 xl:col-span-1">Xoá bộ lọc</button>
                </div>

                {/* FILTER SUMMARY */}
                <div className="flex gap-8 mb-6 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                    <div>
                        <p className="text-sm text-slate-400 uppercase tracking-wider">Tổng doanh thu (Gross)</p>
                        <p className="text-2xl font-bold text-primary">{formatCurrency(filteredGrossRevenue)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-slate-400 uppercase tracking-wider">Tổng số tiền thực thu (Net)</p>
                        <p className="text-2xl font-bold text-green-400">{formatCurrency(filteredNetRevenue)}</p>
                    </div>
                    <div className="cursor-pointer group" onClick={() => setIsAdminUnpaidModalOpen(true)}>
                        <p className="text-sm text-slate-400 uppercase tracking-wider group-hover:text-red-300 transition-colors">Công nợ <span className="underline ml-1 text-xs opacity-70">(Nhấn để xem)</span></p>
                        <p className="text-2xl font-bold text-red-400 group-hover:scale-105 transition-transform origin-left">{formatCurrency(filteredDebt)}</p>
                    </div>
                </div>

                <table className="w-full text-left table-auto">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className="p-3 text-lg font-semibold tracking-wide">STT</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Tài khoản</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Gói</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Giá</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Số tiền thực thu</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Ghi chú</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Đại lý</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Ngày bán</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Tình trạng approve</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Thanh toán</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.map((order, index) => {
                            const agent = agents.find(a => a.id === order.agentId);
                            const discount = agent?.discountPercentage || 0;
                            const calculatedNetRevenue = order.price * (1 - discount / 100);
                            const actualRevenue = order.actual_revenue ?? calculatedNetRevenue;
                            return (
                                <tr key={order.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                                    <td className="p-3 text-lg">{index + 1}</td>
                                    <td className="p-3"><p className="font-bold text-lg">{order.account_name}</p><p className="text-sm text-slate-400">{order.account_email}</p></td>
                                    <td className="p-3 text-lg">{getPackageName(order.packageId)}</td>
                                    <td className="p-3 text-lg">{formatCurrency(order.price)}</td>
                                    <td className="p-3 text-lg font-semibold text-yellow-400">{formatCurrency(actualRevenue)}</td>
                                    <td className="p-3 text-lg text-slate-400 max-w-xs truncate" title={order.notes}>{order.notes}</td>
                                    <td className="p-3 text-lg">{getAgentName(order.agentId)}</td>
                                    <td className="p-3 text-lg">{format(parseISO(order.sold_at), 'dd/MM/yyyy')}</td>
                                    <td className="p-3">
                                        <button
                                            onClick={() => handleToggleActivation(order)}
                                            className={`px - 2 py - 1 text - sm font - semibold rounded - full cursor - pointer transition - colors ${order.status === ActivationStatus.Activated ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'} `}
                                        >
                                            {order.status === ActivationStatus.Activated ? 'Approved' : 'Not Approved'}
                                        </button>
                                    </td>
                                    <td className="p-3"><span className={`px - 2 py - 1 text - sm font - semibold rounded - full ${order.paymentStatus === PaymentStatus.Paid ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'} `}>{order.paymentStatus}</span></td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            {order.status === ActivationStatus.NotActivated && (
                                                <button onClick={() => handleToggleActivation(order)} className="px-4 py-1 font-bold text-white bg-green-600 rounded-md hover:bg-green-700">Approve</button>
                                            )}
                                            {order.paymentStatus !== PaymentStatus.Paid && (
                                                <button onClick={() => handleOpenEditModal(order)} className="px-4 py-1 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700">Sửa</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                {filteredOrders.length === 0 && <p className="mt-4 text-center text-slate-400">Không có đơn hàng nào khớp.</p>}
            </div>
        )
    };

    const renderAgentsTab = () => (
        <div className="p-6 bg-slate-800 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-slate-100">Quản lý Đại lý ({agents.length})</h2>
                <button onClick={() => handleOpenAgentModal(null)} className="px-5 py-2 text-lg font-semibold text-white transition-colors duration-200 rounded-md bg-primary hover:bg-primary-focus">+ Thêm Đại lý</button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left table-auto">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className="p-3 text-lg font-semibold tracking-wide">Tên</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Username</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Tổng Doanh thu</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Lợi nhuận phải trả</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Chiết khấu</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Trạng thái</th>
                            <th className="p-3 text-lg font-semibold tracking-wide">Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {agents.map(agent => {
                            const agentOrders = orders.filter(o => o.agentId === agent.id);
                            const totalGrossRevenue = agentOrders.reduce((sum, order) => sum + order.price, 0);
                            const commissionPayable = totalGrossRevenue * ((agent.discountPercentage || 0) / 100);

                            return (
                                <tr key={agent.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                                    <td className="p-3 text-lg font-bold">{agent.name}</td>
                                    <td className="p-3 text-lg text-slate-400">{agent.username}</td>
                                    <td className="p-3 text-lg text-primary">{formatCurrency(totalGrossRevenue)}</td>
                                    <td className="p-3 text-lg font-semibold text-green-400">{formatCurrency(commissionPayable)}</td>
                                    <td className="p-3 text-lg">{agent.discountPercentage || 0}%</td>
                                    <td className="p-3"><span className={`px - 2 py - 1 text - sm font - semibold rounded - full ${agent.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} `}>{agent.isActive ? 'Hoạt động' : 'Đã khoá'}</span></td>
                                    <td className="p-3"><button onClick={() => handleOpenAgentModal(agent)} className="px-4 py-1 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700">Sửa</button></td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderDebtTab = () => (
        <div className="p-6 overflow-x-auto bg-slate-800 rounded-lg shadow-lg">
            <div className="flex flex-col items-start justify-between gap-4 mb-6 md:flex-row md:items-center">
                <h2 className="text-3xl font-bold text-slate-100">Đối soát Công nợ ({filteredDebts.length})</h2>
                <div className="flex flex-wrap items-center gap-3">
                    <select value={debtAgentFilter} onChange={e => setDebtAgentFilter(e.target.value)} className="px-4 py-2 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none focus:ring-primary-focus focus:border-primary-focus">
                        <option value="all">Tất cả đại lý</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <select value={debtStatusFilter} onChange={e => setDebtStatusFilter(e.target.value)} className="px-4 py-2 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none focus:ring-primary-focus focus:border-primary-focus">
                        <option value="all">Mọi trạng thái</option>
                        <option value={DebtStatus.Paid}>{DebtStatus.Paid}</option>
                        <option value={DebtStatus.Unpaid}>{DebtStatus.Unpaid}</option>
                    </select>
                    <div className="flex items-center gap-2">
                        <label className="text-slate-400">Từ:</label>
                        <input type="date" value={debtStartDate} onChange={e => setDebtStartDate(e.target.value)} className="px-4 py-2 text-lg bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-primary-focus focus:border-primary-focus" />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-slate-400">Đến:</label>
                        <input type="date" value={debtEndDate} onChange={e => setDebtEndDate(e.target.value)} className="px-4 py-2 text-lg bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-primary-focus focus:border-primary-focus" />
                    </div>
                    <button onClick={() => { setDebtStartDate(''); setDebtEndDate(''); setDebtAgentFilter('all'); setDebtStatusFilter('all'); }} className="px-4 py-2 text-lg font-semibold text-white bg-slate-600 rounded-md hover:bg-slate-500">Xoá bộ lọc</button>
                </div>
            </div>
            <table className="w-full text-left table-auto">
                <thead>
                    <tr className="border-b border-slate-700"><th className="p-3 text-lg font-semibold tracking-wide">Ngày</th><th className="p-3 text-lg font-semibold tracking-wide">Đại lý</th><th className="p-3 text-lg font-semibold tracking-wide">Doanh thu Gross</th><th className="p-3 text-lg font-semibold tracking-wide">Phải thu Net</th><th className="p-3 text-lg font-semibold tracking-wide">Trạng thái</th><th className="p-3 text-lg font-semibold tracking-wide">Hành động</th></tr>
                </thead>
                <tbody>
                    {filteredDebts.map(debt => (
                        <tr key={debt.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                            <td className="p-3 text-lg">{format(parseISO(debt.date), 'dd/MM/yyyy')}</td>
                            <td className="p-3 text-lg font-bold cursor-pointer hover:text-primary" onClick={() => handleOpenDebtDetailModal(debt)}>{getAgentName(debt.agentId)}</td>
                            <td className="p-3 text-lg">{formatCurrency(debt.totalGrossRevenue)}</td>
                            <td className="p-3 text-lg font-semibold text-yellow-400">{formatCurrency(debt.totalNetRevenue)}</td>
                            <td className="p-3">
                                <span className={`px - 3 py - 1 text - sm font - bold rounded - full ${debt.status === DebtStatus.Paid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} `}>
                                    {debt.status}
                                </span>
                            </td>
                            <td className="p-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDebtStatusChange(debt.id, debt.status === DebtStatus.Paid ? DebtStatus.Unpaid : DebtStatus.Paid)}
                                        className={`px - 4 py - 1 font - bold text - white rounded - md ${debt.status === DebtStatus.Paid ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} `}
                                    >
                                        {debt.status === DebtStatus.Paid ? 'Hoàn tác' : 'Xác nhận TT'}
                                    </button>
                                    <button onClick={() => handleOpenDebtDetailModal(debt)} className="px-4 py-1 font-bold text-white bg-gray-600 rounded-md hover:bg-gray-500">Chi tiết</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {filteredDebts.length === 0 && <p className="mt-4 text-center text-slate-400">Không có dữ liệu công nợ nào khớp.</p>}
        </div>
    );

    const renderLogsTab = () => (
        <div className="p-6 overflow-x-auto bg-slate-800 rounded-lg shadow-lg">
            <h2 className="mb-6 text-3xl font-bold text-slate-100">Nhật ký Admin ({adminLogs.length})</h2>
            <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left table-auto">
                    <thead>
                        <tr className="border-b border-slate-700">
                            <th className="sticky top-0 p-3 text-lg font-semibold tracking-wide bg-slate-800">Thời gian</th>
                            <th className="sticky top-0 p-3 text-lg font-semibold tracking-wide bg-slate-800">Admin</th>
                            <th className="sticky top-0 p-3 text-lg font-semibold tracking-wide bg-slate-800">Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {adminLogs.map(log => (
                            <tr key={log.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                                <td className="p-3 text-lg text-slate-400 whitespace-nowrap">{format(parseISO(log.timestamp), 'dd/MM/yyyy HH:mm:ss')}</td>
                                <td className="p-3 text-lg font-bold">{log.adminName}</td>
                                <td className="p-3 text-lg">{log.description}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {adminLogs.length === 0 && <p className="mt-4 text-center text-slate-400">Chưa có nhật ký nào được ghi lại.</p>}
        </div>
    );

    const activeTabClasses = "px-6 py-3 text-lg font-semibold text-white bg-slate-700 rounded-t-lg";
    const inactiveTabClasses = "px-6 py-3 text-lg font-semibold text-slate-400 hover:text-white";

    const renderRevenueSummary = () => {
        const { todayRevenue, thisWeekRevenue, thisMonthRevenue } = globalStats;

        return (
            <div className="flex flex-col gap-3 mt-4">
                <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    <span className="text-sm font-medium text-slate-400">Hôm nay</span>
                    <span className="text-xl font-bold text-green-400">{formatCurrency(todayRevenue)}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    <span className="text-sm font-medium text-slate-400">Tuần này</span>
                    <span className="text-xl font-bold text-blue-400">{formatCurrency(thisWeekRevenue)}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 border-l-2 border-l-yellow-500">
                    <span className="text-sm font-bold text-yellow-500">Tháng này</span>
                    <span className="text-xl font-bold text-yellow-400">{formatCurrency(thisMonthRevenue)}</span>
                </div>
            </div>
        )
    };


    const renderProfitTab = () => {
        // Bao gồm tất cả các đơn hàng chưa bị huỷ để tính vào netRevenue. Tạm thời duyệt qua toàn bộ orders.
        const dailyProfitMap: Record<string, { date: string, netRevenue: number, debtAmount: number, orderCount: number }> = {};

        const filteredProfitOrders = orders.filter(order => {
            if (!profitStartDate && !profitEndDate) return true;
            const orderDate = startOfDay(parseISO(order.sold_at));
            if (profitStartDate && isBefore(orderDate, startOfDay(parseISO(profitStartDate)))) return false;
            if (profitEndDate && isAfter(orderDate, startOfDay(parseISO(profitEndDate)))) return false;
            return true;
        });

        filteredProfitOrders.forEach(order => {
            let actualRevenue = order.actual_revenue;
            if (actualRevenue == null) {
                const agent = agents.find(a => a.id === order.agentId);
                const discount = agent?.discountPercentage || 0;
                actualRevenue = order.price * (1 - discount / 100);
            }

            const dayKey = format(parseISO(order.sold_at), 'yyyy-MM-dd');
            if (!dailyProfitMap[dayKey]) {
                dailyProfitMap[dayKey] = { date: dayKey, netRevenue: 0, debtAmount: 0, orderCount: 0 };
            }
            dailyProfitMap[dayKey].netRevenue += actualRevenue;
            if (order.paymentStatus === PaymentStatus.Unpaid) {
                dailyProfitMap[dayKey].debtAmount += actualRevenue;
            }
            dailyProfitMap[dayKey].orderCount += 1;
        });

        const dailyProfits = Object.values(dailyProfitMap).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const totalProfitOverall = dailyProfits.reduce((sum, day) => sum + day.netRevenue, 0);

        return (
            <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">Thống kê lợi nhuận</h2>
                    <div className="bg-green-900/50 border border-green-500/30 px-6 py-2 rounded-lg">
                        <span className="text-sm font-semibold text-green-300 mr-2 uppercase">Tổng luỹ kế:</span>
                        <span className="text-xl font-bold text-green-400">{formatCurrency(totalProfitOverall)}</span>
                    </div>
                </div>

                {/* FILTERS for Profit Tab */}
                <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <label htmlFor="profitStartDate" className="text-slate-400">Từ:</label>
                        <input id="profitStartDate" type="date" value={profitStartDate} onChange={e => setProfitStartDate(e.target.value)} className="px-4 py-2 text-base bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-primary-focus focus:border-primary-focus" />
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="profitEndDate" className="text-slate-400">Đến:</label>
                        <input id="profitEndDate" type="date" value={profitEndDate} onChange={e => setProfitEndDate(e.target.value)} className="px-4 py-2 text-base bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-primary-focus focus:border-primary-focus" />
                    </div>
                    <button onClick={handleClearProfitFilters} className="px-4 py-2 text-base font-semibold text-white bg-slate-600 rounded-md hover:bg-slate-500">Xoá lọc</button>
                    {(profitStartDate || profitEndDate) && (
                        <span className="text-sm text-yellow-400 ml-auto bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20">
                            Đang xem dữ liệu được giới hạn từ {profitStartDate ? format(parseISO(profitStartDate), 'dd/MM/yyyy') : '...'} đến {profitEndDate ? format(parseISO(profitEndDate), 'dd/MM/yyyy') : '...'}
                        </span>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left table-auto">
                        <thead>
                            <tr className="border-b border-slate-700">
                                <th className="p-3 text-lg font-semibold tracking-wide text-slate-300 w-16">STT</th>
                                <th className="p-3 text-lg font-semibold tracking-wide text-slate-300">Ngày</th>
                                <th className="p-3 text-lg font-semibold tracking-wide text-slate-300">Số lượng đơn</th>
                                <th className="p-3 text-lg font-semibold tracking-wide text-slate-300">Công nợ (nếu có)</th>
                                <th className="p-3 text-lg font-semibold tracking-wide text-slate-300 text-right">Lợi nhuận (Net)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyProfits.map((dayData, index) => (
                                <tr key={dayData.date} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                                    <td className="p-3 text-slate-400">{index + 1}</td>
                                    <td className="p-3 font-medium text-slate-200">{format(parseISO(dayData.date), 'dd/MM/yyyy')}</td>
                                    <td className="p-3 text-slate-300">{dayData.orderCount} đơn</td>
                                    <td className="p-3">
                                        {dayData.debtAmount > 0 ? (
                                            <span className="text-red-400 font-medium">
                                                {formatCurrency(dayData.debtAmount)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-500">-</span>
                                        )}
                                    </td>
                                    <td className="p-3 font-bold text-green-400 text-right">{formatCurrency(dayData.netRevenue)}</td>
                                </tr>
                            ))}
                            {dailyProfits.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-6 text-center text-slate-400">Không có dữ liệu lợi nhuận nào.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="container p-4 mx-auto md:p-8">
            <header className="flex flex-col items-start justify-between gap-4 mb-8 md:flex-row md:items-center">
                <div className="flex flex-col gap-1">
                    <h1 className="text-5xl font-extrabold text-white">Admin Dashboard</h1>
                    <p className="text-xl text-slate-400 capitalize">{format(new Date(), "EEEE, 'ngày' dd 'tháng' MM 'năm' yyyy", { locale: vi })}</p>
                </div>
                <div className="flex items-center gap-4">

                    <p className="text-xl text-slate-400">Chào, {user.name}!</p>
                    <button onClick={() => setIsChangePasswordModalOpen(true)} className="px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 bg-slate-600 rounded-lg shadow-md hover:bg-slate-500">Đổi mật khẩu</button>
                    <button onClick={onLogout} className="px-6 py-2 text-sm font-semibold text-white transition-colors duration-200 bg-red-600 rounded-lg shadow-md hover:bg-red-700">Đăng xuất</button>
                </div>
            </header>

            {/* Global Stats */}
            <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2 xl:grid-cols-4">
                {/* Card 1: Tổng quan (Gross, Net, Orders) */}
                <div className="p-6 flex flex-col justify-between rounded-xl bg-gradient-to-br from-indigo-900/60 to-slate-800/90 border border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.15)]">
                    <div className="flex items-center justify-between pb-4 border-b border-indigo-500/30">
                        <div>
                            <h4 className="text-xs font-medium text-indigo-200 uppercase tracking-wider mb-1">Tổng Doanh thu (Gross)</h4>
                            <p className="text-3xl font-extrabold text-white">{formatCurrency(globalStats.totalGrossRevenue)}</p>
                        </div>
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><TrendingUp size={24} /></div>
                    </div>
                    <div className="flex items-center justify-between py-4 border-b border-indigo-500/30">
                        <div>
                            <h4 className="text-xs font-medium text-green-200 uppercase tracking-wider mb-1">Lợi nhuận (Net)</h4>
                            <p className="text-3xl font-extrabold text-green-400">{formatCurrency(globalStats.totalNetRevenue)}</p>
                        </div>
                        <div className="p-2 bg-green-500/20 rounded-lg text-green-400"><PiggyBank size={24} /></div>
                    </div>
                    <div className="flex items-center justify-between pt-4">
                        <div>
                            <h4 className="text-xs font-medium text-blue-200 uppercase tracking-wider mb-1">Tổng số đơn hàng</h4>
                            <p className="text-3xl font-extrabold text-blue-400">{globalStats.totalOrders}</p>
                        </div>
                        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><ShoppingCart size={24} /></div>
                    </div>
                </div>

                {/* Card 2: Doanh thu gần đây */}
                <div className="p-6 rounded-xl bg-slate-800 shadow-lg border border-slate-700/80 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Doanh thu gần đây</h4>
                        <div className="p-2 bg-slate-700 rounded-lg text-slate-400"><Activity size={24} /></div>
                    </div>
                    <div className="flex-1 flex flex-col justify-center">
                        {renderRevenueSummary()}
                    </div>
                </div>

                {/* Card 3: Kỷ lục Doanh thu */}
                <div className="p-6 flex flex-col justify-between rounded-xl bg-gradient-to-br from-rose-900/50 to-slate-800/90 border border-rose-500/30 shadow-[0_4px_20px_rgba(244,63,94,0.15)] flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-rose-200 uppercase tracking-wider">Kỷ lục Doanh thu</h4>
                        <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400"><Award size={24} /></div>
                    </div>
                    <div className="flex-1 flex flex-col gap-4 justify-center">
                        <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/50 hover:bg-slate-700/50 transition-colors">
                            <p className="text-xs text-rose-300 uppercase font-semibold mb-1">Tháng đỉnh cao</p>
                            <div className="flex justify-between items-end">
                                <p className="text-lg font-bold text-white max-w-[120px] truncate">{revenueRecords.bestMonth.month || 'N/A'}</p>
                                <p className="text-xl font-bold text-rose-400">{formatCurrency(revenueRecords.bestMonth.revenue)}</p>
                            </div>
                        </div>
                        <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/50 hover:bg-slate-700/50 transition-colors">
                            <p className="text-xs text-rose-300 uppercase font-semibold mb-1">Ngày bùng nổ</p>
                            <div className="flex justify-between items-end">
                                <p className="text-lg font-bold text-white max-w-[120px] truncate">{revenueRecords.bestDay.date ? format(parseISO(revenueRecords.bestDay.date), 'dd/MM/yyyy') : 'N/A'}</p>
                                <p className="text-xl font-bold text-rose-400">{formatCurrency(revenueRecords.bestDay.revenue)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Card 4: Top 3 Đại lý */}
                <div className="p-6 rounded-xl bg-gradient-to-br from-amber-900/40 to-slate-800/90 shadow-lg border border-amber-500/30 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-amber-200 uppercase tracking-wider">Xếp hạng Đại lý (Top 3)</h4>
                        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400"><Trophy size={24} /></div>
                    </div>
                    <div className="flex flex-col gap-3 flex-1 justify-center">
                        {topAgents.map((stat, index) => (
                            <div key={stat.agentId} className="flex items-center justify-between bg-slate-800/60 p-3 rounded-lg border border-slate-700/50 hover:bg-slate-700/50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold shadow-sm ${index === 0 ? 'bg-yellow-400 text-slate-900 shadow-[0_0_10px_rgba(250,204,21,0.5)]' : index === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-600 text-white'}`}>
                                        {index + 1}
                                    </div>
                                    <span className="font-semibold text-slate-200 truncate max-w-[120px]" title={getAgentName(stat.agentId)}>{getAgentName(stat.agentId)}</span>
                                </div>
                                <span className="font-bold text-amber-400">{formatCurrency(stat.totalNet)}</span>
                            </div>
                        ))}
                        {topAgents.length === 0 && <p className="text-slate-400 text-center text-sm py-4">Chưa có dữ liệu đại lý.</p>}
                    </div>
                </div>
            </div>

            <div className="mb-8 p-6 bg-slate-800 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-100">
                        {chartPeriod === 'week' ? 'Biểu đồ doanh số 7 ngày gần nhất' :
                            chartPeriod === 'month' ? 'Biểu đồ doanh số 30 ngày gần nhất' :
                                'Biểu đồ doanh số 12 tháng gần nhất'}
                    </h3>
                    <select
                        value={chartPeriod}
                        onChange={e => setChartPeriod(e.target.value as 'week' | 'month' | 'year')}
                        className="px-4 py-2 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none focus:ring-primary-focus focus:border-primary-focus"
                    >
                        <option value="week">Theo tuần</option>
                        <option value="month">Theo tháng</option>
                        <option value="year">Theo năm</option>
                    </select>
                </div>
                <RevenueChart data={chartData} title="" />
            </div>

            <div className="flex mb-0 overflow-x-auto border-b-2 border-slate-700 whitespace-nowrap">
                <button onClick={() => setActiveTab('orders')} className={activeTab === 'orders' ? activeTabClasses : inactiveTabClasses}>Đơn hàng</button>
                <button onClick={() => setActiveTab('agents')} className={activeTab === 'agents' ? activeTabClasses : inactiveTabClasses}>Đại lý</button>
                <button onClick={() => setActiveTab('debt')} className={activeTab === 'debt' ? activeTabClasses : inactiveTabClasses}>Đối soát</button>
                <button onClick={() => setActiveTab('profit')} className={activeTab === 'profit' ? activeTabClasses : inactiveTabClasses}>Lợi nhuận</button>
                <button onClick={() => setActiveTab('logs')} className={activeTab === 'logs' ? activeTabClasses : inactiveTabClasses}>Nhật ký Admin</button>
            </div>

            <div className="pt-8">
                {activeTab === 'orders' && renderOrdersTab()}
                {activeTab === 'agents' && renderAgentsTab()}
                {activeTab === 'debt' && renderDebtTab()}
                {activeTab === 'profit' && renderProfitTab()}
                {activeTab === 'logs' && renderLogsTab()}
            </div>

            {/* Modals */}
            <AgentManagementModal isOpen={isAgentModalOpen} onClose={() => setIsAgentModalOpen(false)} onSave={handleSaveAgent} agentToEdit={agentToEdit} adminUser={user} />
            {isAddOrderModalOpen && <AddOrderModal agents={agents} packages={packages} onClose={() => setIsAddOrderModalOpen(false)} onSave={handleAddOrder} />}
            {isEditOrderModalOpen && orderToEdit && (
                <EditOrderModal
                    order={orderToEdit}
                    agents={agents}
                    packages={packages}
                    onClose={() => setIsEditOrderModalOpen(false)}
                    onUpdate={handleUpdateOrder}
                    onDelete={handleDeleteOrder}
                />
            )}
            {selectedDebt && (
                <DebtDetailModal
                    isOpen={isDebtDetailModalOpen}
                    onClose={() => setIsDebtDetailModalOpen(false)}
                    debt={selectedDebt}
                    agent={agents.find(a => a.id === selectedDebt.agentId) || null}
                    orders={orders.filter(o => o.agentId === selectedDebt.agentId && format(startOfDay(parseISO(o.sold_at)), 'yyyy-MM-dd') === selectedDebt.date)}
                    packages={packages}
                />
            )}
            {isChangePasswordModalOpen && (
                <ChangePasswordModal
                    user={user}
                    onClose={() => setIsChangePasswordModalOpen(false)}
                    onSuccess={() => {
                        setIsChangePasswordModalOpen(false);
                        alert("Đổi mật khẩu thành công!");
                    }}
                />
            )}
            {isAdminUnpaidModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                    <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800/50">
                            <h3 className="text-2xl font-bold text-red-200 flex items-center gap-2">
                                Tổng hợp Công nợ theo Đại lý
                            </h3>
                            <button onClick={() => setIsAdminUnpaidModalOpen(false)} className="p-2 text-slate-400 transition-colors hover:text-white hover:bg-slate-700 rounded-lg">
                                X
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {adminUnpaidStats.length === 0 ? (
                                <p className="text-center text-slate-400 text-lg py-8">Tất cả đại lý đều đã thanh toán đủ.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-700">
                                    <table className="w-full text-left table-auto">
                                        <thead className="bg-slate-700/50">
                                            <tr>
                                                <th className="p-4 font-semibold text-slate-200">Tên Đại lý</th>
                                                <th className="p-4 font-semibold text-slate-200 text-center">Số đơn nợ</th>
                                                <th className="p-4 font-semibold text-red-300 text-right">Tổng tiền phải nộp CTY</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700">
                                            {adminUnpaidStats.map(stat => (
                                                <tr key={stat.agentId} className="hover:bg-slate-700/30 transition-colors">
                                                    <td className="p-4 text-white font-medium">{getAgentName(stat.agentId)}</td>
                                                    <td className="p-4 text-slate-300 text-center">{stat.count}</td>
                                                    <td className="p-4 font-bold text-red-400 text-right">{formatCurrency(stat.totalDebt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-900/50 font-bold border-t border-slate-700">
                                            <tr>
                                                <td className="p-4 text-slate-200">Tổng cộng</td>
                                                <td className="p-4 text-slate-200 text-center">{adminUnpaidStats.reduce((sum, s) => sum + s.count, 0)}</td>
                                                <td className="p-4 text-red-500 text-right text-xl">{formatCurrency(adminUnpaidStats.reduce((sum, s) => sum + s.totalDebt, 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Add Order Modal Component ---
interface AddOrderModalProps {
    agents: User[];
    packages: Package[];
    onClose: () => void;
    onSave: (orderData: Omit<Order, 'id'>) => void;
}

const AddOrderModal: React.FC<AddOrderModalProps> = ({ agents, packages, onClose, onSave }) => {
    const [agentId, setAgentId] = useState<number | ''>('');
    const [packageId, setPackageId] = useState<number | ''>('');
    const [accountEmail, setAccountEmail] = useState('');
    const [price, setPrice] = useState<number | ''>('');
    const [notes, setNotes] = useState('');
    const [soldAt, setSoldAt] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const selectedPackage = packages.find(p => p.id === packageId);
        if (selectedPackage) {
            setPrice(selectedPackage.price);
        }
    }, [packageId, packages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agentId || !packageId || !accountEmail) {
            alert('Vui lòng điền đầy đủ thông tin bắt buộc.');
            return;
        }
        setIsSubmitting(true);
        onSave({
            account_name: accountEmail.split('@')[0], // Use part of email as name since it's required by type
            account_email: accountEmail,
            packageId: Number(packageId),
            price: Number(price),
            agentId: Number(agentId),
            status: ActivationStatus.NotActivated, // Default
            paymentStatus: PaymentStatus.Unpaid, // Default
            notes: notes,
            sold_at: soldAt ? formatISO(startOfDay(parseISO(soldAt))) : formatISO(new Date()),
        });
        // The parent will handle closing and error display
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={onClose}>
            <div className="w-full max-w-lg p-8 space-y-6 bg-slate-800 rounded-lg shadow-xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-4xl font-bold text-center text-white">Thêm đơn hàng mới</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <select value={agentId} onChange={e => setAgentId(Number(e.target.value))} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none focus:ring-primary-focus focus:border-primary-focus md:col-span-2">
                            <option value="" disabled>-- Chọn đại lý --</option>
                            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <input type="email" placeholder="Email khách hàng" value={accountEmail} onChange={e => setAccountEmail(e.target.value)} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md md:col-span-2" />
                        <select value={packageId} onChange={e => setPackageId(Number(e.target.value))} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none">
                            <option value="" disabled>-- Chọn gói --</option>
                            {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input type="date" value={soldAt} onChange={e => setSoldAt(e.target.value)} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
                        <input type="number" placeholder="Giá bán" value={price} onChange={e => setPrice(Number(e.target.value))} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md md:col-span-2" />
                    </div>
                    <textarea placeholder="Ghi chú" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
                    <div className="flex justify-end gap-4 !mt-8">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-6 py-3 text-lg font-semibold text-white bg-slate-600 rounded-md hover:bg-slate-500">Huỷ</button>
                        <button type="submit" disabled={isSubmitting} className="px-6 py-3 text-lg font-semibold text-white bg-primary rounded-md hover:bg-primary-focus">
                            {isSubmitting ? 'Đang lưu...' : 'Lưu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Edit Order Modal Component ---
interface EditOrderModalProps {
    order: Order;
    agents: User[];
    packages: Package[];
    onClose: () => void;
    onUpdate: (orderData: Order) => void;
    onDelete: (orderId: number) => Promise<void>;
}

const EditOrderModal: React.FC<EditOrderModalProps> = ({ order, agents, packages, onClose, onUpdate, onDelete }) => {
    const [formData, setFormData] = useState<Order>(() => {
        const agent = agents.find(a => a.id === order.agentId);
        const discount = agent?.discountPercentage || 0;
        const calculatedNetRevenue = order.price * (1 - discount / 100);
        return {
            ...order,
            actual_revenue: order.actual_revenue ?? calculatedNetRevenue,
        };
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const selectedPackage = packages.find(p => p.id === formData.packageId);
        if (selectedPackage && formData.price !== selectedPackage.price) {
            setFormData(prev => ({ ...prev, price: selectedPackage.price }));
        }
    }, [formData.packageId, packages]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: ['agentId', 'packageId', 'price', 'actual_revenue'].includes(name) ? Number(value) : value }));
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = startOfDay(parseISO(e.target.value));
        setFormData(prev => ({ ...prev, sold_at: formatISO(newDate) }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        onUpdate(formData);
        // Parent handles closing
    };

    const handleDelete = async () => {
        if (order.paymentStatus === PaymentStatus.Paid) {
            alert('Không thể xoá đơn hàng đã thanh toán.');
            return;
        }
        setIsSubmitting(true);
        await onDelete(order.id);
        setIsSubmitting(false);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={onClose}>
            <div className="w-full max-w-2xl p-8 space-y-4 bg-slate-800 rounded-lg shadow-xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-4xl font-bold text-center text-white">Chỉnh sửa Đơn hàng</h2>
                <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="block mb-1 text-slate-400">Đại lý</label>
                            <select name="agentId" value={formData.agentId} onChange={handleInputChange} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none focus:ring-primary-focus focus:border-primary-focus">
                                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block mb-1 text-slate-400">Gói</label>
                            <select name="packageId" value={formData.packageId} onChange={handleInputChange} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none">
                                {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block mb-1 text-slate-400">Tên khách hàng</label>
                            <input type="text" name="account_name" value={formData.account_name} onChange={handleInputChange} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
                        </div>
                        <div>
                            <label className="block mb-1 text-slate-400">Email khách hàng</label>
                            <input type="email" name="account_email" value={formData.account_email} onChange={handleInputChange} className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
                        </div>
                        <div>
                            <label className="block mb-1 text-slate-400">Giá bán</label>
                            <input type="number" name="price" value={formData.price} onChange={handleInputChange} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
                        </div>
                        <div>
                            <label className="block mb-1 text-slate-400">Ngày bán</label>
                            <input type="date" name="sold_at" value={format(parseISO(formData.sold_at), 'yyyy-MM-dd')} onChange={handleDateChange} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
                        </div>
                        <div>
                            <label className="block mb-1 text-slate-400">Số tiền thực thu</label>
                            <input type="number" name="actual_revenue" value={formData.actual_revenue || ''} onChange={handleInputChange} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
                        </div>
                        <div>
                            <label className="block mb-1 text-slate-400">Tình trạng approve</label>
                            <select name="status" value={formData.status} onChange={handleInputChange} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none">
                                <option value={ActivationStatus.Activated}>Approved</option>
                                <option value={ActivationStatus.NotActivated}>Not Approved</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block mb-1 text-slate-400">Trạng thái thanh toán</label>
                            <select name="paymentStatus" value={formData.paymentStatus} onChange={handleInputChange} required className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md appearance-none">
                                <option value={PaymentStatus.Paid}>{PaymentStatus.Paid}</option>
                                <option value={PaymentStatus.Unpaid}>{PaymentStatus.Unpaid}</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block mb-1 text-slate-400">Ghi chú</label>
                            <textarea name="notes" placeholder="Ghi chú" value={formData.notes || ''} onChange={handleInputChange} className="w-full px-4 py-3 text-lg bg-slate-700 text-white border border-slate-600 rounded-md" />
                        </div>
                    </div>
                    <div className="flex justify-between gap-4 !mt-8">
                        {order.paymentStatus !== PaymentStatus.Paid ? (
                            <button type="button" onClick={handleDelete} disabled={isSubmitting} className="px-6 py-3 text-lg font-semibold text-white bg-red-600 rounded-md hover:bg-red-700">Xoá</button>
                        ) : (
                            <div title="Không thể xoá đơn đã thanh toán">
                                <button type="button" disabled className="px-6 py-3 text-lg font-semibold text-white bg-red-600/50 rounded-md cursor-not-allowed">Xoá</button>
                            </div>
                        )}
                        <div className="flex gap-4">
                            <button type="button" onClick={onClose} disabled={isSubmitting} className="px-6 py-3 text-lg font-semibold text-white bg-slate-600 rounded-md hover:bg-slate-500">Huỷ</button>
                            <button type="submit" disabled={isSubmitting} className="px-6 py-3 text-lg font-semibold text-white bg-primary rounded-md hover:bg-primary-focus">
                                {isSubmitting ? 'Đang lưu...' : 'Lưu'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};


export default AdminDashboard;