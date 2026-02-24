import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = '8747808288:AAGh6MLqO33yrBCAlIFHchulYPFvov7yRxE';
const TELEGRAM_CHAT_ID = '6648239426';

export default async function handler(req: any, res: any) {
    try {
        // Supabase client
        const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Ngay hom nay theo UTC+7 (Vietnam)
        const now = new Date();
        const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const todayStr = vietnamTime.toISOString().split('T')[0]; // "2026-02-25"

        // Lay tat ca don hang
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*');

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Loc don hang cua ngay hom nay (theo gio VN)
        const todayOrders = (orders || []).filter((order: any) => {
            const soldAt = new Date(order.sold_at);
            const soldAtVN = new Date(soldAt.getTime() + 7 * 60 * 60 * 1000);
            const orderDate = soldAtVN.toISOString().split('T')[0];
            return orderDate === todayStr && order.paymentStatus !== 'ĐÃ HOÀN TIỀN';
        });

        // Tinh toan
        let totalGross = 0;
        let totalCommission = 0;
        let totalNetProfit = 0;

        todayOrders.forEach((order: any) => {
            const price = Number(order.price) || 0;
            const actualRevenue = Number(order.actual_revenue) || price;
            totalGross += price;
            totalCommission += price - actualRevenue;
            totalNetProfit += actualRevenue;
        });

        // Format so tien
        const fmt = (n: number) => n.toLocaleString('vi-VN');

        // Noi dung tin nhan
        const message = `📊 [Tsoft] Bao cao ngay ${todayStr}:
━━━━━━━━━━━━━━━
💰 Doanh so: ${fmt(totalGross)} VND
🤝 Hoa hong dai ly: ${fmt(totalCommission)} VND
📈 Loi nhuan cong ty: ${fmt(totalNetProfit)} VND
━━━━━━━━━━━━━━━
📦 Tong don: ${todayOrders.length} don`;

        // Gui Telegram
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const telegramRes = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
            }),
        });

        const telegramData = await telegramRes.json();

        if (!telegramData.ok) {
            return res.status(500).json({ error: 'Telegram failed', detail: telegramData });
        }

        return res.status(200).json({
            success: true,
            date: todayStr,
            totalGross,
            totalCommission,
            totalNetProfit,
            orderCount: todayOrders.length,
        });
    } catch (err: any) {
        console.error('Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
