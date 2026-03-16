import { Context, Schema } from 'koishi';
declare module 'koishi' {
    interface Tables {
        jrys: JrysTable;
        username: UsernameTable;
    }
}
interface JrysTable {
    id: number;
    name: string;
    time: Date;
    exp: number;
    signCount: number;
}
interface UsernameTable {
    id: number;
    userId: string;
    username: string;
    platform: string;
    channelId: string;
    uid: string;
}
interface LevelInfo {
    level: number;
    levelExp: number;
    levelName: string;
    levelColor: string;
}
export declare const name = "jrys-fix-ranks";
export declare const inject: {
    required: string[];
    optional: string[];
};
export interface Config {
    limit: number;
    expCommand: string;
    signCommand: string;
    imageMode: boolean;
    syncLevelSet: boolean;
    levelSet: LevelInfo[];
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context): void;
export {};
