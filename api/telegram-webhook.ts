import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = '8747808288:AAGh6MLqO33yrBCAlIFHchulYPFvov7yRxE';

function parseDate(text: string): string | null {
    // Format: dd/mm/yyyy
    const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return year + '-' + month + '-' + day;
    }
    return null;
}

async function getReport(dateStr: string) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const parts = dateStr.split('-');
    const dateDisplay = parts[2] + '/' + parts[1] + '/' + parts[0];

    const startUTC = new Date(new Date(dateStr + 'T00:00:00+07:00').getTime()).toISOString();
    const endUTC = new Date(new Date(dateStr + 'T23:59:59+07:00').getTime()).toISOString();

    const { data: orders, error } = await supabase
        .from('orders')
        .select('price, actual_revenue, sold_at, paymentStatus')
        .gte('sold_at', startUTC)
        .lte('sold_at', endUTC);

    if (error) return 'L\u1ed7i truy v\u1ea5n d\u1eef li\u1ec7u: ' + error.message;

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

    return [
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
    ].join('\n');
}

async function sendTelegramMessage(chatId: number | string, text: string) {
    await fetch(
        'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text }),
        }
    );
}

export default async function handler(req: any, res: any) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ status: 'Telegram webhook active' });
        }

        const body = req.body;
        const message = body?.message;
        if (!message || !message.text) {
            return res.status(200).json({ ok: true });
        }

        const chatId = message.chat.id;
        const text = message.text.trim();

        // Lenh /baocao hoac /baocao dd/mm/yyyy
        if (text.startsWith('/baocao') || text.startsWith('/report')) {
            const dateParam = text.replace('/baocao', '').replace('/report', '').trim();

            let targetDate: string;
            if (dateParam) {
                const parsed = parseDate(dateParam);
                if (!parsed) {
                    await sendTelegramMessage(chatId,
                        '\u274c Sai \u0111\u1ecbnh d\u1ea1ng ng\u00e0y! Vui l\u00f2ng nh\u1eadp theo m\u1eabu:\n/baocao 24/02/2026'
                    );
                    return res.status(200).json({ ok: true });
                }
                targetDate = parsed;
            } else {
                // Hom nay
                const now = new Date();
                const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
                targetDate = vnNow.toISOString().split('T')[0];
            }

            const report = await getReport(targetDate);
            await sendTelegramMessage(chatId, report);
            return res.status(200).json({ ok: true });
        }

        // Lenh /help
        if (text.startsWith('/help') || text.startsWith('/start')) {
            await sendTelegramMessage(chatId, [
                '\ud83e\udd16 Bot B\u00e1o c\u00e1o Tifo',
                '',
                'C\u00e1c l\u1ec7nh c\u00f3 th\u1ec3 d\u00f9ng:',
                '',
                '/baocao - Xem doanh thu h\u00f4m nay',
                '/baocao 24/02/2026 - Xem doanh thu ng\u00e0y b\u1ea5t k\u1ef3',
                '/help - Xem h\u01b0\u1edbng d\u1eabn',
            ].join('\n'));
            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });
    } catch (err: any) {
        return res.status(200).json({ error: err.message });
    }
}
