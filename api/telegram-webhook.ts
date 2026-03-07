import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = '8747808288:AAGh6MLqO33yrBCAlIFHchulYPFvov7yRxE';
const OWNER_ID = 6648239426;

// === Normalize Vietnamese text (bo dau de match loi chinh ta) ===
function normalizeVN(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd').replace(/\u0110/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

// === Bang gia goi (ca co dau lan khong dau) ===
const PACKAGES: Record<string, { id: number; price: number; label: string }> = {
    '1 thang': { id: 1, price: 400000, label: 'G\u00f3i 1 th\u00e1ng' },
    '3 thang': { id: 2, price: 800000, label: 'G\u00f3i 3 th\u00e1ng' },
    '6 thang': { id: 3, price: 1200000, label: 'G\u00f3i 6 th\u00e1ng' },
    '1 nam': { id: 4, price: 1200000, label: 'G\u00f3i 1 n\u0103m' },
};

// VIP aliases: key la dang normalized, value la { price, label, months }
const VIP_ALIASES: { pattern: string; price: number; label: string }[] = [
    // --- 1 thang VIP ---
    { pattern: 'vip 1 thang', price: 50000, label: 'VIP 1 th\u00e1ng' },
    { pattern: '1 thang vip', price: 50000, label: 'VIP 1 th\u00e1ng' },
    { pattern: '1 thang tao anh', price: 50000, label: 'VIP 1 th\u00e1ng' },
    { pattern: 'tao anh 1 thang', price: 50000, label: 'VIP 1 th\u00e1ng' },
    { pattern: '1 thang hinh', price: 50000, label: 'VIP 1 th\u00e1ng' },
    { pattern: '1 thang anh', price: 50000, label: 'VIP 1 th\u00e1ng' },
    // --- 3 thang VIP ---
    { pattern: 'vip 3 thang', price: 150000, label: 'VIP 3 th\u00e1ng' },
    { pattern: '3 thang vip', price: 150000, label: 'VIP 3 th\u00e1ng' },
    { pattern: '3 thang tao anh', price: 150000, label: 'VIP 3 th\u00e1ng' },
    { pattern: 'tao anh 3 thang', price: 150000, label: 'VIP 3 th\u00e1ng' },
    { pattern: '3 thang hinh', price: 150000, label: 'VIP 3 th\u00e1ng' },
    { pattern: '3 thang anh', price: 150000, label: 'VIP 3 th\u00e1ng' },
    // --- 6 thang VIP ---
    { pattern: 'vip 6 thang', price: 300000, label: 'VIP 6 th\u00e1ng' },
    { pattern: '6 thang vip', price: 300000, label: 'VIP 6 th\u00e1ng' },
    { pattern: '6 thang tao anh', price: 300000, label: 'VIP 6 th\u00e1ng' },
    { pattern: 'tao anh 6 thang', price: 300000, label: 'VIP 6 th\u00e1ng' },
    { pattern: '6 thang hinh', price: 300000, label: 'VIP 6 th\u00e1ng' },
    { pattern: '6 thang anh', price: 300000, label: 'VIP 6 th\u00e1ng' },
];

function getSupabase() {
    return createClient(
        process.env.VITE_SUPABASE_URL || '',
        process.env.VITE_SUPABASE_ANON_KEY || ''
    );
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

// =============================================
// TELEGRAM API HELPERS
// =============================================

async function sendTelegram(chatId: number | string, text: string, options: any = {}) {
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, ...options }),
    });
}

async function sendTelegramInline(chatId: number | string, text: string, keyboard: any) {
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_markup: JSON.stringify(keyboard),
        }),
    });
}

async function editMessageText(chatId: number | string, messageId: number, text: string, keyboard?: any) {
    const body: any = { chat_id: chatId, message_id: messageId, text };
    if (keyboard) {
        body.reply_markup = JSON.stringify(keyboard);
    } else {
        body.reply_markup = JSON.stringify({ inline_keyboard: [] });
    }
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/editMessageText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function answerCallback(callbackQueryId: string, text?: string) {
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/answerCallbackQuery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }),
    });
}

// =============================================
// BUSINESS LOGIC HELPERS
// =============================================

function parseOrder(text: string) {
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    // parseOrder co the duoc goi voi text khong co email (truong hop goi rieng)
    const email = emailMatch ? emailMatch[0] : '';
    const norm = normalizeVN(text);

    // === Tim goi chinh (dua tren normalized text) ===
    let packageId = 0, packagePrice = 0, packageName = '', packageLabel = '';
    for (const [key, val] of Object.entries(PACKAGES)) {
        if (norm.includes(key)) {
            packageId = val.id;
            packagePrice = val.price;
            packageName = key;
            packageLabel = val.label;
            break;
        }
    }

    if (!packageId) {
        if (email) return { email, packageId: 0, totalPrice: 0, packagePrice: 0, vipPrice: 0, vipName: '', packageName: '', notes: '' };
        return null;
    }

    // === Tim VIP (normalized, khop pattern dai truoc) ===
    // Loai bo phan email trong text de tranh nham lan
    const normNoEmail = norm.replace(/[\w.-]+@[\w.-]+\.\w+/, '');

    let vipPrice = 0, vipLabel = '';
    // Sort by pattern length desc de khop cai dai truoc (tranh '3 thang anh' bi khop boi '3 thang')
    const sortedVip = [...VIP_ALIASES].sort((a, b) => b.pattern.length - a.pattern.length);
    for (const alias of sortedVip) {
        if (normNoEmail.includes(alias.pattern)) {
            vipPrice = alias.price;
            vipLabel = alias.label;
            break;
        }
    }

    const totalPrice = packagePrice + vipPrice;
    const vipName = vipLabel;
    const notes = vipLabel
        ? ('G\u00f3i ch\u00ednh: ' + packageLabel + ' + ' + vipLabel)
        : ('G\u00f3i ch\u00ednh: ' + packageLabel);

    return { email, packageId, totalPrice, packagePrice, vipPrice, vipName, packageName: packageLabel, notes };
}

