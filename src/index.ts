import { Context, Schema, h } from 'koishi'
import { resolve } from 'path'
import { promises as fsAsync } from 'fs'
import type { } from 'koishi-plugin-puppeteer'

/**
 * ========================================
 * koishi-plugin-jrys-fix-ranks
 * 为 jrys-fix 签到插件提供排行榜功能
 * 提供经验值排行与签到天数排行的展示
 * 支持图片模式和文本模式两种输出方式
 * ========================================
 */

// 声明数据库表结构
/**
 * 扩展 Koishi 数据库表接口
 * 声明本插件所支持的数据表
 */
declare module 'koishi' {
  interface Tables {
    jrys: JrysTable
    username: UsernameTable
  }
}

/**
 * jrys 数据表结构
 * 存储用户的签到经验与累计签到天数
 */
interface JrysTable {
  id: number          // 记录ID
  name: string        // 用户ID
  time: Date          // 最后签到时间
  exp: number         // 累计经验值
  signCount: number   // 累计签到天数
}

/**
 * username 数据表结构
 * 存储用户在不同平台频道的昵称映射
 * 用于用户跨频道/跨平台的昵称识别与隔离
 */
interface UsernameTable {
  id: number        // 记录ID
  userId: string    // jrys 用户ID
  username: string  // 平台用户名
  platform: string  // 平台标识（如 qq、telegram 等）
  channelId: string // 频道ID
  uid: string       // 平台用户UID
}

/**
 * Koishi 内置用户表结构
 * 包含用户的昵称等信息
 */
interface UserTable {
  id: string  // 用户ID
  name: string // 用户昵称
}

/**
 * 等级/段位信息结构
 * 定义单个等级的各种属性
 */
interface LevelInfo {
  level: number      // 等级序号
  levelExp: number   // 该等级所需的最低经验值
  levelName: string  // 等级名称
  levelColor: string // 等级颜色（十六进制，用于在排行榜中显示）
}

// 默认等级信息
/**
 * 当未配置等级信息或等级获取失败时的默认等级
 * 此等级不会在排行榜中实际显示
 */
const DEFAULT_LEVEL: LevelInfo = {
  level: 0,
  levelExp: 0,
  levelName: '无等级',
  levelColor: '#666666'
}

/**
 * HTML 模板文件的多个可能路径候选
 * 根据不同的部署方式（开发/编译/npm包），模板文件在不同位置
 * 逐个尝试这些路径，以支持多种环境
 */
const TEMPLATE_CANDIDATES = [
  resolve(process.cwd(), 'src', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'lib', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'dist', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'external', 'jrys-fix-ranks', 'src', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'external', 'jrys-fix-ranks', 'lib', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'external', 'jrys-fix-ranks', 'dist', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'node_modules', 'koishi-plugin-jrys-fix-ranks', 'lib', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'node_modules', 'koishi-plugin-jrys-fix-ranks', 'dist', 'templates', 'rank-card.html'),
]

/**
 * 动态解析 HTML 模板文件的路径
 * 在多个可能的位置中查找 rank-card.html 文件
 * 支持开发模式、编译后、以及 npm 包安装等多种场景
 * @returns 找到的模板文件路径
 * @throws 若无法找到模板文件则抛出错误
 */
async function resolveTemplatePath() {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try {
      // 尝试访问该路径，如果存在则返回
      await fsAsync.access(candidate)
      return candidate
    } catch {
      // 该路径不存在或不可访问，继续尝试下一个
      continue
    }
  }

  throw new Error('未找到 rank-card.html 模板文件')
}

/**
 * 根据用户经验值获取其对应的等级信息
 * 使用二分法逻辑快速匹配用户当前等级
 * @param exp - 用户的经验值
 * @param levels - 等级配置列表（从低到高排序）
 * @returns 用户对应的等级信息
 */
