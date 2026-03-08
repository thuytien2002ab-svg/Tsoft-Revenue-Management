import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = '8747808288:AAGh6MLqO33yrBCAlIFHchulYPFvov7yRxE';
const OWNER_CHAT_ID = '6648239426';

// Parse so thang tu ten goi: "Goi 3 thang", "Goi 1 nam", etc.
function parseDurationMonths(text: string): number {
    const lower = (text || '').toLowerCase();
    if (lower.includes('1 n\u0103m') || lower.includes('12 th\u00e1ng')) return 12;
    if (lower.includes('6 th\u00e1ng')) return 6;
    if (lower.includes('3 th\u00e1ng')) return 3;
    if (lower.includes('1 th\u00e1ng')) return 1;
    return 1;
}

// Parse VIP info tu notes: "Goi chinh: Goi 3 thang + VIP 1 thang"
// → { label: 'VIP 1 tháng', months: 1 }
function parseVipFromNotes(notes: string): { label: string; months: number } | null {
    const match = (notes || '').match(/VIP\s+(\d+)\s+(th\u00e1ng|n\u0103m)/i);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const months = unit.includes('n') ? num * 12 : num;
    return { label: 'VIP ' + num + ' ' + match[2], months };
}

async function sendTelegram(chatId: string | number, text: string) {
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
}

export default async function handler(_req: any, res: any) {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Ngay mai theo UTC+7
        const now = new Date();
        const vnOffset = 7 * 60 * 60 * 1000;
        const vietnamNow = new Date(now.getTime() + vnOffset);
        const tomorrow = new Date(vietnamNow.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        const tomorrowDisplay = tomorrowStr.split('-').reverse().join('/');

        // Lay tat ca don hang con hoat dong
        const { data: orders, error } = await supabase
            .from('orders')
            .select('account_email, sold_at, notes, agentId, packages(name), users(name)')
            .neq('paymentStatus', '\u0110\u00c3 HO\u00c0N TI\u1ec0N')
            .not('sold_at', 'is', null);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Lay group chat ID tu pending_orders gan nhat
        const { data: latestPending } = await supabase
            .from('pending_orders')
            .select('group_chat_id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        const groupChatId = latestPending?.group_chat_id || OWNER_CHAT_ID;

        // Tim don hang va VIP het han ngay mai
        interface ExpiringItem {
            email: string;
            label: string; // "Goi 3 thang" hoac "VIP 3 thang"
            type: 'main' | 'vip';
        }
        const expiringByAgent: Record<string, ExpiringItem[]> = {};

        for (const order of (orders || [])) {
            const pkg = (order as any).packages;
            const agent = (order as any).users;
            const pkgName = pkg?.name || '';
            const notes = order.notes || '';
            const agentName = agent?.name || 'Kh\u00f4ng r\u00f5';
            const soldAt = new Date(order.sold_at);

            // 1. Check goi chinh
            const mainMonths = parseDurationMonths(pkgName || notes);
            const mainExpire = new Date(soldAt);
            mainExpire.setMonth(mainExpire.getMonth() + mainMonths);
            const mainExpireVN = new Date(mainExpire.getTime() + vnOffset);
            if (mainExpireVN.toISOString().split('T')[0] === tomorrowStr) {
                if (!expiringByAgent[agentName]) expiringByAgent[agentName] = [];
                expiringByAgent[agentName].push({
                    email: order.account_email,
                    label: pkgName || ('G\u00f3i ' + mainMonths + ' th\u00e1ng'),
                    type: 'main',
                });
            }

            // 2. Check VIP rieng (neu co VIP va thoi han khac goi chinh)
            const vip = parseVipFromNotes(notes);
            if (vip && vip.months !== mainMonths) {
                const vipExpire = new Date(soldAt);
                vipExpire.setMonth(vipExpire.getMonth() + vip.months);
                const vipExpireVN = new Date(vipExpire.getTime() + vnOffset);
                if (vipExpireVN.toISOString().split('T')[0] === tomorrowStr) {
                    if (!expiringByAgent[agentName]) expiringByAgent[agentName] = [];
                    expiringByAgent[agentName].push({
                        email: order.account_email,
                        label: vip.label + ' (T\u1ea1o \u1ea3nh)',
                        type: 'vip',
                    });
                }
            }
        }

        const agentNames = Object.keys(expiringByAgent);

        if (agentNames.length === 0) {
            return res.status(200).json({ message: 'No expiring orders tomorrow', date: tomorrowStr });
        }

        // Tao tin nhan
        const lines: string[] = [
            '\ud83d\udd14 <b>Nh\u1eafc gia h\u1ea1n ng\u00e0y mai (' + tomorrowDisplay + ')</b>',
            '',
        ];

        for (const agentName of agentNames) {
            lines.push('\ud83d\udc64 <b>' + agentName + ':</b>');
            const items = expiringByAgent[agentName];
            for (const item of items) {
                const icon = item.type === 'vip' ? '\ud83c\udfa8' : '\ud83d\udce6';
                lines.push('  ' + icon + ' ' + item.email + ' \u2014 ' + item.label);
            }
            lines.push('');
        }

        lines.push('\ud83d\udcac Nh\u1eafc kh\u00e1ch gia h\u1ea1n \u0111\u1ec3 kh\u00f4ng b\u1ecb gi\u00e1n \u0111o\u1ea1n nh\u00e9!');

        await sendTelegram(groupChatId, lines.join('\n'));

        return res.status(200).json({
            success: true,
            tomorrowDate: tomorrowStr,
            agentCount: agentNames.length,
        });

    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
