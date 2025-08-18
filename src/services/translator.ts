import OpenAI from "openai";
import { env } from "../config.js";

export type TargetLang = "sr" | "en";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

function systemPrompt(target: TargetLang) {
    if (target === "sr") {
        return (
            "Ты профессиональный переводчик. Переводи входной текст с русского на сербский язык " +
            "латиницей (sr-Latn). Сохраняй смысл, тон и вежливость. Используй диакритики: č, ć, š, ž, đ. " +
            "Не добавляй комментариев и пояснений — возвращай только перевод. " +
            "Ссылки/код оставляй как есть, эмодзи сохраняй."
        );
    }
    // en
    return (
        "You are a professional translator. Translate the input from Russian to **English**. " +
        "Preserve meaning, tone and politeness. Do not add comments or explanations — " +
        "return the translation only. Keep links/code as is; keep emojis."
    );
}

export async function translate(text: string, target: TargetLang): Promise<string> {
    const res = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        temperature: 0.1,
        messages: [
            { role: "system", content: systemPrompt(target) },
            { role: "user", content: text }
        ]
    });

    const out = res.choices[0]?.message?.content?.trim();
    if (!out) throw new Error("Empty translation");
    return out;
}