function getLevelInfo(exp: number, levels: LevelInfo[]): LevelInfo {
  // 如果等级配置为空，返回默认等级
  if (!levels?.length) return DEFAULT_LEVEL

  // 按照经验值要求从大到小排序（降序）
  // 这样可以从高等级向下查找，快速定位用户等级
  const sortedLevels = [...levels].sort((a, b) => b.levelExp - a.levelExp)

  // 找到第一个经验要求小于等于用户经验值的等级
  // 即找到用户能满足要求的最高等级
  return sortedLevels.find(level => exp >= level.levelExp) || sortedLevels[sortedLevels.length - 1]
}

// 获取频道标识符
/**
 * 根据平台和频道ID生成唯一的频道标识符
 * 用于在排行榜中实现频道隔离，同一用户在不同频道视为不同数据
 * @param platform - 机器人接入的平台标识（如 qq、telegram）
 * @param channelId - 该平台上的频道/群ID
 * @returns 统一格式的频道标识符："platform:channelId"
 */
function getChannelIdentifier(platform: string, channelId: string): string {
  // 如果platform末尾没有冒号，则补一个冒号以保证统一格式
  // 部分平台的标识可能已带冒号，需要规范化处理
  const normalizedPlatform = platform.endsWith(':') ? platform : platform + ':'
  return normalizedPlatform + channelId
}

// 检查username数据库是否存在
/**
 * 检查 username 数据表是否存在并可访问
 * username 表由其他插件（如 koishi-plugin-username）创建
 * 此功能用于判断是否可使用频道隔离与用户昵称解析功能
 * @param ctx - Koishi 上下文对象
 * @returns true 表示表存在并可访问，false 表示表不存在或不可访问
 */
async function checkUsernameDatabaseExists(ctx: Context): Promise<boolean> {
  try {
    // 尝试查询 username 表，如果表不存在或不可访问会抛出错误
    // 仅查询一条记录以最小化性能开销
    await ctx.database.get('username', {}, { limit: 1 })
    return true
  } catch (error) {
    // 表不存在是预期行为，不需要在主日志中报错
    // 仅在调试模式下输出日志
    ctx.logger('jrys-fix-ranks').debug('username数据库不存在，将使用原始用户名显示')
    return false
  }
}

// 用户显示信息接口
/**
 * 最终用于排行榜中显示的用户信息
 * 包含显示名称（昵称/用户名/ID的优先级选择）与原始ID
 */
interface UserDisplayInfo {
  displayName: string  // 实际显示的名称（可能是昵称、用户名或原始ID）
  originalId: string   // 用户的原始jrys ID
  username?: string    // 平台用户名（可选）
  nickname?: string    // 用户昵称（可选）
}

/**
 * 根据 jrys 用户ID和频道标识符获取用户的显示信息
 * 优先级：用户昵称 > 平台用户名 > 原始 jrys ID
 *
 * @param ctx - Koishi 上下文对象
 * @param jrysUserId - jrys 系统中的用户ID
 * @param channelIdentifier - 频道标识符（platform:channelId 格式）
 * @returns 用户显示信息对象
 *
 * 流程说明：
 * 1. 从 username 表查询该用户的所有平台记录
 * 2. 筛选出当前频道的用户记录
 * 3. 从 user 表查询该用户的昵称信息（Koishi 内置）
 * 4. 返回优先级最高的名称及其关联信息
 */
async function getUserDisplayInfo(ctx: Context, jrysUserId: string, channelIdentifier: string): Promise<UserDisplayInfo> {
  try {
    // 首先从 username 表查找该 jrys 用户的所有记录
    // username 表存储了用户在不同平台的用户名映射
    const usernameRecords = await ctx.database.get('username', {
      userId: jrysUserId
    })

    // 筛选出当前频道的用户
    // 同一用户可能在多个频道有不同的用户名，需要按频道过滤
    const channelUser = usernameRecords.find(record =>
      getChannelIdentifier(record.platform, record.channelId) === channelIdentifier
    )

    if (channelUser) {
      // 从 Koishi 内置的 user 表查询该用户的昵称信息
      const userRecord = await ctx.database.get('user', channelUser.uid)

      if (userRecord && userRecord.length > 0 && userRecord[0].name) {
        // 用户有设置昵称，优先使用昵称
        return {
          displayName: userRecord[0].name,
          originalId: jrysUserId,
          username: channelUser.username,
          nickname: userRecord[0].name
        }
      }

      // 用户没有昵称，使用平台用户名
      return {
        displayName: channelUser.username,
        originalId: jrysUserId,
        username: channelUser.username
      }
    }

    // 如果在 username 表中找不到该用户记录，使用原始 jrys ID
    // 这通常发生在未安装用户名相关插件的情况
    return {
      displayName: jrysUserId,
      originalId: jrysUserId
    }
  } catch (error) {
    // 数据库查询出错时，降级使用原始 ID
    // 记录错误以便调试，但不中断排行榜生成
    ctx.logger('jrys-fix-ranks').error('获取用户显示信息失败:', error)
    return {
      displayName: jrysUserId,
      originalId: jrysUserId
    }
  }
}

