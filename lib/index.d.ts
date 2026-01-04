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
export declare const name = "jrys-fix-ranks";
export interface Config {
    limit: number;
    expCommand: string;
    signCommand: string;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context): void;
export {};
