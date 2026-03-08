import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = '8747808288:AAGh6MLqO33yrBCAlIFHchulYPFvov7yRxE';
const TELEGRAM_CHAT_ID = '6648239426';

export default async function handler(_req: any, res: any) {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Lay ngay HOM QUA theo UTC+7 (bao cao triggered 00:05, report ngay truoc do)
        const now = new Date();
        const vnOffset = 7 * 60 * 60 * 1000;
        const vietnamNow = new Date(now.getTime() + vnOffset);
        const yesterday = new Date(vietnamNow.getTime() - 24 * 60 * 60 * 1000);
        const todayStr = yesterday.toISOString().split('T')[0];

        // Format ngay/thang/nam
        const parts = todayStr.split('-');
        const dateDisplay = parts[2] + '/' + parts[1] + '/' + parts[0];

        // Start/end of yesterday VN in UTC
        const startUTC = new Date(new Date(todayStr + 'T00:00:00+07:00').getTime()).toISOString();
        const endUTC = new Date(new Date(todayStr + 'T23:59:59+07:00').getTime()).toISOString();

        // Lay don hang, join voi thong tin dai ly
        const { data: orders, error } = await supabase
            .from('orders')
            .select('price, actual_revenue, sold_at, paymentStatus, agentId, users(name, username, discountPercentage)')
            .gte('sold_at', startUTC)
            .lte('sold_at', endUTC);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Loc bo don hoan tien
        const validOrders = (orders || []).filter(
            (o: any) => o.paymentStatus !== '\u0110\u00c3 HO\u00c0N TI\u1ec0N'
        );

        const fmt = (n: number) => n.toLocaleString('vi-VN');

        // === TONG QUAN ===
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

        // === PHAN THEO DAI LY ===
        const agentMap: Record<string, {
            name: string; username: string; discount: number;
            orders: number; gross: number; commission: number; net: number;
            unpaidCommission: number; unpaidCount: number;
        }> = {};

        validOrders.forEach((order: any) => {
            const agentId = String(order.agentId || 'unknown');
            const agentName = order.users?.name || 'Kh\u00f4ng r\u00f5';
            const username = order.users?.username || '';
            const discount = order.users?.discountPercentage || 0;
            const price = Number(order.price) || 0;
            const actualRevenue = Number(order.actual_revenue) || price;
            const commission = price - actualRevenue;
            const isPaid = order.paymentStatus === '\u0110\u00c3 THANH TO\u00c1N';

            if (!agentMap[agentId]) {
                agentMap[agentId] = {
                    name: agentName, username, discount,
                    orders: 0, gross: 0, commission: 0, net: 0,
                    unpaidCommission: 0, unpaidCount: 0,
                };
            }
            agentMap[agentId].orders++;
            agentMap[agentId].gross += price;
            agentMap[agentId].commission += commission;
            agentMap[agentId].net += actualRevenue;
            if (!isPaid) {
                agentMap[agentId].unpaidCommission += commission;
                agentMap[agentId].unpaidCount++;
            }
        });

        // Build message
        const lines: string[] = [
            '\ud83d\udcca B\u00e1o c\u00e1o doanh thu Tifo',
            'Ng\u00e0y ' + dateDisplay,
            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
            '',
            '\ud83d\udcb0 T\u1ed5ng doanh s\u1ed1: ' + fmt(totalGross) + ' VN\u0110',
            '\ud83e\udd1d Hoa h\u1ed3ng \u0111\u1ea1i l\u00fd: ' + fmt(totalCommission) + ' VN\u0110',
            '\ud83d\udcc8 L\u1ee3i nhu\u1eadn c\u00f4ng ty: ' + fmt(totalNetProfit) + ' VN\u0110',
            '\ud83d\udce6 T\u1ed5ng s\u1ed1 \u0111\u01a1n: ' + validOrders.length + ' \u0111\u01a1n',
            '',
            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
            '\ud83d\udc65 Chi ti\u1ebft theo \u0111\u1ea1i l\u00fd',
            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
        ];

        const agentList = Object.values(agentMap).sort((a, b) => b.gross - a.gross);

        if (agentList.length === 0) {
            lines.push('');
            lines.push('Kh\u00f4ng c\u00f3 \u0111\u01a1n h\u00e0ng n\u00e0o trong ng\u00e0y.');
        } else {
            agentList.forEach((ag) => {
                lines.push('');
                lines.push('\ud83c\udfe2 ' + ag.name + ' (CK ' + ag.discount + '%)');
                lines.push('   \ud83d\udce6 S\u1ed1 \u0111\u01a1n: ' + ag.orders + ' | Doanh s\u1ed1: ' + fmt(ag.gross) + '\u0111');
                lines.push('   \ud83d\udcb8 Hoa h\u1ed3ng ph\u1ea3i tr\u1ea3: ' + fmt(ag.commission) + '\u0111');
                if (ag.unpaidCommission > 0) {
                    lines.push('   \u26a0\ufe0f C\u00f4ng n\u1ee3: ' + fmt(ag.unpaidCommission) + '\u0111 (' + ag.unpaidCount + ' \u0111\u01a1n ch\u01b0a tt)');
                } else {
                    lines.push('   \u2705 \u0110\u00e3 \u0111\u1ed1i so\u00e1t xong');
                }
            });
        }

        lines.push('');
        lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
        lines.push('\u23f0 ' + new Date(now.getTime() + vnOffset).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));

        const message = lines.join('\n');

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