export const name = 'jrys-fix-ranks'

/**
 * 插件的依赖声明
 * required: 插件正常工作必须的服务
 * optional: 插件可选的增强服务（缺少时会降级功能）
 */
export const inject = {
  required: ['database'],    // 必须有数据库服务以读取签到数据
  optional: ['puppeteer']    // 可选：puppeteer 用于图片渲染，缺少时降级为文本模式
}

/**
 * 插件配置接口
 * 定义了所有可配置的选项及其类型
 */
export interface Config {
  limit: number              // 排行榜最多显示多少条记录
  expCommand: string         // 经验排行榜的命令名称
  signCommand: string        // 签到排行榜的命令名称
  imageMode: boolean         // 是否使用图片模式（需要 puppeteer）
  syncLevelSet: boolean      // 是否从 jrys-fix 自动同步等级配置
  levelSet: LevelInfo[]      // 手动配置的等级列表（在 syncLevelSet=false 时使用）
}

/**
 * 插件配置的 Schema 定义
 * 定义了配置项在 Koishi 控制台中的显示方式和验证规则
 */
export const Config: Schema<Config> = Schema.object({
  // 基础设置
  limit: Schema.number()
    .description('排行榜显示的最大条目数')
    .default(10)
    .min(1)
    .max(100),

  expCommand: Schema.string()
    .description('经验排行榜命令')
    .default('jrysranks'),

  signCommand: Schema.string()
    .description('签到天数排行榜命令')
    .default('jrysranksign'),

  // 显示模式
  imageMode: Schema.boolean()
    .description('是否使用图片模式渲染排行榜（需要 puppeteer 服务）')
    .default(true),

  next_ExpDisplay: Schema.boolean()
    .description('是否在排行榜中显示升级所需经验')
    .default(true),

  pre_next_LevelDisplay: Schema.boolean()
    .description('是否在排行榜中显示前后等级信息')
    .default(true),

  borderwidth: Schema.number()
    .description('边框宽度（一般最佳宽度为14）')
    .default(14),

  // 等级配置同步
  syncLevelSet: Schema.boolean()
    .description('自动从 jrys-fix 插件同步等级配置（启用后将忽略下方 levelSet）')
    .default(true),

  // 手动等级配置
  levelSet: Schema.array(Schema.object({
    level: Schema.number().description('等级'),
    levelExp: Schema.number().description('等级最低经验'),
    levelName: Schema.string().description('等级名称'),
    levelColor: Schema.string().description('等级颜色'),
  })).description('等级配置列表（与 jrys-fix 中的 levelSet 保持一致）').default([]),
})

