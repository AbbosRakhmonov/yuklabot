import { IMyContext } from "@/interfaces/IMyContext";
import { config } from "@/config/config";
import logger from "@/config/logger";
import { activeTasks } from "@/utils/activeTasks";
import User from "@/models/User";
import Download from "@/models/Download";
import { myDayjs } from "@/utils/myDayjs";
import os from "os";

export const adminCommand = async (ctx: IMyContext): Promise<void> => {
  const userId = ctx.from?.id;

  // Only allow configured admin
  if (!userId || (config.admin.chatId && userId !== config.admin.chatId)) {
    await ctx.reply("⛔ Kechirasiz, ushbu buyruq faqat bot admini uchun mo'ljallangan.");
    return;
  }

  try {
    const todayStart = myDayjs().startOf("day").toDate();
    const [totalUsers, todayActiveUsers, todayDownloads] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActiveAt: { $gte: todayStart } }),
      Download.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);

    const taskSummary = activeTasks.getSummary();
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const ramUsedMB = (mem.rss / (1024 * 1024)).toFixed(0);
    const ramTotalMB = (totalMem / (1024 * 1024)).toFixed(0);

    const activeList = activeTasks.getActiveTasks();
    let activeTasksText = "";
    if (activeList.length > 0) {
      activeTasksText = "\n\n<b>⚡ Hozirgi jarayonlar:</b>\n" +
        activeList
          .slice(0, 5)
          .map(
            (t) =>
              `• <b>${t.platform.toUpperCase()}</b>: ${t.title || "Yuklanmoqda..."} (${t.progress?.percent || 0}% - ${t.stage})` +
              (t.isStuck ? " ⚠️ <i>Qotgan!</i>" : "")
          )
          .join("\n");
      if (activeList.length > 5) {
        activeTasksText += `\n<i>...va yana ${activeList.length - 5} ta jarayon</i>`;
      }
    }

    const message =
      `🎛 <b>YuklaBot Monitoring & Boshqaruv</b>\n\n` +
      `👥 <b>Foydalanuvchilar:</b> ${totalUsers.toLocaleString()} ta (Bugun faol: ${todayActiveUsers})\n` +
      `📥 <b>Bugungi yuklamalar:</b> ${todayDownloads.toLocaleString()} ta\n` +
      `⚡ <b>Hozir faol:</b> ${taskSummary.activeCount} ta` +
      (taskSummary.stuckCount > 0 ? ` (⚠️ ${taskSummary.stuckCount} ta qotgan)` : "") +
      `\n💾 <b>RAM:</b> ${ramUsedMB} MB / ${ramTotalMB} MB\n` +
      `⏱ <b>Uptime:</b> ${Math.floor(process.uptime() / 60)} daqiqa` +
      activeTasksText +
      `\n\n🌐 <b>Web Dashboard:</b> <code>http://&lt;server-ip&gt;:${config.serverPort}/admin</code>`;

    await ctx.reply(message, {
      parse_mode: "HTML",
    });
  } catch (error) {
    logger.error("Admin command error", { error });
    await ctx.reply("Admin statistikasini olishda xatolik yuz berdi.");
  }
};
