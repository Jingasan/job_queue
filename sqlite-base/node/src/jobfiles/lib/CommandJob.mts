import IJob from "./IJob.mjs";
import { spawn } from "child_process";

/**
 * BatchJobのコンフィグ
 */
export type BashJobConfig = {
  name: string;
  cmd: string;
  args: ReadonlyArray<string>;
};

/**
 * コマンドジョブ定義クラス
 */
export default class BashJobDefinition implements IJob {
  private name: string; // ジョブ名
  private cmd: string; // 実行コマンド
  private args: ReadonlyArray<string>; // 実行コマンドの引数
  private execJob: any; // 実行されたコマンドのプロセス

  /**
   * コンストラクタ
   * @param config
   */
  constructor(config: BashJobConfig) {
    this.name = config.name;
    this.cmd = config.cmd;
    this.args = config.args;
  }

  /**
   * ジョブ実行
   * @return Promise
   */
  execute() {
    return new Promise((resolve, reject) => {
      // コマンド実行
      // execではなく、spawnを用いることでパイプやリダイレクトを使えなくしている
      // また、spawnはコマンドの実行結果をストリームで取得することができる
      this.execJob = spawn(this.cmd, this.args);

      // 終了時のコールバック
      this.execJob.on("close", (code: any) => {
        console.log(`Job ${this.name} has finished with code: ${code}`);
        //終了コードが0ならresolve、それ以外ならreject
        if (code !== 0) {
          reject(code);
        } else {
          resolve(code);
        }
      });

      // エラー発生時はリジェクト
      this.execJob.on("error", (err: any) => {
        console.error(err);
        reject(err);
      });

      // ジョブの標準出力を取得
      this.execJob.stdout?.on("data", (data: any) => {
        console.log(data.toString());
      });

      // ジョブの標準エラー出力を取得
      this.execJob.stderr?.on("data", (data: any) => {
        console.error(data.toString());
      });
    });
  }

  /**
   * ジョブ実行キャンセル
   * @returns
   */
  cancel() {
    this.execJob.kill(9);
    return;
  }
}
