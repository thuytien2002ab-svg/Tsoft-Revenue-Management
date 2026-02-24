import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = '8747808288:AAGh6MLqO33yrBCAlIFHchulYPFvov7yRxE';
const TELEGRAM_CHAT_ID = '6648239426';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Ngay hom nay theo UTC+7
        const now = new Date();
        const vnOffset = 7 * 60 * 60 * 1000;
        const vietnamNow = new Date(now.getTime() + vnOffset);
        const todayStr = vietnamNow.toISOString().split('T')[0];

        // Start/end of today in UTC (for VN timezone)
        const startOfDayVN = new Date(todayStr + 'T00:00:00+07:00');
        const endOfDayVN = new Date(todayStr + 'T23:59:59+07:00');

        const { data: orders, error } = await supabase
            .from('orders')
            .select('price, actual_revenue, sold_at, paymentStatus')
            .gte('sold_at', startOfDayVN.toISOString())
            .lte('sold_at', endOfDayVN.toISOString());

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Loc bo don hoan tien
        const validOrders = (orders || []).filter(
            (o: any) => o.paymentStatus !== '\u0110\u00c3 HO\u00c0N TI\u1ec0N'
        );

        let totalGross = 0;
        let totalCommission = 0;
        let totalNetProfit = 0;

        validOrders.forEach((order: any) => {
            const price = Number(order.price) || 0;
            const actualRevenue = Number(order.actual_revenue) || price;
            totalGross += price;
            totalCommission += price - actualRevenue;
            totalNetProfit += actualRevenue;
        });

        const fmt = (n: number) => n.toLocaleString('vi-VN');

        const message = [
            `\ud83d\udcca [Tsoft] Bao cao ngay ${todayStr}:`,
            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
            `\ud83d\udcb0 Doanh so: ${fmt(totalGross)} VND`,
            `\ud83e\udd1d Hoa hong dai ly: ${fmt(totalCommission)} VND`,
            `\ud83d\udcc8 Loi nhuan cong ty: ${fmt(totalNetProfit)} VND`,
            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
            `\ud83d\udce6 Tong don: ${validOrders.length} don`,
        ].join('\n');

        const telegramRes = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }),
            }
        );

        const telegramData = await telegramRes.json();

        return res.status(200).json({
            success: telegramData.ok,
            date: todayStr,
            totalGross,
            totalCommission,
            totalNetProfit,
            orderCount: validOrders.length,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
