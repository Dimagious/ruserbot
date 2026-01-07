import "dotenv/config";
import { Bot, InlineKeyboard, session, Context, type SessionFlavor } from "grammy";
import { env, allowedIds } from "./config.js";
import { translate, type TargetLang } from "./services/translator.js";
import { logger } from "./logger.js";

// ---- session typings
type MySession = { 
    mode: TargetLang;
    lastOriginalText?: string; // для кнопки "Перевести ещё раз"
    lastTranslatedText?: string; // для кнопки "Копировать"
};
type MyContext = Context & SessionFlavor<MySession>;

// ---- bot
const bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);

// session middleware (default in-memory)
bot.use(session({ initial: (): MySession => ({ mode: "sr" }) }));

// helper: build inline keyboard with active mark
function buildModeKeyboard(current: TargetLang) {
    const kb = new InlineKeyboard();
    const sr = current === "sr" ? "🇷🇸 Сербский ✅" : "🇷🇸 Сербский";
    const en = current === "en" ? "🇬🇧 Английский ✅" : "🇬🇧 Английский";
    kb.text(sr, "mode:sr");
    kb.text(en, "mode:en");
    return kb;
}

// helper: build keyboard for translation result
function buildTranslationKeyboard() {
    const kb = new InlineKeyboard();
    kb.text("📋 Копировать", "copy");
    kb.text("🔄 Перевести ещё раз", "retranslate_menu");
    return kb;
}

// helper: build keyboard for retranslate with language selection
function buildRetranslateKeyboard(currentMode: TargetLang) {
    const kb = new InlineKeyboard();
    const sr = currentMode === "sr" ? "🇷🇸 Сербский ✅" : "🇷🇸 Сербский";
    const en = currentMode === "en" ? "🇬🇧 Английский ✅" : "🇬🇧 Английский";
    kb.text(sr, "retranslate:sr");
    kb.text(en, "retranslate:en");
    kb.row();
    kb.text("✏️ Ввести новый текст", "retranslate:new");
    return kb;
}

// commands
bot.command("start", async (ctx) => {
    await ctx.reply(
        `Привет! Я перевожу с русского.\nВыбери режим перевода или используй /sr и /en.\nТекущий: ${ctx.session.mode === "sr" ? "Сербский" : "Английский"}`,
        { reply_markup: buildModeKeyboard(ctx.session.mode) }
    );
});

bot.command("mode", async (ctx) => {
    await ctx.reply(
        `Текущий режим: ${ctx.session.mode === "sr" ? "Сербский" : "Английский"}\n(быстрые команды: /sr /en)`,
        { reply_markup: buildModeKeyboard(ctx.session.mode) }
    );
});

bot.command("sr", async (ctx) => {
    ctx.session.mode = "sr";
    await ctx.reply("Режим: Сербский", { reply_markup: buildModeKeyboard("sr") });
});

bot.command("en", async (ctx) => {
    ctx.session.mode = "en";
    await ctx.reply("Режим: Английский", { reply_markup: buildModeKeyboard("en") });
});

bot.command("help", async (ctx) => {
    const helpText = `
📖 *Справка по командам*

*Основные команды:*
/start - Начать работу с ботом
/help - Показать эту справку
/mode - Показать текущий режим перевода

*Переключение режимов:*
/sr - Переключить на сербский язык
/en - Переключить на английский язык

*Как использовать:*
1. Выберите режим перевода (/sr или /en)
2. Отправьте текст на русском языке
3. Получите перевод с кнопками для удобной работы

*Подсказки:*
• Используйте кнопки под переводом для копирования или повторного перевода
• Режим перевода сохраняется между сообщениями
• Бот переводит только текстовые сообщения
    `.trim();
    
    await ctx.reply(helpText, { 
        parse_mode: "Markdown",
        reply_markup: buildModeKeyboard(ctx.session.mode)
    });
});

// handle mode switch
bot.callbackQuery(/^mode:(sr|en)$/, async (ctx) => {
    const m = (ctx.match[1] as TargetLang);
    ctx.session.mode = m;
    // update buttons and toast
    await ctx.editMessageReplyMarkup({ reply_markup: buildModeKeyboard(m) }).catch(() => { });
    await ctx.answerCallbackQuery({ text: m === "sr" ? "Режим: Сербский" : "Режим: Английский" });
});

