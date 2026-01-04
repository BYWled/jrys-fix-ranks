import { Context, Schema } from 'koishi'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import * as yaml from 'yaml'

// 配置文件接口
interface KoishiConfig {
  plugins: {
    [key: string]: {
      levelSet?: LevelInfo[]
      [key: string]: any
    }
  }
}

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

export interface Config {
  limit: number
  expCommand: string
  signCommand: string
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
  next_ExpDisplay: Schema.boolean()
    .description('是否在排行榜中显示升级所需经验')
    .default(true),
  pre_next_LevelDisplay: Schema.boolean()
    .description('是否在排行榜中显示前后等级信息')
    .default(true),
  borderwidth: Schema.number()
    .description('边框宽度（一般最佳宽度为14）')
    .default(14)
})

export function apply(ctx: Context) {
  let levelConfig = []
  const logger = ctx.logger('jrys-fix-ranks')

  try {
    // 获取 koishi.yml 的路径
    const configPath = resolve(__dirname, '../../../koishi.yml')
    logger.debug('尝试读取配置文件:', configPath)

    // 读取并解析 YAML 文件
    const yamlContent = readFileSync(configPath, 'utf8')
    const config = yaml.parse(yamlContent) as KoishiConfig

    // 查找 jrys-fix 插件的配置
    const plugins = config.plugins || {}
    for (const [key, value] of Object.entries(plugins)) {
      if (key.startsWith('jrys-fix:') || key === 'jrys-fix') {
        const pluginConfig = value as { levelSet?: LevelInfo[] }
        if (pluginConfig?.levelSet?.length > 0) {
          levelConfig = pluginConfig.levelSet
          logger.success(`从 ${key} 成功加载 ${levelConfig.length} 个等级配置`)
          logger.debug('等级配置详情:', levelConfig)
          break
        }
      }
    }

    if (levelConfig.length === 0) {
      logger.warn('在 koishi.yml 中未找到有效的等级配置')
    }
  } catch (error) {
    logger.error('读取配置文件失败:', error)
  }

  // 经验值排行榜命令
  ctx.command(ctx.config.expCommand)
    .action(async ({ session }) => {
      // 检查username数据库是否存在
      const usernameDbExists = await checkUsernameDatabaseExists(ctx)

      // 获取所有jrys用户
      const allUsers = await ctx.database.get('jrys', {}, {
        sort: { exp: 'desc' }
      })

      if (!allUsers.length) return '暂无数据'

      let users = []

      if (usernameDbExists) {
        // 如果username数据库存在，进行频道筛选
        const channelIdentifier = getChannelIdentifier(session.platform, session.channelId)

        // 筛选当前频道的用户并获取显示名称
        const channelUsers = []
        for (const user of allUsers) {
          const displayInfo = await getUserDisplayInfo(ctx, user.name, channelIdentifier)
          // 如果显示名称不是原始ID，说明找到了该频道的用户
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

        if (!users.length) return '当前频道暂无数据'
      } else {
        // 如果username数据库不存在，直接使用原始数据
        users = allUsers.slice(0, ctx.config.limit).map(user => ({
          ...user,
          displayName: user.name
        }))
      }

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
        // 基本信息和用户名
        let nameLine = `┃ ${medal} ${position}. ${user.displayName}`
        if (user.nickname && user.username && user.displayName === user.nickname) {
          // 如果有昵称，显示昵称（用户名）
          nameLine += `（${user.username}）`
        } else if (user.displayName !== user.name) {
          // 如果没有昵称但有用户名，显示用户名（原始ID）
          nameLine += `（${user.name}）`
        }
        rankText.push(nameLine)
        // 等级信息（如果有配置）
        if (levelConfig.length > 0) {
          const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
          const currentLevel = getLevelInfo(user.exp, levelConfig)
          const currentIndex = sortedLevels.findIndex(l => l.levelExp === currentLevel.levelExp)
          const prevLevel = sortedLevels[currentIndex - 1]?.levelName
          const nextLevel = sortedLevels[currentIndex + 1]?.levelName
          let levelLine = `┃  ✨`
          // 有等级的经验值信息
          if (ctx.config.next_ExpDisplay) { // 如果配置开启显示升级所需经验
            if (sortedLevels[currentIndex + 1]) {
              const nextExp = sortedLevels[currentIndex + 1].levelExp
              rankText.push(`┃  ⚡${expStr} exp (下一级:${nextExp} exp)`)
            } else {
              rankText.push(`┃  ⚡${expStr} (Max)`)
            }
          } else {
            rankText.push(`┃  ⚡${expStr} exp`)
          }
          // 等级信息
          if (ctx.config.pre_next_LevelDisplay) { // 如果配置开启显示前后等级
            if (prevLevel) levelLine += `${prevLevel} ->`
            levelLine += `「${currentLevel.levelName}」`
            if (nextLevel) levelLine += `-> ${nextLevel}`
          } else {
            levelLine += `${currentLevel.levelName}`
          }
          rankText.push(levelLine)
        }
        else {
          // 经验值信息
          rankText.push(`┃  ⚡${expStr} exp`)
        }
        return rankText.join('\n')
      }).join('\n\n')

      const output = [
        header,
        rankings,
        endDivider
      ].join('\n')

      return output
    })

  // 签到天数排行榜命令
  ctx.command(ctx.config.signCommand)
    .action(async ({ session }) => {
      // 检查username数据库是否存在
      const usernameDbExists = await checkUsernameDatabaseExists(ctx)

      // 获取所有jrys用户
      const allUsers = await ctx.database.get('jrys', {}, {
        sort: { signCount: 'desc' }
      })

      if (!allUsers.length) return '暂无数据'

      let users = []

      if (usernameDbExists) {
        // 如果username数据库存在，进行频道筛选
        const channelIdentifier = getChannelIdentifier(session.platform, session.channelId)

        // 筛选当前频道的用户并获取显示名称
        const channelUsers = []
        for (const user of allUsers) {
          const displayInfo = await getUserDisplayInfo(ctx, user.name, channelIdentifier)
          // 如果显示名称不是原始ID，说明找到了该频道的用户
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

        if (!users.length) return '当前频道暂无数据'
      } else {
        // 如果username数据库不存在，直接使用原始数据
        users = allUsers.slice(0, ctx.config.limit).map(user => ({
          ...user,
          displayName: user.name
        }))
      }

      const divider = '┏' + '—'.repeat(ctx.config.borderwidth) + '┓'
      const midDivider = '┣' + '—'.repeat(ctx.config.borderwidth) + '┫'
      const endDivider = '┗' + '—'.repeat(ctx.config.borderwidth) + '┛'

      const header = [
        divider,
        `┃  ${users.length ? '🏆' : '�'} 累计签到排行榜 TOP.${ctx.config.limit} `,
        midDivider
      ].join('\n')

      const rankings = users.map((user, index) => {
        const position = (index + 1).toString()
        const medal = index < 3 ? ['👑', '⭐', '✧'][index] : '•'
        const signStr = user.signCount.toLocaleString()
        let rankText = []
        // 基本信息和用户名
        let nameLine = `┃ ${medal} ${position}. ${user.displayName}`
        if (user.nickname && user.username && user.displayName === user.nickname) {
          // 如果有昵称，显示昵称（用户名）
          nameLine += `（${user.username}）`
        } else if (user.displayName !== user.name) {
          // 如果没有昵称但有用户名，显示用户名（原始ID）
          nameLine += `（${user.name}）`
        }
        rankText.push(nameLine)
        // 签到天数信息
        rankText.push(`┃  📅${signStr} 天`)
        // 等级信息（如果有配置）
        if (levelConfig.length > 0) {
          const sortedLevels = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
          const currentLevel = getLevelInfo(user.exp, levelConfig)
          const currentIndex = sortedLevels.findIndex(l => l.levelExp === currentLevel.levelExp)
          const prevLevel = sortedLevels[currentIndex - 1]?.levelName
          const nextLevel = sortedLevels[currentIndex + 1]?.levelName
          let levelLine = `┃  ✨`
          // 等级信息
          if (ctx.config.pre_next_LevelDisplay) { // 如果配置开启显示前后等级
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

      const output = [
        header,
        rankings,
        endDivider
      ].join('\n')

      return output
    })
}
