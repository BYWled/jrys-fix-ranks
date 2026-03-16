var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");
var import_path = require("path");
var import_fs = require("fs");
var jrysFix = __toESM(require("koishi-plugin-jrys-fix"));
var DEFAULT_LEVEL = {
  level: 0,
  levelExp: 0,
  levelName: "无等级",
  levelColor: "#666666"
};
var TEMPLATE_CANDIDATES = [
  (0, import_path.resolve)(process.cwd(), "src", "templates", "rank-card.html"),
  (0, import_path.resolve)(process.cwd(), "lib", "templates", "rank-card.html"),
  (0, import_path.resolve)(process.cwd(), "dist", "templates", "rank-card.html"),
  (0, import_path.resolve)(process.cwd(), "external", "jrys-fix-ranks", "src", "templates", "rank-card.html"),
  (0, import_path.resolve)(process.cwd(), "external", "jrys-fix-ranks", "lib", "templates", "rank-card.html"),
  (0, import_path.resolve)(process.cwd(), "external", "jrys-fix-ranks", "dist", "templates", "rank-card.html"),
  (0, import_path.resolve)(process.cwd(), "node_modules", "koishi-plugin-jrys-fix-ranks", "lib", "templates", "rank-card.html"),
  (0, import_path.resolve)(process.cwd(), "node_modules", "koishi-plugin-jrys-fix-ranks", "dist", "templates", "rank-card.html")
];
async function resolveTemplatePath() {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try {
      await import_fs.promises.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error("未找到 rank-card.html 模板文件");
}
__name(resolveTemplatePath, "resolveTemplatePath");
function getLevelInfo(exp, levels) {
  if (!levels?.length) return DEFAULT_LEVEL;
  const sortedLevels = [...levels].sort((a, b) => b.levelExp - a.levelExp);
  return sortedLevels.find((level) => exp >= level.levelExp) || sortedLevels[sortedLevels.length - 1];
}
__name(getLevelInfo, "getLevelInfo");
function getChannelIdentifier(platform, channelId) {
  const normalizedPlatform = platform.endsWith(":") ? platform : platform + ":";
  return normalizedPlatform + channelId;
}
__name(getChannelIdentifier, "getChannelIdentifier");
async function checkUsernameDatabaseExists(ctx) {
  try {
    await ctx.database.get("username", {}, { limit: 1 });
    return true;
  } catch (error) {
    ctx.logger("jrys-fix-ranks").debug("username数据库不存在，将使用原始用户名显示");
    return false;
  }
}
__name(checkUsernameDatabaseExists, "checkUsernameDatabaseExists");
async function getUserDisplayInfo(ctx, jrysUserId, channelIdentifier) {
  try {
    const usernameRecords = await ctx.database.get("username", {
      userId: jrysUserId
    });
    const channelUser = usernameRecords.find(
      (record) => getChannelIdentifier(record.platform, record.channelId) === channelIdentifier
    );
    if (channelUser) {
      const userRecord = await ctx.database.get("user", channelUser.uid);
      if (userRecord && userRecord.length > 0 && userRecord[0].name) {
        return {
          displayName: userRecord[0].name,
          originalId: jrysUserId,
          username: channelUser.username,
          nickname: userRecord[0].name
        };
      }
      return {
        displayName: channelUser.username,
        originalId: jrysUserId,
        username: channelUser.username
      };
    }
    return {
      displayName: jrysUserId,
      originalId: jrysUserId
    };
  } catch (error) {
    ctx.logger("jrys-fix-ranks").error("获取用户显示信息失败:", error);
    return {
      displayName: jrysUserId,
      originalId: jrysUserId
    };
  }
}
__name(getUserDisplayInfo, "getUserDisplayInfo");
var name = "jrys-fix-ranks";
var inject = {
  required: ["database"],
  optional: ["puppeteer"]
};
var Config = import_koishi.Schema.object({
  limit: import_koishi.Schema.number().description("排行榜显示的最大条目数").default(10).min(1).max(100),
  expCommand: import_koishi.Schema.string().description("经验排行榜命令").default("jrysranks"),
  signCommand: import_koishi.Schema.string().description("签到天数排行榜命令").default("jrysranksign"),
  imageMode: import_koishi.Schema.boolean().description("是否使用图片模式渲染排行榜（需要 puppeteer 服务）").default(true),
  next_ExpDisplay: import_koishi.Schema.boolean().description("是否在排行榜中显示升级所需经验").default(true),
  pre_next_LevelDisplay: import_koishi.Schema.boolean().description("是否在排行榜中显示前后等级信息").default(true),
  borderwidth: import_koishi.Schema.number().description("边框宽度（一般最佳宽度为14）").default(14),
  syncLevelSet: import_koishi.Schema.boolean().description("自动从 jrys-fix 插件同步等级配置（启用后将忽略下方 levelSet）").default(true),
  levelSet: import_koishi.Schema.array(import_koishi.Schema.object({
    level: import_koishi.Schema.number().description("等级"),
    levelExp: import_koishi.Schema.number().description("等级最低经验"),
    levelName: import_koishi.Schema.string().description("等级名称"),
    levelColor: import_koishi.Schema.string().description("等级颜色")
  })).description("等级配置列表（与 jrys-fix 中的 levelSet 保持一致）").default([])
});
function apply(ctx) {
  const logger = ctx.logger("jrys-fix-ranks");
  function getLevelConfig() {
    if (ctx.config.syncLevelSet) {
      const scope = ctx.registry.get(jrysFix);
      const synced = scope?.config?.levelSet;
      if (synced?.length > 0) return synced;
      logger.warn("syncLevelSet 已启用，但未能从 jrys-fix 读取到等级配置，回退到本地 levelSet");
    }
    return ctx.config.levelSet || [];
  }
  __name(getLevelConfig, "getLevelConfig");
  function canUseImageMode() {
    return ctx.config.imageMode && !!ctx.puppeteer;
  }
  __name(canUseImageMode, "canUseImageMode");
  async function getRankedUsers(session, sortField) {
    const usernameDbExists = await checkUsernameDatabaseExists(ctx);
    const allUsers = await ctx.database.get("jrys", {}, {
      sort: { [sortField]: "desc" }
    });
    if (!allUsers.length) return null;
    let users = [];
    if (usernameDbExists) {
      const channelIdentifier = getChannelIdentifier(session.platform, session.channelId);
      const channelUsers = [];
      for (const user of allUsers) {
        const displayInfo = await getUserDisplayInfo(ctx, user.name, channelIdentifier);
        if (displayInfo.displayName !== user.name) {
          channelUsers.push({
            ...user,
            displayName: displayInfo.displayName,
            username: displayInfo.username,
            nickname: displayInfo.nickname
          });
        }
      }
      users = channelUsers.slice(0, ctx.config.limit);
      if (!users.length) return [];
    } else {
      users = allUsers.slice(0, ctx.config.limit).map((user) => ({
        ...user,
        displayName: user.name
      }));
    }
    return users;
  }
  __name(getRankedUsers, "getRankedUsers");
  function buildUserLevelData(user) {
    const levelConfig = getLevelConfig();
    if (levelConfig.length === 0) return {};
    const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp);
    const currentLevel = getLevelInfo(user.exp, levelConfig);
    const currentIndex = sortedLevels.findIndex((l) => l.levelExp === currentLevel.levelExp);
    const prevLevel = sortedLevels[currentIndex - 1];
    const nextLevel = sortedLevels[currentIndex + 1];
    let levelProgression = "";
    if (ctx.config.pre_next_LevelDisplay) {
      if (prevLevel) levelProgression += `${prevLevel.levelName} → `;
      levelProgression += `「${currentLevel.levelName}」`;
      if (nextLevel) levelProgression += ` → ${nextLevel.levelName}`;
    }
    return {
      levelName: currentLevel.levelName,
      levelColor: currentLevel.levelColor,
      currentLevelExp: currentLevel.levelExp,
      nextLevelExp: nextLevel?.levelExp ?? null,
      levelProgression: levelProgression || null
    };
  }
  __name(buildUserLevelData, "buildUserLevelData");
  async function renderRankImage(type, users, totalUsers) {
    try {
      const templatePath = await resolveTemplatePath();
      let template = await import_fs.promises.readFile(templatePath, "utf-8");
      const data = {
        type,
        limit: ctx.config.limit,
        channelName: "当前频道",
        totalUsers,
        updateTime: (/* @__PURE__ */ new Date()).toLocaleString("zh-CN"),
        users: users.map((user) => {
          const levelData = buildUserLevelData(user);
          return {
            displayName: user.displayName,
            originalId: user.name,
            username: user.username || null,
            nickname: user.nickname || null,
            value: type === "exp" ? user.exp : user.signCount,
            ...levelData
          };
        })
      };
      template = template.replace("{{DATA}}", JSON.stringify(data));
      const page = await ctx.puppeteer.page();
      try {
        await page.setContent(template);
        const element = await page.$(".card");
        if (!element) throw new Error("找不到 .card 元素");
        const imgBuf = await element.screenshot({ encoding: "binary" });
        return import_koishi.h.image(imgBuf, "image/png");
      } finally {
        await page.close();
      }
    } catch (err) {
      logger.error("renderRankImage 失败:", err);
      return null;
    }
  }
  __name(renderRankImage, "renderRankImage");
  function renderExpText(users) {
    const levelConfig = getLevelConfig();
    const divider = "┏" + "—".repeat(ctx.config.borderwidth) + "┓";
    const midDivider = "┣" + "—".repeat(ctx.config.borderwidth) + "┫";
    const endDivider = "┗" + "—".repeat(ctx.config.borderwidth) + "┛";
    const header = [
      divider,
      `┃  ${users.length ? "🏆" : "📊"} 赛季经验排行榜 TOP.${ctx.config.limit} `,
      midDivider
    ].join("\n");
    const rankings = users.map((user, index) => {
      const position = (index + 1).toString();
      const medal = index < 3 ? ["👑", "⭐", "✧"][index] : "•";
      const expStr = user.exp.toLocaleString();
      let rankText = [];
      let nameLine = `┃ ${medal} ${position}. ${user.displayName}`;
      if (user.nickname && user.username && user.displayName === user.nickname) {
        nameLine += `（${user.username}）`;
      } else if (user.displayName !== user.name) {
        nameLine += `（${user.name}）`;
      }
      rankText.push(nameLine);
      if (levelConfig.length > 0) {
        const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp);
        const currentLevel = getLevelInfo(user.exp, levelConfig);
        const currentIndex = sortedLevels.findIndex((l) => l.levelExp === currentLevel.levelExp);
        const prevLevel = sortedLevels[currentIndex - 1]?.levelName;
        const nextLevel = sortedLevels[currentIndex + 1]?.levelName;
        let levelLine = `┃  ✨`;
        if (ctx.config.next_ExpDisplay) {
          if (sortedLevels[currentIndex + 1]) {
            const nextExp = sortedLevels[currentIndex + 1].levelExp;
            rankText.push(`┃  ⚡${expStr} exp (下一级:${nextExp} exp)`);
          } else {
            rankText.push(`┃  ⚡${expStr} (Max)`);
          }
        } else {
          rankText.push(`┃  ⚡${expStr} exp`);
        }
        if (ctx.config.pre_next_LevelDisplay) {
          if (prevLevel) levelLine += `${prevLevel} ->`;
          levelLine += `「${currentLevel.levelName}」`;
          if (nextLevel) levelLine += `-> ${nextLevel}`;
        } else {
          levelLine += `${currentLevel.levelName}`;
        }
        rankText.push(levelLine);
      } else {
        rankText.push(`┃  ⚡${expStr} exp`);
      }
      return rankText.join("\n");
    }).join("\n\n");
    return [header, rankings, endDivider].join("\n");
  }
  __name(renderExpText, "renderExpText");
  function renderSignText(users) {
    const levelConfig = getLevelConfig();
    const divider = "┏" + "—".repeat(ctx.config.borderwidth) + "┓";
    const midDivider = "┣" + "—".repeat(ctx.config.borderwidth) + "┫";
    const endDivider = "┗" + "—".repeat(ctx.config.borderwidth) + "┛";
    const header = [
      divider,
      `┃  ${users.length ? "🏆" : "📊"} 累计签到排行榜 TOP.${ctx.config.limit} `,
      midDivider
    ].join("\n");
    const rankings = users.map((user, index) => {
      const position = (index + 1).toString();
      const medal = index < 3 ? ["👑", "⭐", "✧"][index] : "•";
      const signStr = user.signCount.toLocaleString();
      let rankText = [];
      let nameLine = `┃ ${medal} ${position}. ${user.displayName}`;
      if (user.nickname && user.username && user.displayName === user.nickname) {
        nameLine += `（${user.username}）`;
      } else if (user.displayName !== user.name) {
        nameLine += `（${user.name}）`;
      }
      rankText.push(nameLine);
      rankText.push(`┃  📅${signStr} 天`);
      if (levelConfig.length > 0) {
        const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp);
        const currentLevel = getLevelInfo(user.exp, levelConfig);
        const currentIndex = sortedLevels.findIndex((l) => l.levelExp === currentLevel.levelExp);
        const prevLevel = sortedLevels[currentIndex - 1]?.levelName;
        const nextLevel = sortedLevels[currentIndex + 1]?.levelName;
        let levelLine = `┃  ✨`;
        if (ctx.config.pre_next_LevelDisplay) {
          if (prevLevel) levelLine += `${prevLevel} ->`;
          levelLine += `「${currentLevel.levelName}」`;
          if (nextLevel) levelLine += `-> ${nextLevel}`;
        } else {
          levelLine += `${currentLevel.levelName}`;
        }
        rankText.push(levelLine);
      }
      return rankText.join("\n");
    }).join("\n\n");
    return [header, rankings, endDivider].join("\n");
  }
  __name(renderSignText, "renderSignText");
  ctx.command(ctx.config.expCommand).action(async ({ session }) => {
    const users = await getRankedUsers(session, "exp");
    if (users === null) return "暂无数据";
    if (users.length === 0) return "当前频道暂无数据";
    if (canUseImageMode()) {
      const totalCount = (await ctx.database.get("jrys", {})).length;
      const img = await renderRankImage("exp", users, totalCount);
      if (img) return img;
    }
    return renderExpText(users);
  });
  ctx.command(ctx.config.signCommand).action(async ({ session }) => {
    const users = await getRankedUsers(session, "signCount");
    if (users === null) return "暂无数据";
    if (users.length === 0) return "当前频道暂无数据";
    if (canUseImageMode()) {
      const img = await renderRankImage("sign", users, (await ctx.database.get("jrys", {})).length);
      if (img) return img;
    }
    return renderSignText(users);
  });
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name
});
