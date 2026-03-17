import { Context, Schema } from 'koishi';
/**
 * ========================================
 * koishi-plugin-jrys-fix-ranks
 * 为 jrys-fix 签到插件提供排行榜功能
 * 提供经验值排行与签到天数排行的展示
 * 支持图片模式和文本模式两种输出方式
 * ========================================
 */
/**
 * 扩展 Koishi 数据库表接口
 * 声明本插件所支持的数据表
 */
declare module 'koishi' {
    interface Tables {
        jrys: JrysTable;
        username: UsernameTable;
    }
}
/**
 * jrys 数据表结构
 * 存储用户的签到经验与累计签到天数
 */
interface JrysTable {
    id: number;
    name: string;
    time: Date;
    exp: number;
    signCount: number;
}
/**
 * username 数据表结构
 * 存储用户在不同平台频道的昵称映射
 * 用于用户跨频道/跨平台的昵称识别与隔离
 */
interface UsernameTable {
    id: number;
    userId: string;
    username: string;
    platform: string;
    channelId: string;
    uid: string;
}
/**
 * 等级/段位信息结构
 * 定义单个等级的各种属性
 */
interface LevelInfo {
    level: number;
    levelExp: number;
    levelName: string;
    levelColor: string;
}
export declare const name = "jrys-fix-ranks";
/**
 * 插件的依赖声明
 * required: 插件正常工作必须的服务
 * optional: 插件可选的增强服务（缺少时会降级功能）
 */
export declare const inject: {
    required: string[];
    optional: string[];
};
/**
 * 插件配置接口
 * 定义了所有可配置的选项及其类型
 */
export interface Config {
    limit: number;
    expCommand: string;
    signCommand: string;
    imageMode: boolean;
    syncLevelSet: boolean;
    levelSet: LevelInfo[];
}
/**
 * 插件配置的 Schema 定义
 * 定义了配置项在 Koishi 控制台中的显示方式和验证规则
 */
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context): void;
export {};
