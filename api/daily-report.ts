import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = '8747808288:AAGh6MLqO33yrBCAlIFHchulYPFvov7yRxE';
const TELEGRAM_CHAT_ID = '6648239426';

export default async function handler(_req: any, res: any) {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Ngay hom nay theo UTC+7
        const now = new Date();
        const vnOffset = 7 * 60 * 60 * 1000;
        const vietnamNow = new Date(now.getTime() + vnOffset);
        const todayStr = vietnamNow.toISOString().split('T')[0];

        // Format ngay/thang/nam
        const parts = todayStr.split('-');
        const dateDisplay = parts[2] + '/' + parts[1] + '/' + parts[0];

        // Start/end of today VN in UTC
        const startUTC = new Date(new Date(todayStr + 'T00:00:00+07:00').getTime()).toISOString();
        const endUTC = new Date(new Date(todayStr + 'T23:59:59+07:00').getTime()).toISOString();

        const { data: orders, error } = await supabase
            .from('orders')
            .select('price, actual_revenue, sold_at, paymentStatus')
            .gte('sold_at', startUTC)
            .lte('sold_at', endUTC);

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
            '\ud83d\udcca B\u00e1o c\u00e1o doanh thu Tifo',
            'Ng\u00e0y ' + dateDisplay,
            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
            '',
            '\ud83d\udcb0 T\u1ed5ng doanh s\u1ed1: ' + fmt(totalGross) + ' VN\u0110',
            '\ud83e\udd1d Hoa h\u1ed3ng \u0111\u1ea1i l\u00fd: ' + fmt(totalCommission) + ' VN\u0110',
            '\ud83d\udcc8 L\u1ee3i nhu\u1eadn c\u00f4ng ty: ' + fmt(totalNetProfit) + ' VN\u0110',
            '',
            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
            '\ud83d\udce6 T\u1ed5ng s\u1ed1 \u0111\u01a1n: ' + validOrders.length + ' \u0111\u01a1n h\u00e0ng',
            '\u23f0 Th\u1eddi gian g\u1eedi: ' + new Date(now.getTime() + vnOffset).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        ].join('\n');

        const telegramRes = await fetch(
            'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
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