async function checkDuplicateOrder(supabase: any, email: string, packageId: number): Promise<boolean> {
    const now = new Date();
    const vnOffset = 7 * 60 * 60 * 1000;
    const vietnamNow = new Date(now.getTime() + vnOffset);
    const todayStr = vietnamNow.toISOString().split('T')[0];
    const startUTC = new Date(new Date(todayStr + 'T00:00:00+07:00').getTime()).toISOString();
    const endUTC = new Date(new Date(todayStr + 'T23:59:59+07:00').getTime()).toISOString();

    const { data } = await supabase
        .from('orders')
        .select('id')
        .ilike('account_email', email)
        .eq('packageId', packageId)
        .gte('sold_at', startUTC)
        .lte('sold_at', endUTC)
        .limit(1);

    return (data && data.length > 0);
}

async function checkAdmin(chatId: number | string, userId: number, chatType: string): Promise<boolean> {
    if (chatType === 'private') return userId === OWNER_ID;
    try {
        const res = await fetch(
            'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/getChatAdministrators',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId }),
            }
        );
        const data = await res.json();
        if (!data.ok) return false;
        return data.result.some((admin: any) => admin.user.id === userId);
    } catch {
        return false;
    }
}

function getReport(dateDisplay: string, orders: any[]) {
    const validOrders = (orders || []).filter((o: any) => o.paymentStatus !== '\u0110\u00c3 HO\u00c0N TI\u1ec0N');
    let totalGross = 0, totalCommission = 0, totalNetProfit = 0;
    validOrders.forEach((order: any) => {
        const price = Number(order.price) || 0;
        const actualRevenue = Number(order.actual_revenue) || price;
        totalGross += price;
        totalCommission += price - actualRevenue;
        totalNetProfit += actualRevenue;
    });
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

// =============================================
// PENDING ORDER HELPERS
// =============================================

function buildPendingMessage(pending: any, prefix: string = '\ud83c\udd95 \u0110\u01a1n h\u00e0ng m\u1edbi!') {
    if (pending.package_id) {
        return [
            prefix,
            '',
            '\ud83d\udce7 Email: ' + pending.email,
            '\ud83d\udce6 G\u00f3i: ' + pending.package_name + ' - ' + fmt(pending.total_price) + ' VN\u0110',
            pending.vip_name ? ('\u2b50 VIP: ' + pending.vip_name) : '',
            '\ud83d\udc64 G\u1eedi b\u1edfi: ' + pending.agent_telegram_name,
        ].filter(Boolean).join('\n');
    } else {
        return [
            prefix,
            '',
            '\ud83d\udce7 Email: ' + pending.email,
            '\u26a0\ufe0f Kh\u00f4ng nh\u1eadn di\u1ec7n \u0111\u01b0\u1ee3c g\u00f3i (c\u00f3 th\u1ec3 do l\u1ed7i ch\u00ednh t\u1ea3)',
            '\ud83d\udc64 G\u1eedi b\u1edfi: ' + pending.agent_telegram_name,
            '',
            '\ud83d\udca1 Nh\u1ea5n "Ch\u1ec9nh s\u1eeda" \u0111\u1ec3 ch\u1ecdn g\u00f3i th\u1ee7 c\u00f4ng.',
        ].join('\n');
    }
}

function buildMainKeyboard(pendingId: number) {
    return {
        inline_keyboard: [
            [
                { text: '\u270f\ufe0f Ch\u1ec9nh s\u1eeda', callback_data: 'edit:' + pendingId },
                { text: '\u2705 Ch\u1ecdn \u0111\u1ea1i l\u00fd & X\u00e1c nh\u1eadn', callback_data: 'confirm:' + pendingId },
            ],
            [
                { text: '\u274c Hu\u1ef7 \u0111\u01a1n', callback_data: 'cancel:' + pendingId },
            ],
        ],
    };
}

// =============================================
// MAIN HANDLER
// =============================================

export default async function handler(req: any, res: any) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ status: 'Telegram webhook active' });
        }

        const body = req.body;

        // --- Handle callback queries (inline button clicks) ---
        if (body.callback_query) {
            await handleCallback(body.callback_query);
            return res.status(200).json({ ok: true });
        }

        const message = body?.message;
        if (!message || !message.text) {
            return res.status(200).json({ ok: true });
        }

        const chatId = message.chat.id;
        const text = message.text.trim();
        const chatType = message.chat.type;
        const userId = message.from?.id;

        // --- Commands (start with /) ---
        if (text.startsWith('/')) {
            return await handleCommand(message, text, chatId, chatType, userId, res);
        }

        // --- Owner DM: check for edit input (email input) ---
        if (chatType === 'private' && userId === OWNER_ID) {
            const handled = await handleOwnerInput(message);
            if (handled) return res.status(200).json({ ok: true });
        }

        // --- Group messages: auto-detect orders ---
        if (chatType !== 'private') {
            // Skip bot messages and owner messages
            if (!message.from?.is_bot && userId !== OWNER_ID) {
                await handleGroupMessage(message);
            }
        }

        return res.status(200).json({ ok: true });

    } catch (err: any) {
        console.error('Webhook error:', err);
        return res.status(200).json({ error: err.message });
    }
}

