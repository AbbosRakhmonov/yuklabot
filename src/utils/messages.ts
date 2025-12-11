import { MESSAGES } from "@/constants";

// Dynamic message functions
export const Messages = {
  /**
   * Welcome message with user's name
   */
  welcome: (firstName: string): string => {
    return `Salom, ${firstName}! 👋\n\nYuklabBot ga xush kelibsiz! 🔥\n\nSevimli ijtimoiy tarmoqlaringizdan kontent yuklashning eng oson yo‘li.\n\n📥 Qo‘llab-quvvatlanadigan xizmatlar:\n\n📸 Instagram – Reels, postlar, storislar\n📘 Facebook – videolar va postlar\n▶️ YouTube – videolar (har xil sifatlarda)\n\n🔗 Link yuboring — hammasini men hal qilaman! ⚡\n\nYordam kerak bo‘lsa: /help 😊`;
  },

  /**
   * Help message
   */
  help: (): string => {
    return "@Abbosbekraxmonov ga murojaat qiling";
  },

  /**
   * Warning message with custom message
   */
  warn: (firstName: string, message?: string): string => {
    const base = `Dear, ${firstName}! 🚨`;
    return message ? `${base}\n\n${message}` : base;
  },

  /**
   * Error message with optional details
   */
  error: (customMessage?: string): string => {
    return customMessage || MESSAGES.ERROR.GENERIC;
  },
};
