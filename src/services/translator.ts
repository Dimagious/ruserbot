import OpenAI from "openai";
import { env } from "../config.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function ruToSrLatn(text: string): Promise<string> {
    const res = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        temperature: 0.1,
        messages: [
            {
                role: "system",
                content:
                    "Ты профессиональный переводчик. Переводи входной текст с русского на сербский язык латиницей (sr-Latn). " +
                    "Сохраняй смысл и тон. Используй č, ć, š, ž, đ. " +
                    "Не добавляй комментариев и пояснений — возвращай только перевод. " +
                    "Ссылки/код оставляй как есть, эмодзи сохраняй."
            },
            { role: "user", content: text }
        ]
    });

    const out = res.choices[0]?.message?.content?.trim();
    if (!out) throw new Error("Empty translation");
    return out;
}