// =============================================
// GENDER DETECTION FROM VIETNAMESE NAME
// =============================================

function getGenderTitle(from: any): { title: string; lastName: string } {
    const firstName = from?.first_name || '';
    const lastName = from?.last_name || '';
    const fullName = (firstName + ' ' + lastName).trim();
    const lowerFull = fullName.toLowerCase();

    // Ten dem chi ra nu
    const femalePatterns = ['thi ', 'th\u1ecb ', ' nu ', ' n\u1eef ', ' tuyen', ' tuy\u1ebfn', ' lan', ' linh', ' hoa', ' huong', ' h\u01b0\u01a1ng', ' hang', ' h\u1eb1ng', ' nhi', ' mai', ' van anh', ' v\u00e2n anh', ' bich', ' b\u00edch'];
    // Ten dem chi ra nam
    const malePatterns = ['van ', 'v\u0103n ', ' hung', ' h\u00f9ng', ' cuong', ' c\u01b0\u1eddng', ' duc', ' \u0111\u1ee9c', ' tuan', ' tu\u1ea5n', ' minh', ' long', ' phuc', ' ph\u00fac', ' khoa', ' hieu', ' hi\u1ebfu', ' dung nam'];

    const isFemale = femalePatterns.some(p => lowerFull.includes(p));
    const isMale = !isFemale && malePatterns.some(p => lowerFull.includes(p));

    // Lay ten goi (ten cuoi cung hoac first_name neu k co last_name)
    // Vi nguoi Viet: ho ten = [Ho] [Ten dem] [Ten]. First name = Ten, Last name = Ho
    // Khi display tren Telegram: first_name thuong la Ten rieng
    const displayName = firstName || fullName;

    if (isFemale) return { title: 'Ch\u1ecb', lastName: displayName };
    if (isMale) return { title: 'Anh', lastName: displayName };

    // Không xác định được → giữ "Anh/Chị" trung tính
    return { title: 'Anh/Ch\u1ecb', lastName: '' };
}

// =========================================================
// TAO DON VA THONG BAO NGAY (immediate)
// =========================================================
async function createAndNotify(
    supabase: any,
    message: any,
    email: string,
    parsed: ReturnType<typeof parseOrder>,
    originalMessageId?: number
) {
    const senderId = message.from?.id;
    const agentName = (message.from?.first_name || '') + (message.from?.last_name ? ' ' + message.from.last_name : '');

    // Kiem tra linked agent va gender
    let linkedAgent: any = null;
    if (senderId) {
        const { data: mapping } = await supabase
            .from('agent_telegram_mappings')
            .select('agent_id, users(*)')
            .eq('telegram_user_id', senderId)
            .maybeSingle();
        linkedAgent = mapping?.users || null;
    }

    // Build salutation
    let salutation: string;
    if (linkedAgent && linkedAgent.gender) {
        const firstName = (linkedAgent.name || '').split(' ').pop() || linkedAgent.name;
        salutation = (linkedAgent.gender === 'female' ? 'Ch\u1ecb ' : 'Anh ') + firstName;
    } else {
        const fakeFrom = { first_name: agentName, last_name: '' };
        const gi = getGenderTitle(fakeFrom);
        salutation = gi.title ? gi.title + (gi.lastName ? ' ' + gi.lastName : '') : 'Anh/Ch\u1ecb';
    }

    // Luu vao DB
    const { data: pending, error } = await supabase
        .from('pending_orders')
        .insert({
            email,
            package_id: parsed!.packageId,
            package_name: parsed!.packageName,
            total_price: parsed!.totalPrice,
            vip_name: parsed!.vipName,
            vip_price: parsed!.vipPrice,
            notes: parsed!.notes,
            group_chat_id: message.chat.id,
            group_message_id: originalMessageId || message.message_id,
            agent_telegram_name: agentName,
            sender_user_id: senderId,
            status: 'pending',
        })
        .select().single();

    if (error || !pending) return;

    // Reply ngay vao group
    const groupReply = 'Em ti\u1ebfp nh\u1eadn v\u00e0 g\u1eedi \u0111\u01a1n c\u1ee7a ' + salutation + ' sang cho s\u1ebfp Long r\u1ed3i \u1ea1 ! ' + salutation + ' ch\u1edd x\u00edu nh\u00e9 ...';
    await sendTelegram(message.chat.id, groupReply, { reply_to_message_id: originalMessageId || message.message_id });

    // DM cho Owner ngay
    let dmText = buildPendingMessage(pending);
    let keyboard: any;
    if (linkedAgent) {
        dmText += '\n\n\ud83e\udd16 \u0110\u1ea1i l\u00fd t\u1ef1 \u0111\u1ed9ng: ' + linkedAgent.name + ' (CK ' + (linkedAgent.discountPercentage || 0) + '%)';
        keyboard = {
            inline_keyboard: [
                [{ text: '\u2705 X\u00e1c nh\u1eadn cho ' + linkedAgent.name, callback_data: 'agent:' + pending.id + ':' + linkedAgent.id }],
                [{ text: '\u270f\ufe0f Ch\u1ec9nh s\u1eeda \u0111\u01a1n', callback_data: 'edit:' + pending.id }],
                [{ text: '\ud83d\udd04 \u0110\u1ed5i \u0111\u1ea1i l\u00fd kh\u00e1c', callback_data: 'confirm:' + pending.id }],
                [{ text: '\u274c H\u1ee7y', callback_data: 'cancel:' + pending.id }],
            ],
        };
    } else {
        keyboard = buildMainKeyboard(pending.id);
    }
    try {
        await sendTelegramInline(OWNER_ID, dmText, keyboard);
    } catch (e) {
        console.error('Failed to DM owner:', e);
    }
}