export function apply(ctx: Context) {
  const logger = ctx.logger('jrys-fix-ranks')

  /**
   * 获取等级配置的核心逻辑
   * 支持两种模式：
   * 1. 自动同步模式（syncLevelSet=true）：从 jrys-fix 插件实例直接读取
   * 2. 手动配置模式（syncLevelSet=false）：从本插件的配置中读取
   *
   * 自动同步的好处：
   * - 无需手动复制配置，改一处两个插件自动同步
   * - 完全避免文件 I/O，性能最优
   * - 运行时读取，支持热更新
   *
   * @returns 当前应使用的等级配置列表
   */
  function getLevelConfig(): LevelInfo[] {
    if (ctx.config.syncLevelSet) {
      // 从 Koishi 注册表中获取 jrys-fix 插件的实例和配置
      const scope = ctx.registry.get('jrys-fix' as any)
      const synced: LevelInfo[] = scope?.config?.levelSet

      // 如果成功读到配置，直接使用（不需要日志，这是正常流程）
      if (synced?.length > 0) return synced

      // 同步失败时降级到本地配置，并记录警告
      logger.warn('syncLevelSet 已启用，但未能从 jrys-fix 读取到等级配置，回退到本地 levelSet')
    }

    // 返回本地手动配置的等级列表
    return ctx.config.levelSet || []
  }

  // 检查是否可以使用图片模式
  /**
   * 判断当前环境是否支持图片模式渲染
   * 需要同时满足：1. 用户启用了 imageMode  2. puppeteer 服务可用
   * @returns true 则可使用图片模式，否则必须用文本模式
   */
  function canUseImageMode(): boolean {
    return ctx.config.imageMode && !!ctx.puppeteer
  }

  /**
   * 获取要在排行榜中显示的用户列表
   * 包含数据过滤、频道隔离、用户显示名称解析等逻辑
   *
   * @param session - 命令执行的会话信息（包含平台、频道等）
   * @param sortField - 排序字段：'exp'（经验值）或 'signCount'（签到天数）
   * @returns 过滤后的用户列表，null 表示数据表为空，[] 表示当前频道无数据
   *
   * 工作流程：
   * 1. 检查 username 表是否存在（用于频道隔离）
   * 2. 从 jrys 表按指定字段排序查询所有用户
   * 3. 如果 username 表存在，则执行频道隔离（仅显示本频道用户）
   * 4. 截取前 limit 条记录
   * 5. 解析每个用户的显示名称
   */
  async function getRankedUsers(session: any, sortField: 'exp' | 'signCount') {
    // 检查是否可使用频道隔离功能
    const usernameDbExists = await checkUsernameDatabaseExists(ctx)

    // 从 jrys 表查询所有用户，按指定字段降序排序
    const allUsers = await ctx.database.get('jrys', {}, {
      sort: { [sortField]: 'desc' }
    })

    // 若无任何用户记录，返回 null 以区分"无数据"和"无频道数据"
    if (!allUsers.length) return null

    let users = []

    if (usernameDbExists) {
      // 频道隔离模式：仅显示当前频道有记录的用户
      const channelIdentifier = getChannelIdentifier(session.platform, session.channelId)

      // 逐一查询每个用户的显示名称，并筛选出当前频道的用户
      const channelUsers = []
      for (const user of allUsers) {
        const displayInfo = await getUserDisplayInfo(ctx, user.name, channelIdentifier)

        // 只有获取到非原始ID的显示名称才表示该用户在这个频道有记录
        if (displayInfo.displayName !== user.name) {
          channelUsers.push({
            ...user,
            displayName: displayInfo.displayName,
            username: displayInfo.username,
            nickname: displayInfo.nickname
          })
        }
      }

      // 取前 limit 条频道内的用户
      users = channelUsers.slice(0, ctx.config.limit)

      // 若频道内无用户，返回空数组以提示频道内暂无数据
      if (!users.length) return []
    } else {
      // 无频道隔离模式：直接显示全部用户
      // 此时所有用户的显示名称就是原始 name
      users = allUsers.slice(0, ctx.config.limit).map(user => ({
        ...user,
        displayName: user.name
      }))
    }

    return users
  }

  // 为用户构建等级相关数据
  /**
   * 根据用户经验值计算其等级相关的所有信息
   * 包括当前等级、颜色、升级进度、前后等级等
   *
   * @param user - 用户对象（需要包含 exp 字段）
   * @returns 包含等级、颜色、进度等信息的对象，若无等级配置则返回空对象
   *
   * 返回对象结构：
   * {
   *   levelName: 当前等级名称
   *   levelColor: 当前等级颜色
   *   currentLevelExp: 当前等级的最低经验要求
   *   nextLevelExp: 下一等级的最低经验要求（如果存在）
   *   levelProgression: 等级进度字符串（如有配置），格式为 "前驱 → 「当前」 → 后驱"
   * }
   */
  function buildUserLevelData(user: any) {
    const levelConfig = getLevelConfig()
    if (levelConfig.length === 0) return {}

    // 按经验要求从低到高排序，便于查找前后等级
    const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)

    // 根据用户经验值获取当前等级
    const currentLevel = getLevelInfo(user.exp, levelConfig)

    // 找到当前等级在排序列表中的位置
    const currentIndex = sortedLevels.findIndex(l => l.levelExp === currentLevel.levelExp)

    // 获取前后等级信息（用于显示进度链）
    const prevLevel = sortedLevels[currentIndex - 1]
    const nextLevel = sortedLevels[currentIndex + 1]

    // 构建等级进度字符串（如启用了此配置）
    let levelProgression = ''
    if (ctx.config.pre_next_LevelDisplay) {
      // 格式示例: "水系魔法师 → 「水系魔导师」 → 藏书的魔女"
      if (prevLevel) levelProgression += `${prevLevel.levelName} → `
      levelProgression += `「${currentLevel.levelName}」`
      if (nextLevel) levelProgression += ` → ${nextLevel.levelName}`
    }

    return {
      levelName: currentLevel.levelName,
      levelColor: currentLevel.levelColor,
      currentLevelExp: currentLevel.levelExp,
      nextLevelExp: nextLevel?.levelExp ?? null,
      levelProgression: levelProgression || null,
    }
  }

  // 渲染排行榜图片
  /**
   * 使用 puppeteer 将 HTML 模板渲染为图片
   * 这是高级功能，依赖 puppeteer 服务可用
   *
   * @param type - 排行榜类型：'exp'（经验值）或 'sign'（签到天数）
   * @param users - 要展示的用户列表
   * @param totalUsers - jrys 表中的用户总数
   * @returns 渲染得到的图片（h.image 对象），若失败则返回 null
   *
   * 工作流程：
   * 1. 查找并读取 HTML 模板文件（支持多个路径）
   * 2. 将用户数据序列化为 JSON 并注入到模板中
   * 3. 使用 puppeteer 打开页面并渲染 HTML 为 PNG
   * 4. 截图 .card 元素并返回二进制数据
   * 5. 错误处理：若任何步骤失败则记录日志并返回 null（由上层降级处理）
   */
  async function renderRankImage(type: 'exp' | 'sign', users: any[], totalUsers: number) {
    try {
      // 第一步：定位模板文件（支持多个路径）
      const templatePath = await resolveTemplatePath()

      // 第二步：读取模板文件
      let template = await fsAsync.readFile(templatePath, 'utf-8')

      // 第三步：构建要传递给模板的数据对象
      const data = {
        type,                                    // 标识排行榜类型
        limit: ctx.config.limit,                 // 显示的最大条目数
        channelName: '当前频道',                  // 频道名称（当前硬编码）
        totalUsers,                              // 用户总数
        updateTime: new Date().toLocaleString('zh-CN'), // 更新时间戳
        // 转换用户数据格式，为模板提供所有必要的展示字段
        users: users.map(user => {
          const levelData = buildUserLevelData(user)
          return {
            displayName: user.displayName,
            originalId: user.name,
            username: user.username || null,
            nickname: user.nickname || null,
            value: type === 'exp' ? user.exp : user.signCount,
            ...levelData,
          }
        }),
      }

      // 第四步：将数据注入到模板中（替换占位符 {{DATA}}）
      template = template.replace('{{DATA}}', JSON.stringify(data))

      // 第五步：使用 puppeteer 渲染页面
      const page = await ctx.puppeteer.page()
      try {
        // 设置页面内容并等待加载完成
        await page.setContent(template)

        // 找到排行卡片元素（需要模板中存在 .card 类名）
        const element = await page.$('.card')
        if (!element) throw new Error('找不到 .card 元素')

        // 截图该元素为 PNG 二进制数据
        const imgBuf = await element.screenshot({ encoding: 'binary' })

        // 返回 Koishi 的图片对象（自动处理发送逻辑）
        return h.image(imgBuf, 'image/png')
      } finally {
        // 关键：一定要关闭页面，否则会泄漏内存
        await page.close()
      }
    } catch (err) {
      // 错误处理：记录并返回 null，由上层命令降级为文本模式
      logger.error('renderRankImage 失败:', err)
      return null
    }
  }

  // 文本模式渲染经验排行
  /**
   * 将用户排行数据格式化为文本排行榜
   * 使用 Unicode 字符绘制边框（类似表格），易于在终端或消息中显示
   *
   * @param users - 用户列表
   * @returns 格式化的文本字符串
   *
   * 显示格式示例：
   * ┏—— 赛季经验排行榜 TOP.10
   * ┣—— 排行信息 —
   * ┃ 👑 1. 用户A
   * ┃  ✨ 段位1
   * ┃  ⚡ 6000 exp (下一级:8000 exp)
   * ┃ 段位1 → 「段位2」 → 段位3
   * ┗——————————————
   */
  function renderExpText(users: any[]) {
    const levelConfig = getLevelConfig()

    // 根据边框宽度配置构建分割线
    const divider = '┏' + '—'.repeat(ctx.config.borderwidth) + '┓'
    const midDivider = '┣' + '—'.repeat(ctx.config.borderwidth) + '┫'
    const endDivider = '┗' + '—'.repeat(ctx.config.borderwidth) + '┛'

    // 构建表头
    const header = [
      divider,
      `┃  ${users.length ? '🏆' : '📊'} 赛季经验排行榜 TOP.${ctx.config.limit} `,
      midDivider
    ].join('\n')

    // 构建排行条目
    const rankings = users.map((user, index) => {
      const position = (index + 1).toString()
      // 前三名使用特殊奖章 emoji，其他位置用圆点
      const medal = index < 3 ? ['👑', '⭐', '✧'][index] : '•'
      const expStr = user.exp.toLocaleString()

      let rankText = []

      // 用户名行（带奖章和位次）
      let nameLine = `┃ ${medal} ${position}. ${user.displayName}`
      if (user.nickname && user.username && user.displayName === user.nickname) {
        // 如果显示名是昵称，附加括号中的用户名
        nameLine += `（${user.username}）`
      } else if (user.displayName !== user.name) {
        // 如果显示名不是原始ID，附加括号中的原始ID
        nameLine += `（${user.name}）`
      }
      rankText.push(nameLine)

      // 等级与经验数据
      if (levelConfig.length > 0) {
        // 根据等级信息展示详细数据
        const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
        const currentLevel = getLevelInfo(user.exp, levelConfig)
        const currentIndex = sortedLevels.findIndex(l => l.levelExp === currentLevel.levelExp)
        const prevLevel = sortedLevels[currentIndex - 1]?.levelName
        const nextLevel = sortedLevels[currentIndex + 1]?.levelName

        // 经验值显示（可选显示下一等级所需经验）
        let levelLine = `┃  ✨`
        if (ctx.config.next_ExpDisplay) {
          if (sortedLevels[currentIndex + 1]) {
            const nextExp = sortedLevels[currentIndex + 1].levelExp
            rankText.push(`┃  ⚡${expStr} exp (下一级:${nextExp} exp)`)
          } else {
            rankText.push(`┃  ⚡${expStr} (Max)`)
          }
        } else {
          rankText.push(`┃  ⚡${expStr} exp`)
        }

        // 等级进度线（显示前后等级）
        if (ctx.config.pre_next_LevelDisplay) {
          if (prevLevel) levelLine += `${prevLevel} ->`
          levelLine += `「${currentLevel.levelName}」`
          if (nextLevel) levelLine += `-> ${nextLevel}`
        } else {
          levelLine += `${currentLevel.levelName}`
        }
        rankText.push(levelLine)
      }
      else {
        // 无等级配置时，仅显示经验值
        rankText.push(`┃  ⚡${expStr} exp`)
      }

      return rankText.join('\n')
    }).join('\n\n')

    return [header, rankings, endDivider].join('\n')
  }

  // 文本模式渲染签到排行
  /**
   * 将用户签到天数排行数据格式化为文本
   * 与 renderExpText 类似，但显示的是签到天数而非经验值
   *
   * @param users - 用户列表
   * @returns 格式化的文本字符串
   */
  function renderSignText(users: any[]) {
    const levelConfig = getLevelConfig()
    const divider = '┏' + '—'.repeat(ctx.config.borderwidth) + '┓'
    const midDivider = '┣' + '—'.repeat(ctx.config.borderwidth) + '┫'
    const endDivider = '┗' + '—'.repeat(ctx.config.borderwidth) + '┛'

    const header = [
      divider,
      `┃  ${users.length ? '🏆' : '📊'} 累计签到排行榜 TOP.${ctx.config.limit} `,
      midDivider
    ].join('\n')

    const rankings = users.map((user, index) => {
      const position = (index + 1).toString()
      const medal = index < 3 ? ['👑', '⭐', '✧'][index] : '•'
      const signStr = user.signCount.toLocaleString()
      let rankText = []

      // 用户名行
      let nameLine = `┃ ${medal} ${position}. ${user.displayName}`
      if (user.nickname && user.username && user.displayName === user.nickname) {
        nameLine += `（${user.username}）`
      } else if (user.displayName !== user.name) {
        nameLine += `（${user.name}）`
      }
      rankText.push(nameLine)

      // 签到天数
      rankText.push(`┃  📅${signStr} 天`)

      // 等级信息（相同逻辑）
      if (levelConfig.length > 0) {
        const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
        const currentLevel = getLevelInfo(user.exp, levelConfig)
        const currentIndex = sortedLevels.findIndex(l => l.levelExp === currentLevel.levelExp)
        const prevLevel = sortedLevels[currentIndex - 1]?.levelName
        const nextLevel = sortedLevels[currentIndex + 1]?.levelName

        let levelLine = `┃  ✨`
        if (ctx.config.pre_next_LevelDisplay) {
          if (prevLevel) levelLine += `${prevLevel} ->`
          levelLine += `「${currentLevel.levelName}」`
          if (nextLevel) levelLine += `-> ${nextLevel}`
        } else {
          levelLine += `${currentLevel.levelName}`
        }
        rankText.push(levelLine)
      }

      return rankText.join('\n')
    }).join('\n\n')

    return [header, rankings, endDivider].join('\n')
  }

  // 经验值排行榜命令
  /**
   * 经验排行榜指令处理器
   * 触发命令后执行以下流程：
   * 1. 获取排行用户列表
   * 2. 尝试图片模式渲染（如可用）
   * 3. 降级文本模式输出
   */
  ctx.command(ctx.config.expCommand)
    .action(async (argv, ..._args) => {
      const { session } = argv
      // 获取排行用户列表，按经验值排序
      const users = await getRankedUsers(session, 'exp')

      // 若数据表为空，返回总体提示
      if (users === null) return '暂无数据'

      // 若当前频道无用户记录，返回频道特定提示
      if (users.length === 0) return '当前频道暂无数据'

      // 尝试图片模式（如启用且 puppeteer 可用）
      if (canUseImageMode()) {
        const totalCount = (await ctx.database.get('jrys', {})).length
        const img = await renderRankImage('exp', users, totalCount)
        // 图片渲染成功则直接返回图片
        if (img) return img
        // 否则自动降级为文本模式（无需记录，这是预期行为）
      }

      // 文本模式作为最后的兜底方案
      return renderExpText(users)
    })

  // 签到天数排行榜命令
  /**
   * 签到排行榜指令处理器
   * 流程同 jrysranks，但按签到天数排序
   */
  ctx.command(ctx.config.signCommand)
    .action(async (argv, ..._args) => {
      const { session } = argv
      // 获取排行用户列表，按签到天数排序
      const users = await getRankedUsers(session, 'signCount')

      if (users === null) return '暂无数据'
      if (users.length === 0) return '当前频道暂无数据'

      if (canUseImageMode()) {
        // 图片模式
        const img = await renderRankImage('sign', users, (await ctx.database.get('jrys', {})).length)
        if (img) return img
      }

      // 文本模式
      return renderSignText(users)
    })
}
