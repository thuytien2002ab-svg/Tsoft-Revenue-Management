import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = '8747808288:AAGh6MLqO33yrBCAlIFHchulYPFvov7yRxE';
const ADMIN_CHAT_ID = 6648239426;

// Bang gia goi
const PACKAGES: Record<string, { id: number; price: number }> = {
    '1 thang': { id: 1, price: 400000 },
    '1 th\u00e1ng': { id: 1, price: 400000 },
    '3 thang': { id: 2, price: 800000 },
    '3 th\u00e1ng': { id: 2, price: 800000 },
    '6 thang': { id: 3, price: 1200000 },
    '6 th\u00e1ng': { id: 3, price: 1200000 },
    '1 nam': { id: 4, price: 1200000 },
    '1 n\u0103m': { id: 4, price: 1200000 },
};

const VIP_PACKAGES: Record<string, number> = {
    'vip 1 thang': 50000,
    'vip 1 th\u00e1ng': 50000,
    'vip 3 thang': 150000,
    'vip 3 th\u00e1ng': 150000,
    'vip 6 thang': 300000,
    'vip 6 th\u00e1ng': 300000,
};

function getSupabase() {
    return createClient(
        process.env.VITE_SUPABASE_URL || '',
        process.env.VITE_SUPABASE_ANON_KEY || ''
    );
}

async function sendTelegram(chatId: number | string, text: string) {
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text }),
    });
}

function parseOrder(text: string) {
    // Tim email
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (!emailMatch) return null;
    const email = emailMatch[0];

    const lower = text.toLowerCase();

    // Tim goi chinh
    let packageId = 0;
    let packagePrice = 0;
    let packageName = '';
    for (const [key, val] of Object.entries(PACKAGES)) {
        if (lower.includes(key)) {
            packageId = val.id;
            packagePrice = val.price;
            packageName = key;
            break;
        }
    }
    if (!packageId) return null;

    // Tim VIP (optional)
    let vipPrice = 0;
    let vipName = '';
    for (const [key, val] of Object.entries(VIP_PACKAGES)) {
        if (lower.includes(key)) {
            vipPrice = val;
            vipName = key;
            break;
        }
    }

    const totalPrice = packagePrice + vipPrice;
    const notes = vipName ? ('G\u00f3i ch\u00ednh: ' + packageName + ' + ' + vipName.toUpperCase()) : ('G\u00f3i ch\u00ednh: ' + packageName);

    return { email, packageId, totalPrice, packagePrice, vipPrice, vipName, packageName, notes };
}

