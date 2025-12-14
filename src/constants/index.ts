export const MESSAGES = {
  ERROR: {
    USER_NOT_FOUND: "Foydalanuvchi topilmadi. Iltimos, qayta urining.",
    GENERIC: "Xatolik yuz berdi. Iltimos, qayta urining.",
    DATABASE: "Ma'lumotlar bazasida xatolik yuz berdi. Iltimos, qayta urining.",
    INVALID_URL: "Havola noto‘g‘ri. Iltimos, qayta urining.",
    UNSUPPORTED_PLATFORM: "Bunday platforma qo‘llab-quvvatlanmaydi.",
    INVALID_COMMAND: "Buyruq noto‘g‘ri. Iltimos, qayta urining.",
    INVALID_MESSAGE:
      "Menga havola yuborishingiz kerak. Iltimos, qayta urining.",
    NO_SESSION: "Sessiya topilmadi. Iltimos, qayta urining.",
  },
  INFO: {
    ANALYZING: "Analiz qilinmoqda...",
    VIDEO_QUALITY: "Video sifatini tanlang, past sifatdan yuqori sifatga qarab o'sib boradi",
    DOWNLOADING_VIDEO: "Video yuklanmoqda...",
  },
  SUCCESS: {
    OPERATION_COMPLETE: "Amal muvaffaqiyatli amalga oshirildi.",
  },
} as const;

export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB