import IJob from "./IJob.mjs";
import { spawn } from "child_process";

/**
 * DockerJobのコンフィグ
 */
export type DockerJobConfig = {
  name: string;
  image: string;
  cpu: number;
  memory: number;
  cmd: Array<string>;
};

/**
 * コンテナジョブ定義クラス
 */
export default class DockerJobDefinition implements IJob {
  private name: string; // コンテナ名
  private image: string; // コンテナイメージ名
  private cmd: Array<string>; // コンテナで実行するコマンド
  private cpu: number; // コンテナに割り当てるvCPU数
  private memory: number; // コンテナに割り当てるメモリ量

  /**
   * コンストラクタ
   * @param config
   */
  constructor(config: DockerJobConfig) {
    this.name = config.name;
    this.image = config.image;
    this.cmd = config.cmd;
    this.cpu = config.cpu;
    this.memory = config.memory;
  }

  /**
   * ジョブ実行
   * @returns
   */
  execute() {
    return new Promise((resolve, reject) => {
      // Dockerコマンド実行
      // execではなく、spawnを用いることでパイプやリダイレクトを使えなくしている
      // また、spawnはコマンドの実行結果をストリームで取得することができる
      const command = "docker";
      const args = [
        "run",
        "--rm",
        "--name",
        this.name,
        "-m",
        this.memory.toString() + "m",
        "--cpus=" + this.cpu,
        this.image,
      ];
      console.log("ExecCommand: " + command + " [" + args + "]");
      const execJob = spawn(command, args.concat(this.cmd));

      // 終了時のコールバック
      execJob.on("close", (code: any) => {
        console.log(`Job ${this.name} has finished with code: ${code}`);
        // 終了コードが0ならresolve、それ以外ならreject
        if (code !== 0) {
          reject(code);
        } else {
          resolve(code);
        }
      });

      // エラー発生時はリジェクト
      execJob.on("error", (err: any) => {
        console.error(err);
        reject(err);
      });

      // ジョブの標準出力を取得
      execJob.stdout?.on("data", (data: any) => {
        console.log(data.toString());
      });

      // ジョブの標準エラー出力を取得
      execJob.stderr?.on("data", (data: any) => {
        console.error(data.toString());
      });
    });
  }

  /**
   * ジョブ実行キャンセル
   * @returns
   */
  cancel() {
    // コンテナの強制終了
    // 起動していない場合や既に終了している場合、同名のコンテナがなければ特に何も起きない。
    console.log("Cancel command: docker stop " + this.name);
    spawn("docker", ["stop", this.name]);
  }
}
