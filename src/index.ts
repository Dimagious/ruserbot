import "dotenv/config";
import { Bot } from "grammy";
import { env, allowedIds } from "./config.js";
import { ruToSrLatn } from "./services/translator.js";
import { logger } from "./logger.js";

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.on("message:text", async (ctx) => {
    if (allowedIds.size && !allowedIds.has(String(ctx.from?.id))) {
        return ctx.reply("⛔️ Доступ ограничён.");
    }
    const text = ctx.message.text.trim();
    if (!text) return;

    await ctx.api.sendChatAction(ctx.chat.id, "typing");
    try {
        const translated = await ruToSrLatn(text);
        await ctx.reply(translated);
    } catch (e) {
        logger.error(e);
        await ctx.reply("⚠️ Не удалось перевести. Попробуйте ещё раз.");
    }
});


// Вариант для простого запуска: long-polling
bot.start();
logger.info("Bot started (long-polling).");
