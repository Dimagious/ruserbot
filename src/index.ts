import "dotenv/config";
import { Bot, InlineKeyboard, session, Context, type SessionFlavor } from "grammy";
import { env, allowedIds } from "./config.js";
import { translate, type TargetLang } from "./services/translator.js";
import { logger } from "./logger.js";

// ---- session typings
type MySession = { mode: TargetLang };
type MyContext = Context & SessionFlavor<MySession>;

// ---- bot
const bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);

// session middleware (default in-memory)
bot.use(session({ initial: (): MySession => ({ mode: "sr" }) }));

// helper: build inline keyboard with active mark
function buildModeKeyboard(current: TargetLang) {
    const kb = new InlineKeyboard();
    kb.text(current === "sr" ? "Сербский ✅" : "Сербский", "mode:sr");
    kb.text(current === "en" ? "Английский ✅" : "Английский", "mode:en");
    return kb;
}

// commands
bot.command("start", async (ctx) => {
    await ctx.reply(
        `Привет! Я перевожу с русского.\nВыбери режим перевода:\nТекущий: ${ctx.session.mode === "sr" ? "Сербский" : "Английский"}`,
        { reply_markup: buildModeKeyboard(ctx.session.mode) }
    );
});

bot.command("mode", async (ctx) => {
    await ctx.reply(
        `Текущий режим: ${ctx.session.mode === "sr" ? "Сербский" : "Английский"}`,
        { reply_markup: buildModeKeyboard(ctx.session.mode) }
    );
});

// handle mode switch
bot.callbackQuery(/^mode:(sr|en)$/, async (ctx) => {
    const m = (ctx.match[1] as TargetLang);
    ctx.session.mode = m;
    // update buttons and toast
    await ctx.editMessageReplyMarkup({ reply_markup: buildModeKeyboard(m) }).catch(() => { });
    await ctx.answerCallbackQuery({ text: m === "sr" ? "Режим: Сербский" : "Режим: Английский" });
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
        await ctx.reply(translated);
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
