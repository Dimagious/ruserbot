import { z } from "zod";

const Env = z.object({
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    ALLOWED_USER_IDS: z.string().optional()
});

export const env = Env.parse(process.env);

export const allowedIds = new Set(
    (env.ALLOWED_USER_IDS ?? "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
);