async function handleGroupMessage(message: any) {
    const text = message.text || '';
    const supabase = getSupabase();
    const senderId = message.from?.id;
    const groupChatId = message.chat.id;
    const lower = text.toLowerCase();

    // === BLACKLIST: Bo qua tin nhan test / dung thu ===
    const SKIP_KEYWORDS = [
        'test', 'dùng thử', 'dung thu', 'thử nghiệm', 'thu nghiem',
        'demo', 'fake', 'giả', 'gia mao', 'thử', 'thu thu',
    ];
    if (SKIP_KEYWORDS.some(kw => lower.includes(kw))) return;

    // Tim TAT CA emails trong tin nhan (khong chi email dau tien)
    const allEmails: string[] = text.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
    const hasEmail = allEmails.length > 0;
    const parsed = parseOrder(text);
    const hasPackage = !!(parsed && parsed.packageId);

    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();

    // =========================================================
    // TRUONG HOP 1: Co ca email(s) + goi trong cung 1 tin
    // =========================================================
    if (hasEmail && hasPackage) {
        for (const email of allEmails) {
            await createAndNotify(supabase, message, email, parsed!);
        }
        return;
    }

    // =========================================================
    // TRUONG HOP 2: Chi co email(s), chua co goi → luu partial(s)
    // =========================================================
    if (hasEmail && !hasPackage) {
        await supabase
            .from('pending_orders')
            .delete()
            .eq('sender_user_id', senderId)
            .eq('group_chat_id', groupChatId)
            .eq('status', 'email_only');

        const agentName = (message.from?.first_name || '') + (message.from?.last_name ? ' ' + message.from.last_name : '');
        const partialRows = allEmails.map(email => ({
            email,
            package_id: 0, package_name: '', total_price: 0,
            vip_name: '', vip_price: 0, notes: '',
            group_chat_id: groupChatId,
            group_message_id: message.message_id,
            agent_telegram_name: agentName,
            sender_user_id: senderId,
            status: 'email_only',
        }));
        await supabase.from('pending_orders').insert(partialRows);
        return;
    }

    // =========================================================
    // TRUONG HOP 3: Chi co goi → tim partial(s) cua cung sender
    // =========================================================
    if (!hasEmail && hasPackage) {
        const { data: partials } = await supabase
            .from('pending_orders').select('*')
            .eq('sender_user_id', senderId)
            .eq('group_chat_id', groupChatId)
            .eq('status', 'email_only')
            .gte('created_at', oneMinuteAgo)
            .order('created_at', { ascending: true });

        if (partials && partials.length > 0) {
            const partialIds = partials.map((p: any) => p.id);
            await supabase.from('pending_orders').update({ status: 'merged_done' }).in('id', partialIds);

            for (const partial of partials) {
                await createAndNotify(supabase, message, partial.email, parsed!, partial.group_message_id);
            }
        }
        return;
    }
}

// =============================================
// CALLBACK QUERY HANDLER (inline buttons)
// =============================================