// handle copy button
bot.callbackQuery("copy", async (ctx) => {
    try {
        const translatedText = ctx.session.lastTranslatedText;
        if (!translatedText) {
            await ctx.answerCallbackQuery({ text: "❌ Нет текста для копирования" });
            return;
        }
        await ctx.answerCallbackQuery({ text: "📋 Текст скопирован" });
        await ctx.reply(`\`\`\`\n${translatedText}\n\`\`\``, { parse_mode: "Markdown" });
    } catch (e) {
        logger.error(e);
        await ctx.answerCallbackQuery({ text: "❌ Ошибка при копировании" });
    }
});

// handle retranslate menu button - show language selection
bot.callbackQuery("retranslate_menu", async (ctx) => {
    const originalText = ctx.session.lastOriginalText;
    if (!originalText) {
        await ctx.answerCallbackQuery({ text: "❌ Нет текста для перевода" });
        return;
    }
    
    const currentMode = ctx.session.mode ?? "sr";
    await ctx.answerCallbackQuery({ text: "Выберите язык для перевода" });
    await ctx.reply(
        `🔄 Перевести ещё раз\n\n` +
        `Последний текст: "${originalText.substring(0, 50)}${originalText.length > 50 ? '...' : ''}"\n\n` +
        `Выберите язык или введите новый текст:`,
        { reply_markup: buildRetranslateKeyboard(currentMode) }
    );
});

// handle retranslate with selected language
bot.callbackQuery(/^retranslate:(sr|en)$/, async (ctx) => {
    try {
        const originalText = ctx.session.lastOriginalText;
        if (!originalText) {
            await ctx.answerCallbackQuery({ text: "❌ Нет текста для перевода" });
            return;
        }
        
        const target = ctx.match[1] as TargetLang;
        ctx.session.mode = target; // обновляем режим
        
        await ctx.answerCallbackQuery({ text: "🔄 Перевожу..." });
        if (ctx.chat) {
            await ctx.api.sendChatAction(ctx.chat.id, "typing");
        }
        
        const translated = await translate(originalText, target);
        // сохраняем тексты в сессии для кнопок
        ctx.session.lastOriginalText = originalText;
        ctx.session.lastTranslatedText = translated;
        await ctx.reply(translated, { 
            reply_markup: buildTranslationKeyboard()
        });
    } catch (e: any) {
        logger.error(e);
        await ctx.answerCallbackQuery({ text: "❌ Ошибка при переводе" });
        if (e?.code === "unsupported_country_region_territory" || e?.status === 403) {
            await ctx.reply("⚠️ Перевод временно недоступен (ограничения провайдера по региону).");
        } else {
            await ctx.reply("⚠️ Не удалось перевести. Попробуйте ещё раз.");
        }
    }
});

// handle "enter new text" button
bot.callbackQuery("retranslate:new", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Введите новый текст для перевода" });
    await ctx.reply(
        `✏️ Введите новый текст на русском языке для перевода.\n\n` +
        `Текущий режим: ${ctx.session.mode === "sr" ? "Сербский" : "Английский"}\n` +
        `Используйте /sr или /en для смены режима.`,
        { reply_markup: buildModeKeyboard(ctx.session.mode) }
    );
});

// main translation
bot.on("message:text", async (ctx) => {
    if (allowedIds.size && !allowedIds.has(String(ctx.from?.id))) {
        return ctx.reply("⛔️ Доступ ограничён.");
    }
    const text = ctx.message.text.trim();
    if (!text) return;

    await ctx.api.sendChatAction(ctx.chat.id, "typing");

    try {
        const target = ctx.session.mode ?? "sr";
        const translated = await translate(text, target);
        // сохраняем тексты в сессии для кнопок
        ctx.session.lastOriginalText = text;
        ctx.session.lastTranslatedText = translated;
        await ctx.reply(translated, { 
            reply_markup: buildTranslationKeyboard()
        });
    } catch (e: any) {
        // дружелюбные сообщения об ошибках
        if (e?.code === "unsupported_country_region_territory" || e?.status === 403) {
            await ctx.reply("⚠️ Перевод временно недоступен (ограничения провайдера по региону).");
        } else {
            await ctx.reply("⚠️ Не удалось перевести. Попробуйте ещё раз.");
        }
        logger.error(e);
    }
});

// long-polling
bot.start();
logger.info("Bot started (long-polling).");
