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
  name: () => name
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");
var import_path = require("path");
var import_fs = require("fs");
var yaml = __toESM(require("yaml"));
var DEFAULT_LEVEL = {
  level: 0,
  levelExp: 0,
  levelName: "无等级",
  levelColor: "#666666"
};
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
var Config = import_koishi.Schema.object({
  limit: import_koishi.Schema.number().description("排行榜显示的最大条目数").default(10).min(1).max(100),
  expCommand: import_koishi.Schema.string().description("经验排行榜命令").default("jrysranks"),
  signCommand: import_koishi.Schema.string().description("签到天数排行榜命令").default("jrysranksign"),
  next_ExpDisplay: import_koishi.Schema.boolean().description("是否在排行榜中显示升级所需经验").default(true),
  pre_next_LevelDisplay: import_koishi.Schema.boolean().description("是否在排行榜中显示前后等级信息").default(true),
  borderwidth: import_koishi.Schema.number().description("边框宽度（一般最佳宽度为14）").default(14)
});
function apply(ctx) {
  let levelConfig = [];
  const logger = ctx.logger("jrys-fix-ranks");
  try {
    const configPath = (0, import_path.resolve)(__dirname, "../../../koishi.yml");
    logger.debug("尝试读取配置文件:", configPath);
    const yamlContent = (0, import_fs.readFileSync)(configPath, "utf8");
    const config = yaml.parse(yamlContent);
    const plugins = config.plugins || {};
    for (const [key, value] of Object.entries(plugins)) {
      if (key.startsWith("jrys-fix:") || key === "jrys-fix") {
        const pluginConfig = value;
        if (pluginConfig?.levelSet?.length > 0) {
          levelConfig = pluginConfig.levelSet;
          logger.success(`从 ${key} 成功加载 ${levelConfig.length} 个等级配置`);
          logger.debug("等级配置详情:", levelConfig);
          break;
        }
      }
    }
    if (levelConfig.length === 0) {
      logger.warn("在 koishi.yml 中未找到有效的等级配置");
    }
  } catch (error) {
    logger.error("读取配置文件失败:", error);
  }
  ctx.command(ctx.config.expCommand).action(async ({ session }) => {
    const usernameDbExists = await checkUsernameDatabaseExists(ctx);
    const allUsers = await ctx.database.get("jrys", {}, {
      sort: { exp: "desc" }
    });
    if (!allUsers.length) return "暂无数据";
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
      if (!users.length) return "当前频道暂无数据";
    } else {
      users = allUsers.slice(0, ctx.config.limit).map((user) => ({
        ...user,
        displayName: user.name
      }));
    }
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
    const output = [
      header,
      rankings,
      endDivider
    ].join("\n");
    return output;
  });
  ctx.command(ctx.config.signCommand).action(async ({ session }) => {
    const usernameDbExists = await checkUsernameDatabaseExists(ctx);
    const allUsers = await ctx.database.get("jrys", {}, {
      sort: { signCount: "desc" }
    });
    if (!allUsers.length) return "暂无数据";
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
      if (!users.length) return "当前频道暂无数据";
    } else {
      users = allUsers.slice(0, ctx.config.limit).map((user) => ({
        ...user,
        displayName: user.name
      }));
    }
    const divider = "┏" + "—".repeat(ctx.config.borderwidth) + "┓";
    const midDivider = "┣" + "—".repeat(ctx.config.borderwidth) + "┫";
    const endDivider = "┗" + "—".repeat(ctx.config.borderwidth) + "┛";
    const header = [
      divider,
      `┃  ${users.length ? "🏆" : "�"} 累计签到排行榜 TOP.${ctx.config.limit} `,
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
    const output = [
      header,
      rankings,
      endDivider
    ].join("\n");
    return output;
  });
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  name
});