async function handleCallback(callbackQuery: any) {
    const data = callbackQuery.data || '';
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    const supabase = getSupabase();

    // Tât cả callback đều phải từ Owner
    if (callbackQuery.from?.id !== OWNER_ID) {
        await answerCallback(callbackQuery.id, 'B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n th\u1ef1c hi\u1ec7n h\u00e0nh \u0111\u1ed9ng n\u00e0y.');
        return;
    }

    await answerCallback(callbackQuery.id);

    // ---- CONFIRM: show agent list ----
    if (data.startsWith('confirm:')) {
        const pendingId = parseInt(data.split(':')[1]);
        const { data: pending } = await supabase.from('pending_orders').select('*').eq('id', pendingId).single();

        if (!pending || pending.status !== 'pending') {
            await editMessageText(chatId, messageId, '\u274c \u0110\u01a1n h\u00e0ng n\u00e0y \u0111\u00e3 \u0111\u01b0\u1ee3c x\u1eed l\u00fd ho\u1eb7c kh\u00f4ng t\u1ed3n t\u1ea1i.');
            return;
        }

        if (!pending.package_id) {
            await answerCallback(callbackQuery.id, '\u26a0\ufe0f Ch\u01b0a ch\u1ecdn g\u00f3i! Vui l\u00f2ng ch\u1ec9nh s\u1eeda tr\u01b0\u1edbc.');
            return;
        }

        // Lay danh sach dai ly
        const { data: agents } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'AGENT')
            .eq('isActive', true)
            .order('name');

        const buttons = (agents || []).map((agent: any) => ([
            { text: agent.name + ' (CK ' + (agent.discountPercentage || 0) + '%)', callback_data: 'agent:' + pendingId + ':' + agent.id }
        ]));
        buttons.push([{ text: '\u2b05\ufe0f Quay l\u1ea1i', callback_data: 'back:' + pendingId }]);

        const text = buildPendingMessage(pending) + '\n\n\ud83d\udc64 Ch\u1ecdn \u0111\u1ea1i l\u00fd:';
        await editMessageText(chatId, messageId, text, { inline_keyboard: buttons });
    }

    // ---- AGENT: confirm with selected agent ----
    else if (data.startsWith('agent:')) {
        const parts = data.split(':');
        const pendingId = parseInt(parts[1]);
        const agentId = parseInt(parts[2]);

        const { data: pending } = await supabase.from('pending_orders').select('*').eq('id', pendingId).single();
        if (!pending || pending.status !== 'pending') {
            await editMessageText(chatId, messageId, '\u274c \u0110\u01a1n h\u00e0ng n\u00e0y \u0111\u00e3 \u0111\u01b0\u1ee3c x\u1eed l\u00fd.');
            return;
        }

        // Check duplicate
        const isDuplicate = await checkDuplicateOrder(supabase, pending.email, pending.package_id);
        if (isDuplicate) {
            await editMessageText(chatId, messageId, '\u26a0\ufe0f Email ' + pending.email + ' v\u1edbi g\u00f3i n\u00e0y \u0111\u00e3 c\u00f3 \u0111\u01a1n h\u00f4m nay r\u1ed3i! Kh\u00f4ng th\u1ec3 th\u00eam tr\u00f9ng.');
            return;
        }

        // Get agent info
        const { data: agent } = await supabase.from('users').select('*').eq('id', agentId).single();
        if (!agent) {
            await editMessageText(chatId, messageId, '\u274c Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u1ea1i l\u00fd.');
            return;
        }

        // Tao don hang
        const discount = agent.discountPercentage || 0;
        const actualRevenue = Math.round(pending.total_price * (1 - discount / 100));

        const { error: insertErr } = await supabase.from('orders').insert({
            account_name: pending.email.split('@')[0],
            account_email: pending.email,
            packageId: pending.package_id,
            price: pending.total_price,
            actual_revenue: actualRevenue,
            status: 'CH\u01af\u0041 K\u00cdCH HO\u1ea0T',
            paymentStatus: 'CH\u01af\u0041 THANH TO\u00c1N',
            agentId: agent.id,
            sold_at: new Date().toISOString(),
            notes: pending.notes,
        });

        if (insertErr) {
            await editMessageText(chatId, messageId, '\u274c L\u1ed7i t\u1ea1o \u0111\u01a1n: ' + insertErr.message);
            return;
        }

        // Cap nhat pending status
        await supabase.from('pending_orders').update({ status: 'confirmed' }).eq('id', pendingId);

        // Cap nhat DM
        await editMessageText(chatId, messageId, [
            '\u2705 \u0110\u01a1n h\u00e0ng \u0111\u00e3 x\u00e1c nh\u1eadn!',
            '',
            '\ud83d\udce7 ' + pending.email,
            '\ud83d\udce6 ' + pending.package_name + (pending.vip_name ? ' + ' + pending.vip_name.toUpperCase() : '') + ' - ' + fmt(pending.total_price) + ' VN\u0110',
            '\ud83d\udc64 \u0110\u1ea1i l\u00fd: ' + agent.name,
            '\ud83d\udcb0 Th\u1ef1c thu: ' + fmt(actualRevenue) + ' VN\u0110',
        ].join('\n'));

        // Thong bao group
        await sendTelegram(pending.group_chat_id, [
            '\u2705 \u0110\u01a1n h\u00e0ng \u0111\u00e3 \u0111\u01b0\u1ee3c x\u00e1c nh\u1eadn!',
            '',
            '\ud83d\udce7 Email: ' + pending.email,
            '\ud83d\udce6 G\u00f3i: ' + pending.package_name + (pending.vip_name ? ' + ' + pending.vip_name.toUpperCase() : '') + ' - ' + fmt(pending.total_price) + ' VN\u0110',
            '\ud83d\udc64 \u0110\u1ea1i l\u00fd: ' + agent.name,
        ].join('\n'), { reply_to_message_id: pending.group_message_id });
    }

    // ---- EDIT: show edit options ----
    else if (data.startsWith('edit:')) {
        const pendingId = parseInt(data.split(':')[1]);
        const keyboard = {
            inline_keyboard: [
                [{ text: '\ud83d\udce7 S\u1eeda Email', callback_data: 'edit_email:' + pendingId }],
                [{ text: '\ud83d\udce6 S\u1eeda G\u00f3i', callback_data: 'edit_pkg:' + pendingId }],
                [{ text: '\u2b05\ufe0f Quay l\u1ea1i', callback_data: 'back:' + pendingId }],
            ],
        };
        const { data: pending } = await supabase.from('pending_orders').select('*').eq('id', pendingId).single();
        if (!pending) return;
        const text = buildPendingMessage(pending, '\u270f\ufe0f Ch\u1ec9nh s\u1eeda \u0111\u01a1n h\u00e0ng') + '\n\n\ud83d\udc47 Ch\u1ecdn m\u1ee5c c\u1ea7n s\u1eeda:';
        await editMessageText(chatId, messageId, text, keyboard);
    }

    // ---- EDIT EMAIL: ask owner to type new email ----
    else if (data.startsWith('edit_email:')) {
        const pendingId = parseInt(data.split(':')[1]);
        await supabase.from('pending_orders').update({ edit_state: 'waiting_email' }).eq('id', pendingId);
        const { data: pending } = await supabase.from('pending_orders').select('*').eq('id', pendingId).single();
        if (!pending) return;
        const text = buildPendingMessage(pending, '\u270f\ufe0f Ch\u1ec9nh s\u1eeda \u0111\u01a1n h\u00e0ng') + '\n\n\ud83d\udce7 Vui l\u00f2ng nh\u1eadp email m\u1edbi:';
        await editMessageText(chatId, messageId, text);
    }

    // ---- EDIT PKG: show package selection ----
    else if (data.startsWith('edit_pkg:')) {
        const pendingId = parseInt(data.split(':')[1]);
        const { data: pkgs } = await supabase.from('packages').select('*').order('id');

        const buttons = (pkgs || []).map((pkg: any) => ([
            { text: pkg.name + ' - ' + fmt(pkg.price) + '\u0111', callback_data: 'pkg:' + pendingId + ':' + pkg.id }
        ]));
        buttons.push([{ text: '\u2b05\ufe0f Quay l\u1ea1i', callback_data: 'edit:' + pendingId }]);

        const { data: pending } = await supabase.from('pending_orders').select('*').eq('id', pendingId).single();
        if (!pending) return;
        const text = buildPendingMessage(pending, '\u270f\ufe0f Ch\u1ec9nh s\u1eeda \u0111\u01a1n h\u00e0ng') + '\n\n\ud83d\udce6 Ch\u1ecdn g\u00f3i m\u1edbi:';
        await editMessageText(chatId, messageId, text, { inline_keyboard: buttons });
    }

    // ---- PKG: select new package ----
    else if (data.startsWith('pkg:')) {
        const parts = data.split(':');
        const pendingId = parseInt(parts[1]);
        const pkgId = parseInt(parts[2]);

        // Lay package info tu DB
        const { data: pkg } = await supabase.from('packages').select('*').eq('id', pkgId).single();
        if (!pkg) return;

        // Lay pending de giu VIP
        const { data: currentPending } = await supabase.from('pending_orders').select('vip_price, vip_name').eq('id', pendingId).single();
        const vipPrice = currentPending?.vip_price || 0;
        const newTotal = pkg.price + vipPrice;

        // Cap nhat pending order
        await supabase.from('pending_orders').update({
            package_id: pkgId,
            package_name: pkg.name,
            total_price: newTotal,
            notes: currentPending?.vip_name
                ? ('G\u00f3i ch\u00ednh: ' + pkg.name + ' + ' + currentPending.vip_name.toUpperCase())
                : ('G\u00f3i ch\u00ednh: ' + pkg.name),
        }).eq('id', pendingId);

        // Lay updated pending
        const { data: pending } = await supabase.from('pending_orders').select('*').eq('id', pendingId).single();
        if (!pending) return;

        const text = buildPendingMessage(pending, '\u270f\ufe0f \u0110\u00e3 c\u1eadp nh\u1eadt g\u00f3i!');
        await editMessageText(chatId, messageId, text, buildMainKeyboard(pendingId));
    }

    // ---- BACK: return to main menu ----
    else if (data.startsWith('back:')) {
        const pendingId = parseInt(data.split(':')[1]);
        const { data: pending } = await supabase.from('pending_orders').select('*').eq('id', pendingId).single();
        if (!pending) return;

        const text = buildPendingMessage(pending);
        await editMessageText(chatId, messageId, text, buildMainKeyboard(pendingId));
    }

    // ---- CANCEL: cancel order ----
    else if (data.startsWith('cancel:')) {
        const pendingId = parseInt(data.split(':')[1]);
        await supabase.from('pending_orders').update({ status: 'cancelled' }).eq('id', pendingId);
        await editMessageText(chatId, messageId, '\u274c \u0110\u01a1n h\u00e0ng \u0111\u00e3 b\u1ecb hu\u1ef7.');
    }
}

