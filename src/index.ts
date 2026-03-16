import { Context, Schema, h } from 'koishi'
import { resolve } from 'path'
import { promises as fsAsync } from 'fs'
import type { } from 'koishi-plugin-puppeteer'
import * as jrysFix from 'koishi-plugin-jrys-fix'

// 声明数据库表结构
declare module 'koishi' {
  interface Tables {
    jrys: JrysTable
    username: UsernameTable
  }
}

interface JrysTable {
  id: number
  name: string
  time: Date
  exp: number
  signCount: number
}

interface UsernameTable {
  id: number
  userId: string
  username: string
  platform: string
  channelId: string
  uid: string
}

interface UserTable {
  id: string
  name: string
}

interface LevelInfo {
  level: number
  levelExp: number
  levelName: string
  levelColor: string
}

// 默认等级信息
const DEFAULT_LEVEL: LevelInfo = {
  level: 0,
  levelExp: 0,
  levelName: '无等级',
  levelColor: '#666666'
}

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

async function resolveTemplatePath() {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try {
      await fsAsync.access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  throw new Error('未找到 rank-card.html 模板文件')
}

function getLevelInfo(exp: number, levels: LevelInfo[]): LevelInfo {
  // 如果等级配置为空，返回默认等级
  if (!levels?.length) return DEFAULT_LEVEL

  // 按照经验值要求从大到小排序
  const sortedLevels = [...levels].sort((a, b) => b.levelExp - a.levelExp)
  // 找到第一个经验要求小于等于用户经验值的等级
  return sortedLevels.find(level => exp >= level.levelExp) || sortedLevels[sortedLevels.length - 1]
}

// 获取频道标识符
function getChannelIdentifier(platform: string, channelId: string): string {
  // 如果platform末尾没有冒号，则补一个冒号
  const normalizedPlatform = platform.endsWith(':') ? platform : platform + ':'
  return normalizedPlatform + channelId
}

// 检查username数据库是否存在
async function checkUsernameDatabaseExists(ctx: Context): Promise<boolean> {
  try {
    // 尝试查询username表，如果表不存在会抛出错误
    await ctx.database.get('username', {}, { limit: 1 })
    return true
  } catch (error) {
    ctx.logger('jrys-fix-ranks').debug('username数据库不存在，将使用原始用户名显示')
    return false
  }
}

// 用户显示信息接口
interface UserDisplayInfo {
  displayName: string
  originalId: string
  username?: string
  nickname?: string
}

// 获取用户显示信息（优先显示昵称，其次用户名）
async function getUserDisplayInfo(ctx: Context, jrysUserId: string, channelIdentifier: string): Promise<UserDisplayInfo> {
  try {
    // 首先从username表查找匹配的用户
    const usernameRecords = await ctx.database.get('username', {
      userId: jrysUserId
    })

    // 筛选出当前频道的用户
    const channelUser = usernameRecords.find(record =>
      getChannelIdentifier(record.platform, record.channelId) === channelIdentifier
    )

    if (channelUser) {
      // 查找用户是否有昵称
      const userRecord = await ctx.database.get('user', channelUser.uid)

      if (userRecord && userRecord.length > 0 && userRecord[0].name) {
        // 有昵称，返回昵称和用户名
        return {
          displayName: userRecord[0].name,
          originalId: jrysUserId,
          username: channelUser.username,
          nickname: userRecord[0].name
        }
      }

      // 没有昵称，只返回用户名
      return {
        displayName: channelUser.username,
        originalId: jrysUserId,
        username: channelUser.username
      }
    }

    // 如果找不到，返回原始ID
    return {
      displayName: jrysUserId,
      originalId: jrysUserId
    }
  } catch (error) {
    ctx.logger('jrys-fix-ranks').error('获取用户显示信息失败:', error)
    return {
      displayName: jrysUserId,
      originalId: jrysUserId
    }
  }
}

export const name = 'jrys-fix-ranks'

export const inject = {
  required: ['database'],
  optional: ['puppeteer']
}

export interface Config {
  limit: number
  expCommand: string
  signCommand: string
  imageMode: boolean
  syncLevelSet: boolean
  levelSet: LevelInfo[]
}

export const Config: Schema<Config> = Schema.object({
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
  syncLevelSet: Schema.boolean()
    .description('自动从 jrys-fix 插件同步等级配置（启用后将忽略下方 levelSet）')
    .default(true),
  levelSet: Schema.array(Schema.object({
    level: Schema.number().description('等级'),
    levelExp: Schema.number().description('等级最低经验'),
    levelName: Schema.string().description('等级名称'),
    levelColor: Schema.string().description('等级颜色'),
  })).description('等级配置列表（与 jrys-fix 中的 levelSet 保持一致）').default([]),
})

export function apply(ctx: Context) {
  const logger = ctx.logger('jrys-fix-ranks')

  // 获取等级配置：优先从 jrys-fix 插件实例同步，回退到本地配置
  function getLevelConfig(): LevelInfo[] {
    if (ctx.config.syncLevelSet) {
      const scope = ctx.registry.get(jrysFix)
      const synced: LevelInfo[] = scope?.config?.levelSet
      if (synced?.length > 0) return synced
      logger.warn('syncLevelSet 已启用，但未能从 jrys-fix 读取到等级配置，回退到本地 levelSet')
    }
    return ctx.config.levelSet || []
  }

  // 检查是否可以使用图片模式
  function canUseImageMode(): boolean {
    return ctx.config.imageMode && !!ctx.puppeteer
  }

  // 获取排行用户列表（公共逻辑）
  async function getRankedUsers(session: any, sortField: 'exp' | 'signCount') {
    const usernameDbExists = await checkUsernameDatabaseExists(ctx)

    const allUsers = await ctx.database.get('jrys', {}, {
      sort: { [sortField]: 'desc' }
    })

    if (!allUsers.length) return null

    let users = []

    if (usernameDbExists) {
      const channelIdentifier = getChannelIdentifier(session.platform, session.channelId)

      const channelUsers = []
      for (const user of allUsers) {
        const displayInfo = await getUserDisplayInfo(ctx, user.name, channelIdentifier)
        if (displayInfo.displayName !== user.name) {
          channelUsers.push({
            ...user,
            displayName: displayInfo.displayName,
            username: displayInfo.username,
            nickname: displayInfo.nickname
          })
        }
      }

      users = channelUsers.slice(0, ctx.config.limit)

      if (!users.length) return []
    } else {
      users = allUsers.slice(0, ctx.config.limit).map(user => ({
        ...user,
        displayName: user.name
      }))
    }

    return users
  }

  // 为用户构建等级相关数据
  function buildUserLevelData(user: any) {
    const levelConfig = getLevelConfig()
    if (levelConfig.length === 0) return {}

    const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
    const currentLevel = getLevelInfo(user.exp, levelConfig)
    const currentIndex = sortedLevels.findIndex(l => l.levelExp === currentLevel.levelExp)
    const prevLevel = sortedLevels[currentIndex - 1]
    const nextLevel = sortedLevels[currentIndex + 1]

    let levelProgression = ''
    if (ctx.config.pre_next_LevelDisplay) {
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
  async function renderRankImage(type: 'exp' | 'sign', users: any[], totalUsers: number) {
    try {
      const templatePath = await resolveTemplatePath()
      let template = await fsAsync.readFile(templatePath, 'utf-8')

      const data = {
        type,
        limit: ctx.config.limit,
        channelName: '当前频道',
        totalUsers,
        updateTime: new Date().toLocaleString('zh-CN'),
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

      template = template.replace('{{DATA}}', JSON.stringify(data))

      const page = await ctx.puppeteer.page()
      try {
        await page.setContent(template)
        const element = await page.$('.card')
        if (!element) throw new Error('找不到 .card 元素')
        const imgBuf = await element.screenshot({ encoding: 'binary' })
        return h.image(imgBuf, 'image/png')
      } finally {
        await page.close()
      }
    } catch (err) {
      logger.error('renderRankImage 失败:', err)
      return null
    }
  }

  // 文本模式渲染经验排行
  function renderExpText(users: any[]) {
    const levelConfig = getLevelConfig()
    const divider = '┏' + '—'.repeat(ctx.config.borderwidth) + '┓'
    const midDivider = '┣' + '—'.repeat(ctx.config.borderwidth) + '┫'
    const endDivider = '┗' + '—'.repeat(ctx.config.borderwidth) + '┛'

    const header = [
      divider,
      `┃  ${users.length ? '🏆' : '📊'} 赛季经验排行榜 TOP.${ctx.config.limit} `,
      midDivider
    ].join('\n')

    const rankings = users.map((user, index) => {
      const position = (index + 1).toString()
      const medal = index < 3 ? ['👑', '⭐', '✧'][index] : '•'
      const expStr = user.exp.toLocaleString()
      let rankText = []
      let nameLine = `┃ ${medal} ${position}. ${user.displayName}`
      if (user.nickname && user.username && user.displayName === user.nickname) {
        nameLine += `（${user.username}）`
      } else if (user.displayName !== user.name) {
        nameLine += `（${user.name}）`
      }
      rankText.push(nameLine)
      if (levelConfig.length > 0) {
        const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
        const currentLevel = getLevelInfo(user.exp, levelConfig)
        const currentIndex = sortedLevels.findIndex(l => l.levelExp === currentLevel.levelExp)
        const prevLevel = sortedLevels[currentIndex - 1]?.levelName
        const nextLevel = sortedLevels[currentIndex + 1]?.levelName
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
        rankText.push(`┃  ⚡${expStr} exp`)
      }
      return rankText.join('\n')
    }).join('\n\n')

    return [header, rankings, endDivider].join('\n')
  }

  // 文本模式渲染签到排行
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
      let nameLine = `┃ ${medal} ${position}. ${user.displayName}`
      if (user.nickname && user.username && user.displayName === user.nickname) {
        nameLine += `（${user.username}）`
      } else if (user.displayName !== user.name) {
        nameLine += `（${user.name}）`
      }
      rankText.push(nameLine)
      rankText.push(`┃  📅${signStr} 天`)
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
  ctx.command(ctx.config.expCommand)
    .action(async ({ session }) => {
      const users = await getRankedUsers(session, 'exp')
      if (users === null) return '暂无数据'
      if (users.length === 0) return '当前频道暂无数据'

      if (canUseImageMode()) {
        const totalCount = (await ctx.database.get('jrys', {})).length
        const img = await renderRankImage('exp', users, totalCount)
        if (img) return img
      }

      return renderExpText(users)
    })

  // 签到天数排行榜命令
  ctx.command(ctx.config.signCommand)
    .action(async ({ session }) => {
      const users = await getRankedUsers(session, 'signCount')
      if (users === null) return '暂无数据'
      if (users.length === 0) return '当前频道暂无数据'

      if (canUseImageMode()) {
        const img = await renderRankImage('sign', users, (await ctx.database.get('jrys', {})).length)
        if (img) return img
      }

      return renderSignText(users)
    })
}