function getReport(dateStr: string, dateDisplay: string, orders: any[]) {
    const validOrders = (orders || []).filter(
        (o: any) => o.paymentStatus !== '\u0110\u00c3 HO\u00c0N TI\u1ec0N'
    );
    let totalGross = 0, totalCommission = 0, totalNetProfit = 0;
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

function parseDate(text: string): string | null {
    const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
    return null;
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
        const supabase = getSupabase();

        // === LENH /done username (admin reply de tao don) ===
        if (text.startsWith('/done ') && message.from?.id === ADMIN_CHAT_ID) {
            const username = text.replace('/done ', '').trim().toLowerCase();

            // Phai reply vao tin nhan don hang
            const repliedMsg = message.reply_to_message;
            if (!repliedMsg || !repliedMsg.text) {
                await sendTelegram(chatId, '\u274c Vui l\u00f2ng reply v\u00e0o tin nh\u1eafn \u0111\u01a1n h\u00e0ng r\u1ed3i g\u00f5 /done username');
                return res.status(200).json({ ok: true });
            }

            // Parse don hang tu tin nhan goc
            const order = parseOrder(repliedMsg.text);
            if (!order) {
                await sendTelegram(chatId, '\u274c Kh\u00f4ng \u0111\u1ecdc \u0111\u01b0\u1ee3c \u0111\u01a1n t\u1eeb tin nh\u1eafn. C\u1ea7n c\u00f3 email v\u00e0 t\u00ean g\u00f3i (1 th\u00e1ng / 3 th\u00e1ng / 6 th\u00e1ng / 1 n\u0103m).');
                return res.status(200).json({ ok: true });
            }

            // Tim dai ly theo username
            const { data: agent, error: agentErr } = await supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .single();

            if (agentErr || !agent) {
                await sendTelegram(chatId, '\u274c Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u1ea1i l\u00fd "' + username + '". Ki\u1ec3m tra l\u1ea1i username.');
                return res.status(200).json({ ok: true });
            }

            // Tinh actual_revenue theo discount cua dai ly
            const discount = agent.discountPercentage || 0;
            const actualRevenue = Math.round(order.totalPrice * (1 - discount / 100));

            // Tao don hang tren Supabase
            const { error: insertErr } = await supabase.from('orders').insert({
                account_name: order.email.split('@')[0],
                account_email: order.email,
                packageId: order.packageId,
                price: order.totalPrice,
                actual_revenue: actualRevenue,
                status: 'CH\u01af\u0041 K\u00cdCH HO\u1ea0T',
                paymentStatus: 'CH\u01af\u0041 THANH TO\u00c1N',
                agentId: agent.id,
                sold_at: new Date().toISOString(),
                notes: order.notes,
            });

            if (insertErr) {
                await sendTelegram(chatId, '\u274c L\u1ed7i t\u1ea1o \u0111\u01a1n: ' + insertErr.message);
                return res.status(200).json({ ok: true });
            }

            const fmt = (n: number) => n.toLocaleString('vi-VN');
            await sendTelegram(chatId, [
                '\u2705 \u0110\u00e3 t\u1ea1o \u0111\u01a1n th\u00e0nh c\u00f4ng!',
                '',
                '\ud83d\udce7 Email: ' + order.email,
                '\ud83d\udce6 ' + order.notes,
                '\ud83d\udcb0 Gi\u00e1: ' + fmt(order.totalPrice) + ' VN\u0110',
                '\ud83d\udcc8 Doanh thu th\u1ef1c: ' + fmt(actualRevenue) + ' VN\u0110',
                '\ud83d\udc64 \u0110\u1ea1i l\u00fd: ' + agent.name + ' (' + username + ')',
            ].join('\n'));

            return res.status(200).json({ ok: true });
        }

        // === LENH /baocao ===
        if (text.startsWith('/baocao') || text.startsWith('/report')) {
            const dateParam = text.replace('/baocao', '').replace('/report', '').trim();
            const now = new Date();
            const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
            let targetDate = vnNow.toISOString().split('T')[0];

            if (dateParam) {
                const parsed = parseDate(dateParam);
                if (!parsed) {
                    await sendTelegram(chatId, '\u274c Sai \u0111\u1ecbnh d\u1ea1ng! V\u00ed d\u1ee5: /baocao 24/02/2026');
                    return res.status(200).json({ ok: true });
                }
                targetDate = parsed;
            }

            const parts = targetDate.split('-');
            const dateDisplay = parts[2] + '/' + parts[1] + '/' + parts[0];
            const startUTC = new Date(new Date(targetDate + 'T00:00:00+07:00').getTime()).toISOString();
            const endUTC = new Date(new Date(targetDate + 'T23:59:59+07:00').getTime()).toISOString();

            const { data: orders } = await supabase
                .from('orders')
                .select('price, actual_revenue, paymentStatus')
                .gte('sold_at', startUTC)
                .lte('sold_at', endUTC);

            await sendTelegram(chatId, getReport(targetDate, dateDisplay, orders || []));
            return res.status(200).json({ ok: true });
        }

        // === LENH /help hoac /start ===
        if (text.startsWith('/help') || text.startsWith('/start')) {
            await sendTelegram(chatId, [
                '\ud83e\udd16 Bot B\u00e1o c\u00e1o Tifo',
                '',
                '\ud83d\udcdd Th\u00eam \u0111\u01a1n:',
                '1. \u0110\u1ea1i l\u00fd nh\u1eafn: email@gmail.com 6 th\u00e1ng + vip 1 th\u00e1ng',
                '2. Admin reply tin \u0111\u00f3: /done username',
                '',
                '\ud83d\udcca B\u00e1o c\u00e1o:',
                '/baocao - Doanh thu h\u00f4m nay',
                '/baocao 24/02/2026 - Doanh thu ng\u00e0y b\u1ea5t k\u1ef3',
                '',
                '\ud83d\udce6 G\u00f3i h\u1ed7 tr\u1ee3:',
                '1 th\u00e1ng (400k) | 3 th\u00e1ng (800k) | 6 th\u00e1ng (1.2tr) | 1 n\u0103m (1.2tr)',
                'VIP 1 th\u00e1ng (50k) | VIP 3 th\u00e1ng (150k) | VIP 6 th\u00e1ng (300k)',
            ].join('\n'));
            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });
    } catch (err: any) {
        return res.status(200).json({ error: err.message });
    }
}