// =============================================
// OWNER DM TEXT INPUT (for edit email)
// =============================================

async function handleOwnerInput(message: any): Promise<boolean> {
    const supabase = getSupabase();
    const text = message.text.trim();

    // Check co pending order nao dang cho nhap email khong
    const { data: pending } = await supabase
        .from('pending_orders')
        .select('*')
        .eq('status', 'pending')
        .eq('edit_state', 'waiting_email')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!pending) return false;

    // Validate email
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (!emailMatch) {
        await sendTelegram(OWNER_ID, '\u274c Email kh\u00f4ng h\u1ee3p l\u1ec7. Vui l\u00f2ng nh\u1eadp l\u1ea1i (v\u00ed d\u1ee5: tenkhach@gmail.com):');
        return true;
    }

    // Cap nhat email
    await supabase.from('pending_orders').update({
        email: emailMatch[0],
        edit_state: null,
    }).eq('id', pending.id);

    // Lay updated pending
    const { data: updated } = await supabase.from('pending_orders').select('*').eq('id', pending.id).single();
    if (!updated) return true;

    const dmText = buildPendingMessage(updated, '\u270f\ufe0f \u0110\u00e3 c\u1eadp nh\u1eadt email!');
    await sendTelegramInline(OWNER_ID, dmText, buildMainKeyboard(pending.id));

    return true;
}

// =============================================
// COMMAND HANDLER
// =============================================

async function handleCommand(message: any, text: string, chatId: number, chatType: string, userId: number, res: any) {
    const supabase = getSupabase();
    const isAdmin = userId ? await checkAdmin(chatId, userId, chatType) : false;

    // === /name username - Gan nick Telegram vao dai ly (phai reply tin nhan cua nguoi can gan) ===
    if (text.startsWith('/name ') && isAdmin) {
        const username = text.replace('/name ', '').trim().toLowerCase();

        // Phai reply vao tin nhan cua nguoi can gan
        const repliedMsg = message.reply_to_message;
        if (!repliedMsg || !repliedMsg.from) {
            await sendTelegram(chatId, '❌ Vui lòng reply vào tin nhắn của đại lý cần gán, rồi gõ /name username');
            return res.status(200).json({ ok: true });
        }

        const telegramUserId = repliedMsg.from.id;
        const telegramName = (repliedMsg.from.first_name || '') + (repliedMsg.from.last_name ? ' ' + repliedMsg.from.last_name : '');

        // Tim dai ly theo username
        const { data: agent, error: agentErr } = await supabase
            .from('users').select('*').eq('username', username).eq('role', 'AGENT').single();

        if (agentErr || !agent) {
            await sendTelegram(chatId, '❌ Không tìm thấy đại lý "' + username + '".');
            return res.status(200).json({ ok: true });
        }

        // UPSERT vao bang mapping (neu nick nay da duoc gan roi thi cap nhat lai)
        await supabase
            .from('agent_telegram_mappings')
            .upsert({ telegram_user_id: telegramUserId, agent_id: agent.id }, { onConflict: 'telegram_user_id' });

        await sendTelegram(chatId, [
            '✅ Đã gán thành công!',
            '',
            '👤 Telegram: ' + telegramName + ' (ID: ' + telegramUserId + ')',
            '🏢 Đại lý: ' + agent.name + ' (' + username + ')',
            '',
            'Từ giờ, đơn hàng từ tài khoản này sẽ tự gắn vào đại lý ' + agent.name + ' không cần chọn lại!',
        ].join('\n'));
        return res.status(200).json({ ok: true });
    }

    // === /gender username nam/nu - Khai bao gioi tinh dai ly (nhan tin rieng voi bot) ===
    if (text.startsWith('/gender ') && chatType === 'private' && userId === OWNER_ID) {
        const parts = text.replace('/gender ', '').trim().split(/\s+/);
        if (parts.length < 2) {
            await sendTelegram(chatId, [
                '\u274c C\u00fa ph\u00e1p: /gender username nam|nu',
                'V\u00ed d\u1ee5:',
                '/gender thuytien nu',
                '/gender longntk nam',
            ].join('\n'));
            return res.status(200).json({ ok: true });
        }
        const gUsername = parts[0].toLowerCase();
        const gValue = parts[1].toLowerCase();
        const genderMap: Record<string, string> = {
            'nam': 'male', 'male': 'male', 'anh': 'male',
            'nu': 'female', 'n\u1eef': 'female', 'female': 'female', 'chi': 'female', 'ch\u1ecb': 'female',
        };
        const genderStored = genderMap[gValue];
        if (!genderStored) {
            await sendTelegram(chatId, '\u274c Gi\u00e1 tr\u1ecb kh\u00f4ng h\u1ee3p l\u1ec7! D\u00f9ng: nam | nu');
            return res.status(200).json({ ok: true });
        }
        const { data: agentG, error: agentGErr } = await supabase
            .from('users').select('id, name').eq('username', gUsername).single();
        if (agentGErr || !agentG) {
            await sendTelegram(chatId, '\u274c Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u1ea1i l\u00fd "' + gUsername + '".');
            return res.status(200).json({ ok: true });
        }
        await supabase.from('users').update({ gender: genderStored }).eq('id', agentG.id);
        const gLabel = genderStored === 'female' ? '\u2640\ufe0f N\u1eef (Ch\u1ecb)' : '\u2642\ufe0f Nam (Anh)';
        await sendTelegram(chatId, [
            '\u2705 \u0110\u00e3 c\u1eadp nh\u1eadt gi\u1edbi t\u00ednh!',
            '',
            '\ud83c\udfe2 \u0110\u1ea1i l\u00fd: ' + agentG.name + ' (' + gUsername + ')',
            '\ud83d\udc64 Gi\u1edbi t\u00ednh: ' + gLabel,
            '',
            'T\u1eeb gi\u1edd bot s\u1ebd g\u1ecdi l\u00e0 "' + (genderStored === 'female' ? 'Ch\u1ecb' : 'Anh') + ' ' + agentG.name.split(' ').pop() + '" khi nh\u1eadn \u0111\u01a1n!',
        ].join('\n'));
        return res.status(200).json({ ok: true });
    }

    // === /themdon (admin them don nhanh) ===
    if (text.startsWith('/themdon ') && isAdmin) {
        const content = text.replace('/themdon ', '').trim();
        const words = content.split(/\s+/);
        const username = words[words.length - 1].toLowerCase();
        const orderText = words.slice(0, words.length - 1).join(' ');

        const order = parseOrder(orderText);
        if (!order || !order.packageId) {
            await sendTelegram(chatId, '\u274c Kh\u00f4ng \u0111\u1ecdc \u0111\u01b0\u1ee3c \u0111\u01a1n. C\u00fa ph\u00e1p:\n/themdon email@gmail.com 6 th\u00e1ng + vip 1 th\u00e1ng thuytien');
            return res.status(200).json({ ok: true });
        }

        const { data: agent, error: agentErr } = await supabase
            .from('users').select('*').eq('username', username).single();

        if (agentErr || !agent) {
            await sendTelegram(chatId, '\u274c Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u1ea1i l\u00fd "' + username + '".');
            return res.status(200).json({ ok: true });
        }

        // Check trung
        const isDuplicate = await checkDuplicateOrder(supabase, order.email, order.packageId);
        if (isDuplicate) {
            await sendTelegram(chatId, '\u26a0\ufe0f Email ' + order.email + ' v\u1edbi g\u00f3i "' + order.packageName + '" \u0111\u00e3 c\u00f3 \u0111\u01a1n h\u00f4m nay r\u1ed3i! Kh\u00f4ng th\u1ec3 th\u00eam tr\u00f9ng.');
            return res.status(200).json({ ok: true });
        }

        const discount = agent.discountPercentage || 0;
        const actualRevenue = Math.round(order.totalPrice * (1 - discount / 100));

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
            await sendTelegram(chatId, '\u274c L\u1ed7i: ' + insertErr.message);
            return res.status(200).json({ ok: true });
        }

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

    // === /baocao (CHI ADMIN) ===
    if (text.startsWith('/baocao') || text.startsWith('/report')) {
        if (!isAdmin) {
            await sendTelegram(chatId, '\u274c Ch\u1ec9 Admin m\u1edbi \u0111\u01b0\u1ee3c xem b\u00e1o c\u00e1o.');
            return res.status(200).json({ ok: true });
        }
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

        await sendTelegram(chatId, getReport(dateDisplay, orders || []));
        return res.status(200).json({ ok: true });
    }

    // === /daily - Danh sach dai ly (CHI ADMIN) ===
    if (text.startsWith('/daily') || text.startsWith('/danhsach')) {
        if (!isAdmin) {
            return res.status(200).json({ ok: true });
        }
        const { data: agents } = await supabase
            .from('users')
            .select('name, username, discountPercentage, isActive')
            .eq('role', 'AGENT')
            .order('name');

        if (!agents || agents.length === 0) {
            await sendTelegram(chatId, 'Ch\u01b0a c\u00f3 \u0111\u1ea1i l\u00fd n\u00e0o.');
            return res.status(200).json({ ok: true });
        }

        const lines = agents.map((a: any, i: number) => {
            const status = a.isActive ? '\u2705' : '\u274c';
            return (i + 1) + '. ' + status + ' ' + a.name + ' - Username: ' + a.username + ' (CK ' + (a.discountPercentage || 0) + '%)';
        });

        await sendTelegram(chatId, [
            '\ud83d\udc65 Danh s\u00e1ch \u0111\u1ea1i l\u00fd (' + agents.length + '):',
            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
            ...lines,
        ].join('\n'));
        return res.status(200).json({ ok: true });
    }

    // === /help hoac /start ===
    if (text.startsWith('/help') || text.startsWith('/start')) {
        if (!isAdmin) {
            return res.status(200).json({ ok: true });
        }
        await sendTelegram(chatId, [
            '\ud83e\udd16 Bot Qu\u1ea3n l\u00fd \u0110\u01a1n h\u00e0ng Tifo',
            '',
            '\ud83d\udce8 T\u1ef1 \u0111\u1ed9ng:',
            '\u0110\u1ea1i l\u00fd g\u1eedi email + g\u00f3i v\u00e0o group \u2192 Bot t\u1ef1 nh\u1eadn \u0111\u01a1n \u2192 G\u1eedi DM cho s\u1ebfp x\u00e1c nh\u1eadn',
            '',
            '\ud83d\udcdd Th\u00eam \u0111\u01a1n nhanh:',
            '/themdon email@gmail.com 6 th\u00e1ng + vip 1 th\u00e1ng thuytien',
            '',
            '\ud83d\udcca B\u00e1o c\u00e1o:',
            '/baocao - Doanh thu h\u00f4m nay',
            '/baocao 24/02/2026 - Doanh thu ng\u00e0y b\u1ea5t k\u1ef3',
            '',
            '\ud83d\udc65 Qu\u1ea3n l\u00fd:',
            '/daily - Danh s\u00e1ch \u0111\u1ea1i l\u00fd',
            '',
            '\ud83d\udce6 G\u00f3i h\u1ed7 tr\u1ee3:',
            '1 th\u00e1ng (400k) | 3 th\u00e1ng (800k) | 6 th\u00e1ng (1.2tr) | 1 n\u0103m (1.2tr)',
            'VIP 1 th\u00e1ng (50k) | VIP 3 th\u00e1ng (150k) | VIP 6 th\u00e1ng (300k)',
        ].join('\n'));
        return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
}
